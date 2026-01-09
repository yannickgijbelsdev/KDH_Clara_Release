from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone
import bcrypt
import jwt
import secrets
import httpx
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'radio-show-planner-secret-key-2024')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="Radio Show Planner API")

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
shows_router = APIRouter(prefix="/shows", tags=["Shows"])
teams_router = APIRouter(prefix="/teams", tags=["Teams"])
users_router = APIRouter(prefix="/users", tags=["Users"])
content_router = APIRouter(prefix="/content", tags=["Content Library"])
wordpress_router = APIRouter(prefix="/wordpress", tags=["WordPress"])

security = HTTPBearer()

# Role definitions
ROLES = ["admin", "editor", "viewer"]

# ============== MODELS ==============

# Team Models
class TeamCreate(BaseModel):
    name: str

class TeamResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    created_at: str

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    team_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    team_id: str
    created_at: str

class UserWithTeamResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    team_id: str
    team_name: str
    created_at: str

class TokenResponse(BaseModel):
    token: str
    user: UserWithTeamResponse

class InviteUserRequest(BaseModel):
    email: EmailStr
    name: str
    role: Literal["admin", "editor", "viewer"] = "editor"

class UpdateUserRoleRequest(BaseModel):
    role: Literal["admin", "editor", "viewer"]

# Show Models
class ShowCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    date: str
    start_time: str
    end_time: str
    status: str = "draft"

class ShowUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[str] = None

class ShowResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: str
    date: str
    start_time: str
    end_time: str
    status: str
    editor_id: str
    team_id: Optional[str] = ""
    created_at: str
    updated_at: str

# Rundown Models
class RundownItemCreate(BaseModel):
    type: str
    title: str
    notes: Optional[str] = ""
    duration: Optional[str] = ""

