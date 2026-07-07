"""Main Sites (Organization) management routes."""
import uuid
import asyncio
import pathlib
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request

from database import db
from models.main_sites import (
    MainSiteCreate, MainSiteUpdate, MainSiteResponse, MainSiteListResponse,
    MainSiteUserCreate, MainSiteUserUpdate, MainSiteUserResponse,
    AvailableFeaturesResponse, AVAILABLE_FEATURES
)
from services.auth import get_current_user
from services.audit import log_action
from services.license_request import send_license_request
from services.redis_cache import cache_get, cache_set, cache_delete_pattern
from routers.shows import resolve_avatar_url

import logging
logger = logging.getLogger(__name__)

SITE_LOGOS_DIR = pathlib.Path("/app/backend/uploads/site_logos")
SITE_LOGOS_DIR.mkdir(parents=True, exist_ok=True)

main_sites_router = APIRouter(prefix="/main-sites", tags=["main-sites"])


def require_network_admin(current_user: dict = Depends(get_current_user)):
    """Dependency that requires network admin role."""
    if not current_user.get('is_network_admin'):
        raise HTTPException(status_code=403, detail="Network admin access required")
    return current_user


async def get_admin_environment_ids(user: dict) -> list:
    """Get environment IDs a network admin has access to.
    
    System admins get None (= all environments).
    Environment admins get their assigned environment IDs.
    """
    if user.get('is_system_admin'):
        return None  # None = no filter, all environments
    
    entries = await db.environment_admins.find(
        {"user_id": user["id"]}, {"_id": 0, "environment_id": 1}
    ).to_list(50)
    return [e["environment_id"] for e in entries]


async def get_main_site_user_role(user_id: str, main_site_id: str) -> Optional[str]:
    """Get user's role for a specific main site."""
    access = await db.main_site_users.find_one(
        {"user_id": user_id, "main_site_id": main_site_id},
        {"_id": 0, "role": 1}
    )
    return access.get("role") if access else None


def require_main_site_admin(main_site_id: str):
    """Dependency factory for main site admin access."""
    async def check_access(current_user: dict = Depends(get_current_user)):
        if current_user.get('is_network_admin'):
            return current_user
        
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if role != 'admin':
            raise HTTPException(status_code=403, detail="Main site admin access required")
        return current_user
    return check_access


# ============== FEATURES ==============

@main_sites_router.get("/features", response_model=AvailableFeaturesResponse)
async def get_available_features(current_user: dict = Depends(get_current_user)):
    """Get list of all available features that can be enabled per main site."""
    return {"features": AVAILABLE_FEATURES}


# ============== NETWORK ADMIN: MAIN SITE CRUD ==============

