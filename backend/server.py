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

from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, Depends, Request
from fastapi.responses import PlainTextResponse, FileResponse
from starlette.middleware.cors import CORSMiddleware
import os
import logging
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
from models.wordpress import PublishToWordPressRequest, PublishResponse
from services.auth import get_current_user, require_editor_or_admin, require_admin

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


# ============== ADDITIONAL API ROUTES ==============

@api_router.get("/")
async def root():
    return {"message": "Radio Show Planner API", "status": "running"}


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


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
    current_user: dict = Depends(require_editor_or_admin)
):
    """Publish content item to one or more WordPress sites."""
    return await publish_content_to_wordpress(content_id, publish_data, current_user)


# ============== MENU BADGE COUNTS ==============

@api_router.get("/menu/counts")
async def get_menu_counts(request: Request, current_user: dict = Depends(get_current_user)):
    """Get counts for menu badges, filtered by main site if specified."""
    team_id = current_user.get('team_id')
    user_id = current_user.get('id')
    is_admin = current_user.get('role') == 'admin'
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
    
    # Content Approval - pending approvals (admin only)
    if is_admin:
        approval_count = await db.content_items.count_documents({
            **content_filter,
            "status": "ready",
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
    
    return counts


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
    """Serve a featured image file - redirects to S3 if stored there."""
    from fastapi.responses import RedirectResponse
    
    # Check if this is an S3 key (starts with content/ or featured/)
    if (file_key.startswith("content/") or file_key.startswith("featured/")) and is_s3_configured():
        s3_url = get_s3_url(file_key)
        return RedirectResponse(url=s3_url, status_code=302)
    
    # Local file
    file_path = UPLOADS_DIR / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)


@api_router.get("/uploads/media/{file_key:path}")
async def get_media_file(file_key: str):
    """Serve a media file - redirects to S3 if the file is stored there."""
    from fastapi.responses import RedirectResponse
    
    # Check if this is an S3 key (starts with media/)
    if file_key.startswith("media/") and is_s3_configured():
        # Redirect to S3 URL
        s3_url = get_s3_url(file_key)
        return RedirectResponse(url=s3_url, status_code=302)
    
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


@api_router.get("/share/{share_token}")
async def get_shared_file(share_token: str):
    """Serve a publicly shared media file (no authentication required)."""
    from fastapi import HTTPException
    
    # Find the share link
    share = await db.media_share_links.find_one({"share_token": share_token})
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found or expired")
    
    # Find the media asset
    asset = await db.media_assets.find_one({"id": share["asset_id"]})
    if not asset:
        raise HTTPException(status_code=404, detail="Media file not found")
    
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
    file: UploadFile = File(...),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Upload a file from the TinyMCE editor to S3 storage."""
    from fastapi import HTTPException
    
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
    
    # Validate file size (100MB max for video, 10MB for others)
    is_video = file.content_type and file.content_type.startswith('video/') or file_ext in ['mp4', 'mov', 'webm', 'avi']
    max_size = 100 * 1024 * 1024 if is_video else 10 * 1024 * 1024
    
    if len(contents) > max_size:
        max_mb = 100 if is_video else 10
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {max_mb}MB")
    
    # Generate unique filename
    ext = file.filename.split('.')[-1] if '.' in file.filename else ''
    file_key = f"editor/{uuid.uuid4()}.{ext}" if ext else f"editor/{uuid.uuid4()}"
    
    # Upload to S3 if configured
    if is_s3_configured():
        try:
            result = await upload_file_to_s3(contents, file_key, file.content_type)
            return {"url": result['url'], "filename": file.filename, "size": len(contents)}
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
        plain_body=f"Test e-mail succesvol! SMTP configuratie werkt correct."
    )
    
    if success:
        return {"success": True, "message": f"Test e-mail verstuurd naar {current_user['email']}"}
    else:
        return {"success": False, "message": "Kon geen e-mail versturen. Controleer de SMTP configuratie."}


# ============== RDS / NOW PLAYING ==============

@api_router.get("/rds/live")
async def get_rds_live():
    """Clean endpoint for MagicRDS - returns only the current live show title."""
    now = datetime.now(timezone.utc)
    today = now.strftime('%Y-%m-%d')
    current_time = now.strftime('%H:%M')
    
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
    """Plain text endpoint for MagicRDS."""
    now = datetime.now(timezone.utc)
    today = now.strftime('%Y-%m-%d')
    current_time = now.strftime('%H:%M')
    
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
    
    user_info = {
        "id": user['id'],
        "name": user.get('name', 'Unknown'),
        "avatar_url": user.get('avatar_url')
    }
    
    await ws_manager.connect(websocket, occurrence_id, user_info)
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
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
    
    user_info = {
        "id": user['id'],
        "name": user.get('name', 'Unknown'),
        "avatar_url": user.get('avatar_url')
    }
    
    await ws_manager.connect(websocket, room_id, user_info)
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, room_id)
    except Exception:
        await ws_manager.disconnect(websocket, room_id)


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
    
    # Start the Audio Trigger scheduler for sound detection
    from services.audio_trigger import AudioTriggerScheduler
    global audio_trigger_scheduler
    audio_trigger_scheduler = AudioTriggerScheduler(db)
    await audio_trigger_scheduler.start()
    logger.info("Audio Trigger scheduler started (3s interval)")


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
    
    # Stop the Audio Trigger scheduler
    global audio_trigger_scheduler
    if audio_trigger_scheduler:
        await audio_trigger_scheduler.stop()
        logger.info("Audio Trigger scheduler stopped")
    
    client.close()
