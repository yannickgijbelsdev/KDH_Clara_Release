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

from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
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
from routers import (
    auth_router, teams_router, users_router, shows_router,
    content_router, wordpress_router, series_router,
    occurrences_router, chat_router, media_router
)
from routers.logs import logs_router
from routers.wordpress import publish_content_to_wordpress
from models.wordpress import PublishToWordPressRequest, PublishResponse
from services.auth import get_current_user, require_editor_or_admin
from fastapi import Depends

# Create the main app
app = FastAPI(title="Radio Show Planner API")

# Create API router
api_router = APIRouter(prefix="/api")

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
api_router.include_router(media_router)
api_router.include_router(logs_router)


# ============== ADDITIONAL API ROUTES ==============

@api_router.get("/")
async def root():
    return {"message": "Radio Show Planner API", "status": "running"}


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


# Content publish endpoint (needs both content and wordpress routers)
@api_router.post("/content/{content_id}/publish", response_model=PublishResponse)
async def publish_to_wordpress(
    content_id: str,
    publish_data: PublishToWordPressRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Publish content item to one or more WordPress sites."""
    return await publish_content_to_wordpress(content_id, publish_data, current_user)


# File serving endpoints
@api_router.get("/uploads/featured_images/{file_key}")
async def get_featured_image_file(file_key: str):
    """Serve a featured image file."""
    file_path = UPLOADS_DIR / file_key
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)


@api_router.get("/uploads/media/{file_key}")
async def get_media_file(file_key: str):
    """Serve a media file."""
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
    """Migrate legacy data on startup."""
    # Migrate legacy users without role/team_id
    legacy_users = await db.users.find({"team_id": {"$exists": False}}).to_list(100)
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
