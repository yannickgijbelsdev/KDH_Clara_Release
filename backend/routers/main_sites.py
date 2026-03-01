"""Main Sites (Organization) management routes."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from database import db
from models.main_sites import (
    MainSiteCreate, MainSiteUpdate, MainSiteResponse, MainSiteListResponse,
    MainSiteUserCreate, MainSiteUserUpdate, MainSiteUserResponse,
    AvailableFeaturesResponse, AVAILABLE_FEATURES
)
from services.auth import get_current_user

import logging
logger = logging.getLogger(__name__)

main_sites_router = APIRouter(prefix="/main-sites", tags=["main-sites"])


def require_network_admin(current_user: dict = Depends(get_current_user)):
    """Dependency that requires network admin role."""
    if not current_user.get('is_network_admin'):
        raise HTTPException(status_code=403, detail="Network admin access required")
    return current_user


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
    """Get all main sites. Network admins see all, others see only their assigned sites."""
    is_network_admin = current_user.get('is_network_admin', False)
    user_id = current_user['id']
    
    if is_network_admin:
        # Network admin sees all main sites
        main_sites = await db.main_sites.find(
            {},
            {"_id": 0}
        ).to_list(100)
    else:
        # Regular users see only assigned main sites
        user_access = await db.main_site_users.find(
            {"user_id": user_id},
            {"_id": 0, "main_site_id": 1}
        ).to_list(100)
        main_site_ids = [a["main_site_id"] for a in user_access]
        
        main_sites = await db.main_sites.find(
            {"id": {"$in": main_site_ids}},
            {"_id": 0}
        ).to_list(100)
    
    # Add counts
    for site in main_sites:
        site_count = await db.sites.count_documents({"main_site_id": site["id"]})
        user_count = await db.main_site_users.count_documents({"main_site_id": site["id"]})
        site["site_count"] = site_count
        site["user_count"] = user_count
    
    return main_sites


@main_sites_router.post("", response_model=MainSiteResponse)
async def create_main_site(
    data: MainSiteCreate,
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
    
    now = datetime.now(timezone.utc).isoformat()
    main_site_id = str(uuid.uuid4())
    
    main_site_doc = {
        "id": main_site_id,
        "name": data.name,
        "slug": slug,
        "description": data.description,
        "logo_url": None,
        "enabled_features": data.enabled_features,
        "created_at": now,
        "updated_at": now
    }
    
    await db.main_sites.insert_one(main_site_doc)
    main_site_doc.pop("_id", None)
    main_site_doc["site_count"] = 0
    main_site_doc["user_count"] = 0
    
    logger.info(f"Main site created: {data.name} ({slug}) by {current_user['email']}")
    return main_site_doc


@main_sites_router.get("/{main_site_id}", response_model=MainSiteResponse)
async def get_main_site(
    main_site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a main site by ID."""
    # Check access
    is_network_admin = current_user.get('is_network_admin', False)
    if not is_network_admin:
        role = await get_main_site_user_role(current_user['id'], main_site_id)
        if not role:
            raise HTTPException(status_code=403, detail="Access denied")
    
    main_site = await db.main_sites.find_one(
        {"id": main_site_id},
        {"_id": 0}
    )
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    # Add counts
    main_site["site_count"] = await db.sites.count_documents({"main_site_id": main_site_id})
    main_site["user_count"] = await db.main_site_users.count_documents({"main_site_id": main_site_id})
    
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
        update_data["enabled_features"] = data.enabled_features
    
    await db.main_sites.update_one(
        {"id": main_site_id},
        {"$set": update_data}
    )
    
    updated = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    updated["site_count"] = await db.sites.count_documents({"main_site_id": main_site_id})
    updated["user_count"] = await db.main_site_users.count_documents({"main_site_id": main_site_id})
    
    return updated


@main_sites_router.delete("/{main_site_id}")
async def delete_main_site(
    main_site_id: str,
    current_user: dict = Depends(require_network_admin)
):
    """Delete a main site. Network admin only."""
    main_site = await db.main_sites.find_one({"id": main_site_id})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")
    
    # Check if there are mini sites
    site_count = await db.sites.count_documents({"main_site_id": main_site_id})
    if site_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete main site with {site_count} mini sites. Delete mini sites first."
        )
    
    # Delete main site and its user assignments
    await db.main_sites.delete_one({"id": main_site_id})
    await db.main_site_users.delete_many({"main_site_id": main_site_id})
    
    logger.info(f"Main site deleted: {main_site['name']} by {current_user['email']}")
    return {"status": "success", "message": "Main site deleted"}


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
            {"_id": 0, "name": 1, "email": 1}
        )
        if user:
            result.append({
                **su,
                "user_name": user.get("name", "Unknown"),
                "user_email": user.get("email", "")
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
    """Get current user's main site access list with their roles."""
    user_id = current_user['id']
    is_network_admin = current_user.get('is_network_admin', False)
    
    if is_network_admin:
        # Network admin has access to all
        main_sites = await db.main_sites.find({}, {"_id": 0}).to_list(100)
        return {
            "is_network_admin": True,
            "main_sites": [
                {
                    "id": ms["id"],
                    "name": ms["name"],
                    "slug": ms["slug"],
                    "logo_url": ms.get("logo_url"),
                    "role": "network_admin"
                }
                for ms in main_sites
            ]
        }
    
    # Regular user - get assigned main sites
    user_access = await db.main_site_users.find(
        {"user_id": user_id},
        {"_id": 0}
    ).to_list(100)
    
    main_site_ids = [a["main_site_id"] for a in user_access]
    access_by_id = {a["main_site_id"]: a["role"] for a in user_access}
    
    main_sites = await db.main_sites.find(
        {"id": {"$in": main_site_ids}},
        {"_id": 0}
    ).to_list(100)
    
    return {
        "is_network_admin": False,
        "main_sites": [
            {
                "id": ms["id"],
                "name": ms["name"],
                "slug": ms["slug"],
                "logo_url": ms.get("logo_url"),
                "role": access_by_id.get(ms["id"], "viewer")
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
        '/api/proradio': {'name': 'ProRadio', 'icon': 'refresh-cw', 'description': 'ProRadio sync'},
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
        "message": f"{len(child_sites)} mini sites gevonden",
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
        "message": f"{users} gebruikers",
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

