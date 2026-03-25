"""WordPress Security router — WAF rules, IP blocklist, login protection."""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone
import httpx

from routers.domains import require_system_admin
from services.main_site_context import get_main_site_id_from_header
from routers.main_sites import db

wp_security_router = APIRouter(prefix="/wp-security", tags=["wp-security"])


async def _get_wp_config(main_site_id: str) -> dict:
    """Get WP security config for a main site."""
    config = await db.wp_security_configs.find_one(
        {"main_site_id": main_site_id}, {"_id": 0}
    )
    return config or {}


@wp_security_router.get("/config")
async def get_wp_security_config(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="No main site context")
    config = await _get_wp_config(main_site_id)
    return config


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
    return {"status": "ok", "count": len(rules), "active": sum(1 for r in rules if r.get("enabled"))}


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

    # Add to blocklist array, avoid duplicates
    await db.wp_security_configs.update_one(
        {"main_site_id": main_site_id},
        {"$push": {"ip_blocklist": entry}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"status": "ok", "ip": ip}


@wp_security_router.delete("/blocklist/{ip}")
async def remove_from_blocklist(
    ip: str,
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="No main site context")

    await db.wp_security_configs.update_one(
        {"main_site_id": main_site_id},
        {"$pull": {"ip_blocklist": {"ip": ip}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"status": "ok", "ip": ip}


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
    return {"status": "ok"}


@wp_security_router.get("/test-connection")
async def test_wp_connection(
    request: Request,
    current_user: dict = Depends(require_system_admin),
):
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        return {
            "status": "error",
            "message": "No main site context",
            "steps": ["Navigate to a WP Security site first"],
        }

    config = await _get_wp_config(main_site_id)
    wp_url = config.get("wordpress_url")
    if not wp_url:
        return {
            "status": "error",
            "message": "WordPress URL not configured",
            "steps": [
                "Enter the WordPress URL in Step 1",
                "Example: https://yoursite.com",
            ],
        }

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(wp_url)
            if resp.status_code == 200:
                # Check if it's actually WordPress
                body = resp.text[:5000].lower()
                is_wp = 'wp-content' in body or 'wordpress' in body or 'wp-json' in body
                if is_wp:
                    return {"status": "ok", "message": f"WordPress site reachable ({wp_url})", "is_wordpress": True}
                return {"status": "warning", "message": "Site reachable but may not be WordPress", "steps": ["The site responded but no WordPress indicators were found", "Verify the URL is correct"]}
            return {
                "status": "error",
                "message": f"Site returned HTTP {resp.status_code}",
                "steps": [f"The site returned HTTP {resp.status_code}", "Verify the URL is correct and the site is online"],
            }
    except httpx.ConnectError:
        return {
            "status": "error",
            "message": f"Cannot reach {wp_url}",
            "steps": ["The site is not reachable", "Check the URL and make sure the site is online"],
        }
    except httpx.TimeoutException:
        return {
            "status": "error",
            "message": "Connection timed out",
            "steps": ["The site is too slow to respond", "Try again in a few minutes"],
        }
    except Exception as e:
        return {"status": "error", "message": str(e), "steps": ["An unexpected error occurred"]}
