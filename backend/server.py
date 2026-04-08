"""Radio Show Planner API - Main Application Entry Point.

This is the main server file that initializes the FastAPI application and
includes all routers. The application logic has been modularized into:
- models/: Pydantic models for request/response validation
- services/: Business logic, authentication, and utilities  
- routers/: API endpoint handlers

Architecture:
- Backend: FastAPI (Python) with async MongoDB (Motor)
- Database: MongoDB
- Authentication: JWT-based
- Real-time: WebSocket for rundown collaboration
"""

from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, Depends, Request, HTTPException
from fastapi.responses import PlainTextResponse, FileResponse
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import asyncio
from datetime import datetime, timezone
import uuid
import jwt
import json
import mimetypes

# Local imports
from database import db, client, JWT_SECRET, UPLOADS_DIR, MEDIA_UPLOADS_DIR, AVATARS_DIR, SHOW_IMAGES_DIR
from services.websocket import ws_manager
from services.wp_scheduler import wp_scheduler
from services.rds_scheduler import rds_scheduler
from services.radioplayer_scheduler import radioplayer_scheduler
from services.shoutcast import ShoutcastScheduler
from services.rds_builder_scheduler import RDSBuilderScheduler
from routers import (
    auth_router, teams_router, users_router, shows_router,
    content_router, wordpress_router, series_router,
    occurrences_router, chat_router, media_router
)
from routers.logs import logs_router
from routers.folders import folders_router
from routers.rds import rds_router
from routers.rds_builder import rds_builder_router
from routers.stream_proxy import stream_proxy_router
from routers.audio_trigger import audio_trigger_router
from routers.sites import sites_router
from routers.main_sites import main_sites_router
from routers.migration import router as migration_router
from routers.wordpress import publish_content_to_wordpress
from routers.proradio import proradio_router
from routers.public_schedule import public_schedule_router
from routers.statistics import statistics_router
from routers.backups import backup_router
from routers.devtools import devtools_router
from routers.tickets import ticket_router
from routers.firewall import firewall_router
from routers.calls import calls_router
from routers.roles import roles_router
from routers.licenses import licenses_router
from routers.environments import environments_router
from routers.zerotier import zerotier_router
from routers.notifications import notifications_router
from routers.xml_imports import xml_imports_router
from routers.vmix import vmix_router
from routers.task_boards import task_boards_router
from routers.branding import branding_router
from routers.radioplayer import radioplayer_router
from routers.cli import cli_router
from routers.canva import canva_router
from routers.domains import domains_router
from routers.wp_security import wp_security_router
from routers.clara_assistant import clara_router
from routers.support_tickets import support_router
from models.wordpress import PublishToWordPressRequest, PublishResponse
from services.auth import get_current_user, require_editor_or_admin, require_admin
from services.call_signaling import call_signaling
from routers.shows import resolve_avatar_url

# Create the main app
app = FastAPI(title="Radio Show Planner API")

# ============== HEALTH CHECK ENDPOINT (root level for Kubernetes) ==============
@app.get("/health")
async def root_health():
    """Health check endpoint for Kubernetes liveness/readiness probes."""
    return {"status": "healthy", "service": "radio-show-planner"}

# Create API router
api_router = APIRouter(prefix="/api")

# Create Shoutcast scheduler (needs db reference)
shoutcast_scheduler = ShoutcastScheduler(db)

# Create RDS Builder scheduler (needs db reference)
rds_builder_scheduler = RDSBuilderScheduler(db)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============== INCLUDE ROUTERS ==============

api_router.include_router(auth_router)
api_router.include_router(teams_router)
api_router.include_router(users_router)
api_router.include_router(shows_router)
api_router.include_router(content_router)
api_router.include_router(wordpress_router)
api_router.include_router(series_router)
api_router.include_router(occurrences_router)
api_router.include_router(chat_router)
api_router.include_router(folders_router)  # Must be before media_router for /folders path
api_router.include_router(media_router)
api_router.include_router(logs_router)
api_router.include_router(rds_router)
api_router.include_router(rds_builder_router)
api_router.include_router(stream_proxy_router)
api_router.include_router(audio_trigger_router)
api_router.include_router(sites_router)
api_router.include_router(main_sites_router)
api_router.include_router(proradio_router)
api_router.include_router(public_schedule_router)
api_router.include_router(statistics_router)
api_router.include_router(backup_router)
api_router.include_router(devtools_router)
api_router.include_router(ticket_router)
api_router.include_router(firewall_router)
api_router.include_router(calls_router)
api_router.include_router(roles_router)
api_router.include_router(zerotier_router)
api_router.include_router(notifications_router)
api_router.include_router(xml_imports_router)
api_router.include_router(vmix_router)
api_router.include_router(task_boards_router)
api_router.include_router(branding_router)
api_router.include_router(radioplayer_router)
api_router.include_router(licenses_router)
api_router.include_router(environments_router)
api_router.include_router(cli_router)
api_router.include_router(canva_router)
api_router.include_router(domains_router)
api_router.include_router(wp_security_router)
api_router.include_router(clara_router)
api_router.include_router(support_router)


# ============== ADDITIONAL API ROUTES ==============

@api_router.get("/")
async def root():
    return {"message": "Radio Show Planner API", "status": "running"}


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


@api_router.get("/files/{path:path}")
async def serve_file(path: str, auth: str = None):
    """Serve a file from object storage. Supports ?auth=token for img src usage."""
    from fastapi import Query, Header, Response
    from services.object_storage import get_object
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")


