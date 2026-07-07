"""Domain & Subdomain management routes.

Manages domain configurations for main sites (custom domains, koodh.com subdomains)
and subdomain routing rules (login.koodh.com, global.koodh.com, etc.).
Cloudflare API integration for DNS automation.
"""
import uuid
import dns.resolver
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from database import db
from services.auth import get_current_user

import logging

logger = logging.getLogger(__name__)

domains_router = APIRouter(prefix="/domains", tags=["domains"])


def _now():
    return datetime.now(timezone.utc).isoformat()


# ---------- Auth helpers ----------

def require_system_admin(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_system_admin"):
        raise HTTPException(status_code=403, detail="System Administrator access required")
    return current_user


def require_network_admin(current_user: dict = Depends(get_current_user)):
    if not (current_user.get("is_system_admin") or current_user.get("is_network_admin")):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ---------- Models ----------

class DomainConfigCreate(BaseModel):
    main_site_id: str
    domain_type: str  # 'koodh' or 'custom'
    subdomain: Optional[str] = None  # e.g. 'radiogroep' -> radiogroep.koodh.com
    custom_domain: Optional[str] = None  # e.g. 'radio.example.com'


class DomainConfigUpdate(BaseModel):
    domain_type: Optional[str] = None
    subdomain: Optional[str] = None
    custom_domain: Optional[str] = None
    ssl_enabled: Optional[bool] = None


class SubdomainRouteCreate(BaseModel):
    subdomain: str  # e.g. 'login', 'global'
    label: str  # e.g. 'Login Portal', 'Global Management'
    description: Optional[str] = None
    route_type: str  # 'auth', 'network', 'firewall', 'app'
    target_path: str  # e.g. '/login', '/network'
    is_active: bool = True


class SubdomainRouteUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    route_type: Optional[str] = None
    target_path: Optional[str] = None
    is_active: Optional[bool] = None


class CloudflareConfigUpdate(BaseModel):
    api_token: Optional[str] = None
    zone_id: Optional[str] = None
    base_domain: Optional[str] = None


# ---------- Seed default subdomain routes ----------

DEFAULT_SUBDOMAIN_ROUTES = [
    {
        "subdomain": "clara",
        "label": "Clara Dashboard",
        "description": "Main application - site dashboards, shows, content",
        "route_type": "app",
        "target_path": "/",
        "is_active": True,
        "is_system": True,
    },
    {
        "subdomain": "login",
        "label": "Login Portal",
        "description": "Authentication - login, 2FA, password reset",
        "route_type": "auth",
        "target_path": "/login",
        "is_active": False,
        "is_system": True,
    },
    {
        "subdomain": "global",
        "label": "Global Management",
        "description": "Network Management, Firewall, License Manager",
        "route_type": "network",
        "target_path": "/network",
        "is_active": False,
        "is_system": True,
    },
    {
        "subdomain": "verify",
        "label": "Domain Verification",
        "description": "Target record for custom domain CNAME verification (_clara-verify.<domain> → verify.koodh.com)",
        "route_type": "app",
        "target_path": "/verify",
        "is_active": True,
        "is_system": True,
    },
]


async def seed_subdomain_routes():
    """Seed default subdomain routes if none exist, and backfill missing system routes."""
    count = await db.subdomain_routes.count_documents({})
    if count == 0:
        for route in DEFAULT_SUBDOMAIN_ROUTES:
            route["id"] = str(uuid.uuid4())
            route["created_at"] = _now()
            route["updated_at"] = _now()
            await db.subdomain_routes.insert_one(route)
        logger.info(f"Seeded {len(DEFAULT_SUBDOMAIN_ROUTES)} default subdomain routes")
        return

    # Backfill: add any system subdomains that aren't yet present (e.g. 'verify' on older installs)
    for route in DEFAULT_SUBDOMAIN_ROUTES:
        if not route.get("is_system"):
            continue
        existing = await db.subdomain_routes.find_one({"subdomain": route["subdomain"]})
        if not existing:
            new_route = {**route, "id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now()}
            await db.subdomain_routes.insert_one(new_route)
            logger.info(f"Backfilled missing system subdomain route: {route['subdomain']}")


# ---------- Cloudflare Config ----------

@domains_router.get("/cloudflare/config")
async def get_cloudflare_config(current_user: dict = Depends(require_system_admin)):
    """Get Cloudflare configuration (token masked)."""
    config = await db.cloudflare_config.find_one({"type": "global"}, {"_id": 0})
    if not config:
        return {
            "configured": False,
            "api_token_set": False,
            "zone_id": None,
            "base_domain": "koodh.com",
        }
    return {
        "configured": bool(config.get("api_token")),
        "api_token_set": bool(config.get("api_token")),
        "api_token_preview": f"...{config['api_token'][-8:]}" if config.get("api_token") else None,
        "zone_id": config.get("zone_id"),
        "base_domain": config.get("base_domain", "koodh.com"),
        "updated_at": config.get("updated_at"),
        "updated_by": config.get("updated_by"),
    }


@domains_router.put("/cloudflare/config")
async def update_cloudflare_config(
    data: CloudflareConfigUpdate,
    current_user: dict = Depends(require_system_admin)
):
    """Update Cloudflare API configuration."""
    update_fields = {"updated_at": _now(), "updated_by": current_user.get("name", "Unknown"), "type": "global"}

    if data.api_token is not None:
        update_fields["api_token"] = data.api_token
    if data.zone_id is not None:
        update_fields["zone_id"] = data.zone_id
    if data.base_domain is not None:
        update_fields["base_domain"] = data.base_domain

    await db.cloudflare_config.update_one(
        {"type": "global"},
        {"$set": update_fields},
        upsert=True
    )
    return {"status": "ok", "message": "Cloudflare configuration updated"}


@domains_router.get("/cloudflare/test-connection")
async def test_cloudflare_connection(current_user: dict = Depends(require_system_admin)):
    """Test the Cloudflare API connection by verifying the token and zone."""
    config = await db.cloudflare_config.find_one({"type": "global"}, {"_id": 0})
    if not config or not config.get("api_token"):
        return {
            "status": "error",
            "message": "No API token configured",
            "steps": [
                "Go to dash.cloudflare.com and log in",
                "Click your profile icon (top right) → My Profile",
                "Click 'API Tokens' in the left sidebar",
                "Click 'Create Token' → use the 'Edit zone DNS' template",
                "Under 'Zone Resources', select your domain",
                "Click 'Continue to summary' → 'Create Token'",
                "Copy the token and paste it in Step 1 above",
            ],
            "link": "https://dash.cloudflare.com/profile/api-tokens",
            "link_label": "Open Cloudflare API Tokens",
        }
    if not config.get("zone_id"):
        return {
            "status": "error",
            "message": "No Zone ID configured",
            "steps": [
                "Go to dash.cloudflare.com and log in",
                "Click on your domain name in the dashboard",
                "On the Overview page, scroll down on the right sidebar",
                "Find 'Zone ID' — it's a long string of letters and numbers",
                "Copy this Zone ID and paste it in Step 2 above",
            ],
            "link": "https://dash.cloudflare.com",
            "link_label": "Open Cloudflare Dashboard",
        }

    token = config["api_token"]
    zone_id = config["zone_id"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{CF_API_BASE}/user/tokens/verify",
                headers={"Authorization": f"Bearer {token}"}
            )
            if resp.status_code == 401:
                return {
                    "status": "error",
                    "message": "API token is invalid or expired",
                    "steps": [
                        "Your current token no longer works — it may have been deleted or expired",
                        "Go to dash.cloudflare.com → My Profile → API Tokens",
                        "If you see your old token, click the '...' menu and 'Roll' to regenerate it",
                        "Or create a new token using the 'Edit zone DNS' template",
                        "Copy the new token and paste it in Step 1 above (click the step to open it)",
                    ],
                    "link": "https://dash.cloudflare.com/profile/api-tokens",
                    "link_label": "Open Cloudflare API Tokens",
                }

            token_data = resp.json()
            if not token_data.get("success"):
                return {
                    "status": "error",
                    "message": "Token verification failed",
                    "steps": [
                        "The token exists but Cloudflare rejected it",
                        "Go to dash.cloudflare.com → My Profile → API Tokens",
                        "Check that the token has 'Zone:DNS:Edit' permission",
                        "If unsure, create a new token with the 'Edit zone DNS' template",
                    ],
                    "link": "https://dash.cloudflare.com/profile/api-tokens",
                    "link_label": "Open Cloudflare API Tokens",
                }

            resp2 = await client.get(
                f"{CF_API_BASE}/zones/{zone_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
            zone_data = resp2.json()
            if not zone_data.get("success"):
                errors = zone_data.get("errors", [])
                msg = errors[0].get("message") if errors else "Zone not found"
                return {
                    "status": "error",
                    "message": f"Zone access error: {msg}",
                    "steps": [
                        f"Your token works, but the Zone ID '{zone_id[:8]}...' was not found or your token doesn't have access to it",
                        "Go to dash.cloudflare.com → click your domain → Overview",
                        "On the right sidebar, scroll down to find 'Zone ID'",
                        "Make sure this Zone ID matches what you entered in Step 2",
                        "Also check that your API token includes this zone in its permissions",
                    ],
                    "link": "https://dash.cloudflare.com",
                    "link_label": "Open Cloudflare Dashboard",
                }

            zone_name = zone_data.get("result", {}).get("name", "Unknown")
            zone_status = zone_data.get("result", {}).get("status", "unknown")

            return {
                "status": "ok",
                "message": f"Connected to {zone_name} (status: {zone_status})",
                "zone_name": zone_name,
                "zone_status": zone_status,
            }
    except httpx.ConnectError:
        return {
            "status": "error",
            "message": "Cannot reach Cloudflare API",
            "steps": [
                "The server could not connect to api.cloudflare.com",
                "This is usually a temporary network issue",
                "Wait a few minutes and click the refresh button to try again",
            ],
        }
    except httpx.TimeoutException:
        return {
            "status": "error",
            "message": "Connection to Cloudflare timed out",
            "steps": [
                "Cloudflare's API is responding too slowly",
                "This is usually temporary — wait a moment and retry",
            ],
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Connection test failed: {str(e)}",
            "steps": [
                "An unexpected error occurred during the test",
                "Verify your API Token and Zone ID are correct",
                "If the problem persists, try creating a new API token",
            ],
            "link": "https://dash.cloudflare.com/profile/api-tokens",
            "link_label": "Open Cloudflare API Tokens",
        }


# ---------- Cloudflare API Helpers ----------

CF_API_BASE = "https://api.cloudflare.com/client/v4"


async def _get_cf_credentials():
    """Get Cloudflare API token and zone ID from DB."""
    config = await db.cloudflare_config.find_one({"type": "global"}, {"_id": 0})
    if not config or not config.get("api_token") or not config.get("zone_id"):
        raise HTTPException(status_code=400, detail="Cloudflare API not configured. Set API Token and Zone ID first.")
    return config["api_token"], config["zone_id"], config.get("base_domain", "koodh.com")


async def _cf_request(method: str, path: str, token: str, json_data=None):
    """Make an authenticated request to the Cloudflare API."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(
                method,
                f"{CF_API_BASE}{path}",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=json_data,
            )
            try:
                data = resp.json()
            except Exception:
                raise HTTPException(status_code=502, detail=f"Cloudflare gaf een ongeldig antwoord (HTTP {resp.status_code})")
            
            if not data.get("success", False):
                errors = data.get("errors", [])
                msg = errors[0].get("message") if errors else f"Cloudflare API fout ({resp.status_code})"
                raise HTTPException(status_code=resp.status_code if resp.status_code >= 400 else 502, detail=msg)
            return data
    except HTTPException:
        raise
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Cannot connect to Cloudflare API")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Cloudflare API timeout - probeer het opnieuw")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cloudflare verbindingsfout: {str(e)}")


# ---------- Cloudflare DNS Sync ----------

@domains_router.get("/cloudflare/dns-records")
async def list_cloudflare_dns_records(current_user: dict = Depends(require_system_admin)):
    """Fetch all DNS records from Cloudflare for the configured zone."""
    token, zone_id, base_domain = await _get_cf_credentials()
    
    all_records = []
    page = 1
    while True:
        data = await _cf_request("GET", f"/zones/{zone_id}/dns_records?page={page}&per_page=100", token)
        all_records.extend(data.get("result", []))
        total_pages = data.get("result_info", {}).get("total_pages", 1)
        if page >= total_pages:
            break
        page += 1
    
    # Filter to only records for our base domain
    records = []
    for r in all_records:
        records.append({
            "id": r["id"],
            "type": r["type"],
            "name": r["name"],
            "content": r["content"],
            "proxied": r.get("proxied", False),
            "ttl": r.get("ttl", 1),
        })
    
    return {"records": records, "total": len(records), "zone_id": zone_id, "base_domain": base_domain}


@domains_router.post("/cloudflare/verify-token")
async def verify_cloudflare_token(current_user: dict = Depends(require_system_admin)):
    """Verify that the stored Cloudflare API token is valid."""
    token, zone_id, base_domain = await _get_cf_credentials()
    
    try:
        data = await _cf_request("GET", "/user/tokens/verify", token)
        status = data.get("result", {}).get("status", "unknown")
        
        # Also verify zone access
        zone_data = await _cf_request("GET", f"/zones/{zone_id}", token)
        zone_name = zone_data.get("result", {}).get("name", "unknown")
        zone_status = zone_data.get("result", {}).get("status", "unknown")
        
        return {
            "valid": status == "active",
            "token_status": status,
            "zone_name": zone_name,
            "zone_status": zone_status,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cloudflare verificatie mislukt: {str(e)}")


@domains_router.post("/cloudflare/sync")
async def sync_cloudflare_dns(current_user: dict = Depends(require_system_admin)):
    """Sync all Clara DNS records with Cloudflare.
    
    Creates or updates DNS records for:
    - Subdomain routes (clara.koodh.com, login.koodh.com, etc.)
    - Site domain configs (radiogroep.koodh.com, etc.)
    """
    token, zone_id, base_domain = await _get_cf_credentials()
    
    # 1. Fetch existing DNS records from Cloudflare
    all_cf_records = []
    page = 1
    while True:
        data = await _cf_request("GET", f"/zones/{zone_id}/dns_records?page={page}&per_page=100", token)
        all_cf_records.extend(data.get("result", []))
        total_pages = data.get("result_info", {}).get("total_pages", 1)
        if page >= total_pages:
            break
        page += 1
    
    cf_record_map = {r["name"]: r for r in all_cf_records}
    
    # 2. Determine what Clara needs
    needed_records = []
    
    # a) Subdomain routes
    routes = await db.subdomain_routes.find({"is_active": True}, {"_id": 0}).to_list(100)
    for route in routes:
        fqdn = f"{route['subdomain']}.{base_domain}"
        needed_records.append({
            "fqdn": fqdn,
            "type": "CNAME",
            "content": base_domain,
            "proxied": True,
            "source": "route",
            "label": route.get("label", route["subdomain"]),
        })
    
    # b) Site domain configs (koodh.com subdomains)
    site_configs = await db.domain_configs.find({"domain_type": "koodh"}, {"_id": 0}).to_list(500)
    for cfg in site_configs:
        subdomain = cfg.get("subdomain")
        if subdomain:
            fqdn = f"{subdomain}.{base_domain}"
            # Skip if already covered by a route
            if not any(r["fqdn"] == fqdn for r in needed_records):
                needed_records.append({
                    "fqdn": fqdn,
                    "type": "CNAME",
                    "content": base_domain,
                    "proxied": True,
                    "source": "site",
                    "label": cfg.get("site_name", subdomain),
                })
    
    # 3. Sync: create or update
    results = {"created": [], "updated": [], "unchanged": [], "errors": []}
    
    for rec in needed_records:
        fqdn = rec["fqdn"]
        existing = cf_record_map.get(fqdn)
        
        record_payload = {
            "type": rec["type"],
            "name": fqdn,
            "content": rec["content"],
            "proxied": rec["proxied"],
            "ttl": 1,  # Auto TTL
        }
        
        try:
            if existing:
                # Check if update needed
                if (existing.get("content") == rec["content"]
                    and existing.get("type") == rec["type"]
                    and existing.get("proxied") == rec["proxied"]):
                    results["unchanged"].append({
                        "fqdn": fqdn,
                        "source": rec["source"],
                        "label": rec["label"],
                        "cf_id": existing["id"],
                    })
                else:
                    await _cf_request(
                        "PUT",
                        f"/zones/{zone_id}/dns_records/{existing['id']}",
                        token,
                        json_data=record_payload,
                    )
                    results["updated"].append({
                        "fqdn": fqdn,
                        "source": rec["source"],
                        "label": rec["label"],
                        "cf_id": existing["id"],
                    })
            else:
                resp_data = await _cf_request(
                    "POST",
                    f"/zones/{zone_id}/dns_records",
                    token,
                    json_data=record_payload,
                )
                results["created"].append({
                    "fqdn": fqdn,
                    "source": rec["source"],
                    "label": rec["label"],
                    "cf_id": resp_data.get("result", {}).get("id"),
                })
        except HTTPException as e:
            results["errors"].append({
                "fqdn": fqdn,
                "source": rec["source"],
                "label": rec["label"],
                "error": e.detail,
            })
    
    # Store last sync timestamp
    await db.cloudflare_config.update_one(
        {"type": "global"},
        {"$set": {"last_sync": _now(), "last_sync_by": current_user.get("name", "Unknown")}},
    )
    
    return {
        "status": "ok",
        "total_needed": len(needed_records),
        "created": results["created"],
        "updated": results["updated"],
        "unchanged": results["unchanged"],
        "errors": results["errors"],
    }


@domains_router.post("/cloudflare/dns-records")
async def create_cloudflare_dns_record(
    record: dict,
    current_user: dict = Depends(require_system_admin),
):
    """Create a single DNS record in Cloudflare."""
    token, zone_id, base_domain = await _get_cf_credentials()
    
    payload = {
        "type": record.get("type", "CNAME"),
        "name": record["name"],
        "content": record["content"],
        "proxied": record.get("proxied", True),
        "ttl": record.get("ttl", 1),
    }
    
    data = await _cf_request("POST", f"/zones/{zone_id}/dns_records", token, json_data=payload)
    return {"status": "ok", "record": data.get("result")}


@domains_router.delete("/cloudflare/dns-records/{record_id}")
async def delete_cloudflare_dns_record(
    record_id: str,
    current_user: dict = Depends(require_system_admin),
):
    """Delete a single DNS record from Cloudflare."""
    token, zone_id, base_domain = await _get_cf_credentials()
    await _cf_request("DELETE", f"/zones/{zone_id}/dns_records/{record_id}", token)
    return {"status": "ok"}


@domains_router.post("/cloudflare/test-worker")
async def test_cloudflare_worker(current_user: dict = Depends(require_system_admin)):
    """Test all configured subdomains: DNS resolution, Worker recognition, and connectivity.
    
    For each active route, checks:
    1. DNS — does the CNAME record exist?
    2. Worker — is the route in the Worker's route table?
    3. HTTP — can we reach the subdomain?
    """
    import dns.resolver

    cf_config = await db.cloudflare_config.find_one({"type": "global"}, {"_id": 0})
    base_domain = cf_config.get("base_domain", "koodh.com") if cf_config else "koodh.com"

    # Get all active routes
    routes = await db.subdomain_routes.find(
        {"is_active": True}, {"_id": 0}
    ).to_list(100)

    if not routes:
        return {
            "status": "error",
            "message": "No active routes configured",
            "steps": [
                "Create subdomain routes in the Subdomain Routing tab",
                "Make sure they are set to Active",
                "Then test again",
            ],
            "domains": [],
        }

    # Find the main app subdomain
    app_route = next((r for r in routes if r["target_path"] == "/"), None)
    app_subdomain = app_route["subdomain"] if app_route else "clara"

    # Find a working test subdomain to fetch the Worker's route table
    worker_routes = []
    worker_fetch_status = "unknown"
    for probe in routes:
        if probe["subdomain"] == app_subdomain:
            continue
        probe_fqdn = f"{probe['subdomain']}.{base_domain}"
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                resp = await client.get(f"https://{probe_fqdn}/api/domains/routes/public")
                if resp.status_code == 200:
                    data = resp.json()
                    if "routes" in data:
                        worker_routes = [r["subdomain"] for r in data.get("routes", [])]
                        worker_fetch_status = "ok"
                        break
        except Exception:
            continue

    # Test each subdomain
    domains = []
    ok_count = 0
    total_testable = 0

    for route in routes:
        fqdn = f"{route['subdomain']}.{base_domain}"
        is_app = route["subdomain"] == app_subdomain
        domain_result = {
            "subdomain": route["subdomain"],
            "fqdn": fqdn,
            "target_path": route["target_path"],
            "route_type": route.get("route_type", ""),
            "is_app": is_app,
            "dns": "unknown",
            "dns_ip": None,
            "worker": "unknown",
            "http": "unknown",
            "status": "unknown",
        }

        # DNS check
        try:
            answers = dns.resolver.resolve(fqdn, 'A')
            ip = str(list(answers)[0]) if answers else None
            domain_result["dns"] = "ok"
            domain_result["dns_ip"] = ip
        except dns.resolver.NXDOMAIN:
            domain_result["dns"] = "missing"
        except Exception:
            domain_result["dns"] = "error"

        # Worker recognition check
        if is_app:
            domain_result["worker"] = "passthrough"
        elif worker_fetch_status == "ok":
            domain_result["worker"] = "ok" if route["subdomain"] in worker_routes else "missing"
        else:
            domain_result["worker"] = "unknown"

        # HTTP check (skip for app subdomain — it always works)
        if not is_app and domain_result["dns"] == "ok":
            total_testable += 1
            try:
                async with httpx.AsyncClient(timeout=6, follow_redirects=True) as client:
                    resp = await client.get(f"https://{fqdn}/", follow_redirects=False)
                    if resp.status_code in (200, 301, 302, 304):
                        domain_result["http"] = "ok"
                    elif resp.status_code == 404:
                        # Check if it's the Worker's "niet geconfigureerd" page
                        body = resp.text[:500]
                        if "not configured" in body or "not configured" in body.lower():
                            domain_result["http"] = "not_in_worker"
                        else:
                            domain_result["http"] = "ok"  # 404 from the app is fine
                    else:
                        domain_result["http"] = f"http_{resp.status_code}"
            except Exception:
                domain_result["http"] = "unreachable"
        elif is_app:
            domain_result["http"] = "passthrough"

        # Overall status
        if is_app:
            domain_result["status"] = "ok"
            ok_count += 1
        elif domain_result["dns"] == "missing":
            domain_result["status"] = "no_dns"
        elif domain_result["worker"] == "missing":
            domain_result["status"] = "not_in_worker"
        elif domain_result["http"] == "ok":
            domain_result["status"] = "ok"
            ok_count += 1
        elif domain_result["http"] == "not_in_worker":
            domain_result["status"] = "not_in_worker"
        elif domain_result["dns"] == "ok" and domain_result["http"] == "unreachable":
            domain_result["status"] = "dns_only"
        else:
            domain_result["status"] = "error"

        domains.append(domain_result)

    # Overall summary
    total = len(domains)
    if ok_count == total:
        overall = "ok"
        message = f"All {total} subdomain(s) are working correctly"
    elif ok_count > 0:
        overall = "warning"
        message = f"{ok_count}/{total} subdomain(s) working — {total - ok_count} need attention"
    else:
        overall = "error"
        message = "No subdomains are fully working yet"

    return {
        "status": overall,
        "message": message,
        "domains": domains,
        "worker_route_table": worker_routes if worker_fetch_status == "ok" else None,
        "base_domain": base_domain,
    }


# ---------- Domain Configs (per main site) ----------

@domains_router.get("/configs")
async def get_domain_configs(current_user: dict = Depends(require_network_admin)):
    """Get all domain configurations with site info."""
    configs = await db.domain_configs.find({}, {"_id": 0}).to_list(500)

    # Enrich with site names
    site_ids = [c["main_site_id"] for c in configs]
    sites = await db.main_sites.find(
        {"id": {"$in": site_ids}},
        {"_id": 0, "id": 1, "name": 1, "slug": 1, "site_type": 1}
    ).to_list(500)
    site_map = {s["id"]: s for s in sites}

    for config in configs:
        site = site_map.get(config["main_site_id"], {})
        config["site_name"] = site.get("name", "Unknown")
        config["site_slug"] = site.get("slug", "")
        config["site_type"] = site.get("site_type", "radio")

    return configs


@domains_router.get("/configs/{main_site_id}")
async def get_domain_config(main_site_id: str, current_user: dict = Depends(require_network_admin)):
    """Get domain config for a specific main site."""
    config = await db.domain_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    if not config:
        return {"main_site_id": main_site_id, "domain_type": "none", "configured": False}
    return config


@domains_router.post("/configs")
async def create_domain_config(
    data: DomainConfigCreate,
    current_user: dict = Depends(require_network_admin)
):
    """Create or update domain config for a main site."""
    # Validate site exists
    site = await db.main_sites.find_one({"id": data.main_site_id}, {"_id": 0, "id": 1, "name": 1})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")

    # Check uniqueness
    if data.domain_type == "koodh" and data.subdomain:
        existing = await db.domain_configs.find_one({
            "domain_type": "koodh",
            "subdomain": data.subdomain,
            "main_site_id": {"$ne": data.main_site_id}
        })
        if existing:
            raise HTTPException(status_code=409, detail=f"Subdomain '{data.subdomain}.koodh.com' is already in use")

    if data.domain_type == "custom" and data.custom_domain:
        existing = await db.domain_configs.find_one({
            "custom_domain": data.custom_domain,
            "main_site_id": {"$ne": data.main_site_id}
        })
        if existing:
            raise HTTPException(status_code=409, detail=f"Domain '{data.custom_domain}' is already configured")

    cf_config = await db.cloudflare_config.find_one({"type": "global"}, {"_id": 0})
    base_domain = cf_config.get("base_domain", "koodh.com") if cf_config else "koodh.com"

    config = {
        "id": str(uuid.uuid4()),
        "main_site_id": data.main_site_id,
        "domain_type": data.domain_type,
        "subdomain": data.subdomain if data.domain_type == "koodh" else None,
        "custom_domain": data.custom_domain if data.domain_type == "custom" else None,
        "full_domain": f"{data.subdomain}.{base_domain}" if data.domain_type == "koodh" and data.subdomain else data.custom_domain,
        "ssl_enabled": True if data.domain_type == "koodh" else False,
        "ssl_status": "active" if data.domain_type == "koodh" else "pending",
        "dns_status": "pending",
        "verification_status": "verified" if data.domain_type == "koodh" else "pending",
        "verification_token": str(uuid.uuid4())[:16] if data.domain_type == "custom" else None,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": current_user.get("name", "Unknown"),
    }

    # Upsert: one config per site
    await db.domain_configs.update_one(
        {"main_site_id": data.main_site_id},
        {"$set": config},
        upsert=True
    )

    return config


@domains_router.put("/configs/{main_site_id}")
async def update_domain_config(
    main_site_id: str,
    data: DomainConfigUpdate,
    current_user: dict = Depends(require_network_admin)
):
    """Update domain configuration for a main site."""
    config = await db.domain_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Domain config not found")

    update_fields = {"updated_at": _now()}
    if data.domain_type is not None:
        update_fields["domain_type"] = data.domain_type
    if data.subdomain is not None:
        update_fields["subdomain"] = data.subdomain
    if data.custom_domain is not None:
        update_fields["custom_domain"] = data.custom_domain
    if data.ssl_enabled is not None:
        update_fields["ssl_enabled"] = data.ssl_enabled

    await db.domain_configs.update_one(
        {"main_site_id": main_site_id},
        {"$set": update_fields}
    )
    return {"status": "ok"}


@domains_router.delete("/configs/{main_site_id}")
async def delete_domain_config(
    main_site_id: str,
    current_user: dict = Depends(require_network_admin)
):
    """Remove domain configuration for a main site."""
    result = await db.domain_configs.delete_one({"main_site_id": main_site_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Domain config not found")
    return {"status": "ok", "message": "Domain configuration removed"}


# ---------- CNAME Verification ----------

@domains_router.post("/configs/{main_site_id}/verify")
async def verify_custom_domain(
    main_site_id: str,
    current_user: dict = Depends(require_network_admin)
):
    """Verify CNAME record for a custom domain."""
    config = await db.domain_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Domain config not found")

    if config.get("domain_type") != "custom":
        raise HTTPException(status_code=400, detail="Only custom domains need verification")

    custom_domain = config.get("custom_domain")
    verification_token = config.get("verification_token")
    if not custom_domain or not verification_token:
        raise HTTPException(status_code=400, detail="Domain or verification token missing")

    # Check CNAME verification record
    verify_domain = f"_clara-verify.{custom_domain}"
    cf_config = await db.cloudflare_config.find_one({"type": "global"}, {"_id": 0})
    expected_target = f"verify.{cf_config.get('base_domain', 'koodh.com')}" if cf_config else "verify.koodh.com"

    verified = False
    dns_error = None
    try:
        answers = dns.resolver.resolve(verify_domain, "CNAME")
        for rdata in answers:
            target = str(rdata.target).rstrip(".")
            if target == expected_target:
                verified = True
                break
    except dns.resolver.NXDOMAIN:
        dns_error = "CNAME record not found"
    except dns.resolver.NoAnswer:
        dns_error = "No CNAME answer for verification domain"
    except Exception as e:
        dns_error = f"DNS lookup failed: {str(e)}"

    # Also check main CNAME pointing to Clara
    # Apex domains (e.g. example.com) typically cannot have a CNAME — fall back to A record lookup.
    is_apex = custom_domain.count(".") == 1  # naive but works for most TLDs: example.com → True, www.example.com → False
    main_cname_ok = False
    main_cname_target = None
    main_dns_mode = "none"  # 'cname' | 'a' | 'none'
    try:
        answers = dns.resolver.resolve(custom_domain, "CNAME")
        for rdata in answers:
            target = str(rdata.target).rstrip(".")
            main_cname_target = target
            main_dns_mode = "cname"
            if "koodh.com" in target or "emergentagent.com" in target:
                main_cname_ok = True
                break
    except Exception:
        # No CNAME — for apex this is expected; try A record (Cloudflare flattened CNAME / ALIAS / ANAME)
        try:
            a_answers = dns.resolver.resolve(custom_domain, "A")
            ips = [str(r) for r in a_answers]
            if ips:
                main_dns_mode = "a"
                main_cname_target = ",".join(ips[:3])
                # Cloudflare proxy IPs: 104.16.0.0/12, 104.24.0.0/14, 172.64.0.0/13, 162.158.0.0/15, 173.245.48.0/20, 103.21.244.0/22
                cf_ranges = ("104.", "172.64.", "172.65.", "172.66.", "172.67.", "162.158.", "173.245.", "103.21.244.", "103.22.200.", "103.31.4.", "141.101.", "108.162.", "190.93.", "188.114.", "197.234.240.", "198.41.")
                if any(ip.startswith(r) for ip in ips for r in cf_ranges):
                    main_cname_ok = True  # Cloudflare-proxied A record → treat as OK (CNAME flattening / ALIAS)
        except Exception:
            pass

    # Worker routing & HTTP reachability check
    worker_status = "unknown"
    http_status = "unknown"
    http_code = None
    if main_cname_ok:
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
                resp = await client.get(f"https://{custom_domain}/")
                http_code = resp.status_code
                if resp.status_code in (200, 301, 302, 304):
                    http_status = "ok"
                    worker_status = "ok"
                elif resp.status_code == 404:
                    body = resp.text[:500]
                    if "not configured" in body or "not configured" in body.lower():
                        http_status = "not_in_worker"
                        worker_status = "missing"
                    else:
                        http_status = "ok"
                        worker_status = "ok"
                elif resp.status_code in (525, 526, 495, 496):
                    http_status = "ssl_pending"
                    worker_status = "ssl_pending"
                else:
                    http_status = f"http_{resp.status_code}"
                    worker_status = "unknown"
        except Exception as e:
            http_status = "unreachable"
            worker_status = "unreachable"
            logger.warning(f"Worker check failed for {custom_domain}: {e}")

    update = {"updated_at": _now()}
    if verified:
        update["verification_status"] = "verified"
        update["dns_status"] = "active" if main_cname_ok else "cname_missing"
        if worker_status == "ok":
            update["ssl_status"] = "active"
        elif worker_status in ("missing", "ssl_pending"):
            update["ssl_status"] = "pending_issuance"
        else:
            update["ssl_status"] = "pending_issuance"
    else:
        update["verification_status"] = "failed"
        update["dns_error"] = dns_error

    await db.domain_configs.update_one(
        {"main_site_id": main_site_id},
        {"$set": update}
    )

    return {
        "verified": verified,
        "main_cname_ok": main_cname_ok,
        "main_cname_target": main_cname_target,
        "main_dns_mode": main_dns_mode,
        "is_apex": is_apex,
        "worker_status": worker_status,
        "http_status": http_status,
        "http_code": http_code,
        "error": dns_error,
        "verify_domain": verify_domain,
        "expected_target": expected_target,
    }


# ---------- Subdomain Routes ----------

@domains_router.get("/routes")
async def get_subdomain_routes(current_user: dict = Depends(require_network_admin)):
    """Get all subdomain routing rules."""
    await seed_subdomain_routes()
    routes = await db.subdomain_routes.find({}, {"_id": 0}).sort("subdomain", 1).to_list(100)
    return routes


@domains_router.post("/routes")
async def create_subdomain_route(
    data: SubdomainRouteCreate,
    current_user: dict = Depends(require_system_admin)
):
    """Create a new subdomain route."""
    existing = await db.subdomain_routes.find_one({"subdomain": data.subdomain})
    if existing:
        raise HTTPException(status_code=409, detail=f"Subdomain '{data.subdomain}' already has a route configured")

    route = {
        "id": str(uuid.uuid4()),
        "subdomain": data.subdomain.lower().strip(),
        "label": data.label,
        "description": data.description or "",
        "route_type": data.route_type,
        "target_path": data.target_path,
        "is_active": data.is_active,
        "is_system": False,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.subdomain_routes.insert_one(route)
    del route["_id"]
    return route


@domains_router.put("/routes/{route_id}")
async def update_subdomain_route(
    route_id: str,
    data: SubdomainRouteUpdate,
    current_user: dict = Depends(require_system_admin)
):
    """Update a subdomain route."""
    route = await db.subdomain_routes.find_one({"id": route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    update_fields = {"updated_at": _now()}
    if data.label is not None:
        update_fields["label"] = data.label
    if data.description is not None:
        update_fields["description"] = data.description
    if data.route_type is not None:
        update_fields["route_type"] = data.route_type
    if data.target_path is not None:
        update_fields["target_path"] = data.target_path
    if data.is_active is not None:
        update_fields["is_active"] = data.is_active

    await db.subdomain_routes.update_one({"id": route_id}, {"$set": update_fields})
    return {"status": "ok"}


@domains_router.delete("/routes/{route_id}")
async def delete_subdomain_route(
    route_id: str,
    current_user: dict = Depends(require_system_admin)
):
    """Delete a subdomain route (system routes cannot be deleted)."""
    route = await db.subdomain_routes.find_one({"id": route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    if route.get("is_system"):
        raise HTTPException(status_code=400, detail="System routes cannot be deleted, only deactivated")

    await db.subdomain_routes.delete_one({"id": route_id})
    return {"status": "ok", "message": "Route deleted"}


@domains_router.get("/routes/public")
async def get_public_routes():
    """Public endpoint for Cloudflare Worker and frontend subdomain detection.
    
    Returns active routes with subdomain → target_path mapping.
    No authentication required - this data is not sensitive.
    Includes cache headers for Worker performance.
    """
    cf_config = await db.cloudflare_config.find_one({"type": "global"}, {"_id": 0})
    base_domain = cf_config.get("base_domain", "koodh.com") if cf_config else "koodh.com"
    
    routes = await db.subdomain_routes.find(
        {"is_active": True},
        {"_id": 0, "subdomain": 1, "target_path": 1, "route_type": 1, "label": 1}
    ).to_list(100)
    
    # Also include site domain configs (koodh subdomains)
    site_configs = await db.domain_configs.find(
        {"domain_type": "koodh"},
        {"_id": 0, "subdomain": 1, "main_site_id": 1}
    ).to_list(500)
    
    return {
        "base_domain": base_domain,
        "routes": routes,
        "site_domains": site_configs,
        "cache_ttl": 300,
    }


# ---------- Overview / Stats ----------

@domains_router.get("/overview")
async def get_domains_overview(current_user: dict = Depends(require_network_admin)):
    """Get domain management overview with stats."""
    total_sites = await db.main_sites.count_documents({})
    configured = await db.domain_configs.count_documents({})
    koodh_domains = await db.domain_configs.count_documents({"domain_type": "koodh"})
    custom_domains = await db.domain_configs.count_documents({"domain_type": "custom"})
    verified = await db.domain_configs.count_documents({"verification_status": "verified"})
    pending_verification = await db.domain_configs.count_documents({"verification_status": "pending"})

    active_routes = await db.subdomain_routes.count_documents({"is_active": True})
    total_routes = await db.subdomain_routes.count_documents({})

    cf_config = await db.cloudflare_config.find_one({"type": "global"}, {"_id": 0})

    return {
        "total_sites": total_sites,
        "configured_domains": configured,
        "unconfigured": total_sites - configured,
        "koodh_domains": koodh_domains,
        "custom_domains": custom_domains,
        "verified": verified,
        "pending_verification": pending_verification,
        "active_routes": active_routes,
        "total_routes": total_routes,
        "cloudflare_configured": bool(cf_config and cf_config.get("api_token")),
        "base_domain": cf_config.get("base_domain", "koodh.com") if cf_config else "koodh.com",
    }
