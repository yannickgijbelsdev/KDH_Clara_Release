"""Domain & Subdomain management routes.

Manages domain configurations for main sites (custom domains, koodh.com subdomains)
and subdomain routing rules (login.koodh.com, global.koodh.com, etc.).
Prepares Cloudflare API integration for DNS automation.
"""
import uuid
import dns.resolver
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from database import db
from services.auth import get_current_user

import logging
import os

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
]


async def seed_subdomain_routes():
    """Seed default subdomain routes if none exist."""
    count = await db.subdomain_routes.count_documents({})
    if count == 0:
        for route in DEFAULT_SUBDOMAIN_ROUTES:
            route["id"] = str(uuid.uuid4())
            route["created_at"] = _now()
            route["updated_at"] = _now()
            await db.subdomain_routes.insert_one(route)
        logger.info(f"Seeded {len(DEFAULT_SUBDOMAIN_ROUTES)} default subdomain routes")


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
    main_cname_ok = False
    try:
        answers = dns.resolver.resolve(custom_domain, "CNAME")
        for rdata in answers:
            target = str(rdata.target).rstrip(".")
            if "koodh.com" in target or "emergentagent.com" in target:
                main_cname_ok = True
                break
    except Exception:
        pass

    update = {"updated_at": _now()}
    if verified:
        update["verification_status"] = "verified"
        update["dns_status"] = "active" if main_cname_ok else "cname_missing"
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