@main_sites_router.get("", response_model=list[MainSiteListResponse])
async def get_all_main_sites(current_user: dict = Depends(get_current_user)):
    """Get all main sites with Redis caching."""
    user_id = current_user['id']
    is_network_admin = current_user.get('is_network_admin', False)
    cache_key = f"main_sites:{user_id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    # Original query logic
    
    if is_network_admin:
        # Check if system admin (sees all) or environment admin (scoped)
        allowed_env_ids = await get_admin_environment_ids(current_user)
        
        if allowed_env_ids is None:
            # System admin: sees everything
            main_sites = await db.main_sites.find({}, {"_id": 0}).to_list(100)
        else:
            # Environment admin: only sites in their assigned environments
            main_sites = await db.main_sites.find(
                {"environment_id": {"$in": allowed_env_ids}},
                {"_id": 0}
            ).to_list(100)
    else:
        # Regular users see only assigned main sites
        user_access = await db.main_site_users.find(
            {"user_id": user_id},
            {"_id": 0, "main_site_id": 1, "role": 1}
        ).to_list(100)
        main_site_ids = [a["main_site_id"] for a in user_access]
        access_by_id = {a["main_site_id"]: a["role"] for a in user_access}
        
        main_sites = await db.main_sites.find(
            {"id": {"$in": main_site_ids}},
            {"_id": 0}
        ).to_list(100)
        
        # Filter out clones unless user is admin of the parent site
        admin_site_ids = {sid for sid, role in access_by_id.items() if role == "admin"}
        filtered = []
        for site in main_sites:
            cloned_from = site.get("cloned_from")
            if not cloned_from:
                # Not a clone — always show
                filtered.append(site)
            elif cloned_from in admin_site_ids or site["id"] in admin_site_ids:
                # Clone visible if user is admin of parent or the clone itself
                filtered.append(site)
        main_sites = filtered
    
    # Add counts, resolve linked names, and add environment info
    linked_ids = [s["linked_main_site_id"] for s in main_sites if s.get("linked_main_site_id")]
    linked_names = {}
    if linked_ids:
        linked_docs = await db.main_sites.find({"id": {"$in": linked_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
        linked_names = {d["id"]: d["name"] for d in linked_docs}

    # Fetch all environments for lookup
    env_ids = list(set(s.get("environment_id") for s in main_sites if s.get("environment_id")))
    env_lookup = {}
    if env_ids:
        envs = await db.environments.find({"id": {"$in": env_ids}}, {"_id": 0, "id": 1, "name": 1, "color": 1}).to_list(50)
        env_lookup = {e["id"]: e for e in envs}

    # Batch count queries instead of N+1
    site_ids = [s["id"] for s in main_sites]

    site_counts_agg = await db.sites.aggregate([
        {"$match": {"main_site_id": {"$in": site_ids}}},
        {"$group": {"_id": "$main_site_id", "count": {"$sum": 1}}}
    ]).to_list(200)
    site_count_map = {r["_id"]: r["count"] for r in site_counts_agg}

    user_counts_agg = await db.main_site_users.aggregate([
        {"$match": {"main_site_id": {"$in": site_ids}}},
        {"$group": {"_id": "$main_site_id", "count": {"$sum": 1}}}
    ]).to_list(200)
    user_count_map = {r["_id"]: r["count"] for r in user_counts_agg}

    for site in main_sites:
        site["site_count"] = site_count_map.get(site["id"], 0)
        site["user_count"] = user_count_map.get(site["id"], 0)
        if site.get("linked_main_site_id"):
            site["linked_main_site_name"] = linked_names.get(site["linked_main_site_id"])
        # Add environment info
        env = env_lookup.get(site.get("environment_id"))
        if env:
            site["environment_name"] = env.get("name")
            site["environment_color"] = env.get("color")
    
    await cache_set(cache_key, main_sites, ttl=30)
    return main_sites


@main_sites_router.post("", response_model=MainSiteResponse)
async def create_main_site(
    data: MainSiteCreate,
    request: Request,
    current_user: dict = Depends(require_network_admin)
):
    """Create a new main site. Network admin only."""
    # Check if slug is unique
    existing = await db.main_sites.find_one({"slug": data.slug.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="This URL is already in use")
    
    # Validate slug format
    slug = data.slug.lower()
    if not all(c.isalnum() or c == '-' for c in slug):
        raise HTTPException(status_code=400, detail="URL may only contain letters, numbers, and hyphens")
    
    # Validate enabled features
    valid_feature_ids = [f["id"] for f in AVAILABLE_FEATURES]
    for feature_id in data.enabled_features:
        if feature_id not in valid_feature_ids:
            raise HTTPException(status_code=400, detail=f"Invalid feature: {feature_id}")

    # Auto-include content_library + media_library for Clara Custom sites
    # so admins can immediately manage content for external integrations.
    effective_features = list(data.enabled_features)
    if data.site_type == "clara_custom":
        for f in ("content_library", "media_library"):
            if f not in effective_features:
                effective_features.append(f)

    # Zero-config News API: every main site gets `clara_publish` enabled by
    # default so admins can publish content via /api/news/* immediately —
    # without needing WordPress credentials. Can still be toggled off in
    # site settings if a site is purely read-only.
    if "clara_publish" not in effective_features:
        effective_features.append("clara_publish")

    now = datetime.now(timezone.utc).isoformat()
    main_site_id = str(uuid.uuid4())
    
    main_site_doc = {
        "id": main_site_id,
        "name": data.name,
        "slug": slug,
        "description": data.description,
        "logo_url": None,
        "enabled_features": effective_features,
        "site_type": data.site_type,
        "linked_main_site_id": data.linked_main_site_id,
        "is_demo": data.is_demo,
        "require_2fa": data.require_2fa,
        "clara_enterprise": data.clara_enterprise if current_user.get('is_system_admin') else False,
        "environment_id": data.environment_id,
        "created_at": now,
        "updated_at": now
    }
    
    # If no environment_id provided, assign to default environment
    if not main_site_doc["environment_id"]:
        default_env = await db.environments.find_one({"is_default": True}, {"_id": 0, "id": 1})
        if default_env:
            main_site_doc["environment_id"] = default_env["id"]
    
    await db.main_sites.insert_one(main_site_doc)
    main_site_doc.pop("_id", None)
    main_site_doc["site_count"] = 0
    main_site_doc["user_count"] = 0

    # If this is a Clara Custom site and the wizard passed initial APIs, register them now.
    try:
        body_json = await request.json()
    except Exception:
        body_json = {}
    initial_apis = body_json.get("clara_custom_apis") if isinstance(body_json, dict) else None
    if data.site_type == "clara_custom" and isinstance(initial_apis, list):
        for entry in initial_apis:
            if not isinstance(entry, dict) or not entry.get("base_url"):
                continue
            try:
                await db.clara_custom_apis.insert_one({
                    "id": str(uuid.uuid4()),
                    "main_site_id": main_site_id,
                    "name": entry.get("name") or entry["base_url"],
                    "base_url": (entry["base_url"] or "").rstrip("/"),
                    "method": (entry.get("method") or "GET").upper(),
                    "health_check_path": entry.get("health_check_path") or "/",
                    "expected_status": int(entry.get("expected_status") or 200),
                    "expected_schema": entry.get("expected_schema") or None,
                    "auth_header": entry.get("auth_header") or "",
                    "extra_headers": entry.get("extra_headers") or [],
                    "tags": ["wizard"],
                    "created_at": now,
                    "created_by": current_user.get("id"),
                    "last_health_check": None,
                })
            except Exception as e:
                logger.warning(f"Failed to insert Clara Custom API for {main_site_id}: {e}")
    
    logger.info(f"Main site created: {data.name} ({slug}) by {current_user['email']}")

    # Auto-enable firewall for the new site
    await db.firewall_settings.update_one(
        {"main_site_id": main_site_id},
        {"$set": {"main_site_id": main_site_id, "enabled": True, "updated_at": now}},
        upsert=True,
    )

    # Log and notify system admin
    type_label = {"server": "Server Site", "technical": "Technical Site", "task_scheduler": "Clara Tasks", "wp_security": "WP Security Site"}.get(data.site_type, "Main Site")
    asyncio.create_task(log_action(
        action=f"{type_label} Created",
        category="system",
        user_id=current_user.get("id"),
        user_name=current_user.get("name", ""),
        user_email=current_user.get("email", ""),
        main_site_id=main_site_id,
        details={"description": f"{type_label} '{data.name}' (slug: {slug}) created by {current_user.get('name', '')}"},
        target_type="main_site",
        target_id=main_site_id,
        target_name=data.name,
    ))

    # Send license request email
    asyncio.create_task(send_license_request(
        site_name=data.name,
        site_type=data.site_type,
        site_slug=slug,
        site_id=main_site_id,
        environment_id=main_site_doc.get("environment_id", ""),
        requester_id=current_user.get("id", ""),
        requester_name=current_user.get("name", ""),
        requester_email=current_user.get("email", ""),
    ))

    await cache_delete_pattern("main_sites:*")
    return main_site_doc


@main_sites_router.get("/{main_site_id}", response_model=MainSiteResponse)
async def get_main_site(
    main_site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a main site by ID."""
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if not role:
            raise HTTPException(status_code=403, detail="Access denied")
    elif not current_user.get('is_system_admin'):
        # Environment admin: check environment scope
        allowed_env_ids = await get_admin_environment_ids(current_user)
        if allowed_env_ids is not None:
            site_check = await db.main_sites.find_one(
                {"id": main_site_id}, {"_id": 0, "environment_id": 1}
            )
            if site_check and site_check.get("environment_id") not in allowed_env_ids:
                raise HTTPException(status_code=403, detail="Access denied - site not in your environment")
    
    main_site = await db.main_sites.find_one(
        {"id": main_site_id},
        {"_id": 0}
    )
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    # Add counts
    main_site["site_count"] = await db.sites.count_documents({"main_site_id": main_site_id})
    main_site["user_count"] = await db.main_site_users.count_documents({"main_site_id": main_site_id})
    
    # Resolve linked main site name for server sites
    if main_site.get("linked_main_site_id"):
        linked = await db.main_sites.find_one({"id": main_site["linked_main_site_id"]}, {"_id": 0, "name": 1})
        main_site["linked_main_site_name"] = linked["name"] if linked else None

    return main_site


@main_sites_router.get("/by-slug/{slug}", response_model=MainSiteResponse)
async def get_main_site_by_slug(
    slug: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a main site by slug."""
    main_site = await db.main_sites.find_one(
        {"slug": slug.lower()},
        {"_id": 0}
    )
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    # Check access
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site['id'])
        if not role:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Add counts
    main_site["site_count"] = await db.sites.count_documents({"main_site_id": main_site['id']})
    main_site["user_count"] = await db.main_site_users.count_documents({"main_site_id": main_site['id']})
    
    # Resolve linked main site name for server sites
    if main_site.get("linked_main_site_id"):
        linked = await db.main_sites.find_one({"id": main_site["linked_main_site_id"]}, {"_id": 0, "name": 1})
        main_site["linked_main_site_name"] = linked["name"] if linked else None

    # Resolve environment info
    if main_site.get("environment_id"):
        env = await db.environments.find_one({"id": main_site["environment_id"]}, {"_id": 0, "name": 1, "color": 1})
        if env:
            main_site["environment_name"] = env["name"]
            main_site["environment_color"] = env.get("color")

    return main_site


@main_sites_router.put("/{main_site_id}", response_model=MainSiteResponse)
async def update_main_site(
    main_site_id: str,
    data: MainSiteUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a main site. Network admin or main site admin only."""
    # Check access
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if role != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
    
    main_site = await db.main_sites.find_one({"id": main_site_id})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.name is not None:
        update_data["name"] = data.name
    
    if data.slug is not None:
        slug = data.slug.lower()
        # Check uniqueness if changing
        if slug != main_site.get("slug"):
            existing = await db.main_sites.find_one({"slug": slug, "id": {"$ne": main_site_id}})
            if existing:
                raise HTTPException(status_code=400, detail="This URL is already in use")
            if not all(c.isalnum() or c == '-' for c in slug):
                raise HTTPException(status_code=400, detail="URL may only contain letters, numbers, and hyphens")
        update_data["slug"] = slug
    
    if data.description is not None:
        update_data["description"] = data.description
    
    if data.logo_url is not None:
        update_data["logo_url"] = data.logo_url
    
    if data.enabled_features is not None:
        valid_feature_ids = [f["id"] for f in AVAILABLE_FEATURES]
        for feature_id in data.enabled_features:
            if feature_id not in valid_feature_ids:
                raise HTTPException(status_code=400, detail=f"Invalid feature: {feature_id}")
        # task_boards is exclusive to task_scheduler sites
        site_type = main_site.get("site_type", "radio")
        if site_type != "task_scheduler" and "task_boards" in data.enabled_features:
            data.enabled_features = [f for f in data.enabled_features if f != "task_boards"]
        update_data["enabled_features"] = data.enabled_features

    if data.linked_main_site_id is not None:
        update_data["linked_main_site_id"] = data.linked_main_site_id

    if data.is_demo is not None:
        update_data["is_demo"] = data.is_demo

    if data.require_2fa is not None:
        update_data["require_2fa"] = data.require_2fa

    if data.clara_enterprise is not None:
        if not current_user.get('is_system_admin'):
            pass  # Only system admins can change enterprise status
        else:
            update_data["clara_enterprise"] = data.clara_enterprise

    if data.environment_id is not None:
        # Only network/system admins can move sites between environments
        if not is_network_admin:
            raise HTTPException(status_code=403, detail="Only network admins can move sites between environments")
        # Verify target environment exists
        target_env = await db.environments.find_one({"id": data.environment_id}, {"_id": 0, "id": 1})
        if not target_env:
            raise HTTPException(status_code=404, detail="Target environment not found")
        update_data["environment_id"] = data.environment_id

    if data.pending_setup is not None:
        update_data["pending_setup"] = data.pending_setup

    if data.pending_setup_steps is not None:
        update_data["pending_setup_steps"] = data.pending_setup_steps

    await db.main_sites.update_one(
        {"id": main_site_id},
        {"$set": update_data}
    )
    
    updated = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    updated["site_count"] = await db.sites.count_documents({"main_site_id": main_site_id})
    updated["user_count"] = await db.main_site_users.count_documents({"main_site_id": main_site_id})

    # Resolve linked main site name
    if updated.get("linked_main_site_id"):
        linked = await db.main_sites.find_one({"id": updated["linked_main_site_id"]}, {"_id": 0, "name": 1})
        updated["linked_main_site_name"] = linked["name"] if linked else None

    # Log and notify system admin
    changed_fields = [k for k in update_data if k != "updated_at"]
    type_label = {"server": "Server Site", "technical": "Technical Site"}.get(updated.get("site_type", ""), "Main Site")
    asyncio.create_task(log_action(
        action=f"{type_label} Updated",
        category="system",
        user_id=current_user.get("id"),
        user_name=current_user.get("name", ""),
        user_email=current_user.get("email", ""),
        main_site_id=main_site_id,
        details={"description": f"{type_label} '{updated.get('name', '')}' updated by {current_user.get('name', '')} (fields: {', '.join(changed_fields)})"},
        target_type="main_site",
        target_id=main_site_id,
        target_name=updated.get("name", ""),
    ))

    await cache_delete_pattern("main_sites:*")
    return updated


@main_sites_router.delete("/{main_site_id}")
async def delete_main_site(
    main_site_id: str,
    current_user: dict = Depends(require_network_admin)
):
    """Delete a main site and all related data. Network admin only."""
    main_site = await db.main_sites.find_one({"id": main_site_id})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")

    # Cascade delete all related data
    related_collections = [
        "sites", "shows", "show_series", "show_titles", "show_occurrences",
        "series_assignments", "occurrence_assignments", "rundowns", "rundown_items",
        "content_items", "content_item_publishes", "content_item_featured_images",
        "media_assets", "media_folders", "wordpress_sites", "rds_settings",
        "rds_sequences", "rds_scheduled_texts", "rds_outputs", "rds_stations",
        "firewall_settings", "task_boards", "task_columns", "tasks",
        "studios", "categories",
    ]
    for coll in related_collections:
        await db[coll].delete_many({"main_site_id": main_site_id})

    # Delete user assignments and teams linked to this site
    site_user_ids = set()
    async for doc in db.main_site_users.find({"main_site_id": main_site_id}):
        uid = doc.get("user_id")
        if uid:
            site_user_ids.add(uid)
    await db.main_site_users.delete_many({"main_site_id": main_site_id})

    # Delete the main site itself
    await db.main_sites.delete_one({"id": main_site_id})

    logger.info(f"Main site deleted (cascade): {main_site['name']} by {current_user['email']}")

    type_label = {"server": "Server Site", "technical": "Technical Site"}.get(main_site.get("site_type", ""), "Main Site")
    asyncio.create_task(log_action(
        action=f"{type_label} Deleted",
        category="system",
        user_id=current_user.get("id"),
        user_name=current_user.get("name", ""),
        user_email=current_user.get("email", ""),
        details={"description": f"{type_label} '{main_site.get('name', '')}' deleted by {current_user.get('name', '')}"},
        target_type="main_site",
        target_name=main_site.get("name", ""),
    ))

    return {"status": "success", "message": "Main site and all related data deleted"}



@main_sites_router.post("/maintenance/clean-broken-logos")
async def clean_broken_logos(current_user: dict = Depends(get_current_user)):
    """Drop `logo_url` values that point at non-existing local files.

    After moving logo uploads to S3, the legacy `/api/uploads/site_logos/…`
    URLs from before the migration go stale because the container folder is
    ephemeral. This endpoint walks all main sites and clears any logo_url
    that no longer resolves locally and isn't an absolute https:// URL.
    Idempotent.
    """
    sites = await db.main_sites.find(
        {}, {"_id": 0, "id": 1, "name": 1, "logo_url": 1}
    ).to_list(500)

    cleared = 0
    cleared_names = []
    for s in sites:
        url = s.get("logo_url")
        if not url:
            continue
        if url.startswith(("http://", "https://")):
            continue
        if url.startswith("/api/uploads/site_logos/"):
            file_key = url.replace("/api/uploads/site_logos/", "")
            local = SITE_LOGOS_DIR / file_key
            if local.exists():
                continue
        await db.main_sites.update_one({"id": s["id"]}, {"$unset": {"logo_url": ""}})
        cleared += 1
        cleared_names.append(s.get("name"))

    return {"cleared": cleared, "sites": cleared_names}


@main_sites_router.post("/{main_site_id}/logo")
async def upload_site_logo(
    main_site_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a logo for a main site.

    Persists to S3 when configured (survives container restarts). Falls back
    to the local /uploads folder only if S3 is unavailable in the current
    environment — in that case the file is ephemeral and the admin should
    enable Cloud Resources for the environment.
    """
    main_site = await db.main_sites.find_one({"id": main_site_id})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "png"
    file_key = f"site_logos/{main_site_id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_bytes = await file.read()

    logo_url = None
    try:
        from services.s3_storage import is_s3_configured, upload_file_to_s3
        if is_s3_configured():
            result = await upload_file_to_s3(
                file_content=file_bytes,
                file_key=file_key,
                content_type=file.content_type,
                main_site_id=main_site_id,
                user_id=current_user.get("id"),
                user_name=current_user.get("name"),
            )
            logo_url = result["url"]
    except HTTPException:
        # Cloud Resources disabled for this env — fall back to local
        logo_url = None
    except Exception as e:
        # S3 hiccup — log and fall back
        import logging
        logging.getLogger(__name__).warning("Logo upload to S3 failed, falling back to local: %s", e)
        logo_url = None

    if not logo_url:
        # Local fallback (ephemeral — survives reload but not container restart)
        local_key = f"{main_site_id}_{uuid.uuid4().hex[:8]}.{ext}"
        dest = SITE_LOGOS_DIR / local_key
        SITE_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as out:
            out.write(file_bytes)
        logo_url = f"/api/uploads/site_logos/{local_key}"

    await db.main_sites.update_one({"id": main_site_id}, {"$set": {"logo_url": logo_url}})
    return {"logo_url": logo_url}


# ============== MAIN SITE USER MANAGEMENT ==============

@main_sites_router.get("/{main_site_id}/users", response_model=list[MainSiteUserResponse])
async def get_main_site_users(
    main_site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all users for a main site."""
    # Check access (admin or network admin)
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if role != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
    
    main_site = await db.main_sites.find_one({"id": main_site_id})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    site_users = await db.main_site_users.find(
        {"main_site_id": main_site_id},
        {"_id": 0}
    ).to_list(200)
    
    # Enrich with user details
    result = []
    for su in site_users:
        user = await db.users.find_one(
            {"id": su["user_id"]},
            {"_id": 0, "name": 1, "email": 1, "avatar": 1}
        )
        if user:
            avatar = user.get("avatar")
            result.append({
                **su,
                "user_name": user.get("name", "Unknown"),
                "user_email": user.get("email", ""),
                "avatar_url": resolve_avatar_url(avatar)
            })
    
    return result


@main_sites_router.get("/{main_site_id}/users/available")
async def get_available_users_for_main_site(
    main_site_id: str,
    search: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Get all users that are NOT yet assigned to this main site.
    
    Network admins can search across all users in the system.
    Useful for adding existing users from other main sites.
    """
    # Check access (network admin only for now)
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if role != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
    
    main_site = await db.main_sites.find_one({"id": main_site_id})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    # Get users already assigned to this main site
    assigned_users = await db.main_site_users.find(
        {"main_site_id": main_site_id},
        {"_id": 0, "user_id": 1}
    ).to_list(1000)
    assigned_user_ids = [u["user_id"] for u in assigned_users]
    
    # Build query for available users
    query = {
        "id": {"$nin": assigned_user_ids},
        "is_system_account": {"$ne": True}
    }
    
    # Add search filter if provided
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    # Get available users
    available_users = await db.users.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
    ).limit(50).to_list(50)
    
    # For each user, also get which other main sites they have access to
    for user in available_users:
        user_sites = await db.main_site_users.find(
            {"user_id": user["id"]},
            {"_id": 0, "main_site_id": 1, "role": 1}
        ).to_list(10)
        
        site_names = []
        for us in user_sites:
            site = await db.main_sites.find_one(
                {"id": us["main_site_id"]},
                {"_id": 0, "name": 1}
            )
            if site:
                site_names.append(site.get("name", "Unknown"))
        
        user["other_main_sites"] = site_names
    
    return available_users


@main_sites_router.post("/{main_site_id}/users", response_model=MainSiteUserResponse)
async def add_main_site_user(
    main_site_id: str,
    data: MainSiteUserCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a user to a main site."""
    # Check access
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if role != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
    
    main_site = await db.main_sites.find_one({"id": main_site_id})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    # Check if user exists
    user = await db.users.find_one({"id": data.user_id}, {"_id": 0, "name": 1, "email": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already assigned
    existing = await db.main_site_users.find_one({
        "main_site_id": main_site_id,
        "user_id": data.user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="User already has access to this main site")
    
    # Validate role
    valid_roles = ["admin", "editor", "presenter", "viewer"]
    if data.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}")
    
    now = datetime.now(timezone.utc).isoformat()
    assignment_id = str(uuid.uuid4())
    
    assignment = {
        "id": assignment_id,
        "main_site_id": main_site_id,
        "user_id": data.user_id,
        "role": data.role,
        "created_at": now
    }
    
    await db.main_site_users.insert_one(assignment)
    assignment.pop("_id", None)
    
    return {
        **assignment,
        "user_name": user.get("name", "Unknown"),
        "user_email": user.get("email", "")
    }


@main_sites_router.put("/{main_site_id}/users/{user_id}", response_model=MainSiteUserResponse)
async def update_main_site_user_role(
    main_site_id: str,
    user_id: str,
    data: MainSiteUserUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a user's role on a main site."""
    # Check access
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if role != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
    
    assignment = await db.main_site_users.find_one({
        "main_site_id": main_site_id,
        "user_id": user_id
    })
    if not assignment:
        raise HTTPException(status_code=404, detail="User assignment not found")
    
    # Validate role
    valid_roles = ["admin", "editor", "presenter", "viewer"]
    if data.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}")
    
    await db.main_site_users.update_one(
        {"main_site_id": main_site_id, "user_id": user_id},
        {"$set": {"role": data.role}}
    )
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1})
    
    return {
        "id": assignment["id"],
        "main_site_id": main_site_id,
        "user_id": user_id,
        "role": data.role,
        "created_at": assignment["created_at"],
        "user_name": user.get("name", "Unknown") if user else "Unknown",
        "user_email": user.get("email", "") if user else ""
    }


@main_sites_router.delete("/{main_site_id}/users/{user_id}")
async def remove_main_site_user(
    main_site_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove a user from a main site."""
    # Check access
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if role != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.main_site_users.delete_one({
        "main_site_id": main_site_id,
        "user_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User assignment not found")
    
    return {"status": "success", "message": "User removed from main site"}


# ============== MINI SITES WITHIN MAIN SITE ==============

@main_sites_router.get("/{main_site_id}/sites")
async def get_main_site_mini_sites(
    main_site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all mini sites for a main site."""
    # Check access
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if not role:
            raise HTTPException(status_code=403, detail="Access denied")
    
    main_site = await db.main_sites.find_one({"id": main_site_id})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    sites = await db.sites.find(
        {"main_site_id": main_site_id},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    return sites


# ============== MY ACCESS ==============

@main_sites_router.get("/my/access")
async def get_my_main_site_access(current_user: dict = Depends(get_current_user)):
    """Get current user's main site access list with their roles.
    Clone sites are only visible to network admins and admins of the parent site."""
    user_id = current_user['id']
    is_network_admin = current_user.get('is_network_admin', False)
    
    if is_network_admin and current_user.get('is_system_admin'):
        # System admin: show sites they have explicit access to PLUS all production radio sites
        # Full site management is available in Network Management
        user_access = await db.main_site_users.find(
            {"user_id": user_id},
            {"_id": 0}
        ).to_list(200)
        
        access_by_id = {a["main_site_id"]: a.get("role", "admin") for a in user_access}
        explicit_site_ids = list(access_by_id.keys())
        
        # Get sites: explicit access + all non-staging, non-clone, non-technical production sites
        main_sites = await db.main_sites.find({
            "$or": [
                {"id": {"$in": explicit_site_ids}},
                {"cloned_from": {"$exists": False}},
                {"cloned_from": None}
            ]
        }, {"_id": 0}).to_list(200)
        
        # Filter: exclude staging duplicates and test clones from dropdown
        filtered = []
        seen_names = set()
        for ms in main_sites:
            # Skip clones unless explicitly assigned
            if ms.get("cloned_from") and ms["id"] not in access_by_id:
                continue
            # Deduplicate staging variants: prefer production over staging
            base_name = ms.get("name", "").replace(" (Staging)", "").replace("[TEST] ", "")
            if base_name in seen_names and ms["id"] not in access_by_id:
                continue
            seen_names.add(base_name)
            filtered.append(ms)
        
        main_sites = filtered

        env_ids = list(set(ms.get("environment_id") for ms in main_sites if ms.get("environment_id")))
        envs = {}
        if env_ids:
            env_docs = await db.environments.find({"id": {"$in": env_ids}}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "color": 1}).to_list(50)
            envs = {e["id"]: e for e in env_docs}

        return {
            "is_network_admin": True,
            "is_system_admin": True,
            "main_sites": [
                {
                    "id": ms["id"],
                    "name": ms["name"],
                    "slug": ms["slug"],
                    "logo_url": ms.get("logo_url"),
                    "site_type": ms.get("site_type", "radio"),
                    "cloned_from": ms.get("cloned_from"),
                    "environment_id": ms.get("environment_id"),
                    "environment_name": envs.get(ms.get("environment_id"), {}).get("name"),
                    "environment_color": envs.get(ms.get("environment_id"), {}).get("color"),
                    "role": access_by_id.get(ms["id"], "network_admin")
                }
                for ms in main_sites
            ]
        }
    
    # Get user's direct access records
    user_access = await db.main_site_users.find(
        {"user_id": user_id},
        {"_id": 0}
    ).to_list(200)
    
    access_by_id = {a["main_site_id"]: a.get("role", "viewer") for a in user_access}

    if is_network_admin:
        # Network admins: show only sites they have explicit access to
        # Full site management is available in Network Management
        user_site_ids = [a["main_site_id"] for a in user_access]
        main_sites = await db.main_sites.find(
            {"id": {"$in": user_site_ids}},
            {"_id": 0}
        ).to_list(200)
        # Filter clones: only show if user is admin of parent
        admin_site_ids = {sid for sid, role in access_by_id.items() if role in ("admin", "network_admin")}
        filtered = []
        for ms in main_sites:
            cloned_from = ms.get("cloned_from")
            if not cloned_from:
                filtered.append(ms)
            elif cloned_from in admin_site_ids or ms["id"] in admin_site_ids:
                filtered.append(ms)
        main_sites = filtered
    else:
        # Regular users see only sites they have explicit access to
        user_site_ids = [a["main_site_id"] for a in user_access]
        main_sites = await db.main_sites.find(
            {"id": {"$in": user_site_ids}},
            {"_id": 0}
        ).to_list(200)
        # Filter clones: only show if user is admin of parent
        admin_site_ids = {sid for sid, role in access_by_id.items() if role == "admin"}
        filtered = []
        for ms in main_sites:
            cloned_from = ms.get("cloned_from")
            if not cloned_from:
                filtered.append(ms)
            elif cloned_from in admin_site_ids or ms["id"] in admin_site_ids:
                filtered.append(ms)
        main_sites = filtered

    env_ids = list(set(ms.get("environment_id") for ms in main_sites if ms.get("environment_id")))
    envs = {}
    if env_ids:
        env_docs = await db.environments.find({"id": {"$in": env_ids}}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "color": 1}).to_list(50)
        envs = {e["id"]: e for e in env_docs}

    return {
        "is_network_admin": is_network_admin,
        "is_system_admin": False,
        "main_sites": [
            {
                "id": ms["id"],
                "name": ms["name"],
                "slug": ms["slug"],
                "logo_url": ms.get("logo_url"),
                "site_type": ms.get("site_type", "radio"),
                "cloned_from": ms.get("cloned_from"),
                "environment_id": ms.get("environment_id"),
                "environment_name": envs.get(ms.get("environment_id"), {}).get("name"),
                "environment_color": envs.get(ms.get("environment_id"), {}).get("color"),
                "role": access_by_id.get(ms["id"], "network_admin")
            }
            for ms in main_sites
        ]
    }



# ============== DEBUG ENDPOINTS ==============

@main_sites_router.get("/debug/all-user-access")
async def get_all_user_access(current_user: dict = Depends(require_network_admin)):
    """Get all user access records for debugging purposes.
    
    Returns all main_site_users records with user and site details.
    Only accessible by network admins.
    """
    # Get all main_site_users records
    access_records = await db.main_site_users.find({}, {"_id": 0}).to_list(1000)
    
    # Get all users and main sites for lookup
    all_users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}).to_list(1000)
    all_main_sites = await db.main_sites.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1}).to_list(100)
    
    users_by_id = {u["id"]: u for u in all_users}
    sites_by_id = {s["id"]: s for s in all_main_sites}
    
    # Build enriched access list
    enriched_access = []
    for record in access_records:
        user = users_by_id.get(record.get("user_id"), {})
        site = sites_by_id.get(record.get("main_site_id"), {})
        
        enriched_access.append({
            "user_id": record.get("user_id"),
            "user_name": user.get("name", "Unknown"),
            "user_email": user.get("email", "Unknown"),
            "user_global_role": user.get("role", "Unknown"),
            "main_site_id": record.get("main_site_id"),
            "main_site_name": site.get("name", "Unknown"),
            "main_site_slug": site.get("slug", "Unknown"),
            "site_role": record.get("role", "Unknown"),
            "created_at": record.get("created_at"),
        })
    
    # Group by main site for easier viewing
    by_site = {}
    for access in enriched_access:
        site_name = access["main_site_name"]
        if site_name not in by_site:
            by_site[site_name] = []
        by_site[site_name].append(access)
    
    # Also find users WITHOUT any main_site_users records
    users_with_access = set(r.get("user_id") for r in access_records)
    users_without_access = [
        {
            "user_id": u["id"],
            "user_name": u.get("name", "Unknown"),
            "user_email": u.get("email", "Unknown"),
            "user_global_role": u.get("role", "Unknown"),
        }
        for u in all_users
        if u["id"] not in users_with_access
    ]
    
    return {
        "total_access_records": len(access_records),
        "total_users": len(all_users),
        "total_main_sites": len(all_main_sites),
        "users_without_site_access": users_without_access,
        "access_by_site": by_site,
        "all_access_records": enriched_access
    }