@api_router.get("/config")
async def get_config():
    """Get public configuration for the frontend."""
    from database import SHARE_BASE_URL
    return {
        "share_base_url": SHARE_BASE_URL
    }


# Content publish endpoint (needs both content and wordpress routers)
@api_router.post("/content/{content_id}/publish", response_model=PublishResponse)
async def publish_to_wordpress(
    content_id: str,
    publish_data: PublishToWordPressRequest,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Publish content item to one or more WordPress sites."""
    try:
        return await publish_content_to_wordpress(content_id, publish_data, current_user, request)
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.error(f"Unhandled error in publish_to_wordpress: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Server error while publishing: {str(e)}")


# ============== MENU BADGE COUNTS ==============

@api_router.get("/menu/counts")
async def get_menu_counts(request: Request, current_user: dict = Depends(get_current_user)):
    """Get counts for menu badges, filtered by main site if specified."""
    team_id = current_user.get('team_id')
    user_id = current_user.get('id')
    is_admin = current_user.get('role') == 'admin' or current_user.get('is_network_admin') or current_user.get('is_system_admin')
    can_approve = is_admin or current_user.get('role') == 'news_admin'
    main_site_id = request.headers.get('X-Main-Site-ID')
    
    counts = {}
    
    # Build query filter - use main_site_id if available, otherwise team_id
    if main_site_id:
        content_filter = {"main_site_id": main_site_id}
    else:
        content_filter = {"team_id": team_id}
    
    # Content Library - total active content
    content_count = await db.content_items.count_documents({
        **content_filter,
        "deleted_at": {"$exists": False}
    })
    counts["content"] = content_count
    
    # Trash - deleted items (admin only)
    if is_admin:
        trash_count = await db.content_items.count_documents({
            **content_filter,
            "deleted_at": {"$exists": True}
        })
        counts["trash"] = trash_count
    
    # Content Approval - pending approvals (admin or news_admin)
    if can_approve:
        approval_count = await db.content_items.count_documents({
            **content_filter,
            "approval_status": "pending",
            "deleted_at": {"$exists": False}
        })
        counts["approvals"] = approval_count
    
    # Team Chat - unread messages (use team_id since chat is team-wide)
    # First get all threads the user is part of
    team_thread = await db.chat_threads.find_one({
        "team_id": team_id,
        "type": "team"
    })
    
    unread_count = 0
    if team_thread:
        # Get last read timestamp for user
        user_chat_status = await db.chat_read_status.find_one({
            "user_id": user_id,
            "team_id": team_id
        })
        last_read = user_chat_status.get("last_read_at") if user_chat_status else None
        
        if last_read:
            unread_count = await db.chat_messages.count_documents({
                "thread_id": team_thread["id"],
                "created_at": {"$gt": last_read},
                "user_id": {"$ne": user_id}  # Don't count own messages
            })
        else:
            # If never read, count all messages not from self
            unread_count = await db.chat_messages.count_documents({
                "thread_id": team_thread["id"],
                "user_id": {"$ne": user_id}
            })
    counts["chat"] = unread_count
    
    # Activity Logs - unseen logs (admin only)
    if is_admin:
        user_log_status = await db.log_read_status.find_one({
            "user_id": user_id,
            "team_id": team_id
        })
        last_viewed = user_log_status.get("last_viewed_at") if user_log_status else None
        
        # Filter logs by main_site_id if provided
        log_filter = {"main_site_id": main_site_id} if main_site_id else {"team_id": team_id}
        
        if last_viewed:
            logs_count = await db.audit_logs.count_documents({
                **log_filter,
                "timestamp": {"$gt": last_viewed}
            })
        else:
            logs_count = await db.audit_logs.count_documents(log_filter)
        counts["logs"] = logs_count

    # Media Library - total media items
    media_count = await db.media_items.count_documents({
        **content_filter,
        "deleted_at": {"$exists": False}
    })
    counts["media"] = media_count
    
    return counts



# ============== GLOBAL SEARCH ==============

@api_router.get("/search")
async def global_search(request: Request, q: str = "", current_user: dict = Depends(get_current_user)):
    """Search across content, shows, and media within the current main site."""
    main_site_id = request.headers.get('X-Main-Site-ID')
    team_id = current_user.get('team_id')
    
    if not q or len(q.strip()) < 2:
        return {"results": [], "query": q}
    
    query_str = q.strip()
    regex_filter = {"$regex": query_str, "$options": "i"}
    
    # Build base filter
    if main_site_id:
        base_filter = {"main_site_id": main_site_id}
    else:
        base_filter = {"team_id": team_id}
    
    results = []
    
    # Search content items
    content_items = await db.content_items.find(
        {**base_filter, "deleted_at": {"$exists": False}, "$or": [
            {"title": regex_filter}, {"body": regex_filter}, {"excerpt": regex_filter}
        ]},
        {"_id": 0, "id": 1, "title": 1, "type": 1, "status": 1, "updated_at": 1}
    ).sort("updated_at", -1).limit(5).to_list(5)
    
    for item in content_items:
        results.append({"type": "content", "id": item["id"], "title": item.get("title", "Untitled"), 
                        "subtitle": f"{item.get('type', 'text')} - {item.get('status', 'draft')}", "updated_at": item.get("updated_at")})
    
    # Search shows
    shows = await db.shows.find(
        {**base_filter, "deleted_at": {"$exists": False}, "$or": [
            {"title": regex_filter}, {"description": regex_filter}
        ]},
        {"_id": 0, "id": 1, "title": 1, "show_type": 1, "updated_at": 1}
    ).sort("updated_at", -1).limit(5).to_list(5)
    
    for show in shows:
        results.append({"type": "show", "id": show["id"], "title": show.get("title", "Untitled"),
                        "subtitle": show.get("show_type", "show"), "updated_at": show.get("updated_at")})
    
    # Search media items
    media = await db.media_items.find(
        {**base_filter, "deleted_at": {"$exists": False}, "$or": [
            {"name": regex_filter}, {"original_name": regex_filter}, {"description": regex_filter}
        ]},
        {"_id": 0, "id": 1, "name": 1, "original_name": 1, "mime_type": 1, "updated_at": 1}
    ).sort("updated_at", -1).limit(5).to_list(5)
    
    for m in media:
        results.append({"type": "media", "id": m["id"], "title": m.get("name") or m.get("original_name", "Untitled"),
                        "subtitle": m.get("mime_type", "file"), "updated_at": m.get("updated_at")})
    
    # Sort all results by updated_at desc
    results.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
    
    return {"results": results[:15], "query": query_str}



@api_router.post("/chat/mark-read")
async def mark_chat_read(current_user: dict = Depends(get_current_user)):
    """Mark chat as read for current user."""
    now = datetime.now(timezone.utc).isoformat()
    await db.chat_read_status.update_one(
        {"user_id": current_user['id'], "team_id": current_user.get('team_id')},
        {"$set": {"last_read_at": now, "updated_at": now}},
        upsert=True
    )
    return {"message": "Chat marked as read"}


@api_router.post("/logs/mark-viewed")
async def mark_logs_viewed(current_user: dict = Depends(require_admin)):
    """Mark activity logs as viewed for current user."""
    now = datetime.now(timezone.utc).isoformat()
    await db.log_read_status.update_one(
        {"user_id": current_user['id'], "team_id": current_user.get('team_id')},
        {"$set": {"last_viewed_at": now, "updated_at": now}},
        upsert=True
    )
    return {"message": "Logs marked as viewed"}


# ============== ADMIN USER SWITCHING ==============

@api_router.post("/admin/switch-user/{user_id}")
async def switch_to_user(
    user_id: str,
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Admin: Switch to another user's account for debugging."""
    from services.main_site_context import get_main_site_id_from_header
    
    main_site_id = await get_main_site_id_from_header(request)
    
    # In multisite context, check if target user has access to this main site
    if main_site_id:
        user_access = await db.main_site_users.find_one({"user_id": user_id, "main_site_id": main_site_id})
        if not user_access:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="User not found in this main site")
        target_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    else:
        # Legacy mode: check team_id
        target_user = await db.users.find_one(
            {"id": user_id, "team_id": current_user['team_id']},
            {"_id": 0, "password_hash": 0}
        )
    
    if not target_user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create a new token for the target user with impersonation marker
    exp_timestamp = datetime.now(timezone.utc).timestamp() + 3600 * 4  # 4 hour expiry
    token_payload = {
        "user_id": target_user['id'],
        "email": target_user['email'],
        "impersonated_by": current_user['id'],  # Track who is impersonating
        "exp": exp_timestamp
    }
    new_token = jwt.encode(token_payload, JWT_SECRET, algorithm="HS256")
    
    # Get team name
    team = await db.teams.find_one({"id": target_user.get('team_id')}, {"_id": 0})
    target_user['team_name'] = team['name'] if team else None
    
    return {
        "token": new_token,
        "user": target_user,
        "expires_at": exp_timestamp,
        "original_user": {
            "id": current_user['id'],
            "name": current_user['name'],
            "email": current_user['email']
        }
    }


