"""Environment management routes.

Supports multi-environment Clara: Production, Staging, custom environments.
System Administrators have global access. Network Admins are scoped per environment.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from database import db
from services.auth import get_current_user

import logging
logger = logging.getLogger(__name__)

environments_router = APIRouter(prefix="/environments", tags=["environments"])


def _now():
    return datetime.now(timezone.utc).isoformat()


# ---------- Auth helpers ----------

def require_system_admin(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_system_admin"):
        raise HTTPException(status_code=403, detail="System Administrator access required")
    return current_user


def require_env_admin(current_user: dict = Depends(get_current_user)):
    """Require system admin OR network admin."""
    if current_user.get("is_system_admin") or current_user.get("is_network_admin"):
        return current_user
    raise HTTPException(status_code=403, detail="Admin access required")


# ---------- Models ----------

class EnvironmentCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    color: str = "#3b82f6"


class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class EnvironmentAdminAdd(BaseModel):
    user_id: str


# ---------- Seed ----------

async def seed_default_environment():
    """Create the default Production environment if it doesn't exist."""
    # Always ensure is_system_admin is set on primary network admins
    result = await db.users.update_many(
        {"is_primary_network_admin": True, "is_system_admin": {"$ne": True}},
        {"$set": {"is_system_admin": True}}
    )
    if result.modified_count > 0:
        logger.info(f"Set is_system_admin=True on {result.modified_count} primary network admin(s)")

    existing = await db.environments.find_one({"is_default": True})
    if existing:
        return existing["id"]

    env_id = str(uuid.uuid4())
    doc = {
        "id": env_id,
        "name": "Production",
        "slug": "production",
        "description": "Live production environment",
        "color": "#ef4444",
        "is_default": True,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.environments.insert_one({**doc})
    logger.info(f"Seeded default Production environment: {env_id}")

    # Link all existing main_sites to Production
    result = await db.main_sites.update_many(
        {"environment_id": {"$exists": False}},
        {"$set": {"environment_id": env_id}}
    )
    if result.modified_count > 0:
        logger.info(f"Linked {result.modified_count} existing sites to Production environment")

    # Add all current network admins as environment admins for Production
    net_admins = await db.users.find(
        {"is_network_admin": True}, {"_id": 0, "id": 1}
    ).to_list(50)
    for admin in net_admins:
        existing_ea = await db.environment_admins.find_one({
            "environment_id": env_id, "user_id": admin["id"]
        })
        if not existing_ea:
            await db.environment_admins.insert_one({
                "id": str(uuid.uuid4()),
                "environment_id": env_id,
                "user_id": admin["id"],
                "created_at": _now(),
            })

    return env_id


# ---------- CRUD ----------

@environments_router.get("")
async def list_environments(current_user: dict = Depends(get_current_user)):
    """List environments accessible to the user."""
    if current_user.get("is_system_admin") or current_user.get("is_network_admin"):
        envs = await db.environments.find({}, {"_id": 0}).sort("created_at", 1).to_list(50)
    else:
        # Regular users: only environments where they have site access
        env_admin_ids = []
        ea_cursor = db.environment_admins.find({"user_id": current_user["id"]}, {"_id": 0, "environment_id": 1})
        async for ea in ea_cursor:
            env_admin_ids.append(ea["environment_id"])

        # Also include environments where user has site access
        user_sites = await db.main_site_users.find(
            {"user_id": current_user["id"]}, {"_id": 0, "main_site_id": 1}
        ).to_list(100)
        site_ids = [s["main_site_id"] for s in user_sites]
        if site_ids:
            sites = await db.main_sites.find(
                {"id": {"$in": site_ids}}, {"_id": 0, "environment_id": 1}
            ).to_list(100)
            env_ids_from_sites = list(set(s.get("environment_id") for s in sites if s.get("environment_id")))
        else:
            env_ids_from_sites = []

        all_env_ids = list(set(env_admin_ids + env_ids_from_sites))
        if all_env_ids:
            envs = await db.environments.find(
                {"id": {"$in": all_env_ids}}, {"_id": 0}
            ).sort("created_at", 1).to_list(50)
        else:
            envs = []

    # Enrich with counts
    for env in envs:
        env["site_count"] = await db.main_sites.count_documents({"environment_id": env["id"]})
        env["admin_count"] = await db.environment_admins.count_documents({"environment_id": env["id"]})

    return envs


@environments_router.get("/{env_id}")
async def get_environment(env_id: str, current_user: dict = Depends(require_env_admin)):
    env = await db.environments.find_one({"id": env_id}, {"_id": 0})
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    env["site_count"] = await db.main_sites.count_documents({"environment_id": env_id})
    env["admin_count"] = await db.environment_admins.count_documents({"environment_id": env_id})
    return env


@environments_router.post("")
async def create_environment(data: EnvironmentCreate, current_user: dict = Depends(require_system_admin)):
    """Create a new environment. System Admin only."""
    existing = await db.environments.find_one({"slug": data.slug})
    if existing:
        raise HTTPException(status_code=400, detail="Environment with this slug already exists")

    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "slug": data.slug,
        "description": data.description,
        "color": data.color,
        "is_default": False,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.environments.insert_one({**doc})
    return doc


@environments_router.put("/{env_id}")
async def update_environment(env_id: str, data: EnvironmentUpdate, current_user: dict = Depends(require_system_admin)):
    env = await db.environments.find_one({"id": env_id})
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = _now()
    await db.environments.update_one({"id": env_id}, {"$set": update})
    updated = await db.environments.find_one({"id": env_id}, {"_id": 0})
    return updated


@environments_router.delete("/{env_id}")
async def delete_environment(env_id: str, current_user: dict = Depends(require_system_admin)):
    env = await db.environments.find_one({"id": env_id})
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    if env.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete the default environment")

    site_count = await db.main_sites.count_documents({"environment_id": env_id})
    if site_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {site_count} site(s) still in this environment. Remove or move them first.")

    await db.environments.delete_one({"id": env_id})
    await db.environment_admins.delete_many({"environment_id": env_id})
    return {"message": "Environment deleted"}


# ---------- Environment Admins ----------

@environments_router.get("/{env_id}/admins")
async def list_environment_admins(env_id: str, current_user: dict = Depends(require_env_admin)):
    env = await db.environments.find_one({"id": env_id})
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    admins = await db.environment_admins.find(
        {"environment_id": env_id}, {"_id": 0}
    ).to_list(100)

    for a in admins:
        user = await db.users.find_one({"id": a["user_id"]}, {"_id": 0, "name": 1, "email": 1, "is_system_admin": 1})
        a["user_name"] = user["name"] if user else "Unknown"
        a["user_email"] = user["email"] if user else ""
        a["is_system_admin"] = user.get("is_system_admin", False) if user else False

    return admins


@environments_router.post("/{env_id}/admins")
async def add_environment_admin(env_id: str, data: EnvironmentAdminAdd, current_user: dict = Depends(require_system_admin)):
    env = await db.environments.find_one({"id": env_id})
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.environment_admins.find_one({"environment_id": env_id, "user_id": data.user_id})
    if existing:
        raise HTTPException(status_code=400, detail="User is already an admin for this environment")

    doc = {
        "id": str(uuid.uuid4()),
        "environment_id": env_id,
        "user_id": data.user_id,
        "created_at": _now(),
    }
    await db.environment_admins.insert_one({**doc})

    # Also ensure the user has is_network_admin flag
    await db.users.update_one({"id": data.user_id}, {"$set": {"is_network_admin": True}})

    return {"message": f"Added {user.get('name', '')} as admin", "id": doc["id"]}


@environments_router.delete("/{env_id}/admins/{admin_id}")
async def remove_environment_admin(env_id: str, admin_id: str, current_user: dict = Depends(require_system_admin)):
    ea = await db.environment_admins.find_one({"id": admin_id, "environment_id": env_id})
    if not ea:
        raise HTTPException(status_code=404, detail="Admin assignment not found")

    # Cannot remove system admin
    user = await db.users.find_one({"id": ea["user_id"]}, {"_id": 0, "is_system_admin": 1})
    if user and user.get("is_system_admin"):
        raise HTTPException(status_code=400, detail="Cannot remove System Administrator")

    await db.environment_admins.delete_one({"id": admin_id})
    return {"message": "Admin removed from environment"}


# ---------- Site management within environment ----------

@environments_router.post("/{env_id}/copy-site/{source_site_id}")
async def copy_site_to_environment(
    env_id: str, source_site_id: str,
    current_user: dict = Depends(require_system_admin),
):
    """Copy a site's structure (no data) into an environment."""
    env = await db.environments.find_one({"id": env_id})
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    source = await db.main_sites.find_one({"id": source_site_id}, {"_id": 0})
    if not source:
        raise HTTPException(status_code=404, detail="Source site not found")

    # Generate new slug
    base_slug = f"{env['slug']}-{source['slug']}"
    existing = await db.main_sites.find_one({"slug": base_slug})
    new_slug = base_slug if not existing else f"{base_slug}-{str(uuid.uuid4())[:6]}"

    new_site = {
        "id": str(uuid.uuid4()),
        "name": f"{source['name']} ({env['name']})",
        "slug": new_slug,
        "description": source.get("description"),
        "logo_url": source.get("logo_url"),
        "enabled_features": source.get("enabled_features", []),
        "site_type": source.get("site_type", "radio"),
        "linked_main_site_id": source.get("linked_main_site_id"),
        "is_demo": False,
        "environment_id": env_id,
        "copied_from": source_site_id,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.main_sites.insert_one({**new_site})

    # Copy roles from source site
    roles = await db.roles.find({"main_site_id": source_site_id}, {"_id": 0}).to_list(50)
    for role in roles:
        new_role = {**role, "id": str(uuid.uuid4()), "main_site_id": new_site["id"]}
        await db.roles.insert_one({**new_role})

    return {k: v for k, v in new_site.items() if k != "_id"}
