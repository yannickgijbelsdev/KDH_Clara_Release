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