@api_router.post("/admin/exit-impersonation")
async def exit_impersonation(request: Request, current_user: dict = Depends(get_current_user)):
    """Exit impersonation and return to original admin account."""
    from fastapi import HTTPException
    from services.main_site_context import get_main_site_id_from_header
    
    main_site_id = await get_main_site_id_from_header(request)
    
    # Get current user's full data
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Find admin to return to - try network admin first, then site admin, then team admin
    admin_user = None
    
    # Check for network admin first
    admin_user = await db.users.find_one(
        {"is_network_admin": True},
        {"_id": 0, "password_hash": 0}
    )
    
    # If in multisite context and no network admin, find main site admin
    if not admin_user and main_site_id:
        admin_access = await db.main_site_users.find_one({"main_site_id": main_site_id, "role": "admin"})
        if admin_access:
            admin_user = await db.users.find_one({"id": admin_access["user_id"]}, {"_id": 0, "password_hash": 0})
    
    # Fallback to team admin
    if not admin_user and current_user.get('team_id'):
        admin_user = await db.users.find_one(
            {"team_id": current_user['team_id'], "role": "admin"},
            {"_id": 0, "password_hash": 0}
        )
    
    if not admin_user:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Create token for admin with 4 hour expiry
    exp_timestamp = datetime.now(timezone.utc).timestamp() + 3600 * 4
    token_payload = {
        "user_id": admin_user['id'],
        "email": admin_user['email'],
        "exp": exp_timestamp
    }
    new_token = jwt.encode(token_payload, JWT_SECRET, algorithm="HS256")
    
    # Get team name if available
    if admin_user.get('team_id'):
        team = await db.teams.find_one({"id": admin_user['team_id']}, {"_id": 0})
        admin_user['team_name'] = team['name'] if team else None
    
    return {
        "token": new_token,
        "user": admin_user,
        "expires_at": exp_timestamp
    }


