"""Clara Test Agent - AI-powered connection testing and site health scanning."""
import os
import uuid
import logging
import httpx
import base64
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Header, Request

from database import db
from services.auth import get_current_user
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

clara_test_router = APIRouter(prefix="/clara-test", tags=["Clara Test Agent"])

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

DIAGNOSE_SYSTEM = """You are Clara, a diagnostic assistant for a radio station management platform.
When given test results from WordPress or RDS stream connections, you:
1. Clearly explain what went wrong in simple terms
2. Provide specific, actionable steps to fix the issue
3. If everything is OK, confirm with a brief positive message
Keep responses concise (2-4 sentences for success, 4-8 sentences for errors).
Always respond in English. Use a friendly, professional tone."""

HEALTH_SCAN_SYSTEM = """You are Clara, a site health monitor for a radio station management platform.
You receive a health report of all main sites including WordPress and RDS stream status.
Summarize the findings:
- List any failing connections with brief explanations
- Suggest fixes for each issue
- If everything is healthy, say so briefly
Keep it concise and actionable. Always respond in English. Use a friendly, professional tone.
Format with markdown: use **bold** for site names, bullet points for issues."""


# ── Models ──

class DiagnoseRequest(BaseModel):
    test_type: str  # "wordpress" or "rds_stream"
    site_name: str
    test_results: dict  # raw results from the test


class DiagnoseResponse(BaseModel):
    diagnosis: str
    status: str  # "ok", "warning", "error"


class HealthScanResponse(BaseModel):
    has_issues: bool
    diagnosis: str
    checks: list


# ── Helpers ──

async def _test_wp_connection(wp_site: dict) -> dict:
    """Test a WordPress connection and return structured results."""
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            auth_str = f"{wp_site['username']}:{wp_site['app_password']}"
            auth_bytes = base64.b64encode(auth_str.encode()).decode()
            base_url = wp_site['wp_base_url'].rstrip('/')
            api_url = f"{base_url}/wp-json/wp/v2/users/me?context=edit"

            response = await client.get(api_url, headers={
                "Authorization": f"Basic {auth_bytes}",
                "Accept": "application/json",
                "User-Agent": "Clara-Test-Agent/1.0",
            })

            if response.status_code == 200:
                try:
                    user_data = response.json()
                    return {
                        "success": True,
                        "status_code": 200,
                        "wp_user": user_data.get("name", "unknown"),
                        "wp_role": ", ".join(user_data.get("roles", [])),
                        "capabilities": list(user_data.get("capabilities", {}).keys())[:10],
                    }
                except Exception:
                    return {"success": False, "status_code": 200, "error": "Response was not valid JSON (possible HTML page)"}
            elif response.status_code == 401:
                return {"success": False, "status_code": 401, "error": "Authentication failed - check username and application password"}
            elif response.status_code == 403:
                return {"success": False, "status_code": 403, "error": "Access forbidden - user may lack required permissions"}
            elif response.status_code == 404:
                return {"success": False, "status_code": 404, "error": "REST API not found - check if WordPress URL is correct and REST API is enabled"}
            else:
                return {"success": False, "status_code": response.status_code, "error": f"Unexpected response: {response.text[:200]}"}
    except httpx.ConnectError:
        return {"success": False, "error": "Could not connect to the server - check if the URL is correct and the server is running"}
    except httpx.TimeoutException:
        return {"success": False, "error": "Connection timed out after 12 seconds"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _test_rds_stream(station: dict) -> dict:
    """Test if an RDS stream URL is reachable."""
    stream_url = station.get("stream_url", "")
    if not stream_url:
        return {"success": False, "error": "No stream URL configured"}

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(stream_url)
            if response.status_code == 200:
                # Check if it returns XML/JSON stats (Shoutcast/Icecast)
                content = response.text[:500]
                has_stats = any(k in content.lower() for k in ["songtitle", "servertitle", "currentlisteners", "source", "mount"])
                return {
                    "success": True,
                    "status_code": 200,
                    "has_stats": has_stats,
                    "content_preview": content[:100],
                }
            else:
                return {"success": False, "status_code": response.status_code, "error": f"Stream returned HTTP {response.status_code}"}
    except httpx.ConnectError:
        return {"success": False, "error": "Could not connect to stream server"}
    except httpx.TimeoutException:
        return {"success": False, "error": "Stream connection timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _get_diagnose_chat() -> LlmChat:
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"clara-diag-{uuid.uuid4().hex[:8]}",
        system_message=DIAGNOSE_SYSTEM,
    )
    chat.with_model("openai", "gpt-5.2")
    return chat


def _get_health_chat() -> LlmChat:
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"clara-health-{uuid.uuid4().hex[:8]}",
        system_message=HEALTH_SCAN_SYSTEM,
    )
    chat.with_model("openai", "gpt-5.2")
    return chat


