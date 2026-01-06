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
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import bcrypt
import jwt

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

security = HTTPBearer()

# ============== MODELS ==============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    created_at: str

class TokenResponse(BaseModel):
    token: str
    user: UserResponse

class ShowCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    date: str  # ISO date string
    start_time: str  # HH:MM format
    end_time: str  # HH:MM format
    status: str = "draft"  # draft, scheduled, completed

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
    created_at: str
    updated_at: str

class RundownItemCreate(BaseModel):
    type: str  # music, talk, item, ad
    title: str
    notes: Optional[str] = ""
    duration: Optional[str] = ""  # MM:SS format

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

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ============== AUTH ROUTES ==============

@auth_router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    user_response = UserResponse(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        created_at=now
    )
    
    return TokenResponse(token=token, user=user_response)

@auth_router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user['id'])
    user_response = UserResponse(
        id=user['id'],
        email=user['email'],
        name=user['name'],
        created_at=user['created_at']
    )
    
    return TokenResponse(token=token, user=user_response)

@auth_router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user['id'],
        email=current_user['email'],
        name=current_user['name'],
        created_at=current_user['created_at']
    )

# ============== SHOWS ROUTES ==============

@shows_router.get("", response_model=List[ShowResponse])
async def get_shows(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"editor_id": current_user['id']}
    if status:
        query["status"] = status
    
    shows = await db.shows.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return shows