# File serving endpoints
@api_router.get("/uploads/featured_images/{file_key:path}")
async def get_featured_image_file(file_key: str):
    """Serve a featured image file - redirects to S3 presigned URL if stored there."""
    from fastapi.responses import RedirectResponse
    from services.s3_storage import generate_presigned_url
    
    # Check if this is an S3 key (starts with content/ or featured/)
    if (file_key.startswith("content/") or file_key.startswith("featured/")) and is_s3_configured():
        presigned = await generate_presigned_url(file_key, expiration=3600)
        return RedirectResponse(url=presigned, status_code=302)
    
    # Local file
    file_path = UPLOADS_DIR / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)


@api_router.get("/uploads/media/{file_key:path}")
async def get_media_file(file_key: str):
    """Serve a media file - redirects to S3 presigned URL if the file is stored there."""
    from fastapi.responses import RedirectResponse
    from services.s3_storage import generate_presigned_url
    
    # Check if this is an S3 key (starts with media/)
    if file_key.startswith("media/") and is_s3_configured():
        presigned = await generate_presigned_url(file_key, expiration=3600)
        return RedirectResponse(url=presigned, status_code=302)
    
    # Local file
    file_path = MEDIA_UPLOADS_DIR / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)


@api_router.get("/uploads/show_images/{file_key}")
async def get_show_image_file(file_key: str):
    """Serve a show image file."""
    file_path = SHOW_IMAGES_DIR / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)



@api_router.get("/uploads/avatars/{file_key}")
async def get_avatar_file(file_key: str):
    """Serve a user avatar file."""
    file_path = AVATARS_DIR / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)


@api_router.get("/uploads/vmix_logos/{file_key}")
async def get_vmix_logo_file(file_key: str):
    """Serve a vMix logo file."""
    import pathlib
    file_path = pathlib.Path(UPLOADS_DIR) / "vmix_logos" / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)


@api_router.get("/uploads/branding/{file_key}")
async def get_branding_file(file_key: str):
    """Serve a branding file (logo, favicon, login images)."""
    import pathlib
    file_path = pathlib.Path("/app/backend/uploads/branding") / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type, headers={"Cache-Control": "public, max-age=3600"})


@api_router.get("/uploads/site_logos/{file_key}")
async def get_site_logo(file_key: str):
    """Serve a site logo file."""
    import pathlib
    file_path = pathlib.Path("/app/backend/uploads/site_logos") / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type, headers={"Cache-Control": "public, max-age=3600"})



@api_router.get("/share/{share_token}")
async def get_shared_file(share_token: str):
    """Serve a publicly shared media file (no authentication required)."""
    from fastapi import HTTPException
    from fastapi.responses import RedirectResponse
    
    # Find the share link
    share = await db.media_share_links.find_one({"share_token": share_token})
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found or expired")
    
    # Find the media asset
    asset = await db.media_assets.find_one({"id": share["asset_id"]})
    if not asset:
        raise HTTPException(status_code=404, detail="Media file not found")
    
    # Try S3 first (redirect to S3 URL)
    s3_url = asset.get("s3_url")
    if s3_url:
        return RedirectResponse(url=s3_url)
    
    # Fall back to local file
    file_path = MEDIA_UPLOADS_DIR / asset.get("file_storage_key", "")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = asset.get("mime_type") or mimetypes.guess_type(str(file_path))[0] or 'application/octet-stream'
    
    # Return file with original filename for download
    return FileResponse(
        file_path, 
        media_type=media_type,
        filename=asset.get("original_filename", asset.get("title", "download"))
    )


@api_router.get("/uploads/show_title_images/{file_key}")
async def get_show_title_image_file(file_key: str):
    """Serve a show title image file."""
    from database import UPLOADS_DIR
    show_title_images_dir = UPLOADS_DIR.parent / 'show_title_images'
    file_path = show_title_images_dir / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)


# Editor file upload endpoint
from fastapi import UploadFile, File
import aiofiles

EDITOR_UPLOADS_DIR = UPLOADS_DIR.parent / 'editor_files'
EDITOR_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Import S3 storage
from services.s3_storage import upload_file_to_s3, is_s3_configured, get_s3_url

