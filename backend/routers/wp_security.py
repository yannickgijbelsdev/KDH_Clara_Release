"""WordPress Security router — WAF rules, IP blocklist, login protection.

All WAF rules, IP blocks, and rate limiting are synced to Cloudflare
when credentials are configured. Wordfence monitoring provides
vulnerability scanning and plugin detection.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone
import httpx

from routers.domains import require_system_admin
from services.main_site_context import get_main_site_id_from_header
from routers.main_sites import db
from services.cloudflare_waf import (
    test_credentials as cf_test_credentials,
    sync_waf_rules as cf_sync_waf_rules,
    sync_ip_block as cf_sync_ip_block,
    remove_ip_block as cf_remove_ip_block,
)
from services.wordfence import check_wordfence_installed, scan_vulnerabilities

wp_security_router = APIRouter(prefix="/wp-security", tags=["wp-security"])


async def _get_wp_config(main_site_id: str) -> dict:
    """Get WP security config for a main site."""
    config = await db.wp_security_configs.find_one(
        {"main_site_id": main_site_id}, {"_id": 0}
    )
    return config or {}


def _safe_config(config: dict) -> dict:
    """Return config with sensitive fields masked."""
    safe = {k: v for k, v in config.items()}
    if safe.get("cf_api_token"):
        safe["cf_api_token_set"] = True
        safe["cf_api_token_preview"] = f"...{safe['cf_api_token'][-8:]}"
        del safe["cf_api_token"]
    else:
        safe["cf_api_token_set"] = False
        safe["cf_api_token_preview"] = None
    return safe


# ─── Config ─────────────────────────────────────────────────────────

@wp_security_router.get("/config")
async def get_wp_security_config(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="No main site context")
    config = await _get_wp_config(main_site_id)
    return _safe_config(config)


@wp_security_router.put("/config")
async def update_wp_security_config(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="No main site context")

    body = await request.json()
    wordpress_url = body.get("wordpress_url", "").strip().rstrip("/")

    if not wordpress_url:
        raise HTTPException(status_code=400, detail="WordPress URL is required")

    now = datetime.now(timezone.utc).isoformat()
    await db.wp_security_configs.update_one(
        {"main_site_id": main_site_id},
        {"$set": {
            "main_site_id": main_site_id,
            "wordpress_url": wordpress_url,
            "updated_at": now,
        }, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {"status": "ok"}


# ─── Cloudflare Credentials ────────────────────────────────────────

@wp_security_router.put("/cloudflare-config")
async def update_cloudflare_config(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    """Save Cloudflare API Token and Zone ID for this WP site."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="No main site context")

    body = await request.json()
    update = {}
    if "cf_api_token" in body:
        update["cf_api_token"] = body["cf_api_token"].strip()
    if "cf_zone_id" in body:
        update["cf_zone_id"] = body["cf_zone_id"].strip()

    if not update:
        raise HTTPException(status_code=400, detail="No credentials provided")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.wp_security_configs.update_one(
        {"main_site_id": main_site_id},
        {"$set": update, "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"status": "ok"}


@wp_security_router.get("/cloudflare-test")
async def test_cloudflare_config(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    """Test the stored Cloudflare credentials."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        return {"status": "error", "message": "No main site context"}

    config = await _get_wp_config(main_site_id)
    api_token = config.get("cf_api_token")
    zone_id = config.get("cf_zone_id")

    if not api_token or not zone_id:
        return {
            "status": "error",
            "message": "Cloudflare credentials not configured",
            "steps": [
                "Enter your Cloudflare API Token and Zone ID in Step 2",
                "Go to dash.cloudflare.com → Profile → API Tokens",
                "Create a token with 'Zone WAF Edit' and 'Zone Read' permissions",
            ],
        }

    return await cf_test_credentials(api_token, zone_id)


# ─── WAF Rules ──────────────────────────────────────────────────────

@wp_security_router.put("/waf-rules")
async def update_waf_rules(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="No main site context")

    body = await request.json()
    rules = body.get("rules", [])

    now = datetime.now(timezone.utc).isoformat()
    await db.wp_security_configs.update_one(
        {"main_site_id": main_site_id},
        {"$set": {"waf_rules": rules, "updated_at": now}},
        upsert=True,
    )

    # Sync to Cloudflare if configured
    config = await _get_wp_config(main_site_id)
    cf_result = None
    if config.get("cf_api_token") and config.get("cf_zone_id"):
        cf_result = await cf_sync_waf_rules(config["cf_api_token"], config["cf_zone_id"], rules)

    return {
        "status": "ok",
        "count": len(rules),
        "active": sum(1 for r in rules if r.get("enabled")),
        "cloudflare_sync": cf_result,
    }


# ─── IP Blocklist ───────────────────────────────────────────────────

@wp_security_router.post("/blocklist")
async def add_to_blocklist(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="No main site context")

    body = await request.json()
    ip = body.get("ip", "").strip()
    note = body.get("note", "").strip()

    if not ip:
        raise HTTPException(status_code=400, detail="IP address is required")

    entry = {
        "ip": ip,
        "note": note,
        "added_at": datetime.now(timezone.utc).isoformat(),
        "added_by": current_user.get("name", current_user.get("email", "")),
    }

    # Sync to Cloudflare if configured
    config = await _get_wp_config(main_site_id)
    cf_result = None
    if config.get("cf_api_token") and config.get("cf_zone_id"):
        cf_result = await cf_sync_ip_block(config["cf_api_token"], config["cf_zone_id"], ip, note)
        if cf_result.get("cf_rule_id"):
            entry["cf_rule_id"] = cf_result["cf_rule_id"]

    await db.wp_security_configs.update_one(
        {"main_site_id": main_site_id},
        {"$push": {"ip_blocklist": entry}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"status": "ok", "ip": ip, "cloudflare_sync": cf_result}


@wp_security_router.delete("/blocklist/{ip}")
async def remove_from_blocklist(
    ip: str,
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="No main site context")

    # Remove from Cloudflare if configured
    config = await _get_wp_config(main_site_id)
    cf_result = None
    if config.get("cf_api_token") and config.get("cf_zone_id"):
        cf_result = await cf_remove_ip_block(config["cf_api_token"], config["cf_zone_id"], ip)

    await db.wp_security_configs.update_one(
        {"main_site_id": main_site_id},
        {"$pull": {"ip_blocklist": {"ip": ip}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"status": "ok", "ip": ip, "cloudflare_sync": cf_result}


# ─── Login Protection ──────────────────────────────────────────────

@wp_security_router.put("/login-protection")
async def update_login_protection(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="No main site context")

    body = await request.json()
    login_protection = {
        "enabled": body.get("enabled", False),
        "block_xmlrpc": body.get("block_xmlrpc", True),
        "limit_login_attempts": body.get("limit_login_attempts", True),
        "max_attempts": body.get("max_attempts", 5),
    }

    await db.wp_security_configs.update_one(
        {"main_site_id": main_site_id},
        {"$set": {"login_protection": login_protection, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )

    # Sync login protection rules to Cloudflare WAF
    config = await _get_wp_config(main_site_id)
    cf_result = None
    if config.get("cf_api_token") and config.get("cf_zone_id") and login_protection["enabled"]:
        login_rules = []
        if login_protection["block_xmlrpc"]:
            login_rules.append({
                "id": "login_block_xmlrpc", "name": "Block XML-RPC Auth",
                "target": "/xmlrpc.php", "action": "block", "enabled": True,
            })
        if login_protection["limit_login_attempts"]:
            login_rules.append({
                "id": "login_rate_limit_wplogin", "name": "Rate Limit wp-login",
                "target": "/wp-login.php", "action": "rate_limit", "enabled": True,
            })
        cf_result = await cf_sync_waf_rules(
            config["cf_api_token"], config["cf_zone_id"],
            login_rules, clara_prefix="clara-wp-login-",
        )

    return {"status": "ok", "cloudflare_sync": cf_result}


# ─── WordPress / Connection Test ────────────────────────────────────

@wp_security_router.get("/test-connection")
async def test_wp_connection(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        return {"status": "error", "message": "No main site context", "steps": ["Navigate to a WP Security site first"]}

    config = await _get_wp_config(main_site_id)
    wp_url = config.get("wordpress_url")
    if not wp_url:
        return {"status": "error", "message": "WordPress URL not configured", "steps": ["Enter the WordPress URL in Step 1", "Example: https://yoursite.com"]}

    wp_url = wp_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(wp_url)
            if resp.status_code >= 400:
                return {"status": "error", "message": f"Site returned HTTP {resp.status_code}", "steps": [f"The site returned HTTP {resp.status_code}", "Verify the URL is correct and the site is online"]}

            body = resp.text[:10000].lower()
            headers_str = str(resp.headers).lower()
            wp_indicators = []

            if "wp-content" in body:
                wp_indicators.append("wp-content found in HTML")
            if "wp-includes" in body:
                wp_indicators.append("wp-includes found in HTML")
            if "wp-json" in body or "wp-json" in headers_str:
                wp_indicators.append("wp-json API reference found")
            if "wordpress" in body:
                wp_indicators.append("WordPress reference in HTML")
            if 'name="generator" content="wordpress' in body:
                wp_indicators.append("WordPress generator meta tag found")
            if "x-powered-by" in headers_str and "wordpress" in headers_str:
                wp_indicators.append("X-Powered-By: WordPress header")

            if not wp_indicators:
                try:
                    api_resp = await client.get(f"{wp_url}/wp-json/", timeout=5)
                    if api_resp.status_code == 200:
                        api_body = api_resp.text[:2000].lower()
                        if "wp/v2" in api_body or "wordpress" in api_body:
                            wp_indicators.append("WordPress REST API (/wp-json/) detected")
                except Exception:
                    pass

            if not wp_indicators:
                try:
                    login_resp = await client.get(f"{wp_url}/wp-login.php", timeout=5)
                    if login_resp.status_code == 200 and ("wp-login" in login_resp.text[:3000].lower() or "wordpress" in login_resp.text[:3000].lower()):
                        wp_indicators.append("WordPress login page (/wp-login.php) found")
                except Exception:
                    pass

            if wp_indicators:
                return {"status": "ok", "message": f"WordPress site reachable ({wp_url})", "is_wordpress": True, "indicators": wp_indicators}

            return {"status": "warning", "message": "Site reachable but may not be WordPress", "steps": [
                "The site responded but no WordPress indicators were found",
                "Checked: HTML content, response headers, /wp-json/ API, /wp-login.php",
                "If this is a WordPress site, a security plugin may be hiding these indicators",
                "You can still proceed — WAF rules and login protection will work on any site behind Cloudflare",
            ]}

    except httpx.ConnectError:
        return {"status": "error", "message": f"Cannot reach {wp_url}", "steps": ["The site is not reachable", "Check the URL and make sure the site is online", "Make sure the domain is correct (include https://)"]}
    except httpx.TimeoutException:
        return {"status": "error", "message": "Connection timed out", "steps": ["The site is too slow to respond", "Try again in a few minutes"]}
    except Exception as e:
        return {"status": "error", "message": str(e), "steps": ["An unexpected error occurred"]}


# ─── Wordfence ──────────────────────────────────────────────────────

@wp_security_router.get("/wordfence-status")
async def get_wordfence_status(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    """Check Wordfence installation and scan for vulnerabilities."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        return {"status": "error", "message": "No main site context"}

    config = await _get_wp_config(main_site_id)
    wp_url = config.get("wordpress_url")
    if not wp_url:
        return {"status": "error", "message": "WordPress URL not configured"}

    # Check Wordfence installation
    wf_status = await check_wordfence_installed(wp_url)

    # Scan for vulnerabilities
    vuln_scan = await scan_vulnerabilities(wp_url)

    return {
        "status": "ok",
        "wordfence": wf_status,
        "vulnerability_scan": vuln_scan,
    }