@shows_router.post("", response_model=ShowResponse, status_code=status.HTTP_201_CREATED)
async def create_show(
    show_data: ShowCreate,
    current_user: dict = Depends(get_current_user)
):
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
    show = await db.shows.find_one(
        {"id": show_id, "editor_id": current_user['id']},
        {"_id": 0}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    return show

@shows_router.put("/{show_id}", response_model=ShowResponse)
async def update_show(
    show_id: str,
    show_data: ShowUpdate,
    current_user: dict = Depends(get_current_user)
):
    show = await db.shows.find_one(
        {"id": show_id, "editor_id": current_user['id']}
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
    current_user: dict = Depends(get_current_user)
):
    result = await db.shows.delete_one(
        {"id": show_id, "editor_id": current_user['id']}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Show not found")
    
    # Delete associated rundown items
    await db.rundown_items.delete_many({"show_id": show_id})

# ============== RUNDOWN ROUTES ==============

@shows_router.get("/{show_id}/rundown", response_model=List[RundownItemResponse])
async def get_rundown(
    show_id: str,
    current_user: dict = Depends(get_current_user)
):
    # Verify show ownership
    show = await db.shows.find_one(
        {"id": show_id, "editor_id": current_user['id']}
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
    current_user: dict = Depends(get_current_user)
):
    # Verify show ownership
    show = await db.shows.find_one(
        {"id": show_id, "editor_id": current_user['id']}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    # Get next order number
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

# IMPORTANT: reorder must come BEFORE /{item_id} routes to avoid path collision
@shows_router.put("/{show_id}/rundown/reorder", response_model=List[RundownItemResponse])
async def reorder_rundown(
    show_id: str,
    reorder_data: ReorderRequest,
    current_user: dict = Depends(get_current_user)
):
    # Verify show ownership
    show = await db.shows.find_one(
        {"id": show_id, "editor_id": current_user['id']}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    # Update order for each item
    for index, item_id in enumerate(reorder_data.item_ids):
        await db.rundown_items.update_one(
            {"id": item_id, "show_id": show_id},
            {"$set": {"order": index}}
        )
    
    # Return updated list
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
    current_user: dict = Depends(get_current_user)
):
    # Verify show ownership
    show = await db.shows.find_one(
        {"id": show_id, "editor_id": current_user['id']}
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
    current_user: dict = Depends(get_current_user)
):
    # Verify show ownership
    show = await db.shows.find_one(
        {"id": show_id, "editor_id": current_user['id']}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    result = await db.rundown_items.delete_one({"id": item_id, "show_id": show_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")

# ============== HEALTH CHECK ==============

@api_router.get("/")
async def root():
    return {"message": "Radio Show Planner API", "status": "running"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# ============== RDS / NOW PLAYING (Public Endpoint for MagicRDS) ==============

@api_router.get("/rds/live")
async def get_rds_live():
    """
    Simple clean endpoint for MagicRDS.
    Returns only the current live show title as plain text.
    Auto-updates based on scheduled shows and current time.
    """
    now = datetime.now(timezone.utc)
    today = now.strftime('%Y-%m-%d')
    current_time = now.strftime('%H:%M')
    
    # Find the currently live scheduled show
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
        return {
            "title": live_show["title"]
        }
    
    # No show live right now
    return {
        "title": ""
    }


@api_router.get("/rds/live.txt")
async def get_rds_live_text():
    """
    Plain text endpoint for MagicRDS.
    Returns ONLY the show title as raw text, nothing else.
    """
    from fastapi.responses import PlainTextResponse
    
    now = datetime.now(timezone.utc)
    today = now.strftime('%Y-%m-%d')
    current_time = now.strftime('%H:%M')
    
    # Find the currently live scheduled show
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


@api_router.get("/rds/now-playing")
async def get_now_playing():
    """
    Public endpoint for MagicRDS integration.
    Returns the currently scheduled show and current rundown item.
    No authentication required.
    """
    now = datetime.now(timezone.utc)
    today = now.strftime('%Y-%m-%d')
    current_time = now.strftime('%H:%M')
    
    # Find scheduled shows for today that are currently running
    scheduled_shows = await db.shows.find(
        {
            "status": "scheduled",
            "date": today,
            "start_time": {"$lte": current_time},
            "end_time": {"$gte": current_time}
        },
        {"_id": 0}
    ).to_list(10)
    
    if not scheduled_shows:
        # No show currently live, check for next scheduled show today
        next_show = await db.shows.find_one(
            {
                "status": "scheduled",
                "date": today,
                "start_time": {"$gt": current_time}
            },
            {"_id": 0},
            sort=[("start_time", 1)]
        )
        
        if next_show:
            return {
                "status": "off_air",
                "message": "No show currently live",
                "next_show": {
                    "title": next_show["title"],
                    "start_time": next_show["start_time"],
                    "end_time": next_show["end_time"]
                }
            }
        
        return {
            "status": "off_air",
            "message": "No scheduled shows for today",
            "next_show": None
        }
    
    # Get the current show (first one if multiple overlap)
    current_show = scheduled_shows[0]
    
    # Get rundown items for this show
    rundown_items = await db.rundown_items.find(
        {"show_id": current_show["id"]},
        {"_id": 0}
    ).sort("order", 1).to_list(100)
    
    # Build clean RDS output
    rds_output = {
        "status": "on_air",
        "show": {
            "title": current_show["title"],
            "description": current_show.get("description", ""),
            "start_time": current_show["start_time"],
            "end_time": current_show["end_time"],
            "date": current_show["date"]
        },
        "rundown": [
            {
                "order": item["order"] + 1,
                "type": item["type"],
                "title": item["title"],
                "notes": item.get("notes", ""),
                "duration": item.get("duration", "")
            }
            for item in rundown_items
        ],
        "item_count": len(rundown_items),
        "generated_at": now.isoformat()
    }
    
    return rds_output


@api_router.get("/rds/schedule")
async def get_rds_schedule():
    """
    Public endpoint returning all scheduled shows.
    Clean JSON format for external integrations.
    """
    # Get all scheduled shows, sorted by date and time
    scheduled_shows = await db.shows.find(
        {"status": "scheduled"},
        {"_id": 0}
    ).sort([("date", 1), ("start_time", 1)]).to_list(100)
    
    result = []
    for show in scheduled_shows:
        # Get rundown for each show
        rundown_items = await db.rundown_items.find(
            {"show_id": show["id"]},
            {"_id": 0}
        ).sort("order", 1).to_list(100)
        
        result.append({
            "show": {
                "title": show["title"],
                "description": show.get("description", ""),
                "date": show["date"],
                "start_time": show["start_time"],
                "end_time": show["end_time"]
            },
            "rundown": [
                {
                    "order": item["order"] + 1,
                    "type": item["type"],
                    "title": item["title"],
                    "notes": item.get("notes", ""),
                    "duration": item.get("duration", "")
                }
                for item in rundown_items
            ]
        })
    
    return {
        "scheduled_shows": result,
        "total_count": len(result),
        "generated_at": datetime.now(timezone.utc).isoformat()
    }


@api_router.get("/rds/export/{show_id}")
async def export_show_rds(show_id: str):
    """
    Export a single show's rundown in clean RDS format.
    Public endpoint - no authentication required.
    """
    show = await db.shows.find_one(
        {"id": show_id},
        {"_id": 0}
    )
    
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    
    rundown_items = await db.rundown_items.find(
        {"show_id": show_id},
        {"_id": 0}
    ).sort("order", 1).to_list(100)
    
    # Build clean export format
    return {
        "show": {
            "title": show["title"],
            "description": show.get("description", ""),
            "date": show["date"],
            "start_time": show["start_time"],
            "end_time": show["end_time"],
            "status": show["status"]
        },
        "rundown": [
            {
                "order": item["order"] + 1,
                "type": item["type"],
                "title": item["title"],
                "notes": item.get("notes", ""),
                "duration": item.get("duration", "")
            }
            for item in rundown_items
        ],
        "item_count": len(rundown_items),
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

# Include routers
api_router.include_router(auth_router)
api_router.include_router(shows_router)
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