@api_router.post("/uploads/editor-files")
async def upload_editor_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Upload a file from the TinyMCE editor to S3 storage."""
    from fastapi import HTTPException
    from services.main_site_context import get_main_site_id_from_header
    
    main_site_id = await get_main_site_id_from_header(request)
    
    # Validate file type - support images, video, audio, and documents
    allowed_types = [
        # Images
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'image/heic', 'image/heif',  # Apple HEIC format
        # Video
        'video/mp4', 'video/webm', 'video/quicktime',  # quicktime = .mov
        'video/x-msvideo',  # .avi
        # Audio
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a',
        # Documents
        'application/pdf'
    ]
    
    # Also check by file extension for browsers that don't send correct MIME type
    allowed_extensions = [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'heif',
        'mp4', 'webm', 'mov', 'avi',
        'mp3', 'wav', 'ogg', 'm4a',
        'pdf'
    ]
    
    file_ext = file.filename.split('.')[-1].lower() if '.' in file.filename else ''
    
    if file.content_type not in allowed_types and file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"File type {file.content_type} not allowed. Supported: images (jpg, png, gif, webp, heic), video (mp4, mov, webm), audio (mp3, wav, m4a), pdf")
    
    # Read file content
    contents = await file.read()
    
    # Clara Global Protect: scan BEFORE any upload
    from services.global_protect import check_and_raise
    await check_and_raise(
        contents, file.filename, file.content_type,
        main_site_id=None, user_id=current_user.get("id"), user_name=current_user.get("name"),
    )
    
    # Validate file size (100MB max for video/audio, 10MB for others)
    is_video = (file.content_type and file.content_type.startswith('video/')) or file_ext in ['mp4', 'mov', 'webm', 'avi']
    is_audio = (file.content_type and file.content_type.startswith('audio/')) or file_ext in ['mp3', 'wav', 'ogg', 'm4a']
    max_size = 100 * 1024 * 1024 if (is_video or is_audio) else 10 * 1024 * 1024
    
    if len(contents) > max_size:
        max_mb = 100 if (is_video or is_audio) else 10
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {max_mb}MB")
    
    # Generate unique filename
    ext = file.filename.split('.')[-1] if '.' in file.filename else ''
    file_key = f"editor/{uuid.uuid4()}.{ext}" if ext else f"editor/{uuid.uuid4()}"
    
    # Upload to S3 if configured
    if is_s3_configured():
        try:
            result = await upload_file_to_s3(contents, file_key, file.content_type, main_site_id=main_site_id)
            # Return direct S3 URL (files are uploaded with ACL='public-read')
            return {"url": result['url'], "filename": file.filename, "size": len(contents)}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload to storage: {str(e)}")
    
    # Fallback to local storage
    local_file_key = f"{uuid.uuid4()}.{ext}" if ext else str(uuid.uuid4())
    file_path = EDITOR_UPLOADS_DIR / local_file_key
    
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(contents)
    
    base_url = os.environ.get('REACT_APP_BACKEND_URL', '')
    url = f"{base_url}/api/uploads/editor-files/{local_file_key}"
    
    return {"url": url, "filename": file.filename, "size": len(contents)}


@api_router.get("/uploads/editor-files/s3/{file_key:path}")
async def get_editor_file_s3(file_key: str):
    """Serve an S3-stored editor file via presigned URL redirect."""
    from fastapi import HTTPException
    from fastapi.responses import RedirectResponse
    from services.s3_storage import generate_presigned_url, is_s3_configured
    
    if not is_s3_configured():
        raise HTTPException(status_code=404, detail="S3 not configured")
    
    try:
        presigned_url = await generate_presigned_url(file_key, expiration=3600)
        return RedirectResponse(url=presigned_url, status_code=302)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to serve file: {str(e)}")


@api_router.get("/uploads/editor-files/{file_key}")
async def get_editor_file(file_key: str):
    """Serve an editor uploaded file from local storage."""
    file_path = EDITOR_UPLOADS_DIR / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)


@api_router.get("/storage/status")
async def get_storage_status(current_user: dict = Depends(require_admin)):
    """Get S3 storage connection status (admin only)."""
    from services.s3_storage import check_s3_connection
    return await check_s3_connection()


@api_router.get("/email/status")
async def get_email_status(current_user: dict = Depends(require_admin)):
    """Get SMTP email connection status (admin only)."""
    from services.email_service import test_smtp_connection
    return await test_smtp_connection()


@api_router.post("/email/test")
async def send_test_email(current_user: dict = Depends(require_admin)):
    """Send a test email to verify SMTP configuration (admin only)."""
    from services.email_service import send_email
    
    success = await send_email(
        to_email=current_user['email'],
        subject="✅ Test E-mail - Clara Radio Dashboard",
        html_body=f"""
        <div style="font-family: sans-serif; padding: 20px;">
            <h2>Test E-mail Succesvol!</h2>
            <p>Hallo {current_user.get('name', 'Admin')},</p>
            <p>Dit is een test e-mail van Clara Radio Dashboard om te bevestigen dat de e-mail configuratie correct werkt.</p>
            <p style="color: #22c55e; font-weight: bold;">✅ SMTP configuratie is correct!</p>
            <hr>
            <p style="color: #666; font-size: 12px;">Clara Radio Dashboard</p>
        </div>
        """,
        plain_body="Test e-mail succesvol! SMTP configuratie werkt correct."
    )
    
    if success:
        return {"success": True, "message": f"Test e-mail verstuurd naar {current_user['email']}"}
    else:
        return {"success": False, "message": "Kon geen e-mail versturen. Controleer de SMTP configuratie."}


# ============== RDS / NOW PLAYING ==============

@api_router.get("/rds/live")
async def get_rds_live():
    """Clean endpoint for MagicRDS - returns only the current live show title.
    
    Uses Brussels timezone (Europe/Brussels) for show time matching.
    """
    from services.timezone_utils import today_brussels, current_time_brussels
    
    today = today_brussels()
    current_time = current_time_brussels()
    
    live_show = await db.shows.find_one(
        {
            "status": "scheduled",
            "date": today,
            "start_time": {"$lte": current_time},
            "end_time": {"$gte": current_time}
        },
        {"_id": 0}
    )
    
    if live_show:
        return PlainTextResponse(live_show["title"])
    
    return PlainTextResponse("")


@api_router.get("/rds/live.txt")
async def get_rds_live_text():
    """Plain text endpoint for MagicRDS.
    
    Uses Brussels timezone (Europe/Brussels) for show time matching.
    """
    from services.timezone_utils import today_brussels, current_time_brussels
    
    today = today_brussels()
    current_time = current_time_brussels()
    
    live_show = await db.shows.find_one(
        {
            "status": "scheduled",
            "date": today,
            "start_time": {"$lte": current_time},
            "end_time": {"$gte": current_time}
        },
        {"_id": 0}
    )
    
    if live_show:
        return PlainTextResponse(live_show["title"])
    
    return PlainTextResponse("")


# ============== WEBSOCKET ENDPOINTS ==============

@app.websocket("/ws/rundown/{occurrence_id}")
async def rundown_websocket(
    websocket: WebSocket,
    occurrence_id: str
):
    """WebSocket endpoint for real-time rundown collaboration (occurrences)."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        if not user:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except jwt.ExpiredSignatureError:
        await websocket.close(code=4001, reason="Token expired")
        return
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": user.get('team_id')}
    )
    if not occurrence:
        await websocket.close(code=4004, reason="Occurrence not found")
        return
    
    avatar = user.get('avatar') or {}
    user_info = {
        "id": user['id'],
        "name": user.get('name', 'Unknown'),
        "avatar_url": resolve_avatar_url(avatar)
    }
    
    await ws_manager.connect(websocket, occurrence_id, user_info)
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                msg_type = message.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type in ("editing_start", "editing_update", "editing_end"):
                    message["user"] = user_info
                    await ws_manager.broadcast(occurrence_id, message, exclude=websocket)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        await ws_manager.broadcast(occurrence_id, {
            "type": "editing_end",
            "item_id": None,
            "user": user_info
        })
        await ws_manager.disconnect(websocket, occurrence_id)
    except Exception:
        await ws_manager.disconnect(websocket, occurrence_id)


