"""Clara Test Agent - AI-powered connection testing and site health scanning."""
import asyncio
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
from services.redis_cache import cache_get, cache_set
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
        async with httpx.AsyncClient(timeout=3.0, follow_redirects=True) as client:
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
                    }
                except Exception:
                    return {"success": False, "status_code": 200, "error": "Response was not valid JSON"}
            elif response.status_code == 401:
                return {"success": False, "status_code": 401, "error": "Authentication failed"}
            elif response.status_code == 403:
                return {"success": False, "status_code": 403, "error": "Access forbidden"}
            elif response.status_code == 404:
                return {"success": False, "status_code": 404, "error": "REST API not found"}
            else:
                return {"success": False, "status_code": response.status_code, "error": f"HTTP {response.status_code}"}
    except httpx.ConnectError:
        return {"success": False, "error": "Could not connect to server"}
    except httpx.TimeoutException:
        return {"success": False, "error": "Connection timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _test_rds_stream(station: dict) -> dict:
    """Test if an RDS stream URL is reachable."""
    stream_url = station.get("stream_url", "")
    if not stream_url:
        return {"success": False, "error": "No stream URL configured"}

    try:
        async with httpx.AsyncClient(timeout=3.0, follow_redirects=True) as client:
            response = await client.get(stream_url)
            if response.status_code == 200:
                content = response.text[:500]
                has_stats = any(k in content.lower() for k in ["songtitle", "servertitle", "currentlisteners", "source", "mount"])
                return {
                    "success": True,
                    "status_code": 200,
                    "has_stats": has_stats,
                }
            else:
                return {"success": False, "status_code": response.status_code, "error": f"HTTP {response.status_code}"}
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
    """Fast health scan — returns config checks instantly, external checks run in background."""
    if not current_user.get("is_network_admin") and not current_user.get("is_system_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    # Return cached result if available (includes completed external checks)
    cache_key = "health_scan_result"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    # Phase 1: Fast DB-only config checks (instant)
    sites_q = db.main_sites.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "site_type": 1}).to_list(100)
    wp_q = db.wordpress_sites.find({"is_active": True}, {"_id": 0}).to_list(100)
    rds_q = db.rds_stations.find({}, {"_id": 0}).to_list(200)
    sites, wp_sites_all, rds_stations_all = await asyncio.gather(sites_q, wp_q, rds_q)

    wp_by_site = {}
    for wp in wp_sites_all:
        sid = wp.get("main_site_id")
        if sid:
            wp_by_site.setdefault(sid, []).append(wp)
    rds_by_site = {}
    for st in rds_stations_all:
        sid = st.get("main_site_id")
        if sid:
            rds_by_site.setdefault(sid, []).append(st)

    # Build config-level checks (no external HTTP)
    checks = []
    pending_tasks = []

    for site in sites:
        sid = site["id"]

        # WP checks — any site with WP connections
        for wp in wp_by_site.get(sid, []):
            check_entry = {
                "site": site["name"], "site_id": sid,
                "site_slug": site.get("slug", ""), "site_type": site.get("site_type", ""),
                "type": "wordpress",
                "target": wp.get("name", wp.get("wp_base_url", "")),
                "wp_base_url": wp.get("wp_base_url", ""),
            }
            if not wp.get("app_password"):
                check_entry["success"] = False
                check_entry["error"] = "No application password configured"
                checks.append(check_entry)
            else:
                check_entry["success"] = True
                check_entry["status"] = "configured"
                checks.append(check_entry)
                pending_tasks.append((len(checks) - 1, wp, site))

        # RDS checks — any site with RDS stations
        for st in rds_by_site.get(sid, []):
            if not st.get("stream_url"):
                continue
            check_entry = {
                "site": site["name"], "site_id": sid,
                "site_slug": site.get("slug", ""), "site_type": site.get("site_type", ""),
                "type": "rds_stream",
                "target": st.get("name", st.get("code", "")),
                "stream_url": st.get("stream_url", ""),
                "success": True,
                "status": "configured",
            }
            checks.append(check_entry)
            pending_tasks.append((len(checks) - 1, st, site))

    has_issues = any(not c.get("success") for c in checks)

    if not checks:
        resp = {"has_issues": False, "diagnosis": "No connections configured yet.", "checks": []}
        await cache_set(cache_key, resp, ttl=60)
        return resp

    ok_count = sum(1 for c in checks if c.get("success"))
    fail_count = len(checks) - ok_count
    diagnosis = f"{ok_count} connections configured." if fail_count == 0 else f"{fail_count} config issues found."

    resp = {"has_issues": has_issues, "diagnosis": diagnosis, "checks": checks}
    await cache_set(cache_key, resp, ttl=60)

    # Phase 2: Fire-and-forget background task for external connectivity checks
    if pending_tasks:
        asyncio.create_task(_run_external_health_checks(pending_tasks, checks, cache_key))

    return resp