@main_sites_router.get("/debug/api-endpoints")
async def get_api_endpoints(current_user: dict = Depends(require_network_admin)):
    """Get all API endpoints for documentation/debugging.
    
    Returns all registered routes grouped by category/router.
    Only accessible by network admins.
    """
    from server import app
    
    # Category mapping based on route prefix
    category_map = {
        '/api/auth': {'name': 'Authentication', 'icon': 'shield', 'description': 'Login, registration, 2FA'},
        '/api/users': {'name': 'Users', 'icon': 'users', 'description': 'User management'},
        '/api/teams': {'name': 'Teams', 'icon': 'building', 'description': 'Team management'},
        '/api/shows': {'name': 'Shows', 'icon': 'calendar', 'description': 'Show scheduling and rundowns'},
        '/api/content': {'name': 'Content', 'icon': 'file-text', 'description': 'Content items and media'},
        '/api/media': {'name': 'Media', 'icon': 'image', 'description': 'Media assets and uploads'},
        '/api/rds': {'name': 'RDS', 'icon': 'radio', 'description': 'RDS/Now Playing'},
        '/api/rds-builder': {'name': 'RDS Builder', 'icon': 'settings', 'description': 'RDS text sequences'},
        '/api/sites': {'name': 'Sites', 'icon': 'globe', 'description': 'Mini-sites management'},
        '/api/main-sites': {'name': 'Main Sites', 'icon': 'globe-2', 'description': 'Main sites and network'},
        '/api/chat': {'name': 'Chat', 'icon': 'message-circle', 'description': 'Team chat'},
        '/api/wordpress': {'name': 'WordPress', 'icon': 'rss', 'description': 'WordPress integration'},
        '/api/series': {'name': 'Series', 'icon': 'layers', 'description': 'Content series'},
        '/api/folders': {'name': 'Folders', 'icon': 'folder', 'description': 'Media folders'},
        '/api/logs': {'name': 'Logs', 'icon': 'list', 'description': 'Audit logs'},
        '/api/audio-triggers': {'name': 'Audio Triggers', 'icon': 'volume-2', 'description': 'Audio detection triggers'},
        '/api/stream': {'name': 'Stream', 'icon': 'radio', 'description': 'Stream proxy'},
        '/api/public': {'name': 'Public', 'icon': 'external-link', 'description': 'Public endpoints (no auth)'},
        '/api/migration': {'name': 'Migration', 'icon': 'database', 'description': 'Data migration tools'},
    }
    
    # Method colors for UI
    method_colors = {
        'GET': 'emerald',
        'POST': 'blue',
        'PUT': 'amber',
        'PATCH': 'orange',
        'DELETE': 'red',
        'OPTIONS': 'zinc',
        'HEAD': 'zinc',
        'WEBSOCKET': 'violet'
    }
    
    endpoints_by_category = {}
    
    for route in app.routes:
        # Skip internal routes
        if hasattr(route, 'path'):
            path = route.path
            
            # Skip health checks and root
            if path in ['/', '/health', '/openapi.json', '/docs', '/redoc']:
                continue
            
            # Get methods
            methods = []
            if hasattr(route, 'methods'):
                methods = list(route.methods - {'HEAD', 'OPTIONS'})
            elif 'websocket' in str(type(route)).lower():
                methods = ['WEBSOCKET']
            
            if not methods:
                continue
            
            # Find category
            category_key = None
            for prefix in category_map.keys():
                if path.startswith(prefix):
                    category_key = prefix
                    break
            
            if not category_key:
                category_key = '/api/other'
                if category_key not in category_map:
                    category_map[category_key] = {'name': 'Other', 'icon': 'code', 'description': 'Other endpoints'}
            
            category = category_map[category_key]
            
            if category['name'] not in endpoints_by_category:
                endpoints_by_category[category['name']] = {
                    'icon': category['icon'],
                    'description': category['description'],
                    'endpoints': []
                }
            
            # Get endpoint description from docstring
            description = ""
            if hasattr(route, 'endpoint') and route.endpoint.__doc__:
                doc = route.endpoint.__doc__.strip()
                # Get first line only
                description = doc.split('\n')[0].strip()
            
            for method in methods:
                endpoints_by_category[category['name']]['endpoints'].append({
                    'method': method,
                    'path': path,
                    'description': description,
                    'method_color': method_colors.get(method, 'zinc')
                })
    
    # Sort endpoints within each category
    for cat in endpoints_by_category.values():
        cat['endpoints'].sort(key=lambda x: (x['path'], x['method']))
    
    # Sort categories alphabetically
    sorted_categories = dict(sorted(endpoints_by_category.items()))
    
    # Count totals
    total_endpoints = sum(len(cat['endpoints']) for cat in sorted_categories.values())
    
    return {
        'total_endpoints': total_endpoints,
        'total_categories': len(sorted_categories),
        'categories': sorted_categories
    }