@app.websocket("/ws/show/{show_id}")
async def show_rundown_websocket(
    websocket: WebSocket,
    show_id: str
):
    """WebSocket endpoint for real-time show rundown collaboration (legacy shows)."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        if not user:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except jwt.ExpiredSignatureError:
        await websocket.close(code=4001, reason="Token expired")
        return
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    show = await db.shows.find_one(
        {"id": show_id, "team_id": user.get('team_id')}
    )
    if not show:
        await websocket.close(code=4004, reason="Show not found")
        return
    
    room_id = f"show_{show_id}"
    
    avatar = user.get('avatar') or {}
    user_info = {
        "id": user['id'],
        "name": user.get('name', 'Unknown'),
        "avatar_url": resolve_avatar_url(avatar)
    }
    
    await ws_manager.connect(websocket, room_id, user_info)
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                msg_type = message.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type in ("editing_start", "editing_update", "editing_end"):
                    # Relay live editing events to all other viewers
                    message["user"] = user_info
                    await ws_manager.broadcast(room_id, message, exclude=websocket)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        # Notify others that this user stopped editing
        await ws_manager.broadcast(room_id, {
            "type": "editing_end",
            "item_id": None,
            "user": user_info
        })
        await ws_manager.disconnect(websocket, room_id)
    except Exception:
        await ws_manager.disconnect(websocket, room_id)


# ============== CALL SIGNALING WEBSOCKET ==============

@app.websocket("/ws/call/{room_id}")
async def call_signaling_websocket(websocket: WebSocket, room_id: str):
    """WebSocket endpoint for WebRTC call signaling.
    
    Roles:
    - host: Authenticated Clara user (passes token)
    - caller: External user joining via invite link (passes caller_token)
    """
    token = websocket.query_params.get("token")
    role = websocket.query_params.get("role", "host")

    # Validate host via JWT
    if role == "host":
        if not token:
            await websocket.close(code=4001, reason="Missing token")
            return
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("user_id")
            if not user_id:
                await websocket.close(code=4001, reason="Invalid token")
                return
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return
    elif role == "caller":
        # Callers just need a valid room_id (invite was already accepted via REST)
        invite = await db.call_invites.find_one({"id": room_id})
        if not invite or invite.get("status") not in ("active", "pending"):
            await websocket.close(code=4004, reason="Invalid or expired invite")
            return
    else:
        await websocket.close(code=4001, reason="Invalid role")
        return

    await call_signaling.connect(room_id, role, websocket)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                msg_type = message.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type in ("offer", "answer", "ice_candidate", "mute_state", "volume_change", "hangup"):
                    await call_signaling.relay_message(room_id, role, message)
                elif msg_type == "get_status":
                    status = call_signaling.get_room_status(room_id)
                    await websocket.send_json({"type": "room_status", **status})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        await call_signaling.disconnect(room_id, role)
    except Exception:
        await call_signaling.disconnect(room_id, role)


# ============== INCLUDE MAIN ROUTER ==============

app.include_router(api_router)
app.include_router(migration_router)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Firewall Middleware (runs after CORS so blocked requests still get proper CORS headers)
from database import JWT_ALGORITHM
from middleware.firewall_middleware import FirewallMiddleware
from middleware.permission_middleware import PermissionMiddleware
from middleware.no_cache_middleware import NoCacheMiddleware
app.add_middleware(FirewallMiddleware, jwt_secret=JWT_SECRET, jwt_algorithm=JWT_ALGORITHM)
app.add_middleware(PermissionMiddleware, jwt_secret=JWT_SECRET, jwt_algorithm=JWT_ALGORITHM)
app.add_middleware(NoCacheMiddleware)


# ============== STARTUP/SHUTDOWN EVENTS ==============

@app.on_event("startup")
async def startup_db_client():
    """Migrate legacy data and ensure bootstrap admin exists on startup."""
    from services.auth import hash_password
    
    # Ensure ffmpeg is installed for audio trigger functionality
    try:
        from scripts.ensure_ffmpeg import ensure_ffmpeg, reset_ffmpeg_cache
        if ensure_ffmpeg():
            logger.info("FFmpeg is available for audio processing")
        else:
            logger.warning("FFmpeg is NOT available - Audio Triggers will not work")
        reset_ffmpeg_cache()
    except Exception as e:
        logger.warning(f"Could not check/install ffmpeg: {e}")
    
    # Bootstrap: Ensure network admin account exists (for initial access)
    try:
        bootstrap_email = "admkoodh@koodh.com"
        existing_bootstrap = await db.users.find_one({"email": bootstrap_email})
        if not existing_bootstrap:
            bootstrap_user = {
                "id": str(uuid.uuid4()),
                "email": bootstrap_email,
                "name": "System Administrator",
                "password_hash": hash_password("KYLovie13monx"),
                "role": "admin",
                "is_network_admin": True,
                "team_id": None,  # No team - pure network admin
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_system_account": True  # Flag to hide from user lists
            }
            await db.users.insert_one(bootstrap_user)
            logger.info("Bootstrap network admin account created")
        else:
            # Ensure it stays a network admin
            await db.users.update_one(
                {"email": bootstrap_email},
                {"$set": {"is_network_admin": True, "is_system_account": True}}
            )
    except Exception as e:
        logger.warning(f"Could not create/update bootstrap admin: {e}")
    
    # Migrate legacy users without role/team_id (exclude system accounts)
    legacy_users = await db.users.find({
        "team_id": {"$exists": False},
        "is_system_account": {"$ne": True}
    }).to_list(100)
    for user in legacy_users:
        team_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        await db.teams.insert_one({
            "id": team_id,
            "name": "My Radio Station",
            "created_at": now
        })
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"team_id": team_id, "role": "admin"}}
        )
        await db.shows.update_many(
            {"editor_id": user["id"]},
            {"$set": {"team_id": team_id}}
        )
        logger.info(f"Migrated user {user['email']} to team {team_id}")
    
    # Migrate old wordpress_connections to wordpress_sites
    old_connections = await db.wordpress_connections.find({}).to_list(100)
    for conn in old_connections:
        existing = await db.wordpress_sites.find_one({
            "team_id": conn.get("team_id"),
            "wp_base_url": conn.get("wp_base_url")
        })
        if not existing:
            now = datetime.now(timezone.utc).isoformat()
            site_doc = {
                "id": str(uuid.uuid4()),
                "team_id": conn.get("team_id"),
                "name": "Main Website",
                "wp_base_url": conn.get("wp_base_url", ""),
                "username": conn.get("username", ""),
                "app_password": conn.get("app_password", ""),
                "default_post_type": conn.get("default_post_type", "post"),
                "default_publish_status": conn.get("default_status", "draft"),
                "is_active": True,
                "created_at": conn.get("created_at", now),
                "updated_at": now
            }
            await db.wordpress_sites.insert_one(site_doc)
            logger.info(f"Migrated wordpress connection for team {conn.get('team_id')}")
    
    # Start the WordPress scheduler for automatic publishing of scheduled posts
    await wp_scheduler.start()
    logger.info("WordPress scheduler started")
    
    # Start the RDS cache scheduler for MagicRDS integration
    await rds_scheduler.start()
    logger.info("RDS cache scheduler started")
    
    # Start the Shoutcast scheduler for now playing updates (every 10 seconds)
    await shoutcast_scheduler.start()
    logger.info("Shoutcast scheduler started (10s interval)")
    
    # Start the RDS Builder scheduler for text rotation
    await rds_builder_scheduler.start()
    logger.info("RDS Builder scheduler started (1s interval)")
    
    # Start the Radioplayer auto-sync scheduler
    await radioplayer_scheduler.start()
    logger.info("Radioplayer scheduler started (NP: 60s, Schedule: 30min)")
    
    # Start the Audio Trigger scheduler for sound detection
    from services.audio_trigger import AudioTriggerScheduler
    global audio_trigger_scheduler
    audio_trigger_scheduler = AudioTriggerScheduler(db)
    await audio_trigger_scheduler.start()
    logger.info("Audio Trigger scheduler started (3s interval)")

    # Start daily backup scheduler
    from services.backup_scheduler import start_backup_scheduler
    await start_backup_scheduler()
    logger.info("Daily backup scheduler started")

    # Start daily notification digest scheduler
    from services.notification_scheduler import start_notification_scheduler
    await start_notification_scheduler()
    logger.info("Notification digest scheduler started")

    # Start ZeroTier alert scheduler (checks monitored clients every 60s)
    from services.zerotier_alerts import start_zerotier_alert_scheduler
    await start_zerotier_alert_scheduler(db)
    logger.info("ZeroTier alert scheduler started")

    # Auto-initialize system alert config (clara.global@koodh.com always enabled)
    try:
        system_alert = await db.notification_config.find_one({"type": "system_alert"})
        if not system_alert:
            await db.notification_config.insert_one({
                "type": "system_alert",
                "email": "clara.global@koodh.com",
                "enabled": True,
                "mode": "both",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("System alert config auto-initialized (clara.global@koodh.com)")
        elif not system_alert.get("enabled"):
            await db.notification_config.update_one(
                {"type": "system_alert"},
                {"$set": {"enabled": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            logger.info("System alert config auto-enabled")
    except Exception as e:
        logger.warning(f"Could not initialize system alert config: {e}")

    # Migrate: add 'rundown' permission to existing roles
    try:
        from routers.roles import migrate_add_rundown_permission
        await migrate_add_rundown_permission()
    except Exception as e:
        logger.warning(f"Rundown permission migration failed: {e}")

    # Migrate: create missing role documents for role slugs used in main_site_users
    try:
        from routers.roles import migrate_create_missing_roles
        await migrate_create_missing_roles()
    except Exception as e:
        logger.warning(f"Missing roles migration failed: {e}")

    # Seed default license packages
    try:
        from routers.licenses import seed_default_packages
        await seed_default_packages()
    except Exception as e:
        logger.warning(f"License package seeding failed: {e}")

    # Migrate legacy license_assignments: fix site_id -> main_site_id
    try:
        legacy_assignments = await db.license_assignments.find(
            {"site_id": {"$exists": True}, "main_site_id": {"$exists": False}}
        ).to_list(500)
        for la in legacy_assignments:
            await db.license_assignments.update_one(
                {"_id": la["_id"]},
                {"$set": {"main_site_id": la["site_id"], "billing_cycle": la.get("type", "lifetime"), "status": "active"},
                 "$unset": {"site_id": 1}}
            )
        if legacy_assignments:
            logger.info(f"Migrated {len(legacy_assignments)} legacy license_assignments (site_id -> main_site_id)")
    except Exception as e:
        logger.warning(f"License assignment migration failed: {e}")

    # Seed default environment and migrate existing data
    try:
        from routers.environments import seed_default_environment
        await seed_default_environment()
    except Exception as e:
        logger.warning(f"Environment seeding failed: {e}")

    # Start license expiry reminder scheduler
    try:
        from services.license_scheduler import start_license_scheduler
        asyncio.create_task(start_license_scheduler())
        logger.info("License expiry scheduler started")
    except Exception as e:
        logger.warning(f"License scheduler start failed: {e}")

    # Initialize Radioplayer config if not exists
    try:
        existing_rp = await db.radioplayer_config.find_one({})
        if not existing_rp:
            await db.radioplayer_config.insert_one({
                "enabled": True,
                "username": "eddy.thijs@grk.fm",
                "password": "KYLovie13monx",
                "rpid": "056028",
                "country_code": "056",
                "ingest_base_url": "https://core-ingest.radioplayer.cloud",
                "auto_np": True,
                "auto_schedule": True,
            })
            logger.info("Radioplayer config initialized")
        # Add radioplayer feature to all main sites that have streaming features
        await db.main_sites.update_many(
            {"enabled_features": {"$in": ["rds_settings", "rds_builder", "rds_monitor", "stream_monitor"]}},
            {"$addToSet": {"enabled_features": "radioplayer"}}
        )
    except Exception as e:
        logger.warning(f"Radioplayer config init failed: {e}")

    # Migrate proxy URLs in content bodies back to direct S3 URLs
    # (S3 files are uploaded with ACL='public-read', so direct access works)
    try:
        import re
        base_url = os.environ.get('REACT_APP_BACKEND_URL', '')
        if base_url:
            # Convert proxy URLs back to direct S3 URLs
            proxy_pattern = re.escape(base_url) + r'/api/uploads/editor-files/s3/(editor/[^"\'>\s]+)'
            s3_base = f"{os.environ.get('S3_ENDPOINT', 'https://nbg1.your-objectstorage.com')}/{os.environ.get('S3_BUCKET', 'koodh-clara')}"
            async for content in db.content.find({"body": {"$regex": "editor-files/s3/editor"}}, {"_id": 0, "id": 1, "body": 1}):
                new_body = re.sub(proxy_pattern, f'{s3_base}/\\1', content["body"])
                if new_body != content["body"]:
                    await db.content.update_one({"id": content["id"]}, {"$set": {"body": new_body}})
                    logger.info(f"Restored direct S3 URLs in content {content['id']}")
    except Exception as e:
        logger.warning(f"S3 URL restoration failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    # Stop the WordPress scheduler
    await wp_scheduler.stop()
    logger.info("WordPress scheduler stopped")
    
    # Stop the RDS cache scheduler
    await rds_scheduler.stop()
    logger.info("RDS cache scheduler stopped")
    
    # Stop the Shoutcast scheduler
    await shoutcast_scheduler.stop()
    logger.info("Shoutcast scheduler stopped")
    
    # Stop the RDS Builder scheduler
    await rds_builder_scheduler.stop()
    logger.info("RDS Builder scheduler stopped")
    
    # Stop the Radioplayer scheduler
    await radioplayer_scheduler.stop()
    logger.info("Radioplayer scheduler stopped")
    
    # Stop the Audio Trigger scheduler
    global audio_trigger_scheduler
    if audio_trigger_scheduler:
        await audio_trigger_scheduler.stop()
        logger.info("Audio Trigger scheduler stopped")
    
    client.close()
