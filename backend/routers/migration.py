"""
Migration router for multisite migration.
Provides admin endpoints to migrate existing data to multisite architecture.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

from database import db
from services.auth import get_current_user

router = APIRouter(prefix="/api/admin/migration", tags=["migration"])


class MigrationRequest(BaseModel):
    main_site_name: str = "Radiogroep"
    main_site_slug: str = "radiogroep"
    dry_run: bool = True


class MigrationResult(BaseModel):
    success: bool
    dry_run: bool
    main_site_id: Optional[str] = None
    main_site_name: Optional[str] = None
    main_site_slug: Optional[str] = None
    stats: Dict[str, Any] = {}
    errors: List[str] = []
    message: str = ""


# All collections that need main_site_id migration
COLLECTIONS_TO_MIGRATE = {
    # Shows & Calendar
    "shows": "Shows",
    "show_titles": "Show Titles",
    "show_series": "Show Series",
    "show_occurrences": "Show Occurrences",
    "rundowns": "Rundowns",
    "rundown_items": "Rundown Items",
    "rundown_items_v2": "Rundown Items V2",
    "rundown_item_media": "Rundown Item Media",
    "show_media": "Show Media",
    "show_assignments": "Show Assignments",
    "series_assignments": "Series Assignments",
    "occurrence_assignments": "Occurrence Assignments",
    "studios": "Studios",
    
    # Content
    "content_items": "Content Items",
    "content_item_publishes": "Content Publishes",
    "content_item_featured_images": "Content Featured Images",
    "content_audit_logs": "Content Audit Logs",
    "categories": "Categories",
    
    # Media
    "media_assets": "Media Assets",
    "media_folders": "Media Folders",
    "media_share_links": "Media Share Links",
    "folder_shares": "Folder Shares",
    
    # WordPress
    "wordpress_sites": "WordPress Sites",
    
    # Chat
    "chat_threads": "Chat Threads",
    "chat_messages": "Chat Messages",
    
    # RDS & Streaming
    "rds_outputs": "RDS Outputs",
    "rds_output_states": "RDS Output States",
    "rds_sequences": "RDS Sequences",
    "rds_scheduled_texts": "RDS Scheduled Texts",
    "rds_settings": "RDS Settings",
    "rds_cached_rundowns": "RDS Cached Rundowns",
    "rds_builder_output": "RDS Builder Output",
    
    # Audio Triggers
    "audio_triggers": "Audio Triggers",
    "audio_trigger_states": "Audio Trigger States",
    "audio_trigger_logs": "Audio Trigger Logs",
    
    # Sites (mini-sites/landing pages)
    "sites": "Sites (Landing Pages)",
    "site_users": "Site Users",
    "site_submissions": "Site Submissions",
}

# Collections that are station-specific (no team_id)
STATION_COLLECTIONS = [
    "rds_outputs", "rds_output_states", "rds_sequences",
    "rds_scheduled_texts", "rds_settings", "rds_cached_rundowns",
    "rds_builder_output", "audio_triggers", "audio_trigger_states",
    "audio_trigger_logs",
]


async def require_network_admin(current_user: dict = Depends(get_current_user)):
    """Require the user to be a network admin."""
    if not current_user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Network admin access required")
    return current_user


@router.get("/detect-site-info")
async def detect_existing_site_info(current_user: dict = Depends(require_network_admin)):
    """
    Auto-detect existing site information from the database.
    Returns suggested name and slug based on existing team data.
    """
    # Try to detect from team name
    teams = await db.teams.find({}, {"_id": 0}).to_list(100)
    
    suggested_name = "Radiogroep"
    suggested_slug = "radiogroep"
    detected_from = None
    
    if teams:
        primary_team = teams[0]
        team_name = primary_team.get("name", "")
        
        if team_name:
            suggested_name = team_name
            # Create slug from team name
            import re
            slug = team_name.lower()
            slug = re.sub(r'[^a-z0-9\s-]', '', slug)  # Remove special chars
            slug = re.sub(r'[\s]+', '-', slug)  # Replace spaces with dashes
            slug = re.sub(r'-+', '-', slug).strip('-')  # Clean up multiple dashes
            
            if slug:
                suggested_slug = slug
            
            detected_from = "team_name"
    
    # Also check if there are existing RDS settings with a station name
    rds_settings = await db.rds_settings.find_one({}, {"_id": 0})
    if rds_settings and rds_settings.get("station_name"):
        station_name = rds_settings.get("station_name")
        # If team name was generic, prefer RDS station name
        if suggested_name in ["My Radio Station", "Radiogroep"] and station_name:
            suggested_name = station_name
            detected_from = "rds_settings"
    
    return {
        "suggested_name": suggested_name,
        "suggested_slug": suggested_slug,
        "detected_from": detected_from,
        "team_count": len(teams),
        "team_name": teams[0].get("name") if teams else None
    }


@router.get("/status")
async def get_migration_status(current_user: dict = Depends(require_network_admin)):
    """
    Check the current migration status of the database.
    Returns statistics about what needs to be migrated.
    """
    stats = {
        "teams": [],
        "main_sites": [],
        "collections": {},
        "total_documents": 0,
        "needs_migration": 0,
        "already_migrated": 0,
    }
    
    # Get teams
    teams = await db.teams.find({}, {"_id": 0}).to_list(100)
    for team in teams:
        user_count = await db.users.count_documents({"team_id": team.get("id")})
        stats["teams"].append({
            "id": team.get("id"),
            "name": team.get("name"),
            "user_count": user_count
        })
    
    # Get existing main sites
    main_sites = await db.main_sites.find({}, {"_id": 0}).to_list(100)
    for ms in main_sites:
        user_count = await db.main_site_users.count_documents({"main_site_id": ms.get("id")})
        stats["main_sites"].append({
            "id": ms.get("id"),
            "name": ms.get("name"),
            "slug": ms.get("slug"),
            "user_count": user_count
        })
    
    # Check each collection
    existing_collections = await db.list_collection_names()
    for coll_name, description in COLLECTIONS_TO_MIGRATE.items():
        if coll_name not in existing_collections:
            continue
        
        collection = db[coll_name]
        total = await collection.count_documents({})
        
        if total == 0:
            continue
        
        has_main_site = await collection.count_documents({
            "main_site_id": {"$exists": True, "$nin": [None, ""]}
        })
        
        needs_migration = total - has_main_site
        
        stats["collections"][coll_name] = {
            "description": description,
            "total": total,
            "has_main_site_id": has_main_site,
            "needs_migration": needs_migration
        }
        
        stats["total_documents"] += total
        stats["needs_migration"] += needs_migration
        stats["already_migrated"] += has_main_site
    
    return stats


@router.post("/run", response_model=MigrationResult)
async def run_migration(
    request: MigrationRequest,
    current_user: dict = Depends(require_network_admin)
):
    """
    Run the multisite migration.
    
    This will:
    1. Create a Main Site for your existing organization
    2. Link all users to the Main Site
    3. Add main_site_id to all existing data
    
    Use dry_run=True to preview changes without applying them.
    """
    errors = []
    stats = {
        "main_site_created": False,
        "users_linked": 0,
        "collections_updated": {}
    }
    
    try:
        # Step 1: Get primary team
        teams = await db.teams.find({}, {"_id": 0}).to_list(100)
        if not teams:
            return MigrationResult(
                success=False,
                dry_run=request.dry_run,
                message="No teams found in database",
                errors=["No teams found - cannot determine which users to migrate"]
            )
        
        primary_team = teams[0]
        primary_team_id = primary_team.get("id")
        
        # Step 2: Check/Create main site
        existing_main_site = await db.main_sites.find_one({"slug": request.main_site_slug})
        
        if existing_main_site:
            main_site_id = existing_main_site["id"]
            stats["main_site_created"] = False
        else:
            # Get admin user to be owner
            admin_user = await db.users.find_one(
                {"team_id": primary_team_id, "role": "admin"},
                {"_id": 0}
            )
            if not admin_user:
                admin_user = await db.users.find_one({"team_id": primary_team_id}, {"_id": 0})
            
            if not admin_user:
                return MigrationResult(
                    success=False,
                    dry_run=request.dry_run,
                    message="No users found in primary team",
                    errors=["Cannot create main site without an owner"]
                )
            
            main_site_id = str(uuid.uuid4())
            
            all_features = [
                "shows", "calendar", "show_management",
                "content_library", "media_library", "content_approval", "trash",
                "team_chat",
                "rds_settings", "rds_builder", "stream_monitor",
                "sites",
                "team_settings", "wordpress", "activity_logs"
            ]
            
            main_site_doc = {
                "id": main_site_id,
                "name": request.main_site_name,
                "slug": request.main_site_slug,
                "description": f"Migrated from {primary_team.get('name', 'existing')} team",
                "owner_id": admin_user["id"],
                "enabled_features": all_features,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            
            if not request.dry_run:
                await db.main_sites.insert_one(main_site_doc)
            
            stats["main_site_created"] = True
        
        # Step 3: Link users to main site
        users = await db.users.find({"team_id": primary_team_id}, {"_id": 0}).to_list(500)
        
        for user in users:
            existing_link = await db.main_site_users.find_one({
                "user_id": user["id"],
                "main_site_id": main_site_id
            })
            
            if existing_link:
                continue
            
            # Map roles
            role = user.get("role", "viewer")
            role_map = {"admin": "admin", "editor": "editor", "presenter": "presenter"}
            main_site_role = role_map.get(role, "viewer")
            
            link_doc = {
                "id": str(uuid.uuid4()),
                "main_site_id": main_site_id,
                "user_id": user["id"],
                "role": main_site_role,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            
            if not request.dry_run:
                await db.main_site_users.insert_one(link_doc)
            
            stats["users_linked"] += 1
        
        # Step 4: Migrate collections
        existing_collections = await db.list_collection_names()
        
        for coll_name, description in COLLECTIONS_TO_MIGRATE.items():
            if coll_name not in existing_collections:
                continue
            
            collection = db[coll_name]
            
            query = {
                "$or": [
                    {"main_site_id": {"$exists": False}},
                    {"main_site_id": None},
                    {"main_site_id": ""}
                ]
            }
            
            count = await collection.count_documents(query)
            
            if count == 0:
                stats["collections_updated"][coll_name] = {
                    "description": description,
                    "updated": 0,
                    "status": "already_migrated"
                }
                continue
            
            if not request.dry_run:
                if coll_name in STATION_COLLECTIONS:
                    result = await collection.update_many(
                        query,
                        {"$set": {"main_site_id": main_site_id}}
                    )
                else:
                    # Update documents with matching team_id
                    result = await collection.update_many(
                        {"$and": [{"team_id": primary_team_id}, query]},
                        {"$set": {"main_site_id": main_site_id}}
                    )
                    
                    # Also update documents without team_id
                    result2 = await collection.update_many(
                        {"$and": [{"team_id": {"$exists": False}}, query]},
                        {"$set": {"main_site_id": main_site_id}}
                    )
                    
                    count = result.modified_count + result2.modified_count
                
                stats["collections_updated"][coll_name] = {
                    "description": description,
                    "updated": count if request.dry_run else result.modified_count,
                    "status": "migrated"
                }
            else:
                stats["collections_updated"][coll_name] = {
                    "description": description,
                    "updated": count,
                    "status": "would_migrate"
                }
        
        return MigrationResult(
            success=True,
            dry_run=request.dry_run,
            main_site_id=main_site_id,
            main_site_name=request.main_site_name,
            main_site_slug=request.main_site_slug,
            stats=stats,
            errors=errors,
            message=f"{'Dry run completed' if request.dry_run else 'Migration completed'} successfully"
        )
        
    except Exception as e:
        return MigrationResult(
            success=False,
            dry_run=request.dry_run,
            message=f"Migration failed: {str(e)}",
            errors=[str(e)],
            stats=stats
        )
