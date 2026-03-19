"""License management routes."""
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException

from database import db
from models.licenses import (
    LicensePackageCreate, LicensePackageUpdate,
    LicenseAssignmentCreate, LicenseAssignmentUpdate,
)
from services.auth import get_current_user

import logging
logger = logging.getLogger(__name__)

licenses_router = APIRouter(prefix="/licenses", tags=["licenses"])

def _now():
    return datetime.now(timezone.utc).isoformat()


def require_network_admin(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Network admin access required")
    return current_user


# Default packages that get seeded
DEFAULT_PACKAGES = [
    {
        "name": "Standard",
        "slug": "standard",
        "description": "Basic radio station package with essential broadcasting features",
        "features": [
            "shows", "calendar", "show_management",
            "content_library", "media_library", "content_approval", "trash",
            "team_chat",
            "team_settings", "activity_logs",
        ],
        "monthly_price": 0,
        "yearly_price": 0,
        "currency": "EUR",
        "is_default": True,
        "sort_order": 0,
    },
    {
        "name": "Technical",
        "slug": "technical",
        "description": "Technical monitoring and network management features",
        "features": [
            "zerotier",
            "rds_settings", "rds_builder", "rds_monitor",
            "stream_monitor", "call_studio",
            "team_settings", "activity_logs",
        ],
        "monthly_price": 0,
        "yearly_price": 0,
        "currency": "EUR",
        "is_default": True,
        "sort_order": 1,
    },
    {
        "name": "Server",
        "slug": "server",
        "description": "Server-side tools for automation, imports and integrations",
        "features": [
            "xml_imports", "server_api_keys", "vmix_director",
            "team_settings", "activity_logs",
        ],
        "monthly_price": 0,
        "yearly_price": 0,
        "currency": "EUR",
        "is_default": True,
        "sort_order": 2,
    },
]


async def seed_default_packages():
    """Seed the 3 default license packages if they don't exist."""
    for pkg in DEFAULT_PACKAGES:
        existing = await db.license_packages.find_one({"slug": pkg["slug"], "is_default": True})
        if not existing:
            doc = {
                "id": str(uuid.uuid4()),
                **pkg,
                "is_active": True,
                "created_at": _now(),
                "updated_at": _now(),
            }
            await db.license_packages.insert_one(doc)
            logger.info(f"Seeded default license package: {pkg['name']}")


# ============== PACKAGES ==============

@licenses_router.get("/packages")
async def list_packages(current_user: dict = Depends(get_current_user)):
    """List all license packages."""
    packages = await db.license_packages.find(
        {}, {"_id": 0}
    ).sort("sort_order", 1).to_list(100)
    return packages


@licenses_router.get("/packages/{package_id}")
async def get_package(package_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single license package."""
    pkg = await db.license_packages.find_one({"id": package_id}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg


@licenses_router.post("/packages")
async def create_package(
    data: LicensePackageCreate,
    current_user: dict = Depends(require_network_admin),
):
    """Create a new license package."""
    existing = await db.license_packages.find_one({"slug": data.slug})
    if existing:
        raise HTTPException(status_code=400, detail="Package with this slug already exists")

    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "slug": data.slug,
        "description": data.description,
        "features": data.features,
        "monthly_price": data.monthly_price,
        "yearly_price": data.yearly_price,
        "currency": data.currency,
        "is_default": False,
        "is_active": data.is_active,
        "sort_order": data.sort_order,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.license_packages.insert_one({**doc})
    return doc


@licenses_router.put("/packages/{package_id}")
async def update_package(
    package_id: str,
    data: LicensePackageUpdate,
    current_user: dict = Depends(require_network_admin),
):
    """Update a license package."""
    pkg = await db.license_packages.find_one({"id": package_id})
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = _now()

    await db.license_packages.update_one({"id": package_id}, {"$set": update_data})

    # Sync features for all sites assigned to this package
    await _sync_features_for_package(package_id)

    updated = await db.license_packages.find_one({"id": package_id}, {"_id": 0})
    return updated


@licenses_router.delete("/packages/{package_id}")
async def delete_package(
    package_id: str,
    current_user: dict = Depends(require_network_admin),
):
    """Delete a license package (not default ones)."""
    pkg = await db.license_packages.find_one({"id": package_id})
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    if pkg.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete a default package")

    # Check if any sites are assigned to this package
    active_count = await db.license_assignments.count_documents({
        "package_id": package_id, "status": {"$in": ["active", "pending"]}
    })
    if active_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {active_count} site(s) are currently assigned to this package"
        )

    await db.license_packages.delete_one({"id": package_id})
    return {"message": "Package deleted"}


# ============== ASSIGNMENTS ==============

@licenses_router.get("/assignments")
async def list_assignments(current_user: dict = Depends(require_network_admin)):
    """List all license assignments with enriched data."""
    assignments = await db.license_assignments.find(
        {}, {"_id": 0}
    ).to_list(500)

    # Enrich with package and site info
    for a in assignments:
        pkg = await db.license_packages.find_one({"id": a["package_id"]}, {"_id": 0, "name": 1, "slug": 1})
        a["package_name"] = pkg["name"] if pkg else "Unknown"
        a["package_slug"] = pkg["slug"] if pkg else ""
        site = await db.main_sites.find_one({"id": a["main_site_id"]}, {"_id": 0, "name": 1, "slug": 1, "site_type": 1})
        a["site_name"] = site["name"] if site else "Unknown"
        a["site_slug"] = site["slug"] if site else ""
        a["site_type"] = site.get("site_type", "radio") if site else "radio"

    return assignments


@licenses_router.post("/assignments")
async def create_assignment(
    data: LicenseAssignmentCreate,
    current_user: dict = Depends(require_network_admin),
):
    """Assign a license package to a main site."""
    # Verify package exists
    pkg = await db.license_packages.find_one({"id": data.package_id})
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    # Verify main site exists
    site = await db.main_sites.find_one({"id": data.main_site_id})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")

    # Check if site already has an active assignment
    existing = await db.license_assignments.find_one({
        "main_site_id": data.main_site_id,
        "status": {"$in": ["active", "pending"]}
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail="This site already has an active license. Update or remove it first."
        )

    is_lifetime = data.billing_cycle == "lifetime"

    now = datetime.now(timezone.utc)
    if data.billing_cycle == "monthly":
        expires_at = (now + timedelta(days=30)).isoformat()
    elif data.billing_cycle == "yearly":
        expires_at = (now + timedelta(days=365)).isoformat()
    else:
        expires_at = None  # lifetime

    doc = {
        "id": str(uuid.uuid4()),
        "main_site_id": data.main_site_id,
        "package_id": data.package_id,
        "billing_cycle": data.billing_cycle,
        "is_lifetime": is_lifetime,
        "status": data.status,
        "notes": data.notes,
        "payment_provider": None,
        "payment_reference": None,
        "starts_at": _now(),
        "expires_at": expires_at,
        "last_reminder_sent_at": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.license_assignments.insert_one({**doc})

    # Sync features
    await _sync_site_features(data.main_site_id, pkg["features"])

    result = {k: v for k, v in doc.items() if k != "_id"}
    result["package_name"] = pkg["name"]
    result["site_name"] = site["name"]
    return result


@licenses_router.put("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    data: LicenseAssignmentUpdate,
    current_user: dict = Depends(require_network_admin),
):
    """Update a license assignment."""
    assignment = await db.license_assignments.find_one({"id": assignment_id})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    update_data = {k: v for k, v in data.model_dump().items() if v is not None}

    if "billing_cycle" in update_data:
        update_data["is_lifetime"] = update_data["billing_cycle"] == "lifetime"

    update_data["updated_at"] = _now()
    await db.license_assignments.update_one({"id": assignment_id}, {"$set": update_data})

    # If package changed, sync features
    if "package_id" in update_data:
        pkg = await db.license_packages.find_one({"id": update_data["package_id"]})
        if pkg:
            await _sync_site_features(assignment["main_site_id"], pkg["features"])

    updated = await db.license_assignments.find_one({"id": assignment_id}, {"_id": 0})
    return updated


@licenses_router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    current_user: dict = Depends(require_network_admin),
):
    """Remove a license assignment."""
    assignment = await db.license_assignments.find_one({"id": assignment_id})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    await db.license_assignments.delete_one({"id": assignment_id})
    return {"message": "License assignment removed"}


# ============== LICENSE CHECK ==============

@licenses_router.get("/check/{main_site_id}")
async def check_license(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Check the license status for a main site."""
    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "is_demo": 1})
    is_demo = site.get("is_demo", False) if site else False

    assignment = await db.license_assignments.find_one(
        {"main_site_id": main_site_id, "status": "active"},
        {"_id": 0}
    )
    if not assignment:
        return {
            "has_license": False,
            "is_demo": is_demo,
            "days_remaining": None,
            "package": None,
            "assignment": None,
        }

    # Calculate days remaining
    days_remaining = None
    if assignment.get("expires_at") and not assignment.get("is_lifetime"):
        try:
            expires = datetime.fromisoformat(assignment["expires_at"])
            now = datetime.now(timezone.utc)
            days_remaining = max(0, (expires - now).days)
        except (ValueError, TypeError):
            pass

    pkg = await db.license_packages.find_one({"id": assignment["package_id"]}, {"_id": 0})
    return {
        "has_license": True,
        "is_demo": is_demo,
        "days_remaining": days_remaining,
        "package": pkg,
        "assignment": assignment,
    }