async def _run_external_health_checks(pending_tasks, checks, cache_key):
    """Background task: test actual WP/RDS connectivity and update cache."""
    try:
        async def _do_check(idx, config, site_info):
            check = checks[idx]
            if check["type"] == "wordpress":
                return idx, await _test_wp_connection(config)
            else:
                return idx, await _test_rds_stream(config)

        tasks = [_do_check(idx, config, site) for idx, config, site in pending_tasks]
        results = await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=8.0)

        for r in results:
            if isinstance(r, tuple):
                idx, result = r
                checks[idx].update(result)
                checks[idx].pop("status", None)

        has_issues = any(not c.get("success") for c in checks)
        ok_count = sum(1 for c in checks if c.get("success"))
        fail_count = len(checks) - ok_count
        if fail_count == 0:
            diagnosis = f"All {ok_count} connections are healthy."
        else:
            failing = [f"**{c['site']}** ({c['type']}): {c.get('error', 'unknown')}" for c in checks if not c.get("success")]
            diagnosis = f"{fail_count} of {len(checks)} connections have issues:\n" + "\n".join(f"- {f}" for f in failing)

        resp = {"has_issues": has_issues, "diagnosis": diagnosis, "checks": checks}
        await cache_set(cache_key, resp, ttl=60)
        logger.info(f"Health scan background: {ok_count} OK, {fail_count} failed out of {len(checks)}")
    except asyncio.TimeoutError:
        logger.warning("Health scan background checks timed out after 8s")
    except Exception as e:
        logger.warning(f"Health scan background error: {e}")


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
    """Scan all racks and sites for configuration issues — batch-optimized."""

    # Check cache first (60s TTL)
    cache_key = "rack_scan_result"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    issues = []

    # Batch-fetch ALL data in parallel (6 queries instead of N+1)
    sites_q = db.main_sites.find({}, {"_id": 0}).to_list(500)
    racks_q = db.server_racks.find({}, {"_id": 0}).to_list(100)
    fw_q = db.firewall_settings.find({}, {"_id": 0}).to_list(500)
    zt_q = db.zerotier_configs.find({}, {"_id": 0}).to_list(500)
    wp_q = db.wordpress_sites.find({}, {"_id": 0, "main_site_id": 1, "wp_base_url": 1}).to_list(500)
    rds_q = db.rds_stations.find({}, {"_id": 0, "main_site_id": 1}).to_list(500)
    geo_q = db.firewall_geo_rules.find({}, {"_id": 0, "rack_id": 1}).to_list(100)

    all_sites, all_racks, fw_settings, zt_configs, wp_sites_all, rds_all, geo_rules_all = await asyncio.gather(
        sites_q, racks_q, fw_q, zt_q, wp_q, rds_q, geo_q
    )

    # Build lookup maps
    fw_map = {s["main_site_id"]: s.get("enabled", False) for s in fw_settings if "main_site_id" in s}
    zt_map = {z["main_site_id"]: z for z in zt_configs if "main_site_id" in z}
    wp_map = {}
    for wp in wp_sites_all:
        sid = wp.get("main_site_id")
        if sid:
            wp_map.setdefault(sid, []).append(wp)
    rds_map = {}
    for st in rds_all:
        sid = st.get("main_site_id")
        if sid:
            rds_map.setdefault(sid, []).append(st)
    geo_map = {g["rack_id"]: g for g in geo_rules_all if "rack_id" in g}

    for site in all_sites:
        site_id = site.get("id", "")
        site_name = site.get("name", "Unknown")
        site_slug = site.get("slug", "")
        site_type = site.get("site_type", "radio")

        # Firewall check
        if not fw_map.get(site_id, False):
            issues.append({
                "site_id": site_id, "site_name": site_name, "site_slug": site_slug,
                "category": "security", "severity": "critical",
                "title": "Firewall not enabled",
                "description": f"Clara Global Protect is not active for {site_name}.",
                "action": "enable_firewall", "action_label": "Enable Firewall",
            })

        # ZeroTier check for technical sites
        if site_type == "technical":
            zt = zt_map.get(site_id)
            if not zt or not zt.get("api_token"):
                issues.append({
                    "site_id": site_id, "site_name": site_name, "site_slug": site_slug,
                    "category": "configuration", "severity": "warning",
                    "title": "ZeroTier not configured",
                    "description": f"ZeroTier network monitoring is not set up for {site_name}.",
                    "action": "configure_zerotier", "action_label": "Configure",
                })

        # WordPress check
        enabled_features = site.get("enabled_features", [])
        if "wordpress" in enabled_features:
            wp_list = wp_map.get(site_id, [])
            has_wp = any(w.get("wp_base_url") for w in wp_list)
            if not has_wp:
                issues.append({
                    "site_id": site_id, "site_name": site_name, "site_slug": site_slug,
                    "category": "configuration", "severity": "warning",
                    "title": "WordPress not connected",
                    "description": f"WordPress integration is enabled but not configured for {site_name}.",
                    "action": "configure_wordpress", "action_label": "Configure",
                })

        # RDS check for radio sites
        if site_type == "radio":
            if not rds_map.get(site_id):
                issues.append({
                    "site_id": site_id, "site_name": site_name, "site_slug": site_slug,
                    "category": "configuration", "severity": "info",
                    "title": "No RDS stations configured",
                    "description": f"No RDS stations are set up for {site_name}.",
                    "action": "configure_rds", "action_label": "Configure",
                })

        # 2FA check
        if not site.get("require_2fa", False):
            issues.append({
                "site_id": site_id, "site_name": site_name, "site_slug": site_slug,
                "category": "security", "severity": "info",
                "title": "2FA not enforced",
                "description": f"Two-factor authentication is not required for {site_name}.",
                "action": "enable_2fa", "action_label": "Enable",
            })

    # Geo-blocking on racks
    for rack in all_racks:
        rack_id = rack.get("id", "")
        rack_name = rack.get("name", f"Rack {rack_id}")
        if not geo_map.get(rack_id):
            issues.append({
                "rack_id": rack_id, "site_name": rack_name,
                "category": "security", "severity": "warning",
                "title": "Geo-blocking using defaults",
                "description": f"Rack '{rack_name}' uses default European geo-blocking.",
                "action": "configure_geo", "action_label": "Review",
            })

    # Sort by severity
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda x: severity_order.get(x.get("severity", "info"), 3))

    result = {
        "summary": {
            "total_sites": len(all_sites),
            "total_racks": len(all_racks),
            "total_issues": len(issues),
            "critical": len([i for i in issues if i["severity"] == "critical"]),
            "warnings": len([i for i in issues if i["severity"] == "warning"]),
            "info": len([i for i in issues if i["severity"] == "info"]),
        },
        "issues": issues,
    }

    await cache_set(cache_key, result, ttl=60)
    return result