# ── Endpoints ──

@clara_test_router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose_connection(
    req: DiagnoseRequest,
    current_user: dict = Depends(get_current_user),
):
    """Run a connection test and get Clara's AI diagnosis."""
    if not EMERGENT_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    prompt = f"""I just tested a {req.test_type} connection for "{req.site_name}".
Here are the raw test results:
{req.test_results}

Please diagnose this and tell me what's happening and how to fix any issues."""

    chat = _get_diagnose_chat()
    msg = UserMessage(text=prompt)
    response = await chat.send_message(msg)

    status = "ok" if req.test_results.get("success") else "error"
    return DiagnoseResponse(diagnosis=response, status=status)


@clara_test_router.post("/test-wordpress")
async def test_wordpress_with_clara(
    request: Request,
    current_user: dict = Depends(get_current_user),
    x_main_site_id: Optional[str] = Header(None),
):
    """Test a WordPress connection by providing credentials directly (no saved site needed).
    Used by the wizard before saving."""
    if not EMERGENT_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    body = await request.json()
    wp_base_url = body.get("wp_base_url", "")
    username = body.get("username", "")
    app_password = body.get("app_password", "")
    site_name = body.get("name", "WordPress Site")

    if not wp_base_url or not username or not app_password:
        return {"status": "error", "diagnosis": "Please fill in all required fields: WordPress URL, Username, and Application Password."}

    # Run the actual test
    test_result = await _test_wp_connection({
        "wp_base_url": wp_base_url,
        "username": username,
        "app_password": app_password,
    })

    # Get Clara's diagnosis
    chat = _get_diagnose_chat()
    prompt = f"""I tested a WordPress connection for "{site_name}" at {wp_base_url}.
Username: {username}
Results: {test_result}

Diagnose this connection test. If successful, confirm briefly. If failed, explain why and how to fix it."""

    diagnosis = await chat.send_message(UserMessage(text=prompt))
    status = "ok" if test_result.get("success") else "error"

    return {"status": status, "diagnosis": diagnosis, "raw_result": test_result}