# ============== CONTENT MIGRATION ==============

CONTENT_COLLECTIONS = [
    'shows',
    'show_titles',
    'studios',
    'media_assets',
    'content_items',
    'categories',
    'series'
]


@main_sites_router.post("/migrate-content/{main_site_id}")
async def migrate_team_content_to_main_site(
    main_site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Migrate existing team content to a main site.
    This should be run once after creating the first main site to
    associate existing content with the main site.
    
    Only network admins or main site admins can run this.
    """
    # Verify main site exists
    main_site = await db.main_sites.find_one({"id": main_site_id})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    # Check permissions
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        access = await db.main_site_users.find_one({
            "user_id": current_user['id'],
            "main_site_id": main_site_id,
            "role": "admin"
        })
        if not access:
            raise HTTPException(status_code=403, detail="Admin access required")
    
    team_id = current_user.get('team_id')
    if not team_id:
        raise HTTPException(status_code=400, detail="User has no team_id")
    
    results = {}
    
    # Migrate each collection
    for collection_name in CONTENT_COLLECTIONS:
        collection = db[collection_name]
        
        # Find documents that belong to this team and don't have main_site_id
        query = {
            'team_id': team_id,
            '$or': [
                {'main_site_id': {'$exists': False}},
                {'main_site_id': None}
            ]
        }
        
        count_before = await collection.count_documents(query)
        
        if count_before > 0:
            # Update documents
            result = await collection.update_many(
                query,
                {'$set': {'main_site_id': main_site_id}}
            )
            results[collection_name] = {
                "found": count_before,
                "migrated": result.modified_count
            }
        else:
            results[collection_name] = {
                "found": 0,
                "migrated": 0
            }
    
    return {
        "success": True,
        "main_site_id": main_site_id,
        "main_site_name": main_site.get("name"),
        "migration_results": results
    }


# ============== HEALTH CHECK & DEBUG (Network Admin) ==============

@main_sites_router.post("/{main_site_id}/health-check")
async def run_health_check(
    main_site_id: str,
    current_user: dict = Depends(require_network_admin)
):
    """Run health checks for a main site: API endpoints, content counts, site reachability."""
    main_site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    timestamp = datetime.now(timezone.utc).isoformat()
    checks = []
    
    # 1. Get child sites and team_ids
    child_sites = await db.sites.find(
        {"main_site_id": main_site_id}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "team_id": 1}
    ).to_list(50)
    team_ids = list(set(
        [s["team_id"] for s in child_sites if s.get("team_id")] + [main_site_id]
    ))
    
    checks.append({
        "name": "Mini Sites",
        "status": "ok" if child_sites else "warning",
        "message": f"{len(child_sites)} mini sites found",
        "details": [{"name": s.get("name", "?"), "slug": s.get("slug", "?")} for s in child_sites]
    })
    
    # 2. Content count
    content_count = await db.content_items.count_documents({
        "$or": [{"main_site_id": main_site_id}, {"team_id": {"$in": team_ids}}],
        "deleted_at": {"$exists": False}
    })
    checks.append({
        "name": "Content Items",
        "status": "ok" if content_count > 0 else "warning",
        "message": f"{content_count} content items",
        "count": content_count
    })
    
    # 3. Shows count (today and total)
    from zoneinfo import ZoneInfo
    now_brussels = datetime.now(ZoneInfo('Europe/Brussels'))
    today = now_brussels.strftime('%Y-%m-%d')
    
    shows_today = await db.shows.count_documents({
        "$or": [{"team_id": {"$in": team_ids}}, {"main_site_id": main_site_id}],
        "date": today
    })
    shows_total = await db.shows.count_documents({
        "$or": [{"team_id": {"$in": team_ids}}, {"main_site_id": main_site_id}]
    })
    checks.append({
        "name": "Shows",
        "status": "ok" if shows_today > 0 else "warning",
        "message": f"{shows_today} shows vandaag, {shows_total} totaal",
        "today": shows_today,
        "total": shows_total
    })
    
    # 4. Users count
    users = await db.main_site_users.count_documents({"main_site_id": main_site_id})
    checks.append({
        "name": "Users",
        "status": "ok" if users > 0 else "warning",
        "message": f"{users} users",
        "count": users
    })
    
    # 5. RDS settings check
    rds_settings = await db.rds_settings.find_one(
        {"$or": [{"main_site_id": main_site_id}, {"team_id": {"$in": team_ids}}]},
        {"_id": 0}
    )
    if rds_settings:
        last_refresh = rds_settings.get("last_cache_refresh")
        checks.append({
            "name": "RDS Cache",
            "status": "ok" if last_refresh else "warning",
            "message": f"Laatste refresh: {last_refresh[:19] if last_refresh else 'Nooit'}",
            "interval": rds_settings.get("cache_refresh_interval", "?")
        })
    else:
        checks.append({
            "name": "RDS Cache",
            "status": "warning",
            "message": "Geen RDS instellingen"
        })
    
    # 6. WordPress sites
    wp_sites = await db.wordpress_sites.count_documents({
        "$or": [{"team_id": {"$in": team_ids}}, {"main_site_id": main_site_id}]
    })
    checks.append({
        "name": "WordPress Sites",
        "status": "ok" if wp_sites > 0 else "info",
        "message": f"{wp_sites} WordPress sites",
        "count": wp_sites
    })
    
    # 7. Media count
    media_count = await db.media_assets.count_documents({
        "$or": [{"team_id": {"$in": team_ids}}, {"main_site_id": main_site_id}]
    })
    checks.append({
        "name": "Media Assets",
        "status": "ok" if media_count > 0 else "info",
        "message": f"{media_count} media bestanden",
        "count": media_count
    })
    
    # Calculate overall status
    statuses = [c["status"] for c in checks]
    overall = "ok" if all(s == "ok" for s in statuses) else ("error" if "error" in statuses else "warning")
    
    # Save to DB
    result = {
        "id": str(uuid.uuid4()),
        "main_site_id": main_site_id,
        "main_site_name": main_site.get("name"),
        "timestamp": timestamp,
        "overall_status": overall,
        "checks": checks,
        "team_ids_resolved": team_ids
    }
    await db.health_checks.insert_one(result)
    result.pop("_id", None)
    
    return result


@main_sites_router.get("/{main_site_id}/health-history")
async def get_health_history(
    main_site_id: str,
    limit: int = 20,
    current_user: dict = Depends(require_network_admin)
):
    """Get stored health check history for a main site."""
    checks = await db.health_checks.find(
        {"main_site_id": main_site_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return checks


@main_sites_router.get("/{main_site_id}/api-endpoints")
async def get_main_site_api_endpoints(
    main_site_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Curated, feature-aware list of public API endpoints for ONE main site.

    Returned groups depend on the site's `enabled_features`:
      - "rds" feature              → Radio & RDS group (per dynamic station of THIS site)
      - "content_library" feature  → News & Content group (per category of THIS site)
      - "clara_custom" feature     → Clara Custom group (per integration of THIS site)
    Authentication & Public is always included.

    Base URL is derived from the **incoming request's Host header** so the page
    always shows the URLs of whatever Clara instance the admin is currently
    using (preview vs production), not a hardcoded fallback.
    """
    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")

    enabled = site.get("enabled_features") or []
    site_type = site.get("site_type")
    # Backwards compat for migrated sites: external_host/clara_custom no longer
    # exist; the features they used (content_library, etc.) are now explicit.
    # No implicit fall-through here — features must be in enabled_features.

    # Derive base URL from the incoming request so preview→preview URLs,
    # production→production URLs. Cloudflare/Kubernetes ingress forwards the
    # public hostname via X-Forwarded-Host (and the scheme via X-Forwarded-Proto).
    # Fall back to the raw Host header only when no proxy header is present.
    fwd_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
    fwd_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    host = fwd_host or request.url.hostname or ""
    scheme = fwd_proto or request.url.scheme or "https"
    base_url = f"{scheme}://{host}" if host else ""

    groups = []

    # ─── Radio & RDS ───────────────────────────────────────────────────────
    if "rds" in enabled or "rds_settings" in enabled:
        rds_stations = await db.rds_stations.find(
            {"main_site_id": main_site_id}, {"_id": 0}
        ).to_list(50)
        rds_endpoints = []
        for st in rds_stations:
            code = (st.get("code") or "").lower()
            name = st.get("name") or code.upper()
            color = st.get("color") or "#f97316"
            if not code:
                continue
            rds_endpoints.extend([
                {"name": f"{name} — Live Show (text)",  "description": f"Title of the current {name} live show", "method": "GET", "response_type": "text/plain",     "path": f"/api/rds/{code}/live",                 "full_url": f"{base_url}/api/rds/{code}/live",                 "tag": name, "tag_color": color},
                {"name": f"{name} — Live Show (JSON)",  "description": f"Title of the current {name} live show, JSON-wrapped.", "method": "GET", "response_type": "application/json", "path": f"/api/rds/{code}/live.json",            "full_url": f"{base_url}/api/rds/{code}/live.json",            "tag": name, "tag_color": color},
                {"name": f"{name} — Presenter(s) (text)", "description": f"Presenter name(s) live on {name}, joined with ' & '", "method": "GET", "response_type": "text/plain",     "path": f"/api/rds/{code}/presenter",            "full_url": f"{base_url}/api/rds/{code}/presenter",            "tag": name, "tag_color": color},
                {"name": f"{name} — Presenter(s) (JSON)", "description": f"Presenter(s) on {name} as both joined string and list array.", "method": "GET", "response_type": "application/json", "path": f"/api/rds/{code}/presenter.json",       "full_url": f"{base_url}/api/rds/{code}/presenter.json",       "tag": name, "tag_color": color},
                {"name": f"{name} — Now Playing (text)", "description": f"Current track on {name} as plain text", "method": "GET", "response_type": "text/plain",     "path": f"/api/rds/{code}/now-playing.txt",      "full_url": f"{base_url}/api/rds/{code}/now-playing.txt",      "tag": name, "tag_color": color},
                {"name": f"{name} — Now Playing (JSON)", "description": "Shoutcast info incl. listeners",          "method": "GET", "response_type": "application/json", "path": f"/api/rds/{code}/now-playing",          "full_url": f"{base_url}/api/rds/{code}/now-playing",          "tag": name, "tag_color": color},
                {"name": f"{name} — Cached Rundown",     "description": f"Cached rundown JSON for {name}",         "method": "GET", "response_type": "application/json", "path": f"/api/rds/{code}/cached-rundown",       "full_url": f"{base_url}/api/rds/{code}/cached-rundown",       "tag": name, "tag_color": color},
                {"name": f"{name} — Presenter image",    "description": f"Photo of the current {name} presenter",  "method": "GET", "response_type": "image/jpeg",     "path": f"/api/rds/{code}/image.jpg",            "full_url": f"{base_url}/api/rds/{code}/image.jpg",            "tag": name, "tag_color": color},
                {"name": f"{name} — Show image URL (text)", "description": "Plain text URL of the current show's image",                                       "method": "GET", "response_type": "text/plain",     "path": f"/api/rds/{code}/image-url.txt",        "full_url": f"{base_url}/api/rds/{code}/image-url.txt",        "tag": name, "tag_color": color},
                {"name": f"{name} — Show image URL (JSON)", "description": "JSON-wrapped URL of the current show's image",                                     "method": "GET", "response_type": "application/json", "path": f"/api/rds/{code}/image-url.json",       "full_url": f"{base_url}/api/rds/{code}/image-url.json",       "tag": name, "tag_color": color},
            ])
        # Always include the cross-station fallbacks
        rds_endpoints.extend([
            {"name": "Any station — Live Show (text)",   "description": "Title of any currently-live show",         "method": "GET", "response_type": "text/plain",     "path": "/api/rds/live",          "full_url": f"{base_url}/api/rds/live",          "tag": "All", "tag_color": "#71717a"},
            {"name": "Any station — Live Show (JSON)",   "description": "JSON-wrapped title of any currently-live show", "method": "GET", "response_type": "application/json", "path": "/api/rds/live.json",     "full_url": f"{base_url}/api/rds/live.json",     "tag": "All", "tag_color": "#71717a"},
            {"name": "Any station — Presenter(s) (text)", "description": "Presenter(s) for any currently-live show", "method": "GET", "response_type": "text/plain",     "path": "/api/rds/presenter",     "full_url": f"{base_url}/api/rds/presenter",     "tag": "All", "tag_color": "#71717a"},
            {"name": "Any station — Presenter(s) (JSON)", "description": "JSON-wrapped presenter info (string + list)", "method": "GET", "response_type": "application/json", "path": "/api/rds/presenter.json","full_url": f"{base_url}/api/rds/presenter.json","tag": "All", "tag_color": "#71717a"},
        ])
        # Per-station × per-day schedule endpoints (one URL per day, exactly as
        # asked for). Plus convenience "today" and "week" aliases.
        site_slug_for_schedule = site.get("slug", "")
        if site_slug_for_schedule and rds_stations:
            DAYS_NL = ("maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag")
            for st in rds_stations:
                code = (st.get("code") or "").lower()
                name = st.get("name") or code.upper()
                color = st.get("color") or "#f97316"
                if not code:
                    continue
                rds_endpoints.append({
                    "name": f"{name} — Schedule · This Week",
                    "description": f"Full weekly schedule for {name}, grouped per day. Each show carries time, title, presenter and presenter photo.",
                    "method": "GET", "response_type": "application/json",
                    "path": f"/api/public/schedule/{site_slug_for_schedule}/{code}/week",
                    "full_url": f"{base_url}/api/public/schedule/{site_slug_for_schedule}/{code}/week",
                    "tag": name, "tag_color": color,
                })
                rds_endpoints.append({
                    "name": f"{name} — Schedule · Today",
                    "description": f"Shows airing on {name} today (in Europe/Brussels time).",
                    "method": "GET", "response_type": "application/json",
                    "path": f"/api/public/schedule/{site_slug_for_schedule}/{code}/today",
                    "full_url": f"{base_url}/api/public/schedule/{site_slug_for_schedule}/{code}/today",
                    "tag": name, "tag_color": color,
                })
                for day in DAYS_NL:
                    rds_endpoints.append({
                        "name": f"{name} — Schedule · {day.capitalize()}",
                        "description": f"Shows airing on {name} on {day}. Returns time, show name, presenter(s) and presenter photo.",
                        "method": "GET", "response_type": "application/json",
                        "path": f"/api/public/schedule/{site_slug_for_schedule}/{code}/day/{day}",
                        "full_url": f"{base_url}/api/public/schedule/{site_slug_for_schedule}/{code}/day/{day}",
                        "tag": name, "tag_color": color,
                    })
        if rds_endpoints:
            groups.append({
                "id": "radio_rds",
                "name": "Radio & RDS",
                "icon": "radio",
                "description": "Live show, presenter, now-playing and rundown data for this site's radio stations. Public, no auth.",
                "endpoints": rds_endpoints,
            })

    # ─── News & Content ────────────────────────────────────────────────────
    if "content_library" in enabled:
        cats = await db.categories.find(
            {"main_site_id": main_site_id}, {"_id": 0, "id": 1, "name": 1, "slug": 1}
        ).sort("name", 1).to_list(100)
        site_slug = site.get("slug", "")
        news_endpoints = []
        for cat in cats:
            cnt = await db.content_items.count_documents({
                "main_site_id": main_site_id,
                "category_id": cat["id"],
                "status": {"$in": ["ready", "published"]},
            })
            news_endpoints.append({
                "name": f"{cat['name']}",
                "description": f"List of public articles in category '{cat['name']}' for this site. {cnt} item(s) available.",
                "method": "GET",
                "response_type": "application/json",
                "path": f"/api/news/{site_slug}/{cat['slug']}",
                "full_url": f"{base_url}/api/news/{site_slug}/{cat['slug']}",
                "tag": cat["name"],
                "tag_color": "#0ea5e9",
                "item_count": cnt,
            })
        # Always include article-detail endpoint
        news_endpoints.append({
            "name": "Article detail",
            "description": "Full article body (HTML) by id or slug. Public, no auth. Used for share previews, RSS, mobile apps.",
            "method": "GET",
            "response_type": "application/json",
            "path": "/api/news/articles/{article_id}",
            "full_url": f"{base_url}/api/news/articles/{{article_id}}",
            "tag": "Detail",
            "tag_color": "#0ea5e9",
        })
        if news_endpoints:
            groups.append({
                "id": "news_content",
                "name": "News & Content",
                "icon": "newspaper",
                "description": "Public article lists per category and article detail. One endpoint per category — perfect for splitting your site's news feeds.",
                "endpoints": news_endpoints,
            })

    # ─── Clara Custom integrations ─────────────────────────────────────────
    # Show this group when the site has at least one registered Clara
    # integration (auto-detected — no separate feature flag needed).
    integrations = await db.clara_integrations.find(
        {"main_site_id": main_site_id}, {"_id": 0, "shared_secret": 0, "integration_token": 0}
    ).to_list(50)
    if integrations:
        clara_endpoints = [
            {"name": "Inbound — Register external integration", "description": "External Emergent project POSTs here on startup with its `integration_token` to self-register against this Clara.", "method": "POST", "response_type": "application/json", "path": "/api/clara-custom/integrations/register", "full_url": f"{base_url}/api/clara-custom/integrations/register", "tag": "Inbound", "tag_color": "#dd0c51"},
        ]
        # Per-integration outbound endpoints
        for ig in integrations:
            tpl = ig.get("template", "integration")
            base = (ig.get("base_url") or "").rstrip("/")
            if not base:
                continue
            eps = ig.get("endpoints_map") or {}
            color = "#7c1ac8"
            for key, label in [("health", "Health"), ("list", "List items"), ("upsert_by_clara_id", "Upsert by Clara id"), ("delete_by_clara_id", "Delete by Clara id")]:
                p = eps.get(key)
                if not p:
                    continue
                clara_endpoints.append({
                    "name": f"{tpl} — {label}",
                    "description": f"External endpoint Clara calls on the {tpl} integration.",
                    "method": "GET" if key in ("health", "list") else ("POST" if key.startswith("upsert") else "DELETE"),
                    "response_type": "application/json",
                    "path": p,
                    "full_url": f"{base}{p}",
                    "tag": tpl,
                    "tag_color": color,
                })
        if clara_endpoints:
            groups.append({
                "id": "clara_custom",
                "name": "Clara Custom",
                "icon": "plug",
                "description": "Integration endpoints for external Emergent projects to push/pull content via Clara as a headless CMS.",
                "endpoints": clara_endpoints,
            })

    # ─── Video Endpoints (shown when the site has any video endpoints) ────
    has_video_endpoints = False
    try:
        has_video_endpoints = bool(await db.video_endpoints.find_one(
            {"main_site_id": main_site_id}, {"_id": 1}
        ))
    except Exception:
        has_video_endpoints = False
    if has_video_endpoints:
        # Sample a few endpoints + shows so the editor has copy-pasteable URLs
        sample_ve = [d async for d in db.video_endpoints.find(
            {"main_site_id": main_site_id}, {"_id": 0, "id": 1, "name": 1}
        ).limit(3)]
        sample_show = await db.shows.find_one(
            {"main_site_id": main_site_id, "has_video": True},
            {"_id": 0, "id": 1, "title": 1},
        )
        video_endpoints_list = [
            {
                "name": "Currently live show — video",
                "description": "Auto-resolves the currently airing show (today, in the start/end window) and returns its linked video endpoint. Empty body when nothing is live or the live show doesn't have video enabled.",
                "method": "GET",
                "response_type": "application/json",
                "path": "/api/videos/public/live",
                "full_url": f"{base_url}/api/videos/public/live",
                "tag": "Video", "tag_color": "#e11d48",
            },
        ]
        if sample_show:
            video_endpoints_list.append({
                "name": f"Show video — {sample_show.get('title','')[:40]}",
                "description": "Returns the linked Video Endpoint of a specific show. Empty body when 'Send to Video Endpoint' is off in the rundown.",
                "method": "GET",
                "response_type": "application/json",
                "path": f"/api/videos/public/show/{sample_show['id']}",
                "full_url": f"{base_url}/api/videos/public/show/{sample_show['id']}",
                "tag": "Video", "tag_color": "#e11d48",
            })
        else:
            video_endpoints_list.append({
                "name": "Show video — {show_id}",
                "description": "Returns the linked Video Endpoint of a specific show. Empty body when 'Send to Video Endpoint' is off in the rundown. Replace {show_id} with the show's UUID.",
                "method": "GET",
                "response_type": "application/json",
                "path": "/api/videos/public/show/{show_id}",
                "full_url": f"{base_url}/api/videos/public/show/{{show_id}}",
                "tag": "Video", "tag_color": "#e11d48",
            })
        for ve in sample_ve:
            video_endpoints_list.append({
                "name": f"Direct endpoint — {ve.get('name','')[:40]}",
                "description": "Anonymous read of a single Video Endpoint by its id. Returns embed_html, platform, thumbnail.",
                "method": "GET",
                "response_type": "application/json",
                "path": f"/api/videos/public/{ve['id']}",
                "full_url": f"{base_url}/api/videos/public/{ve['id']}",
                "tag": "Video", "tag_color": "#e11d48",
            })
        if not sample_ve:
            video_endpoints_list.append({
                "name": "Direct endpoint — {video_id}",
                "description": "Anonymous read of a single Video Endpoint by its id.",
                "method": "GET",
                "response_type": "application/json",
                "path": "/api/videos/public/{video_id}",
                "full_url": f"{base_url}/api/videos/public/{{video_id}}",
                "tag": "Video", "tag_color": "#e11d48",
            })
        groups.append({
            "id": "video_endpoints",
            "name": "Video Endpoints",
            "icon": "video",
            "description": "Public video URLs. Editors toggle 'Send to Video Endpoint' in a show's rundown to expose it via the API. Empty body when the toggle is off.",
            "endpoints": video_endpoints_list,
        })

    # ─── Authentication & Public (always present) ──────────────────────────
    groups.append({
        "id": "auth_public",
        "name": "Authentication & Public",
        "icon": "shield",
        "description": "Login and other generally-available endpoints. Not site-specific.",
        "endpoints": [
            {"name": "Login",                "description": "POST email+password, receive JWT token.",          "method": "POST", "response_type": "application/json", "path": "/api/auth/login",          "full_url": f"{base_url}/api/auth/login",          "tag": "Auth", "tag_color": "#52525b"},
            {"name": "Current user (whoami)","description": "GET your own user record with the bearer token.", "method": "GET",  "response_type": "application/json", "path": "/api/auth/me",             "full_url": f"{base_url}/api/auth/me",             "tag": "Auth", "tag_color": "#52525b"},
            {"name": "Service health",       "description": "Kubernetes liveness probe. No auth.",               "method": "GET",  "response_type": "application/json", "path": "/api/health",              "full_url": f"{base_url}/api/health",              "tag": "Public", "tag_color": "#52525b"},
        ],
    })

    # ─── Additional Public Endpoints (auto-introspected, sub-grouped) ──────
    # Walk every registered FastAPI route, find the ones that DO NOT require
    # authentication, sub-group them per first-path-segment so the page has
    # ~8 small cards instead of one giant scroll-list.
    try:
        extra_groups = _build_extra_public_endpoint_groups(base_url, site, groups)
        for g in extra_groups:
            if g["endpoints"]:
                groups.append(g)
    except Exception as e:
        logger.warning(f"Could not introspect extra public endpoints: {e}")

    return {
        "site": {"id": site["id"], "name": site["name"], "slug": site.get("slug"), "enabled_features": enabled, "site_type": site_type},
        "base_url": base_url,
        "groups": groups,
        "total_endpoints": sum(len(g["endpoints"]) for g in groups),
    }


def _build_extra_public_endpoint_groups(base_url: str, site: dict, existing_groups: list) -> list:
    """Introspect FastAPI's route table and return a list of sub-groups of
    public (auth-less) GET endpoints, one per first-path-segment.

    "Public" = the route has no auth dependency (no Depends(get_current_user) etc.)
    Each returned group has the same shape as the curated groups so the
    frontend renders them identically.
    """
    from server import app
    from fastapi.routing import APIRoute

    # Build the set of paths already in curated groups so we don't duplicate.
    covered_paths = set()
    for g in existing_groups:
        for ep in g.get("endpoints", []):
            covered_paths.add((ep["method"], ep["path"]))

    # Heuristics: prefixes/keywords that should NEVER be shown to a site admin,
    # even when auth-less, because they're operational/internal or per-token.
    excluded_prefixes = (
        "/api/migration", "/api/debug", "/api/internal", "/api/test",
        "/api/vdc",                # deployment internals
        "/api/clara-custom",       # already curated when integrations are registered
        "/api/auth/",              # all auth flows live in their own group already
        "/api/branding/upload",    # admin uploads
        "/api/canva/auth",         # OAuth callbacks, not browsable
    )
    excluded_keywords = ("debug", "migration", "internal", "test-connection", "/callback")

    # Single-use tokens in path (per-invite, per-share) → skip (not enumerable)
    def _has_single_use_token(p: str) -> bool:
        return any(seg in p for seg in ("{token}", "{invite_token}", "{share_token}", "{call_token}", "{reset_token}"))

    # Some routes are nominally public but route-by-id only (useless to list)
    # We KEEP /api/news/articles/{id} because the curated group already lists it.

    # Auth dependency detection: any dependency whose call signature mentions
    # current_user / token / require_* is treated as authenticated.
    def _is_auth_required(route: APIRoute) -> bool:
        try:
            dep = route.dependant
            for d in dep.dependencies:
                call = getattr(d, "call", None)
                if not call:
                    continue
                name = getattr(call, "__name__", "") or ""
                if any(s in name for s in ("current_user", "get_current_user", "require_", "verify_", "_admin", "_token")):
                    return True
                # Recurse one level into Security dependencies
                for sub in getattr(d, "dependencies", []):
                    sub_call = getattr(sub, "call", None)
                    sub_name = getattr(sub_call, "__name__", "") or ""
                    if any(s in sub_name for s in ("current_user", "get_current_user", "require_", "verify_")):
                        return True
        except Exception:
            return True  # err on the side of hiding
        return False

    site_slug = site.get("slug", "")
    enabled_set = set(site.get("enabled_features") or [])
    # The curated groups already added these implicit features, so respect them too
    extra_endpoints = []

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        path = getattr(route, "path", "") or ""
        if not path.startswith("/api/"):
            continue
        if any(path.startswith(p) for p in excluded_prefixes):
            continue
        if any(k in path for k in excluded_keywords):
            continue
        if _has_single_use_token(path):
            continue
        # Only list READ-ONLY routes — write/delete are intrinsically more
        # privileged even when nominally auth-less.
        methods = (getattr(route, "methods", set()) or set()) & {"GET"}
        if not methods:
            continue
        if _is_auth_required(route):
            continue

        # Feature-aware filter: hide routes whose first segment requires a
        # feature the site does not have enabled.
        seg = _path_to_tag(path)
        if not _segment_is_allowed_for_site(seg, enabled_set):
            continue

        # Pull short docstring as description
        ep_fn = getattr(route, "endpoint", None)
        doc = (ep_fn.__doc__ or "").strip() if ep_fn else ""
        description = (doc.split("\n", 1)[0] if doc else "").strip()

        # Prefer GET first
        for method in sorted(methods, key=lambda m: 0 if m == "GET" else 1):
            if (method, path) in covered_paths:
                continue
            full_url = f"{base_url}{path}"
            # Auto-suggest the site slug in the URL preview when the path
            # contains a `{site_slug}` or `{main_site_slug}` placeholder.
            preview_url = full_url.replace("{site_slug}", site_slug).replace("{main_site_slug}", site_slug)
            extra_endpoints.append({
                "name": (getattr(route, "name", "") or path).replace("_", " "),
                "description": description or "Auto-discovered public endpoint",
                "method": method,
                "response_type": "application/json",
                "path": path,
                "full_url": preview_url,
                "tag": _path_to_tag(path),
                "tag_color": "#0891b2",
            })

    # Sort by path for stable ordering, then de-dupe (some routers register
    # the same path twice for backwards-compat aliases).
    seen = set()
    deduped = []
    for ep in sorted(extra_endpoints, key=lambda e: (e["path"], e["method"])):
        key = (ep["method"], ep["path"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ep)

    # Sub-group by first path segment after /api/
    bucket: dict = {}
    for ep in deduped:
        seg = _path_to_tag(ep["path"])
        bucket.setdefault(seg, []).append(ep)

    def _segment_label(seg: str) -> str:
        # Hand-tuned display names; fall back to titlecased segment
        return _SEG_LABELS.get(seg, seg.replace("-", " ").replace("_", " ").title())

    def _segment_description(seg: str) -> str:
        return _SEG_DESCRIPTIONS.get(seg, f"Public endpoints under /api/{seg}/. Auto-discovered, auth-less.")

    def _segment_icon(seg: str) -> str:
        return _SEG_ICONS.get(seg, "globe")

    result = []
    # Sort buckets alphabetically except put 'rds-builder', 'public', 'sites' early
    priority = {"rds-builder": 0, "public": 1, "sites": 2, "vmix": 3}
    for seg in sorted(bucket.keys(), key=lambda s: (priority.get(s, 99), s)):
        result.append({
            "id": f"extras_{seg}",
            "name": _segment_label(seg),
            "icon": _segment_icon(seg),
            "description": _segment_description(seg),
            "endpoints": bucket[seg],
        })
    return result


_SEG_LABELS = {
    "branding": "Branding",
    "config": "Configuration",
    "domains": "Domain Routing",
    "files": "File Serving",
    "media": "Media Library",
    "notifications": "Notifications",
    "occurrences": "Occurrences (Schedule)",
    "public": "Public Schedule",
    "rds-builder": "RDS Builder",
    "rds": "RDS Image & Aliases",
    "shows": "Shows (Public)",
    "sites": "Public Sites",
    "streams": "Audio Streams",
    "support-tickets": "Support Asset Proxy",
    "task-boards": "Task Board Files",
    "uploads": "Uploads & Assets",
    "vmix": "vMix Overlays",
    "chat": "Chat Files",
    "news": "News (extra)",
    "api": "Root",
}

_SEG_DESCRIPTIONS = {
    "branding": "Brand assets and platform metadata. Used by the login page and frontend boot.",
    "config": "Public frontend configuration (feature flags, theme defaults).",
    "domains": "Subdomain routing data for the Cloudflare Worker.",
    "files": "Generic file proxy. Serves assets from object storage with optional ?auth= token.",
    "media": "Media library asset serving (presigned S3 URLs).",
    "notifications": "Notification category catalog and SMTP provider templates.",
    "occurrences": "Print-friendly views of scheduled rundowns. Token-protected variants exist for sharing.",
    "public": "Public schedule and station information. Safe to embed on external sites.",
    "rds-builder": "Live RDS text output, scheduled-texts status and monitor history per station.",
    "rds": "Image and alias endpoints for the legacy RDS contract.",
    "shows": "Read-only show data exposed publicly.",
    "sites": "Public site renderer data (used by the white-label frontend).",
    "streams": "Audio stream proxies (CORS-bypass) and status checks.",
    "support-tickets": "Authenticated proxy for support ticket attachments. Uses ?auth= token.",
    "task-boards": "Task board file attachments via presigned URL redirect.",
    "uploads": "Avatar, logo, editor-file and featured-image file serving.",
    "vmix": "HTML overlay generators for vMix Web Browser Input.",
    "chat": "Direct file serving for chat attachments stored locally.",
    "news": "News endpoints not already in the curated News & Content group.",
    "api": "Root API metadata.",
}

_SEG_ICONS = {
    "branding": "image", "config": "settings", "domains": "globe",
    "files": "file", "media": "image", "notifications": "bell",
    "occurrences": "calendar", "public": "calendar", "rds-builder": "radio",
    "rds": "radio", "shows": "mic", "sites": "globe", "streams": "headphones",
    "support-tickets": "life-buoy", "task-boards": "kanban", "uploads": "upload",
    "vmix": "video", "chat": "message-square", "news": "newspaper",
}


def _path_to_tag(path: str) -> str:
    """Derive a short tag from the route path's first non-{} segment after /api/."""
    parts = [p for p in path.split("/") if p and not p.startswith("{") and p != "api"]
    return parts[0] if parts else "api"


# Map "first path segment after /api/" → enabled_features that must be set.
# When a site does NOT have any of these features, the corresponding routes
# are hidden from the Additional Public Endpoints groups.
#
# Segments not present in this map are considered always-available (e.g. config,
# branding, files — these serve generic platform metadata).
_SEG_REQUIRES_FEATURE = {
    "vmix":          ("vmix_director",),
    "rds":           ("rds", "rds_settings"),
    "rds-builder":   ("rds", "rds_settings"),
    "shows":         ("shows",),
    "public":        ("shows", "calendar", "rds", "rds_settings"),  # /api/public/schedule needs shows
    "occurrences":   ("shows", "calendar"),
    "streams":       ("rds", "rds_settings"),  # audio streams are only useful with radio
    "task-boards":   ("task_boards",),
    "uploads":       (),  # always allow — used by editor / avatars
    "media":         ("media_library", "content_library"),
    "chat":          ("team_chat",),
    "news":          ("content_library", "clara_publish"),
    "support-tickets": (),  # always allow — support is platform-wide
    "notifications": (),
}


def _segment_is_allowed_for_site(seg: str, enabled_set: set) -> bool:
    """Return True when the site's enabled_features satisfies the requirement
    for this URL segment. Segments not listed are always allowed.
    """
    req = _SEG_REQUIRES_FEATURE.get(seg)
    if req is None:
        return True
    if not req:
        return True
    return any(f in enabled_set for f in req)


@main_sites_router.get("/{main_site_id}/debug")
async def get_debug_info(
    main_site_id: str,
    current_user: dict = Depends(require_network_admin)
):
    """Get live debug info for a main site: recent logs, traffic, RDS status."""
    from zoneinfo import ZoneInfo
    
    main_site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    now_brussels = datetime.now(ZoneInfo('Europe/Brussels'))
    timestamp = now_brussels.isoformat()
    
    # Get child site team_ids
    child_sites = await db.sites.find(
        {"main_site_id": main_site_id}, {"_id": 0, "id": 1, "name": 1, "team_id": 1}
    ).to_list(50)
    team_ids = list(set(
        [s["team_id"] for s in child_sites if s.get("team_id")] + [main_site_id]
    ))
    
    # 1. Recent audit logs (last 50)
    recent_logs = await db.audit_logs.find(
        {"$or": [{"main_site_id": main_site_id}, {"team_id": {"$in": team_ids}}]},
        {"_id": 0}
    ).sort("timestamp", -1).limit(50).to_list(50)
    
    # 2. Recent RDS cache logs
    rds_logs = await db.rds_cache_logs.find(
        {"$or": [{"team_id": {"$in": team_ids}}, {"main_site_id": main_site_id}]},
        {"_id": 0}
    ).sort("timestamp", -1).limit(20).to_list(20)
    
    # 3. RDS cached rundowns (active shows)
    active_rundowns = await db.rds_cached_rundowns.find(
        {"$or": [{"team_id": {"$in": team_ids}}, {"is_active": True}]},
        {"_id": 0}
    ).to_list(10)
    
    # 4. Shoutcast logs (recent)
    shoutcast_logs = await db.shoutcast_logs.find(
        {}, {"_id": 0}
    ).sort("timestamp", -1).limit(20).to_list(20)
    
    # 5. Today's shows
    today = now_brussels.strftime('%Y-%m-%d')
    current_time = now_brussels.strftime('%H:%M')
    todays_shows = await db.shows.find(
        {"$or": [{"team_id": {"$in": team_ids}}, {"main_site_id": main_site_id}], "date": today},
        {"_id": 0, "id": 1, "title": 1, "date": 1, "start_time": 1, "end_time": 1, "status": 1, "rds_station": 1}
    ).to_list(50)
    
    # Mark which shows are live
    for show in todays_shows:
        start = show.get("start_time", "00:00")
        end = show.get("end_time", "23:59")
        crosses_midnight = start > end
        if crosses_midnight:
            show["is_live"] = current_time >= start or current_time <= end
        else:
            show["is_live"] = start <= current_time <= end
    
    # 6. Traffic summary - count recent activities by category
    one_hour_ago = (now_brussels - __import__('datetime').timedelta(hours=1)).isoformat()
    traffic_pipeline = [
        {"$match": {
            "$or": [{"main_site_id": main_site_id}, {"team_id": {"$in": team_ids}}],
            "timestamp": {"$gte": one_hour_ago}
        }},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]
    traffic = await db.audit_logs.aggregate(traffic_pipeline).to_list(20)
    
    # Save debug snapshot
    debug_result = {
        "id": str(uuid.uuid4()),
        "main_site_id": main_site_id,
        "main_site_name": main_site.get("name"),
        "timestamp": timestamp,
        "brussels_time": now_brussels.strftime('%Y-%m-%d %H:%M:%S'),
        "team_ids_resolved": team_ids,
        "child_sites": [{"name": s.get("name"), "team_id": s.get("team_id")} for s in child_sites],
        "recent_logs": recent_logs[:20],
        "rds_cache_logs": rds_logs,
        "active_rundowns": [{
            "show_title": r.get("show_title"),
            "show_date": r.get("show_date"),
            "show_start_time": r.get("show_start_time"),
            "show_end_time": r.get("show_end_time"),
            "rds_station": r.get("rds_station"),
            "is_active": r.get("is_active"),
            "cached_at": r.get("cached_at")
        } for r in active_rundowns],
        "shoutcast_logs": shoutcast_logs[:10],
        "todays_shows": todays_shows,
        "traffic_last_hour": [{"action": t["_id"], "count": t["count"]} for t in traffic]
    }
    
    await db.debug_snapshots.insert_one(debug_result)
    debug_result.pop("_id", None)
    
    return debug_result