# ============== OVERVIEW ==============

@licenses_router.get("/overview")
async def license_overview(current_user: dict = Depends(require_network_admin)):
    """Get overview of all main sites with their license status."""
    sites = await db.main_sites.find({}, {"_id": 0}).to_list(100)
    assignments = await db.license_assignments.find({}, {"_id": 0}).to_list(500)
    packages = await db.license_packages.find({}, {"_id": 0}).to_list(100)

    pkg_map = {p["id"]: p for p in packages}
    assign_map = {}
    for a in assignments:
        if a["status"] in ("active", "pending"):
            assign_map[a["main_site_id"]] = a

    result = []
    for site in sites:
        assignment = assign_map.get(site["id"])
        pkg = pkg_map.get(assignment["package_id"]) if assignment else None
        result.append({
            "site_id": site["id"],
            "site_name": site["name"],
            "site_slug": site["slug"],
            "site_type": site.get("site_type", "radio"),
            "is_demo": site.get("is_demo", False),
            "enabled_features": site.get("enabled_features", []),
            "has_license": assignment is not None,
            "license_package": pkg["name"] if pkg else None,
            "license_slug": pkg["slug"] if pkg else None,
            "billing_cycle": assignment["billing_cycle"] if assignment else None,
            "is_lifetime": assignment.get("is_lifetime", False) if assignment else False,
            "license_status": assignment["status"] if assignment else None,
            "assignment_id": assignment["id"] if assignment else None,
        })

    return result