@clara_test_router.post("/test-rds-stream")
async def test_rds_stream_with_clara(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Test an RDS stream URL and get Clara's diagnosis."""
    if not EMERGENT_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    body = await request.json()
    stream_url = body.get("stream_url", "")
    station_name = body.get("station_name", "Station")
    stream_type = body.get("stream_type", "shoutcast_v1")

    if not stream_url:
        return {"status": "error", "diagnosis": "No stream URL provided. Please enter a stream URL to test."}

    test_result = await _test_rds_stream({"stream_url": stream_url})

    chat = _get_diagnose_chat()
    prompt = f"""I tested an RDS stream connection for "{station_name}".
Stream URL: {stream_url}
Stream Type: {stream_type}
Results: {test_result}

Diagnose this stream connection test. If successful, confirm what type of data was found. If failed, explain why and how to fix it."""

    diagnosis = await chat.send_message(UserMessage(text=prompt))
    status = "ok" if test_result.get("success") else "error"

    return {"status": status, "diagnosis": diagnosis, "raw_result": test_result}


@clara_test_router.get("/health-scan", response_model=HealthScanResponse)
async def health_scan(
    current_user: dict = Depends(get_current_user),
):
    """Scan all main sites for WordPress and RDS issues. Returns Clara's diagnosis.
    Called automatically after admin login."""
    if not current_user.get("is_network_admin") and not current_user.get("is_system_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    if not EMERGENT_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    checks = []

    # Get all main sites
    sites = await db.main_sites.find({}, {"_id": 0}).to_list(100)

    for site in sites:
        site_id = site.get("id")
        site_name = site.get("name", "Unknown")
        site_slug = site.get("slug", "")
        site_type = site.get("site_type", "")

        # Check WordPress connections
        if site_type in ("radio", "external_host"):
            wp_sites = await db.wordpress_sites.find(
                {"main_site_id": site_id, "is_active": True}, {"_id": 0}
            ).to_list(20)

            for wp in wp_sites:
                if not wp.get("app_password"):
                    checks.append({
                        "site": site_name, "site_id": site_id, "site_slug": site_slug,
                        "site_type": site_type, "type": "wordpress",
                        "target": wp.get("name", wp.get("wp_base_url", "")),
                        "wp_base_url": wp.get("wp_base_url", ""),
                        "success": False, "error": "No application password configured",
                    })
                    continue

                result = await _test_wp_connection(wp)
                checks.append({
                    "site": site_name, "site_id": site_id, "site_slug": site_slug,
                    "site_type": site_type, "type": "wordpress",
                    "target": wp.get("name", wp.get("wp_base_url", "")),
                    "wp_base_url": wp.get("wp_base_url", ""),
                    **result,
                })

        # Check RDS stations
        if site_type == "radio":
            stations = await db.rds_stations.find(
                {"main_site_id": site_id}, {"_id": 0}
            ).to_list(50)

            for st in stations:
                if not st.get("stream_url"):
                    continue
                result = await _test_rds_stream(st)
                checks.append({
                    "site": site_name, "site_id": site_id, "site_slug": site_slug,
                    "site_type": site_type, "type": "rds_stream",
                    "target": f"{st.get('name', st.get('code', ''))}",
                    "stream_url": st.get("stream_url", ""),
                    **result,
                })

    has_issues = any(not c.get("success") for c in checks)

    if not checks:
        return HealthScanResponse(
            has_issues=False,
            diagnosis="No WordPress or RDS connections configured yet. Nothing to check!",
            checks=[],
        )

    # Build report for Clara
    report_lines = []
    for c in checks:
        status_icon = "OK" if c.get("success") else "FAIL"
        report_lines.append(f"[{status_icon}] {c['site']} / {c['type']} / {c['target']}: {c.get('error', 'connected')}")

    report = "\n".join(report_lines)

    chat = _get_health_chat()
    prompt = f"""Here is the health scan report for all main sites:

{report}

Total checks: {len(checks)}
Failures: {sum(1 for c in checks if not c.get('success'))}

Summarize the findings. If there are issues, list them with brief fixes. If all healthy, confirm briefly."""

    diagnosis = await chat.send_message(UserMessage(text=prompt))

    return HealthScanResponse(has_issues=has_issues, diagnosis=diagnosis, checks=checks)


@clara_test_router.post("/retest-check")
async def retest_single_check(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Re-test a single WordPress or RDS connection and get Clara's updated diagnosis."""
    if not EMERGENT_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    body = await request.json()
    check_type = body.get("type", "")
    site_name = body.get("site", "")

    if check_type == "wordpress":
        wp_base_url = body.get("wp_base_url", "")
        if not wp_base_url:
            return {"success": False, "diagnosis": "No WordPress URL available for re-test."}

        wp_site = await db.wordpress_sites.find_one(
            {"wp_base_url": {"$regex": f"^{wp_base_url.rstrip('/')}"}}, {"_id": 0}
        )
        if not wp_site or not wp_site.get("app_password"):
            return {"success": False, "diagnosis": "WordPress connection not found or missing credentials. Please reconfigure the connection first."}

        result = await _test_wp_connection(wp_site)
        chat = _get_diagnose_chat()
        prompt = f"""I re-tested the WordPress connection for "{site_name}" at {wp_base_url}.
Results: {result}
If successful, confirm briefly and congratulate. If failed, explain clearly what's wrong and the exact steps to fix it."""
        diagnosis = await chat.send_message(UserMessage(text=prompt))
        return {"success": result.get("success", False), "diagnosis": diagnosis, "raw_result": result}

    elif check_type == "rds_stream":
        stream_url = body.get("stream_url", "")
        if not stream_url:
            return {"success": False, "diagnosis": "No stream URL available for re-test."}

        result = await _test_rds_stream({"stream_url": stream_url})
        chat = _get_diagnose_chat()
        prompt = f"""I re-tested the RDS stream for "{site_name}" at {stream_url}.
Results: {result}
If successful, confirm briefly and congratulate. If failed, explain clearly what's wrong and the exact steps to fix it."""
        diagnosis = await chat.send_message(UserMessage(text=prompt))
        return {"success": result.get("success", False), "diagnosis": diagnosis, "raw_result": result}

    return {"success": False, "diagnosis": "Unknown check type."}


# ============== RACK SCAN (Login Audit) ==============

@clara_test_router.get("/rack-scan")
async def rack_scan(current_user: dict = Depends(get_current_user)):
    """Scan all racks and sites for configuration issues, security gaps, and improvement suggestions."""
    issues = []

    # 1. Get all main sites the user has access to
    all_sites = await db.main_sites.find({}, {"_id": 0}).to_list(500)
    all_racks = await db.server_racks.find({}, {"_id": 0}).to_list(100)

    # 2. Check firewall status
    fw_settings = await db.firewall_settings.find({}, {"_id": 0}).to_list(500)
    fw_map = {s["main_site_id"]: s.get("enabled", False) for s in fw_settings if "main_site_id" in s}

    for site in all_sites:
        site_id = site.get("id", "")
        site_name = site.get("name", "Unknown")
        site_slug = site.get("slug", "")
        site_type = site.get("site_type", "radio")

        # Firewall check
        if not fw_map.get(site_id, False):
            issues.append({
                "site_id": site_id,
                "site_name": site_name,
                "site_slug": site_slug,
                "category": "security",
                "severity": "critical",
                "title": "Firewall not enabled",
                "description": f"Clara Global Protect is not active for {site_name}. This leaves the site vulnerable to brute force attacks.",
                "action": "enable_firewall",
                "action_label": "Enable Firewall",
            })

        # ZeroTier check for technical sites
        if site_type == "technical":
            zt_config = await db.zerotier_configs.find_one({"main_site_id": site_id}, {"_id": 0})
            if not zt_config or not zt_config.get("api_token"):
                issues.append({
                    "site_id": site_id,
                    "site_name": site_name,
                    "site_slug": site_slug,
                    "category": "configuration",
                    "severity": "warning",
                    "title": "ZeroTier not configured",
                    "description": f"ZeroTier network monitoring is not set up for {site_name}.",
                    "action": "configure_zerotier",
                    "action_label": "Configure",
                })

        # WordPress check
        enabled_features = site.get("enabled_features", [])
        if "wordpress" in enabled_features:
            wp_site = await db.wordpress_sites.find_one({"main_site_id": site_id}, {"_id": 0})
            if not wp_site or not wp_site.get("wp_base_url"):
                issues.append({
                    "site_id": site_id,
                    "site_name": site_name,
                    "site_slug": site_slug,
                    "category": "configuration",
                    "severity": "warning",
                    "title": "WordPress not connected",
                    "description": f"WordPress integration is enabled but not configured for {site_name}.",
                    "action": "configure_wordpress",
                    "action_label": "Configure",
                })

        # RDS check for radio sites
        if site_type == "radio":
            rds_stations = await db.rds_stations.find({"main_site_id": site_id}, {"_id": 0}).to_list(50)
            if len(rds_stations) == 0:
                issues.append({
                    "site_id": site_id,
                    "site_name": site_name,
                    "site_slug": site_slug,
                    "category": "configuration",
                    "severity": "info",
                    "title": "No RDS stations configured",
                    "description": f"No RDS stations are set up for {site_name}. Configure stations to enable RDS metadata.",
                    "action": "configure_rds",
                    "action_label": "Configure",
                })

        # 2FA check
        if not site.get("require_2fa", False):
            issues.append({
                "site_id": site_id,
                "site_name": site_name,
                "site_slug": site_slug,
                "category": "security",
                "severity": "info",
                "title": "2FA not enforced",
                "description": f"Two-factor authentication is not required for {site_name}.",
                "action": "enable_2fa",
                "action_label": "Enable",
            })

    # 3. Check geo-blocking on racks
    for rack in all_racks:
        rack_id = rack.get("id", "")
        rack_name = rack.get("name", f"Rack {rack_id}")
        geo_rules = await db.firewall_geo_rules.find_one({"rack_id": rack_id}, {"_id": 0})
        if not geo_rules:
            issues.append({
                "rack_id": rack_id,
                "site_name": rack_name,
                "category": "security",
                "severity": "warning",
                "title": "Geo-blocking using defaults",
                "description": f"Rack '{rack_name}' uses default European geo-blocking. Review and customize if needed.",
                "action": "configure_geo",
                "action_label": "Review",
            })

    # Sort by severity
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda x: severity_order.get(x.get("severity", "info"), 3))

    summary = {
        "total_sites": len(all_sites),
        "total_racks": len(all_racks),
        "total_issues": len(issues),
        "critical": len([i for i in issues if i["severity"] == "critical"]),
        "warnings": len([i for i in issues if i["severity"] == "warning"]),
        "info": len([i for i in issues if i["severity"] == "info"]),
    }

    return {"summary": summary, "issues": issues}
