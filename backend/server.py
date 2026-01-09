from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import PlainTextResponse, FileResponse
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
import aiofiles
import mimetypes

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create uploads directories
UPLOADS_DIR = ROOT_DIR / 'uploads' / 'featured_images'
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MEDIA_UPLOADS_DIR = ROOT_DIR / 'uploads' / 'media'
MEDIA_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

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
chat_router = APIRouter(prefix="/chat", tags=["Chat"])
media_router = APIRouter(prefix="/media", tags=["Media Library"])
series_router = APIRouter(prefix="/series", tags=["Show Series"])
occurrences_router = APIRouter(prefix="/occurrences", tags=["Show Occurrences"])

security = HTTPBearer()

# Role definitions - Added 'presenter' role
ROLES = ["admin", "editor", "presenter", "viewer"]

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
    role: Literal["admin", "editor", "presenter", "viewer"] = "editor"

class UpdateUserRoleRequest(BaseModel):
    role: Literal["admin", "editor", "presenter", "viewer"]

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
    # Per-site publish statuses with featured images
    publish_statuses: List["ContentPublishStatusWithImage"] = []

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

# Featured Image Model (per content item per WordPress site)
class FeaturedImageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    content_item_id: str
    wordpress_site_id: str
    wordpress_site_name: Optional[str] = None
    file_storage_key: str
    file_name: str
    mime_type: str
    size: int
    wp_media_id: Optional[int] = None
    wp_media_url: Optional[str] = None
    sync_status: str = "not_synced"
    sync_error_message: Optional[str] = None
    last_synced_at: Optional[str] = None
    created_at: str
    updated_at: str

# Extended publish status with featured image info
class ContentPublishStatusWithImage(ContentPublishStatus):
    featured_image: Optional[FeaturedImageResponse] = None

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

# ============== MVP 4 MODELS ==============

# Show Assignment Models (Permissions)
class ShowAssignmentCreate(BaseModel):
    show_id: str
    user_id: str
    role_on_show: Literal["editor", "presenter"] = "editor"

class ShowAssignmentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    show_id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    role_on_show: str
    created_at: str

# Show Series Models (Recurring Shows)
class ShowSeriesCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    default_start_time: str
    default_end_time: str
    recurrence_rule: Optional[str] = None  # RRULE string or "none" for one-off (legacy)
    is_active: bool = True
    # New fields for enhanced recurrence (Step 4.1a)
    recurrence_type: Optional[Literal["none", "weekly"]] = "weekly"
    start_date: Optional[str] = None  # Required in UI for new series
    end_date: Optional[str] = None  # Optional end date
    interval_weeks: Optional[int] = 1  # Every N weeks
    days_of_week: Optional[List[int]] = None  # 0=Mon, 1=Tue, ..., 6=Sun

class ShowSeriesUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    default_start_time: Optional[str] = None
    default_end_time: Optional[str] = None
    recurrence_rule: Optional[str] = None
    is_active: Optional[bool] = None
    # New fields for enhanced recurrence (Step 4.1a)
    recurrence_type: Optional[Literal["none", "weekly"]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    interval_weeks: Optional[int] = None
    days_of_week: Optional[List[int]] = None

class ShowSeriesResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    title: str
    description: str
    default_start_time: str
    default_end_time: str
    recurrence_rule: Optional[str] = None
    is_active: bool
    created_by: str
    created_at: str
    updated_at: str
    # New fields for enhanced recurrence (Step 4.1a)
    recurrence_type: Optional[str] = "weekly"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    interval_weeks: Optional[int] = 1
    days_of_week: Optional[List[int]] = None

# Show Occurrence Models
class ShowOccurrenceCreate(BaseModel):
    show_series_id: Optional[str] = None  # nullable for one-off shows
    title: str
    date: str
    start_time: str
    end_time: str
    status: Literal["draft", "scheduled", "completed"] = "draft"

class ShowOccurrenceUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[Literal["draft", "scheduled", "completed"]] = None

class ShowOccurrenceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    show_series_id: Optional[str] = None
    title: str
    date: str
    start_time: str
    end_time: str
    status: str
    rundown_id: Optional[str] = None
    created_at: str
    updated_at: str

# New Rundown Model (linked to occurrences)
class RundownResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    occurrence_id: str
    created_at: str
    updated_at: str

# Chat Models
class ChatThreadCreate(BaseModel):
    type: Literal["team", "show"] = "team"
    show_id: Optional[str] = None  # Only for show type threads

class ChatThreadResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    type: str
    show_id: Optional[str] = None
    show_title: Optional[str] = None
    created_by: str
    created_at: str
    updated_at: str
    last_message: Optional[str] = None
    last_message_at: Optional[str] = None

class ChatMessageCreate(BaseModel):
    body: str

class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    thread_id: str
    user_id: str
    user_name: Optional[str] = None
    body: str
    created_at: str

# Media Library Models
class MediaAssetResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    uploaded_by: str
    uploaded_by_name: Optional[str] = None
    kind: str
    title: str
    file_storage_key: str
    original_filename: str
    mime_type: str
    size: int
    duration_seconds: Optional[float] = None
    created_at: str
    updated_at: str

class MediaAssetUpdate(BaseModel):
    title: Optional[str] = None

# Show Media Attachment Models
class AttachMediaRequest(BaseModel):
    media_asset_ids: List[str]

class ShowMediaResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    show_id: Optional[str] = None
    occurrence_id: Optional[str] = None
    media_asset_id: str
    media_asset: Optional[MediaAssetResponse] = None
    created_at: str

class RundownItemMediaResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    rundown_item_id: str
    media_asset_id: str
    media_asset: Optional[MediaAssetResponse] = None
    created_at: str

# Occurrence Generation Request
class GenerateOccurrencesRequest(BaseModel):
    weeks_ahead: int = 8  # Generate occurrences for the next N weeks

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

async def require_can_edit_content(current_user: dict = Depends(get_current_user)):
    """Editors, Presenters, and Admins can manage content/media."""
    if current_user.get('role') not in ['admin', 'editor', 'presenter']:
        raise HTTPException(status_code=403, detail="Content editing access required")
    return current_user

async def check_show_assignment(show_id: str, user: dict) -> bool:
    """Check if user is assigned to a show (legacy shows model)."""
    if user.get('role') == 'admin':
        return True
    assignment = await db.show_assignments.find_one({
        "show_id": show_id,
        "user_id": user['id']
    })
    return assignment is not None

async def check_occurrence_assignment(occurrence_id: str, user: dict) -> bool:
    """Check if user is assigned to an occurrence's series or the occurrence itself."""
    if user.get('role') == 'admin':
        return True
    
    occurrence = await db.show_occurrences.find_one({"id": occurrence_id})
    if not occurrence:
        return False
    
    # Check series assignment if occurrence belongs to a series
    if occurrence.get('show_series_id'):
        series_assignment = await db.series_assignments.find_one({
            "series_id": occurrence['show_series_id'],
            "user_id": user['id']
        })
        if series_assignment:
            return True
    
    # Check direct occurrence assignment
    occ_assignment = await db.occurrence_assignments.find_one({
        "occurrence_id": occurrence_id,
        "user_id": user['id']
    })
    return occ_assignment is not None

def parse_rrule(rrule_string: str, start_date: str, weeks_ahead: int = 8) -> List[str]:
    """Parse RRULE string and generate dates for the next N weeks.
    Supports: FREQ=DAILY, FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU
    """
    from datetime import timedelta
    
    dates = []
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end_date = start + timedelta(weeks=weeks_ahead)
    
    if not rrule_string or rrule_string.lower() == 'none':
        # One-off show - just the start date
        return [start_date]
    
    parts = dict(item.split('=') for item in rrule_string.split(';') if '=' in item)
    freq = parts.get('FREQ', 'WEEKLY')
    
    if freq == 'DAILY':
        current = start
        while current <= end_date:
            dates.append(current.strftime('%Y-%m-%d'))
            current += timedelta(days=1)
    elif freq == 'WEEKLY':
        byday = parts.get('BYDAY', 'MO,TU,WE,TH,FR,SA,SU').split(',')
        day_map = {'MO': 0, 'TU': 1, 'WE': 2, 'TH': 3, 'FR': 4, 'SA': 5, 'SU': 6}
        target_days = [day_map.get(d.strip(), 0) for d in byday]
        
        current = start
        while current <= end_date:
            if current.weekday() in target_days:
                dates.append(current.strftime('%Y-%m-%d'))
            current += timedelta(days=1)
    
    return dates

def generate_dates_from_recurrence(
    recurrence_type: str,
    start_date: str,
    end_date: Optional[str],
    interval_weeks: int,
    days_of_week: List[int],
    weeks_ahead: int = 12
) -> List[str]:
    """
    Generate occurrence dates based on enhanced recurrence settings.
    
    Args:
        recurrence_type: 'none' or 'weekly'
        start_date: Start date in YYYY-MM-DD format
        end_date: Optional end date in YYYY-MM-DD format
        interval_weeks: Generate every N weeks (1, 2, etc.)
        days_of_week: List of weekday indices (0=Mon, 1=Tue, ..., 6=Sun)
        weeks_ahead: Default weeks to generate if no end_date
    
    Returns:
        List of date strings in YYYY-MM-DD format
    """
    from datetime import timedelta
    
    dates = []
    start = datetime.strptime(start_date, '%Y-%m-%d')
    
    if recurrence_type == 'none' or not days_of_week:
        # One-off show - just the start date
        return [start_date]
    
    # Calculate end boundary
    if end_date:
        end = datetime.strptime(end_date, '%Y-%m-%d')
    else:
        end = start + timedelta(weeks=weeks_ahead)
    
    # Find the week number of start date
    current = start
    week_count = 0
    last_week_start = start - timedelta(days=start.weekday())  # Monday of start week
    
    while current <= end:
        # Check if we're in a valid interval week
        current_week_start = current - timedelta(days=current.weekday())
        weeks_since_start = (current_week_start - last_week_start).days // 7
        
        # Only include dates in valid interval weeks
        if weeks_since_start % interval_weeks == 0:
            if current.weekday() in days_of_week and current >= start:
                dates.append(current.strftime('%Y-%m-%d'))
        
        current += timedelta(days=1)
    
    return dates

async def get_content_with_publish_statuses(content_id: str, team_id: str) -> dict:
    """Get content item with all publish statuses and featured images."""
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
    
    # Add site names and featured images to publish statuses
    for ps in publish_statuses:
        site = await db.wordpress_sites.find_one({"id": ps["wordpress_site_id"]}, {"_id": 0})
        ps["wordpress_site_name"] = site["name"] if site else "Unknown"
        
        # Get featured image for this content + site combination
        featured_image = await db.content_item_featured_images.find_one(
            {"content_item_id": content_id, "wordpress_site_id": ps["wordpress_site_id"]},
            {"_id": 0}
        )
        if featured_image:
            featured_image["wordpress_site_name"] = ps["wordpress_site_name"]
        ps["featured_image"] = featured_image
    
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
    
    # Remove featured images and their files
    featured_images = await db.content_item_featured_images.find(
        {"content_item_id": content_id}
    ).to_list(100)
    for img in featured_images:
        file_path = UPLOADS_DIR / img.get("file_storage_key", "")
        if file_path.exists():
            file_path.unlink()
    await db.content_item_featured_images.delete_many({"content_item_id": content_id})
    
    # Remove content from any rundown items
    await db.rundown_items.update_many(
        {"content_ids": content_id},
        {"$pull": {"content_ids": content_id}}
    )

# ============== FEATURED IMAGE ROUTES ==============

@content_router.get("/{content_id}/featured-images", response_model=List[FeaturedImageResponse])
async def get_featured_images(
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all featured images for a content item."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    images = await db.content_item_featured_images.find(
        {"content_item_id": content_id},
        {"_id": 0}
    ).to_list(100)
    
    # Add site names
    for img in images:
        site = await db.wordpress_sites.find_one({"id": img["wordpress_site_id"]}, {"_id": 0})
        img["wordpress_site_name"] = site["name"] if site else "Unknown"
    
    return images

@content_router.post("/{content_id}/featured-images/{site_id}", response_model=FeaturedImageResponse)
async def upload_featured_image(
    content_id: str,
    site_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Upload a featured image for a specific WordPress site."""
    # Verify content exists and belongs to team
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    # Verify site exists and belongs to team
    site = await db.wordpress_sites.find_one(
        {"id": site_id, "team_id": current_user.get('team_id')}
    )
    if not site:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    if content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}")
    
    # Check if image already exists for this content + site - delete old one
    existing = await db.content_item_featured_images.find_one({
        "content_item_id": content_id,
        "wordpress_site_id": site_id
    })
    if existing:
        old_file = UPLOADS_DIR / existing.get("file_storage_key", "")
        if old_file.exists():
            old_file.unlink()
        await db.content_item_featured_images.delete_one({"id": existing["id"]})
    
    # Generate unique filename
    file_ext = Path(file.filename).suffix or '.jpg'
    storage_key = f"{content_id}_{site_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = UPLOADS_DIR / storage_key
    
    # Save file
    file_size = 0
    async with aiofiles.open(file_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)
            file_size += len(chunk)
    
    now = datetime.now(timezone.utc).isoformat()
    image_doc = {
        "id": str(uuid.uuid4()),
        "content_item_id": content_id,
        "wordpress_site_id": site_id,
        "file_storage_key": storage_key,
        "file_name": file.filename,
        "mime_type": content_type,
        "size": file_size,
        "wp_media_id": None,
        "wp_media_url": None,
        "sync_status": "not_synced",
        "sync_error_message": None,
        "last_synced_at": None,
        "created_at": now,
        "updated_at": now
    }
    
    await db.content_item_featured_images.insert_one(image_doc)
    image_doc.pop("_id", None)
    image_doc["wordpress_site_name"] = site["name"]
    
    return image_doc

@content_router.delete("/{content_id}/featured-images/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_featured_image(
    content_id: str,
    site_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a featured image for a specific WordPress site."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    image = await db.content_item_featured_images.find_one({
        "content_item_id": content_id,
        "wordpress_site_id": site_id
    })
    if not image:
        raise HTTPException(status_code=404, detail="Featured image not found")
    
    # Delete file
    file_path = UPLOADS_DIR / image.get("file_storage_key", "")
    if file_path.exists():
        file_path.unlink()
    
    # Delete record
    await db.content_item_featured_images.delete_one({"id": image["id"]})

@api_router.get("/uploads/featured_images/{file_key}")
async def get_featured_image_file(file_key: str):
    """Serve a featured image file."""
    file_path = UPLOADS_DIR / file_key
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)

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
        
        # Get featured image for this content + site
        featured_image = await db.content_item_featured_images.find_one({
            "content_item_id": content_id,
            "wordpress_site_id": target.site_id
        })
        
        now = datetime.now(timezone.utc).isoformat()
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                auth_string = f"{site['username']}:{site['app_password']}"
                auth_bytes = base64.b64encode(auth_string.encode()).decode()
                headers = {
                    "Authorization": f"Basic {auth_bytes}",
                    "Content-Type": "application/json"
                }
                
                # Upload featured image if exists and needs syncing
                wp_media_id = None
                if featured_image:
                    file_path = UPLOADS_DIR / featured_image.get("file_storage_key", "")
                    
                    # Check if we need to upload (not synced or file changed)
                    needs_upload = (
                        featured_image.get("sync_status") != "synced" or
                        not featured_image.get("wp_media_id")
                    )
                    
                    if needs_upload and file_path.exists():
                        # Upload media to WordPress
                        async with aiofiles.open(file_path, 'rb') as f:
                            file_content = await f.read()
                        
                        media_headers = {
                            "Authorization": f"Basic {auth_bytes}",
                            "Content-Disposition": f'attachment; filename="{featured_image["file_name"]}"',
                            "Content-Type": featured_image["mime_type"]
                        }
                        
                        media_response = await client.post(
                            f"{site['wp_base_url']}/wp-json/wp/v2/media",
                            headers=media_headers,
                            content=file_content
                        )
                        
                        if media_response.status_code in [200, 201]:
                            media_data = media_response.json()
                            wp_media_id = media_data.get('id')
                            wp_media_url = media_data.get('source_url')
                            
                            # Update featured image record
                            await db.content_item_featured_images.update_one(
                                {"id": featured_image["id"]},
                                {"$set": {
                                    "wp_media_id": wp_media_id,
                                    "wp_media_url": wp_media_url,
                                    "sync_status": "synced",
                                    "sync_error_message": None,
                                    "last_synced_at": now,
                                    "updated_at": now
                                }}
                            )
                        else:
                            # Media upload failed - update record with error
                            await db.content_item_featured_images.update_one(
                                {"id": featured_image["id"]},
                                {"$set": {
                                    "sync_status": "failed",
                                    "sync_error_message": f"Media upload failed: {media_response.status_code}",
                                    "last_synced_at": now,
                                    "updated_at": now
                                }}
                            )
                    else:
                        # Use existing wp_media_id
                        wp_media_id = featured_image.get("wp_media_id")
                
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
                
                # Add featured image if available
                if wp_media_id:
                    wp_data["featured_media"] = wp_media_id
                
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

# ============== MVP 4: SHOW ASSIGNMENTS (Permissions) ==============

@shows_router.get("/{show_id}/assignments", response_model=List[ShowAssignmentResponse])
async def get_show_assignments(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all users assigned to a show."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    assignments = await db.show_assignments.find(
        {"show_id": show_id},
        {"_id": 0}
    ).to_list(100)
    
    # Add user details
    for assignment in assignments:
        user = await db.users.find_one({"id": assignment["user_id"]}, {"_id": 0})
        if user:
            assignment["user_name"] = user.get("name")
            assignment["user_email"] = user.get("email")
    
    return assignments

@shows_router.post("/{show_id}/assignments", response_model=ShowAssignmentResponse)
async def create_show_assignment(
    show_id: str,
    assignment_data: ShowAssignmentCreate,
    current_user: dict = Depends(require_admin)
):
    """Assign a user to a show (admin only)."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    # Verify user exists and is in same team
    user = await db.users.find_one(
        {"id": assignment_data.user_id, "team_id": current_user.get('team_id')}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if assignment already exists
    existing = await db.show_assignments.find_one({
        "show_id": show_id,
        "user_id": assignment_data.user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="User already assigned to this show")
    
    now = datetime.now(timezone.utc).isoformat()
    assignment_doc = {
        "id": str(uuid.uuid4()),
        "show_id": show_id,
        "user_id": assignment_data.user_id,
        "role_on_show": assignment_data.role_on_show,
        "created_at": now
    }
    
    await db.show_assignments.insert_one(assignment_doc)
    assignment_doc.pop("_id", None)
    assignment_doc["user_name"] = user.get("name")
    assignment_doc["user_email"] = user.get("email")
    
    return assignment_doc

@shows_router.delete("/{show_id}/assignments/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_show_assignment(
    show_id: str,
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """Remove a user assignment from a show (admin only)."""
    result = await db.show_assignments.delete_one({
        "show_id": show_id,
        "user_id": user_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")

# ============== MVP 4: SHOW SERIES (Recurring Shows) ==============

@series_router.get("", response_model=List[ShowSeriesResponse])
async def get_show_series(
    current_user: dict = Depends(get_current_user)
):
    """Get all show series for the team."""
    series_list = await db.show_series.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0}
    ).sort("title", 1).to_list(1000)
    return series_list

@series_router.post("", response_model=ShowSeriesResponse, status_code=status.HTTP_201_CREATED)
async def create_show_series(
    series_data: ShowSeriesCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new show series (admin only)."""
    series_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    series_doc = {
        "id": series_id,
        "team_id": current_user.get('team_id'),
        "title": series_data.title,
        "description": series_data.description or "",
        "default_start_time": series_data.default_start_time,
        "default_end_time": series_data.default_end_time,
        "recurrence_rule": series_data.recurrence_rule,
        "is_active": series_data.is_active,
        "created_by": current_user['id'],
        "created_at": now,
        "updated_at": now,
        # New fields for enhanced recurrence (Step 4.1a)
        "recurrence_type": series_data.recurrence_type or "weekly",
        "start_date": series_data.start_date,
        "end_date": series_data.end_date,
        "interval_weeks": series_data.interval_weeks or 1,
        "days_of_week": series_data.days_of_week
    }
    
    await db.show_series.insert_one(series_doc)
    series_doc.pop("_id", None)
    return series_doc

@series_router.get("/{series_id}", response_model=ShowSeriesResponse)
async def get_show_series_detail(
    series_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single show series."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    return series

@series_router.put("/{series_id}", response_model=ShowSeriesResponse)
async def update_show_series(
    series_id: str,
    series_data: ShowSeriesUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a show series (admin only)."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    update_dict = {k: v for k, v in series_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.show_series.update_one(
        {"id": series_id},
        {"$set": update_dict}
    )
    
    updated = await db.show_series.find_one({"id": series_id}, {"_id": 0})
    return updated

@series_router.delete("/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_show_series(
    series_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a show series and all its occurrences (admin only)."""
    result = await db.show_series.delete_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    # Delete all occurrences and their rundowns
    occurrences = await db.show_occurrences.find({"show_series_id": series_id}).to_list(1000)
    for occ in occurrences:
        await db.rundowns.delete_many({"occurrence_id": occ["id"]})
        await db.rundown_items_v2.delete_many({"occurrence_id": occ["id"]})
    await db.show_occurrences.delete_many({"show_series_id": series_id})
    await db.series_assignments.delete_many({"series_id": series_id})

@series_router.post("/{series_id}/generate", response_model=List[ShowOccurrenceResponse])
async def generate_occurrences(
    series_id: str,
    gen_data: GenerateOccurrencesRequest,
    current_user: dict = Depends(require_admin)
):
    """Generate occurrences for a show series (admin only)."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    # Get existing occurrences to avoid duplicates
    existing_occs = await db.show_occurrences.find(
        {"show_series_id": series_id},
        {"date": 1}
    ).to_list(1000)
    existing_dates = set(occ.get("date") for occ in existing_occs)
    
    # Check if using new enhanced recurrence fields
    days_of_week = series.get('days_of_week')
    start_date = series.get('start_date')
    recurrence_type = series.get('recurrence_type', 'weekly')
    
    if days_of_week and start_date:
        # Use new enhanced recurrence generation
        dates = generate_dates_from_recurrence(
            recurrence_type=recurrence_type,
            start_date=start_date,
            end_date=series.get('end_date'),
            interval_weeks=series.get('interval_weeks', 1),
            days_of_week=days_of_week,
            weeks_ahead=gen_data.weeks_ahead
        )
    else:
        # Fall back to legacy RRULE parsing
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        dates = parse_rrule(
            series.get('recurrence_rule', ''),
            today,
            gen_data.weeks_ahead
        )
    
    created_occurrences = []
    now = datetime.now(timezone.utc).isoformat()
    
    for date in dates:
        if date in existing_dates:
            continue  # Skip existing dates
        
        occ_id = str(uuid.uuid4())
        rundown_id = str(uuid.uuid4())
        
        occ_doc = {
            "id": occ_id,
            "team_id": current_user.get('team_id'),
            "show_series_id": series_id,
            "title": series['title'],
            "date": date,
            "start_time": series['default_start_time'],
            "end_time": series['default_end_time'],
            "status": "draft",
            "rundown_id": rundown_id,
            "created_at": now,
            "updated_at": now
        }
        
        # Create empty rundown for this occurrence
        rundown_doc = {
            "id": rundown_id,
            "occurrence_id": occ_id,
            "created_at": now,
            "updated_at": now
        }
        
        await db.show_occurrences.insert_one(occ_doc)
        await db.rundowns.insert_one(rundown_doc)
        
        occ_doc.pop("_id", None)
        created_occurrences.append(occ_doc)
    
    return created_occurrences

# Series Assignments
@series_router.get("/{series_id}/assignments", response_model=List[ShowAssignmentResponse])
async def get_series_assignments(
    series_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all users assigned to a series."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    assignments = await db.series_assignments.find(
        {"series_id": series_id},
        {"_id": 0}
    ).to_list(100)
    
    for assignment in assignments:
        user = await db.users.find_one({"id": assignment["user_id"]}, {"_id": 0})
        if user:
            assignment["user_name"] = user.get("name")
            assignment["user_email"] = user.get("email")
        assignment["show_id"] = series_id  # For compatibility with ShowAssignmentResponse
    
    return assignments

@series_router.post("/{series_id}/assignments", response_model=ShowAssignmentResponse)
async def create_series_assignment(
    series_id: str,
    assignment_data: ShowAssignmentCreate,
    current_user: dict = Depends(require_admin)
):
    """Assign a user to a series (admin only)."""
    series = await db.show_series.find_one(
        {"id": series_id, "team_id": current_user.get('team_id')}
    )
    if not series:
        raise HTTPException(status_code=404, detail="Show series not found")
    
    user = await db.users.find_one(
        {"id": assignment_data.user_id, "team_id": current_user.get('team_id')}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    existing = await db.series_assignments.find_one({
        "series_id": series_id,
        "user_id": assignment_data.user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="User already assigned to this series")
    
    now = datetime.now(timezone.utc).isoformat()
    assignment_doc = {
        "id": str(uuid.uuid4()),
        "series_id": series_id,
        "user_id": assignment_data.user_id,
        "role_on_show": assignment_data.role_on_show,
        "created_at": now
    }
    
    await db.series_assignments.insert_one(assignment_doc)
    assignment_doc.pop("_id", None)
    assignment_doc["show_id"] = series_id
    assignment_doc["user_name"] = user.get("name")
    assignment_doc["user_email"] = user.get("email")
    
    return assignment_doc

@series_router.delete("/{series_id}/assignments/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_series_assignment(
    series_id: str,
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """Remove a user assignment from a series (admin only)."""
    result = await db.series_assignments.delete_one({
        "series_id": series_id,
        "user_id": user_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")

# ============== MVP 4: SHOW OCCURRENCES ==============

@occurrences_router.get("", response_model=List[ShowOccurrenceResponse])
async def get_occurrences(
    series_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get show occurrences with optional filters."""
    query = {"team_id": current_user.get('team_id')}
    
    if series_id:
        query["show_series_id"] = series_id
    if status:
        query["status"] = status
    if date_from:
        query["date"] = {"$gte": date_from}
    if date_to:
        if "date" in query:
            query["date"]["$lte"] = date_to
        else:
            query["date"] = {"$lte": date_to}
    
    # For non-admins, filter by assignments
    if current_user.get('role') not in ['admin']:
        # Get series IDs user is assigned to
        user_series = await db.series_assignments.find(
            {"user_id": current_user['id']},
            {"series_id": 1}
        ).to_list(100)
        series_ids = [s['series_id'] for s in user_series]
        
        # Get occurrence IDs user is directly assigned to
        user_occs = await db.occurrence_assignments.find(
            {"user_id": current_user['id']},
            {"occurrence_id": 1}
        ).to_list(100)
        occ_ids = [o['occurrence_id'] for o in user_occs]
        
        query["$or"] = [
            {"show_series_id": {"$in": series_ids}},
            {"id": {"$in": occ_ids}}
        ]
    
    occurrences = await db.show_occurrences.find(
        query,
        {"_id": 0}
    ).sort("date", 1).to_list(1000)
    
    return occurrences

@occurrences_router.post("", response_model=ShowOccurrenceResponse, status_code=status.HTTP_201_CREATED)
async def create_occurrence(
    occ_data: ShowOccurrenceCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a one-off show occurrence (admin only)."""
    occ_id = str(uuid.uuid4())
    rundown_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    occ_doc = {
        "id": occ_id,
        "team_id": current_user.get('team_id'),
        "show_series_id": occ_data.show_series_id,
        "title": occ_data.title,
        "date": occ_data.date,
        "start_time": occ_data.start_time,
        "end_time": occ_data.end_time,
        "status": occ_data.status,
        "rundown_id": rundown_id,
        "created_at": now,
        "updated_at": now
    }
    
    rundown_doc = {
        "id": rundown_id,
        "occurrence_id": occ_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.show_occurrences.insert_one(occ_doc)
    await db.rundowns.insert_one(rundown_doc)
    
    occ_doc.pop("_id", None)
    return occ_doc

@occurrences_router.get("/{occurrence_id}", response_model=ShowOccurrenceResponse)
async def get_occurrence(
    occurrence_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    return occurrence

@occurrences_router.put("/{occurrence_id}", response_model=ShowOccurrenceResponse)
async def update_occurrence(
    occurrence_id: str,
    occ_data: ShowOccurrenceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an occurrence. Admins can edit any, others need assignment."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    # Check permission
    if current_user.get('role') != 'admin':
        has_access = await check_occurrence_assignment(occurrence_id, current_user)
        if not has_access:
            raise HTTPException(status_code=403, detail="Not assigned to this occurrence")
    
    update_dict = {k: v for k, v in occ_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.show_occurrences.update_one(
        {"id": occurrence_id},
        {"$set": update_dict}
    )
    
    updated = await db.show_occurrences.find_one({"id": occurrence_id}, {"_id": 0})
    return updated

@occurrences_router.delete("/{occurrence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_occurrence(
    occurrence_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete an occurrence (admin only)."""
    result = await db.show_occurrences.delete_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    await db.rundowns.delete_many({"occurrence_id": occurrence_id})
    await db.rundown_items_v2.delete_many({"occurrence_id": occurrence_id})
    await db.occurrence_assignments.delete_many({"occurrence_id": occurrence_id})

# Occurrence Rundown Items
@occurrences_router.get("/{occurrence_id}/rundown", response_model=List[RundownItemResponse])
async def get_occurrence_rundown(
    occurrence_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get rundown items for an occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    items = await db.rundown_items_v2.find(
        {"occurrence_id": occurrence_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    
    # Map to RundownItemResponse format
    for item in items:
        item["show_id"] = occurrence_id  # For compatibility
    
    return items

@occurrences_router.post("/{occurrence_id}/rundown", response_model=RundownItemResponse, status_code=status.HTTP_201_CREATED)
async def create_occurrence_rundown_item(
    occurrence_id: str,
    item_data: RundownItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a rundown item to an occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    # Check permission
    if current_user.get('role') != 'admin':
        has_access = await check_occurrence_assignment(occurrence_id, current_user)
        if not has_access:
            raise HTTPException(status_code=403, detail="Not assigned to this occurrence")
    
    last_item = await db.rundown_items_v2.find_one(
        {"occurrence_id": occurrence_id},
        sort=[("order", -1)]
    )
    next_order = (last_item['order'] + 1) if last_item else 0
    
    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    item_doc = {
        "id": item_id,
        "occurrence_id": occurrence_id,
        "show_id": occurrence_id,
        "type": item_data.type,
        "title": item_data.title,
        "notes": item_data.notes or "",
        "duration": item_data.duration or "",
        "order": next_order,
        "created_at": now
    }
    
    await db.rundown_items_v2.insert_one(item_doc)
    item_doc.pop("_id", None)
    return item_doc

@occurrences_router.put("/{occurrence_id}/rundown/reorder", response_model=List[RundownItemResponse])
async def reorder_occurrence_rundown(
    occurrence_id: str,
    reorder_data: ReorderRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder rundown items for an occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    if current_user.get('role') != 'admin':
        has_access = await check_occurrence_assignment(occurrence_id, current_user)
        if not has_access:
            raise HTTPException(status_code=403, detail="Not assigned to this occurrence")
    
    for index, item_id in enumerate(reorder_data.item_ids):
        await db.rundown_items_v2.update_one(
            {"id": item_id, "occurrence_id": occurrence_id},
            {"$set": {"order": index}}
        )
    
    items = await db.rundown_items_v2.find(
        {"occurrence_id": occurrence_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    
    for item in items:
        item["show_id"] = occurrence_id
    
    return items

@occurrences_router.put("/{occurrence_id}/rundown/{item_id}", response_model=RundownItemResponse)
async def update_occurrence_rundown_item(
    occurrence_id: str,
    item_id: str,
    item_data: RundownItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a rundown item in an occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    if current_user.get('role') != 'admin':
        has_access = await check_occurrence_assignment(occurrence_id, current_user)
        if not has_access:
            raise HTTPException(status_code=403, detail="Not assigned to this occurrence")
    
    item = await db.rundown_items_v2.find_one({"id": item_id, "occurrence_id": occurrence_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_dict = {k: v for k, v in item_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.rundown_items_v2.update_one(
            {"id": item_id},
            {"$set": update_dict}
        )
    
    updated_item = await db.rundown_items_v2.find_one({"id": item_id}, {"_id": 0})
    updated_item["show_id"] = occurrence_id
    return updated_item

@occurrences_router.delete("/{occurrence_id}/rundown/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_occurrence_rundown_item(
    occurrence_id: str,
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a rundown item from an occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    if current_user.get('role') != 'admin':
        has_access = await check_occurrence_assignment(occurrence_id, current_user)
        if not has_access:
            raise HTTPException(status_code=403, detail="Not assigned to this occurrence")
    
    result = await db.rundown_items_v2.delete_one({"id": item_id, "occurrence_id": occurrence_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")

# ============== MVP 4: CHAT SYSTEM ==============

@chat_router.get("/threads", response_model=List[ChatThreadResponse])
async def get_chat_threads(
    current_user: dict = Depends(get_current_user)
):
    """Get all chat threads for the team."""
    threads = await db.chat_threads.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    
    # Add show titles and last message info
    for thread in threads:
        if thread.get("show_id"):
            show = await db.shows.find_one({"id": thread["show_id"]}, {"title": 1})
            thread["show_title"] = show.get("title") if show else None
        
        # Get last message
        last_msg = await db.chat_messages.find_one(
            {"thread_id": thread["id"]},
            {"body": 1, "created_at": 1},
            sort=[("created_at", -1)]
        )
        if last_msg:
            thread["last_message"] = last_msg.get("body", "")[:100]
            thread["last_message_at"] = last_msg.get("created_at")
    
    return threads

@chat_router.get("/threads/team", response_model=ChatThreadResponse)
async def get_or_create_team_thread(
    current_user: dict = Depends(get_current_user)
):
    """Get or create the default team chat thread."""
    thread = await db.chat_threads.find_one(
        {"team_id": current_user.get('team_id'), "type": "team"},
        {"_id": 0}
    )
    
    if not thread:
        # Create default team thread
        now = datetime.now(timezone.utc).isoformat()
        thread = {
            "id": str(uuid.uuid4()),
            "team_id": current_user.get('team_id'),
            "type": "team",
            "show_id": None,
            "created_by": current_user['id'],
            "created_at": now,
            "updated_at": now
        }
        await db.chat_threads.insert_one(thread)
        thread.pop("_id", None)
    
    return thread

@chat_router.post("/threads", response_model=ChatThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_thread(
    thread_data: ChatThreadCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new chat thread (show-specific)."""
    if thread_data.type == "team":
        # Team thread - get or create
        return await get_or_create_team_thread(current_user)
    
    # Show thread - verify show exists
    if thread_data.show_id:
        show = await db.shows.find_one(
            {"id": thread_data.show_id, "team_id": current_user.get('team_id')}
        )
        if not show:
            raise HTTPException(status_code=404, detail="Show not found")
        
        # Check if thread already exists for this show
        existing = await db.chat_threads.find_one({
            "show_id": thread_data.show_id,
            "type": "show"
        })
        if existing:
            existing.pop("_id", None)
            existing["show_title"] = show.get("title")
            return existing
    
    now = datetime.now(timezone.utc).isoformat()
    thread_doc = {
        "id": str(uuid.uuid4()),
        "team_id": current_user.get('team_id'),
        "type": thread_data.type,
        "show_id": thread_data.show_id,
        "created_by": current_user['id'],
        "created_at": now,
        "updated_at": now
    }
    
    await db.chat_threads.insert_one(thread_doc)
    thread_doc.pop("_id", None)
    return thread_doc

@chat_router.get("/threads/{thread_id}/messages", response_model=List[ChatMessageResponse])
async def get_thread_messages(
    thread_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get messages in a thread."""
    thread = await db.chat_threads.find_one(
        {"id": thread_id, "team_id": current_user.get('team_id')}
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    query = {"thread_id": thread_id}
    if before:
        query["created_at"] = {"$lt": before}
    
    messages = await db.chat_messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Add user names
    for msg in messages:
        user = await db.users.find_one({"id": msg["user_id"]}, {"name": 1})
        msg["user_name"] = user.get("name") if user else "Unknown"
    
    # Return in chronological order
    messages.reverse()
    return messages

@chat_router.post("/threads/{thread_id}/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    thread_id: str,
    message_data: ChatMessageCreate,
    current_user: dict = Depends(get_current_user)
):
    """Send a message to a thread."""
    thread = await db.chat_threads.find_one(
        {"id": thread_id, "team_id": current_user.get('team_id')}
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    now = datetime.now(timezone.utc).isoformat()
    message_doc = {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "user_id": current_user['id'],
        "body": message_data.body,
        "created_at": now
    }
    
    await db.chat_messages.insert_one(message_doc)
    
    # Update thread's updated_at
    await db.chat_threads.update_one(
        {"id": thread_id},
        {"$set": {"updated_at": now}}
    )
    
    message_doc.pop("_id", None)
    message_doc["user_name"] = current_user.get("name")
    return message_doc

# ============== MVP 4: MEDIA LIBRARY ==============

# Allowed file types
ALLOWED_DOCUMENT_TYPES = {
    'application/pdf': 'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
    'text/plain': 'document'
}
ALLOWED_AUDIO_TYPES = {
    'audio/mpeg': 'audio',
    'audio/mp3': 'audio',
    'audio/wav': 'audio',
    'audio/x-wav': 'audio',
    'audio/x-m4a': 'audio',
    'audio/m4a': 'audio'
}
ALLOWED_MEDIA_TYPES = {**ALLOWED_DOCUMENT_TYPES, **ALLOWED_AUDIO_TYPES}
MAX_MEDIA_SIZE = 100 * 1024 * 1024  # 100MB

@media_router.get("", response_model=List[MediaAssetResponse])
async def get_media_assets(
    kind: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all media assets for the team."""
    query = {"team_id": current_user.get('team_id')}
    
    if kind:
        query["kind"] = kind
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    
    assets = await db.media_assets.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    # Add uploader names
    for asset in assets:
        user = await db.users.find_one({"id": asset["uploaded_by"]}, {"name": 1})
        asset["uploaded_by_name"] = user.get("name") if user else "Unknown"
    
    return assets

@media_router.post("", response_model=MediaAssetResponse, status_code=status.HTTP_201_CREATED)
async def upload_media_asset(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    current_user: dict = Depends(require_can_edit_content)
):
    """Upload a new media asset."""
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    
    if content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: PDF, DOCX, TXT, MP3, WAV, M4A"
        )
    
    kind = ALLOWED_MEDIA_TYPES.get(content_type, 'document')
    
    # Generate storage key
    file_ext = Path(file.filename).suffix or '.bin'
    storage_key = f"{current_user.get('team_id')}_{uuid.uuid4().hex[:12]}{file_ext}"
    file_path = MEDIA_UPLOADS_DIR / storage_key
    
    # Save file
    file_size = 0
    async with aiofiles.open(file_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)
            file_size += len(chunk)
            if file_size > MAX_MEDIA_SIZE:
                # Clean up and error
                await f.close()
                file_path.unlink()
                raise HTTPException(status_code=400, detail="File too large. Maximum size is 100MB")
    
    now = datetime.now(timezone.utc).isoformat()
    asset_doc = {
        "id": str(uuid.uuid4()),
        "team_id": current_user.get('team_id'),
        "uploaded_by": current_user['id'],
        "kind": kind,
        "title": title or file.filename,
        "file_storage_key": storage_key,
        "original_filename": file.filename,
        "mime_type": content_type,
        "size": file_size,
        "duration_seconds": None,  # Could be calculated for audio
        "created_at": now,
        "updated_at": now
    }
    
    await db.media_assets.insert_one(asset_doc)
    asset_doc.pop("_id", None)
    asset_doc["uploaded_by_name"] = current_user.get("name")
    
    return asset_doc

@media_router.get("/{asset_id}", response_model=MediaAssetResponse)
async def get_media_asset(
    asset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single media asset."""
    asset = await db.media_assets.find_one(
        {"id": asset_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    user = await db.users.find_one({"id": asset["uploaded_by"]}, {"name": 1})
    asset["uploaded_by_name"] = user.get("name") if user else "Unknown"
    
    return asset

@media_router.put("/{asset_id}", response_model=MediaAssetResponse)
async def update_media_asset(
    asset_id: str,
    update_data: MediaAssetUpdate,
    current_user: dict = Depends(require_can_edit_content)
):
    """Update media asset metadata."""
    asset = await db.media_assets.find_one(
        {"id": asset_id, "team_id": current_user.get('team_id')}
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.media_assets.update_one(
        {"id": asset_id},
        {"$set": update_dict}
    )
    
    updated = await db.media_assets.find_one({"id": asset_id}, {"_id": 0})
    user = await db.users.find_one({"id": updated["uploaded_by"]}, {"name": 1})
    updated["uploaded_by_name"] = user.get("name") if user else "Unknown"
    
    return updated

@media_router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media_asset(
    asset_id: str,
    current_user: dict = Depends(require_can_edit_content)
):
    """Delete a media asset."""
    asset = await db.media_assets.find_one(
        {"id": asset_id, "team_id": current_user.get('team_id')}
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    # Delete file
    file_path = MEDIA_UPLOADS_DIR / asset.get("file_storage_key", "")
    if file_path.exists():
        file_path.unlink()
    
    # Delete database record
    await db.media_assets.delete_one({"id": asset_id})
    
    # Remove from show/rundown attachments
    await db.show_media.delete_many({"media_asset_id": asset_id})
    await db.rundown_item_media.delete_many({"media_asset_id": asset_id})

@api_router.get("/uploads/media/{file_key}")
async def get_media_file(file_key: str):
    """Serve a media file."""
    file_path = MEDIA_UPLOADS_DIR / file_key
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = mimetypes.guess_type(file_key)[0] or 'application/octet-stream'
    return FileResponse(file_path, media_type=media_type)

# Show Media Attachments
@shows_router.get("/{show_id}/media", response_model=List[ShowMediaResponse])
async def get_show_media(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get media attached to a show."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    attachments = await db.show_media.find(
        {"show_id": show_id},
        {"_id": 0}
    ).to_list(100)
    
    # Add full media asset info
    for attachment in attachments:
        asset = await db.media_assets.find_one(
            {"id": attachment["media_asset_id"]},
            {"_id": 0}
        )
        if asset:
            user = await db.users.find_one({"id": asset["uploaded_by"]}, {"name": 1})
            asset["uploaded_by_name"] = user.get("name") if user else "Unknown"
        attachment["media_asset"] = asset
    
    return attachments

@shows_router.post("/{show_id}/media", response_model=List[ShowMediaResponse])
async def attach_media_to_show(
    show_id: str,
    attach_data: AttachMediaRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Attach media assets to a show."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    for asset_id in attach_data.media_asset_ids:
        # Verify asset exists
        asset = await db.media_assets.find_one(
            {"id": asset_id, "team_id": current_user.get('team_id')}
        )
        if not asset:
            continue
        
        # Check if already attached
        existing = await db.show_media.find_one({
            "show_id": show_id,
            "media_asset_id": asset_id
        })
        if existing:
            continue
        
        await db.show_media.insert_one({
            "id": str(uuid.uuid4()),
            "show_id": show_id,
            "media_asset_id": asset_id,
            "created_at": now
        })
    
    return await get_show_media(show_id, current_user)

@shows_router.delete("/{show_id}/media/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def detach_media_from_show(
    show_id: str,
    asset_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Detach a media asset from a show."""
    result = await db.show_media.delete_one({
        "show_id": show_id,
        "media_asset_id": asset_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Attachment not found")

# Rundown Item Media Attachments
@shows_router.get("/{show_id}/rundown/{item_id}/media", response_model=List[RundownItemMediaResponse])
async def get_rundown_item_media(
    show_id: str,
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get media attached to a rundown item."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id})
    if not item:
        raise HTTPException(status_code=404, detail="Rundown item not found")
    
    attachments = await db.rundown_item_media.find(
        {"rundown_item_id": item_id},
        {"_id": 0}
    ).to_list(100)
    
    for attachment in attachments:
        asset = await db.media_assets.find_one(
            {"id": attachment["media_asset_id"]},
            {"_id": 0}
        )
        if asset:
            user = await db.users.find_one({"id": asset["uploaded_by"]}, {"name": 1})
            asset["uploaded_by_name"] = user.get("name") if user else "Unknown"
        attachment["media_asset"] = asset
    
    return attachments

@shows_router.post("/{show_id}/rundown/{item_id}/media", response_model=List[RundownItemMediaResponse])
async def attach_media_to_rundown_item(
    show_id: str,
    item_id: str,
    attach_data: AttachMediaRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Attach media assets to a rundown item."""
    show = await db.shows.find_one(
        {"id": show_id, "team_id": current_user.get('team_id')}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    item = await db.rundown_items.find_one({"id": item_id, "show_id": show_id})
    if not item:
        raise HTTPException(status_code=404, detail="Rundown item not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    for asset_id in attach_data.media_asset_ids:
        asset = await db.media_assets.find_one(
            {"id": asset_id, "team_id": current_user.get('team_id')}
        )
        if not asset:
            continue
        
        existing = await db.rundown_item_media.find_one({
            "rundown_item_id": item_id,
            "media_asset_id": asset_id
        })
        if existing:
            continue
        
        await db.rundown_item_media.insert_one({
            "id": str(uuid.uuid4()),
            "rundown_item_id": item_id,
            "media_asset_id": asset_id,
            "created_at": now
        })
    
    return await get_rundown_item_media(show_id, item_id, current_user)

@shows_router.delete("/{show_id}/rundown/{item_id}/media/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def detach_media_from_rundown_item(
    show_id: str,
    item_id: str,
    asset_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Detach a media asset from a rundown item."""
    result = await db.rundown_item_media.delete_one({
        "rundown_item_id": item_id,
        "media_asset_id": asset_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Attachment not found")

# Include routers
api_router.include_router(auth_router)
api_router.include_router(shows_router)
api_router.include_router(teams_router)
api_router.include_router(users_router)
api_router.include_router(content_router)
api_router.include_router(wordpress_router)
api_router.include_router(chat_router)
api_router.include_router(media_router)
api_router.include_router(series_router)
api_router.include_router(occurrences_router)
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