class RundownItemUpdate(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    duration: Optional[str] = None

class RundownItemResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    show_id: str
    type: str
    title: str
    notes: str
    duration: str
    order: int
    created_at: str

class ReorderRequest(BaseModel):
    item_ids: List[str]

# Content Library Models (Updated - removed WP fields from ContentItem)
class ContentItemCreate(BaseModel):
    title: str
    type: Literal["text", "link", "reference"] = "text"
    body: Optional[str] = ""
    excerpt: Optional[str] = ""
    external_url: Optional[str] = ""
    tags: Optional[List[str]] = []
    status: Literal["draft", "ready"] = "draft"

class ContentItemUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[Literal["text", "link", "reference"]] = None
    body: Optional[str] = None
    excerpt: Optional[str] = None
    external_url: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[Literal["draft", "ready"]] = None

# Per-site publish status model
class ContentPublishStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    content_item_id: str
    wordpress_site_id: str
    wordpress_site_name: str
    wp_post_id: Optional[int] = None
    wp_post_type: str = "post"
    wp_status: str = "draft"
    wp_permalink: Optional[str] = None
    sync_status: str = "not_synced"
    sync_error_message: Optional[str] = None
    last_synced_at: Optional[str] = None
    created_at: str
    updated_at: str

class ContentItemResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    type: str
    body: str
    excerpt: str
    external_url: str
    tags: List[str]
    status: str
    team_id: str
    created_by: str
    created_at: str
    updated_at: str
    # Per-site publish statuses
    publish_statuses: List[ContentPublishStatus] = []

# WordPress Site Models (Multi-site support)
class WordPressSiteCreate(BaseModel):
    name: str
    wp_base_url: str
    username: str
    app_password: str
    default_post_type: Literal["post", "page"] = "post"
    default_publish_status: Literal["draft", "publish"] = "draft"
    is_active: bool = True

class WordPressSiteUpdate(BaseModel):
    name: Optional[str] = None
    wp_base_url: Optional[str] = None
    username: Optional[str] = None
    app_password: Optional[str] = None
    default_post_type: Optional[Literal["post", "page"]] = None
    default_publish_status: Optional[Literal["draft", "publish"]] = None
    is_active: Optional[bool] = None

class WordPressSiteResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    name: str
    wp_base_url: str
    username: str
    default_post_type: str
    default_publish_status: str
    is_active: bool
    created_at: str
    updated_at: str

# Multi-site Publish Request
class PublishTarget(BaseModel):
    site_id: str
    post_type: Literal["post", "page"] = "post"
    wp_status: Literal["draft", "publish"] = "draft"

class PublishToWordPressRequest(BaseModel):
    targets: List[PublishTarget]

# Single site publish result
class PublishResult(BaseModel):
    site_id: str
    site_name: str
    success: bool
    message: str
    wp_post_id: Optional[int] = None
    wp_permalink: Optional[str] = None

class PublishResponse(BaseModel):
    results: List[PublishResult]

# Rundown-Content Link Models
class AttachContentRequest(BaseModel):
    content_ids: List[str]

class RundownItemWithContentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    show_id: str
    type: str
    title: str
    notes: str
    duration: str
    order: int
    created_at: str
    content_ids: List[str] = []

# ============== HELPER FUNCTIONS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        'user_id': user_id,
        'exp': datetime.now(timezone.utc).timestamp() + (JWT_EXPIRATION_HOURS * 3600)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def generate_temp_password() -> str:
    return secrets.token_urlsafe(12)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def require_editor_or_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get('role') not in ['admin', 'editor']:
        raise HTTPException(status_code=403, detail="Editor or admin access required")
    return current_user

async def get_content_with_publish_statuses(content_id: str, team_id: str) -> dict:
    """Get content item with all publish statuses."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": team_id},
        {"_id": 0}
    )
    if not content:
        return None
    
    # Get all publish statuses for this content
    publish_statuses = await db.content_item_publishes.find(
        {"content_item_id": content_id},
        {"_id": 0}
    ).to_list(100)
    
    # Add site names to publish statuses
    for ps in publish_statuses:
        site = await db.wordpress_sites.find_one({"id": ps["wordpress_site_id"]}, {"_id": 0})
        ps["wordpress_site_name"] = site["name"] if site else "Unknown"
    
    content["publish_statuses"] = publish_statuses
    return content

# ============== AUTH ROUTES ==============

@auth_router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    """Register a new user. First user creates a team and becomes admin."""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    team_id = None
    team_name = user_data.team_name or "My Radio Station"
    role = "admin"
    
    team_id = str(uuid.uuid4())
    team_doc = {
        "id": team_id,
        "name": team_name,
        "created_at": now
    }
    await db.teams.insert_one(team_doc)
    
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": role,
        "team_id": team_id,
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    await db.shows.update_many(
        {"team_id": {"$exists": False}},
        {"$set": {"team_id": team_id}}
    )
    
    token = create_token(user_id)
    user_response = UserWithTeamResponse(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        role=role,
        team_id=team_id,
        team_name=team_name,
        created_at=now
    )
    
    return TokenResponse(token=token, user=user_response)

@auth_router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    team = await db.teams.find_one({"id": user.get('team_id')}, {"_id": 0})
    team_name = team['name'] if team else "Unknown Team"
    
    role = user.get('role', 'editor')
    team_id = user.get('team_id', '')
    
    token = create_token(user['id'])
    user_response = UserWithTeamResponse(
        id=user['id'],
        email=user['email'],
        name=user['name'],
        role=role,
        team_id=team_id,
        team_name=team_name,
        created_at=user['created_at']
    )
    
    return TokenResponse(token=token, user=user_response)

@auth_router.get("/me", response_model=UserWithTeamResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    team = await db.teams.find_one({"id": current_user.get('team_id')}, {"_id": 0})
    team_name = team['name'] if team else "Unknown Team"
    
    return UserWithTeamResponse(
        id=current_user['id'],
        email=current_user['email'],
        name=current_user['name'],
        role=current_user.get('role', 'editor'),
        team_id=current_user.get('team_id', ''),
        team_name=team_name,
        created_at=current_user['created_at']
    )

# ============== TEAM ROUTES ==============

@teams_router.get("/current", response_model=TeamResponse)
async def get_current_team(current_user: dict = Depends(get_current_user)):
    """Get the current user's team."""
    team = await db.teams.find_one({"id": current_user.get('team_id')}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team

@teams_router.put("/current", response_model=TeamResponse)
async def update_team(
    team_data: TeamCreate,
    current_user: dict = Depends(require_admin)
):
    """Update team name (admin only)."""
    await db.teams.update_one(
        {"id": current_user['team_id']},
        {"$set": {"name": team_data.name}}
    )
    team = await db.teams.find_one({"id": current_user['team_id']}, {"_id": 0})
    return team

# ============== USER MANAGEMENT ROUTES ==============

@users_router.get("", response_model=List[UserResponse])
async def get_team_users(current_user: dict = Depends(get_current_user)):
    """Get all users in the current team."""
    users = await db.users.find(
        {"team_id": current_user['team_id']},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    return users

@users_router.post("/invite", response_model=UserResponse)
async def invite_user(
    invite_data: InviteUserRequest,
    current_user: dict = Depends(require_admin)
):
    """Invite a new user to the team (admin only)."""
    existing = await db.users.find_one({"email": invite_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    temp_password = generate_temp_password()
    
    user_doc = {
        "id": user_id,
        "email": invite_data.email,
        "password_hash": hash_password(temp_password),
        "name": invite_data.name,
        "role": invite_data.role,
        "team_id": current_user['team_id'],
        "temp_password": temp_password,
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    return UserResponse(
        id=user_id,
        email=invite_data.email,
        name=invite_data.name,
        role=invite_data.role,
        team_id=current_user['team_id'],
        created_at=now
    )

@users_router.get("/invite/{user_id}/password")
async def get_temp_password(
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """Get temporary password for newly invited user (admin only)."""
    user = await db.users.find_one(
        {"id": user_id, "team_id": current_user['team_id']},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    temp_password = user.get('temp_password')
    if not temp_password:
        raise HTTPException(status_code=400, detail="No temporary password available")
    
    return {"temp_password": temp_password}

@users_router.put("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    role_data: UpdateUserRoleRequest,
    current_user: dict = Depends(require_admin)
):
    """Update a user's role (admin only)."""
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    
    user = await db.users.find_one(
        {"id": user_id, "team_id": current_user['team_id']}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": role_data.role}}
    )
    
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user

@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user(
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """Remove a user from the team (admin only)."""
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    
    result = await db.users.delete_one(
        {"id": user_id, "team_id": current_user['team_id']}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

@auth_router.put("/change-password")
async def change_password(
    old_password: str,
    new_password: str,
    current_user: dict = Depends(get_current_user)
):
    """Change user's password."""
    user = await db.users.find_one({"id": current_user['id']})
    if not verify_password(old_password, user['password_hash']):
        raise HTTPException(status_code=400, detail="Invalid current password")
    
    await db.users.update_one(
        {"id": current_user['id']},
        {
            "$set": {"password_hash": hash_password(new_password)},
            "$unset": {"temp_password": ""}
        }
    )
    return {"message": "Password changed successfully"}

# ============== SHOWS ROUTES ==============

@shows_router.get("", response_model=List[ShowResponse])
async def get_shows(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get shows for the current team."""
    query = {"team_id": current_user.get('team_id')}
    if status:
        query["status"] = status
    
    shows = await db.shows.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return shows

@shows_router.post("", response_model=ShowResponse, status_code=status.HTTP_201_CREATED)
async def create_show(
    show_data: ShowCreate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Create a new show (editor or admin only)."""
    show_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    show_doc = {
        "id": show_id,
        "title": show_data.title,
        "description": show_data.description or "",
        "date": show_data.date,
        "start_time": show_data.start_time,
        "end_time": show_data.end_time,
        "status": show_data.status,
        "editor_id": current_user['id'],
        "team_id": current_user.get('team_id', ''),
        "created_at": now,
        "updated_at": now
    }
    
    await db.shows.insert_one(show_doc)
    show_doc.pop('_id', None)
    return show_doc

@shows_router.get("/{show_id}", response_model=ShowResponse)
async def get_show(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single show (must be in user's team)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    return show

@shows_router.put("/{show_id}", response_model=ShowResponse)
async def update_show(
    show_id: str,
    show_data: ShowUpdate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update a show (editor or admin only)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    update_dict = {k: v for k, v in show_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.shows.update_one(
        {"id": show_id},
        {"$set": update_dict}
    )
    
    updated_show = await db.shows.find_one({"id": show_id}, {"_id": 0})
    return updated_show

@shows_router.delete("/{show_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_show(
    show_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a show (editor or admin only)."""
    result = await db.shows.delete_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Show not found")
    
    await db.rundown_items.delete_many({"show_id": show_id})

# ============== RUNDOWN ROUTES ==============

@shows_router.get("/{show_id}/rundown", response_model=List[RundownItemResponse])
async def get_rundown(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get rundown items for a show."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    items = await db.rundown_items.find(
        {"show_id": show_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    return items

@shows_router.post("/{show_id}/rundown", response_model=RundownItemResponse, status_code=status.HTTP_201_CREATED)
async def create_rundown_item(
    show_id: str,
    item_data: RundownItemCreate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Add a rundown item (editor or admin only)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    last_item = await db.rundown_items.find_one(
        {"show_id": show_id},
        sort=[("order", -1)]
    )
    next_order = (last_item['order'] + 1) if last_item else 0
    
    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    item_doc = {
        "id": item_id,
        "show_id": show_id,
        "type": item_data.type,
        "title": item_data.title,
        "notes": item_data.notes or "",
        "duration": item_data.duration or "",
        "order": next_order,
        "created_at": now
    }
    
    await db.rundown_items.insert_one(item_doc)
    item_doc.pop('_id', None)
    return item_doc

@shows_router.put("/{show_id}/rundown/reorder", response_model=List[RundownItemResponse])
async def reorder_rundown(
    show_id: str,
    reorder_data: ReorderRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Reorder rundown items (editor or admin only)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    for index, item_id in enumerate(reorder_data.item_ids):
        await db.rundown_items.update_one(
            {"id": item_id, "show_id": show_id},
            {"$set": {"order": index}}
        )
    
    items = await db.rundown_items.find(
        {"show_id": show_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    return items

@shows_router.put("/{show_id}/rundown/{item_id}", response_model=RundownItemResponse)
async def update_rundown_item(
    show_id: str,
    item_id: str,
    item_data: RundownItemUpdate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update a rundown item (editor or admin only)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_dict = {k: v for k, v in item_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.rundown_items.update_one(
            {"id": item_id},
            {"$set": update_dict}
        )
    
    updated_item = await db.rundown_items.find_one({"id": item_id}, {"_id": 0})
    return updated_item

@shows_router.delete("/{show_id}/rundown/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rundown_item(
    show_id: str,
    item_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a rundown item (editor or admin only)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    result = await db.rundown_items.delete_one({"id": item_id, "show_id": show_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")

# ============== RUNDOWN-CONTENT ATTACHMENT ==============

@shows_router.get("/{show_id}/rundown/{item_id}/content", response_model=List[ContentItemResponse])
async def get_rundown_item_content(
    show_id: str,
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get content items attached to a rundown item."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    content_ids = item.get("content_ids", [])
    if not content_ids:
        return []
    
    content_items = []
    for cid in content_ids:
        content = await get_content_with_publish_statuses(cid, current_user.get('team_id'))
        if content:
            content_items.append(content)
    
    return content_items

@shows_router.put("/{show_id}/rundown/{item_id}/content")
async def attach_content_to_rundown(
    show_id: str,
    item_id: str,
    attach_data: AttachContentRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Attach content items to a rundown item."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    for content_id in attach_data.content_ids:
        content = await db.content_items.find_one(
            {"id": content_id, "team_id": current_user.get('team_id')}
        )
        if not content:
            raise HTTPException(status_code=404, detail=f"Content item {content_id} not found")
    
    await db.rundown_items.update_one(
        {"id": item_id},
        {"$set": {"content_ids": attach_data.content_ids}}
    )
    
    updated_item = await db.rundown_items.find_one({"id": item_id}, {"_id": 0})
    return updated_item

# ============== CONTENT LIBRARY ROUTES ==============

@content_router.get("", response_model=List[ContentItemResponse])
async def get_content_items(
    type: Optional[str] = None,
    status: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all content items for the team."""
    query = {"team_id": current_user.get('team_id')}
    
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    if tag:
        query["tags"] = tag
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    
    items = await db.content_items.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    
    # Add publish statuses to each item
    result = []
    for item in items:
        publish_statuses = await db.content_item_publishes.find(
            {"content_item_id": item["id"]},
            {"_id": 0}
        ).to_list(100)
        
        for ps in publish_statuses:
            site = await db.wordpress_sites.find_one({"id": ps["wordpress_site_id"]}, {"_id": 0})
            ps["wordpress_site_name"] = site["name"] if site else "Unknown"
        
        item["publish_statuses"] = publish_statuses
        result.append(item)
    
    return result

@content_router.post("", response_model=ContentItemResponse, status_code=status.HTTP_201_CREATED)
async def create_content_item(
    content_data: ContentItemCreate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Create a new content item."""
    content_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    content_doc = {
        "id": content_id,
        "title": content_data.title,
        "type": content_data.type,
        "body": content_data.body or "",
        "excerpt": content_data.excerpt or "",
        "external_url": content_data.external_url or "",
        "tags": content_data.tags or [],
        "status": content_data.status,
        "team_id": current_user.get('team_id', ''),
        "created_by": current_user['id'],
        "created_at": now,
        "updated_at": now
    }
    
    await db.content_items.insert_one(content_doc)
    content_doc.pop('_id', None)
    content_doc["publish_statuses"] = []
    return content_doc

@content_router.get("/{content_id}", response_model=ContentItemResponse)
async def get_content_item(
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single content item."""
    content = await get_content_with_publish_statuses(content_id, current_user.get('team_id'))
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    return content

@content_router.put("/{content_id}", response_model=ContentItemResponse)
async def update_content_item(
    content_id: str,
    content_data: ContentItemUpdate,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update a content item."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    update_dict = {k: v for k, v in content_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.content_items.update_one(
        {"id": content_id},
        {"$set": update_dict}
    )
    
    return await get_content_with_publish_statuses(content_id, current_user.get('team_id'))

@content_router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content_item(
    content_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a content item."""
    result = await db.content_items.delete_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    # Remove publish records
    await db.content_item_publishes.delete_many({"content_item_id": content_id})
    
    # Remove content from any rundown items
    await db.rundown_items.update_many(
        {"content_ids": content_id},
        {"$pull": {"content_ids": content_id}}
    )

# ============== WORDPRESS SITES ROUTES (Multi-site) ==============

@wordpress_router.get("/sites", response_model=List[WordPressSiteResponse])
async def get_wordpress_sites(
    current_user: dict = Depends(get_current_user)
):
    """Get all WordPress sites for the team."""
    sites = await db.wordpress_sites.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0, "app_password": 0}
    ).to_list(100)
    return sites

@wordpress_router.get("/sites/{site_id}", response_model=WordPressSiteResponse)
async def get_wordpress_site(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single WordPress site."""
    site = await db.wordpress_sites.find_one(
        {"id": site_id, "team_id": current_user.get('team_id')},
        {"_id": 0, "app_password": 0}
    )
    if not site:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    return site

@wordpress_router.post("/sites", response_model=WordPressSiteResponse, status_code=status.HTTP_201_CREATED)
async def create_wordpress_site(
    site_data: WordPressSiteCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new WordPress site connection (admin only)."""
    site_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    site_doc = {
        "id": site_id,
        "team_id": current_user.get('team_id'),
        "name": site_data.name,
        "wp_base_url": site_data.wp_base_url.rstrip('/'),
        "username": site_data.username,
        "app_password": site_data.app_password,
        "default_post_type": site_data.default_post_type,
        "default_publish_status": site_data.default_publish_status,
        "is_active": site_data.is_active,
        "created_at": now,
        "updated_at": now
    }
    
    await db.wordpress_sites.insert_one(site_doc)
    
    # Return without password
    del site_doc["app_password"]
    site_doc.pop("_id", None)
    return site_doc

@wordpress_router.put("/sites/{site_id}", response_model=WordPressSiteResponse)
async def update_wordpress_site(
    site_id: str,
    site_data: WordPressSiteUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a WordPress site connection (admin only)."""
    site = await db.wordpress_sites.find_one(
        {"id": site_id, "team_id": current_user.get('team_id')}
    )
    if not site:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    
    update_dict = {k: v for k, v in site_data.model_dump().items() if v is not None}
    if "wp_base_url" in update_dict:
        update_dict["wp_base_url"] = update_dict["wp_base_url"].rstrip('/')
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.wordpress_sites.update_one(
        {"id": site_id},
        {"$set": update_dict}
    )
    
    updated_site = await db.wordpress_sites.find_one(
        {"id": site_id},
        {"_id": 0, "app_password": 0}
    )
    return updated_site

@wordpress_router.delete("/sites/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wordpress_site(
    site_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a WordPress site connection (admin only)."""
    result = await db.wordpress_sites.delete_one(
        {"id": site_id, "team_id": current_user.get('team_id')}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    
    # Remove all publish records for this site
    await db.content_item_publishes.delete_many({"wordpress_site_id": site_id})

@wordpress_router.post("/sites/{site_id}/test")
async def test_wordpress_site(
    site_id: str,
    current_user: dict = Depends(require_admin)
):
    """Test a WordPress site connection (admin only)."""
    site = await db.wordpress_sites.find_one(
        {"id": site_id, "team_id": current_user.get('team_id')}
    )
    if not site:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            auth_string = f"{site['username']}:{site['app_password']}"
            auth_bytes = base64.b64encode(auth_string.encode()).decode()
            headers = {"Authorization": f"Basic {auth_bytes}"}
            
            response = await client.get(
                f"{site['wp_base_url']}/wp-json/wp/v2/users/me",
                headers=headers
            )
            
            if response.status_code == 200:
                user_data = response.json()
                return {
                    "success": True,
                    "message": f"Connected as {user_data.get('name', 'Unknown')}",
                    "wp_user": user_data.get('name')
                }
            else:
                return {
                    "success": False,
                    "message": f"Authentication failed: {response.status_code}",
                    "error": response.text[:200]
                }
    except httpx.TimeoutException:
        return {"success": False, "message": "Connection timed out"}
    except Exception as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}

# ============== MULTI-SITE PUBLISH TO WORDPRESS ==============

@content_router.post("/{content_id}/publish", response_model=PublishResponse)
async def publish_to_wordpress(
    content_id: str,
    publish_data: PublishToWordPressRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Publish content item to one or more WordPress sites."""
    # Get content item
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    results = []
    
    for target in publish_data.targets:
        # Get WordPress site
        site = await db.wordpress_sites.find_one(
            {"id": target.site_id, "team_id": current_user.get('team_id')}
        )
        if not site:
            results.append(PublishResult(
                site_id=target.site_id,
                site_name="Unknown",
                success=False,
                message="WordPress site not found"
            ))
            continue
        
        if not site.get('is_active', True):
            results.append(PublishResult(
                site_id=target.site_id,
                site_name=site['name'],
                success=False,
                message="WordPress site is inactive"
            ))
            continue
        
        # Get or create publish record for this site
        publish_record = await db.content_item_publishes.find_one({
            "content_item_id": content_id,
            "wordpress_site_id": target.site_id
        })
        
        now = datetime.now(timezone.utc).isoformat()
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                auth_string = f"{site['username']}:{site['app_password']}"
                auth_bytes = base64.b64encode(auth_string.encode()).decode()
                headers = {
                    "Authorization": f"Basic {auth_bytes}",
                    "Content-Type": "application/json"
                }
                
                # Prepare content body
                body = content.get('body', '')
                if content.get('type') == 'link' and content.get('external_url'):
                    body = f'<p><a href="{content["external_url"]}" target="_blank">{content["external_url"]}</a></p>\n\n{body}'
                
                # Prepare WP post data
                wp_data = {
                    "title": content['title'],
                    "content": body,
                    "status": target.wp_status
                }
                
                if content.get('excerpt'):
                    wp_data["excerpt"] = content['excerpt']
                
                endpoint = f"{site['wp_base_url']}/wp-json/wp/v2/{target.post_type}s"
                
                # Check if updating existing or creating new
                wp_post_id = publish_record.get('wp_post_id') if publish_record else None
                
                if wp_post_id:
                    response = await client.post(
                        f"{endpoint}/{wp_post_id}",
                        headers=headers,
                        json=wp_data
                    )
                else:
                    response = await client.post(
                        endpoint,
                        headers=headers,
                        json=wp_data
                    )
                
                if response.status_code in [200, 201]:
                    wp_response = response.json()
                    
                    # Update or create publish record
                    publish_doc = {
                        "content_item_id": content_id,
                        "wordpress_site_id": target.site_id,
                        "wp_post_id": wp_response.get('id'),
                        "wp_post_type": target.post_type,
                        "wp_status": wp_response.get('status'),
                        "wp_permalink": wp_response.get('link'),
                        "sync_status": "synced",
                        "sync_error_message": None,
                        "last_synced_at": now,
                        "updated_at": now
                    }
                    
                    if publish_record:
                        await db.content_item_publishes.update_one(
                            {"id": publish_record['id']},
                            {"$set": publish_doc}
                        )
                    else:
                        publish_doc["id"] = str(uuid.uuid4())
                        publish_doc["created_at"] = now
                        await db.content_item_publishes.insert_one(publish_doc)
                    
                    results.append(PublishResult(
                        site_id=target.site_id,
                        site_name=site['name'],
                        success=True,
                        message="Published successfully",
                        wp_post_id=wp_response.get('id'),
                        wp_permalink=wp_response.get('link')
                    ))
                else:
                    error_msg = response.text[:200]
                    
                    # Update publish record with error
                    publish_doc = {
                        "content_item_id": content_id,
                        "wordpress_site_id": target.site_id,
                        "wp_post_type": target.post_type,
                        "wp_status": target.wp_status,
                        "sync_status": "failed",
                        "sync_error_message": f"HTTP {response.status_code}: {error_msg}",
                        "last_synced_at": now,
                        "updated_at": now
                    }
                    
                    if publish_record:
                        await db.content_item_publishes.update_one(
                            {"id": publish_record['id']},
                            {"$set": publish_doc}
                        )
                    else:
                        publish_doc["id"] = str(uuid.uuid4())
                        publish_doc["created_at"] = now
                        publish_doc["wp_post_id"] = None
                        publish_doc["wp_permalink"] = None
                        await db.content_item_publishes.insert_one(publish_doc)
                    
                    results.append(PublishResult(
                        site_id=target.site_id,
                        site_name=site['name'],
                        success=False,
                        message=f"HTTP {response.status_code}: {error_msg}"
                    ))
                    
        except Exception as e:
            # Update publish record with error
            publish_doc = {
                "content_item_id": content_id,
                "wordpress_site_id": target.site_id,
                "wp_post_type": target.post_type,
                "wp_status": target.wp_status,
                "sync_status": "failed",
                "sync_error_message": str(e),
                "last_synced_at": now,
                "updated_at": now
            }
            
            if publish_record:
                await db.content_item_publishes.update_one(
                    {"id": publish_record['id']},
                    {"$set": publish_doc}
                )
            else:
                publish_doc["id"] = str(uuid.uuid4())
                publish_doc["created_at"] = now
                publish_doc["wp_post_id"] = None
                publish_doc["wp_permalink"] = None
                await db.content_item_publishes.insert_one(publish_doc)
            
            results.append(PublishResult(
                site_id=target.site_id,
                site_name=site['name'],
                success=False,
                message=str(e)
            ))
    
    return PublishResponse(results=results)

# Get publish status for a content item on a specific site
@content_router.get("/{content_id}/publish/{site_id}")
async def get_publish_status(
    content_id: str,
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get publish status for a content item on a specific site."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    publish_record = await db.content_item_publishes.find_one(
        {"content_item_id": content_id, "wordpress_site_id": site_id},
        {"_id": 0}
    )
    
    if not publish_record:
        return {"sync_status": "not_synced"}
    
    site = await db.wordpress_sites.find_one({"id": site_id}, {"_id": 0})
    publish_record["wordpress_site_name"] = site["name"] if site else "Unknown"
    
    return publish_record

# ============== LEGACY MIGRATION ENDPOINT (for backward compatibility) ==============

@wordpress_router.get("/connection")
async def get_legacy_connection(
    current_user: dict = Depends(get_current_user)
):
    """Legacy endpoint - returns first active site if exists."""
    site = await db.wordpress_sites.find_one(
        {"team_id": current_user.get('team_id'), "is_active": True},
        {"_id": 0, "app_password": 0}
    )
    if site:
        # Transform to old format
        return {
            "id": site["id"],
            "team_id": site["team_id"],
            "wp_base_url": site["wp_base_url"],
            "username": site["username"],
            "default_post_type": site["default_post_type"],
            "default_status": site["default_publish_status"],
            "created_at": site["created_at"],
            "updated_at": site["updated_at"]
        }
    return None

# ============== HEALTH CHECK ==============

@api_router.get("/")
async def root():
    return {"message": "Radio Show Planner API", "status": "running"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

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

# Include routers
api_router.include_router(auth_router)
api_router.include_router(shows_router)
api_router.include_router(teams_router)
api_router.include_router(users_router)
api_router.include_router(content_router)
api_router.include_router(wordpress_router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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