# ============== HELPERS ==============

async def _sync_site_features(main_site_id: str, features: list):
    """Sync a main site's enabled_features to match its license package."""
    await db.main_sites.update_one(
        {"id": main_site_id},
        {"$set": {"enabled_features": features, "updated_at": _now()}}
    )
    logger.info(f"Synced features for site {main_site_id}: {features}")


async def _sync_features_for_package(package_id: str):
    """When a package's features change, sync all assigned sites."""
    pkg = await db.license_packages.find_one({"id": package_id}, {"_id": 0})
    if not pkg:
        return
    assignments = await db.license_assignments.find(
        {"package_id": package_id, "status": "active"}, {"_id": 0}
    ).to_list(500)
    for a in assignments:
        await _sync_site_features(a["main_site_id"], pkg["features"])



# ─── LICENSE REQUESTS ─────────────────────────────────────────────

@licenses_router.get("/requests")
async def list_license_requests(current_user: dict = Depends(get_current_user)):
    """List all license requests. Network admin only."""
    if not current_user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Network admin access required")
    requests = await db.license_requests.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return requests


@licenses_router.put("/requests/{request_id}")
async def update_license_request(
    request_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Approve or deny a license request."""
    if not current_user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Network admin access required")

    req = await db.license_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="License request not found")

    new_status = data.get("status")
    if new_status not in ("approved", "denied"):
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'denied'")

    now = datetime.now(timezone.utc).isoformat()
    await db.license_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": new_status,
            "reviewed_by": current_user.get("name", ""),
            "reviewed_at": now,
            "notes": data.get("notes", ""),
            "updated_at": now,
        }}
    )
    logger.info(f"License request {request_id} {new_status} by {current_user.get('email')}")
    return {"status": new_status, "id": request_id}
