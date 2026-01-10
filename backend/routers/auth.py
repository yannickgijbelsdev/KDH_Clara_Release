"""Authentication routes."""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from database import db
from models.auth import (
    UserCreate, UserLogin, TokenResponse, UserWithTeamResponse
)
from services.auth import (
    hash_password, verify_password, create_token, get_current_user
)

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])


@auth_router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    """Register a new user. First user creates a team and becomes admin."""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
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
