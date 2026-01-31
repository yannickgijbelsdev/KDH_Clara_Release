"""User management routes."""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Request
from fastapi.responses import FileResponse
from typing import List
from datetime import datetime, timezone
from pathlib import Path
import uuid
import mimetypes
import aiofiles

from database import db, AVATARS_DIR
from models.auth import (
    UserResponse, InviteUserRequest, UpdateUserRoleRequest
)
from services.auth import (
    hash_password, generate_temp_password,
    get_current_user, require_admin
)
from services.audit import log_action, get_client_ip

users_router = APIRouter(prefix="/users", tags=["Users"])

ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5MB


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


@users_router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: dict,
    current_user: dict = Depends(require_admin)
):
    """Update a user's profile (admin only)."""
    user = await db.users.find_one(
        {"id": user_id, "team_id": current_user['team_id']}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Only allow updating name and email
    update_fields = {}
    if "name" in user_data and user_data["name"]:
        update_fields["name"] = user_data["name"]
    if "email" in user_data and user_data["email"]:
        # Check if email is already taken by another user
        existing = await db.users.find_one({"email": user_data["email"], "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        update_fields["email"] = user_data["email"]
    
    if update_fields:
        await db.users.update_one(
            {"id": user_id},
            {"$set": update_fields}
        )
    
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user


@users_router.put("/{user_id}/password")
async def reset_user_password(
    user_id: str,
    password_data: dict,
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Reset a user's password (admin only)."""
    user = await db.users.find_one(
        {"id": user_id, "team_id": current_user['team_id']}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_password = password_data.get("password")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {"password_hash": hash_password(new_password)},
            "$unset": {"temp_password": ""}
        }
    )
    
    # Log the action
    await log_action(
        action="Password Reset",
        category="user",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        team_id=current_user['team_id'],
        ip_address=get_client_ip(request),
        target_type="user",
        target_id=user_id,
        target_name=user.get('name'),
        details={"target_email": user.get('email')}
    )
    
    return {"message": "Password reset successfully"}


@users_router.post("/{user_id}/avatar")
async def upload_avatar(
    user_id: str,
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin)
):
    """Upload avatar for a user (admin only)."""
    # Verify user exists and belongs to team
    user = await db.users.find_one(
        {"id": user_id, "team_id": current_user['team_id']}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate file type
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image type. Allowed: JPEG, PNG, GIF, WebP")
    
    # Read and validate file size
    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB")
    
    # Generate storage key
    file_ext = Path(file.filename).suffix or '.jpg'
    storage_key = f"{user_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = AVATARS_DIR / storage_key
    
    # Delete old avatar if exists
    if user.get('avatar'):
        old_path = AVATARS_DIR / user['avatar'].get('file_key', '')
        if old_path.exists():
            old_path.unlink()
    
    # Save new avatar
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    
    # Update user record
    avatar_data = {
        "file_key": storage_key,
        "filename": file.filename,
        "mime_type": content_type,
        "size": len(content)
    }
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"avatar": avatar_data}}
    )
    
    # Log the action
    await log_action(
        action="Avatar Uploaded",
        category="user",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        team_id=current_user['team_id'],
        ip_address=get_client_ip(request),
        target_type="user",
        target_id=user_id,
        target_name=user.get('name')
    )
    
    return {"avatar": avatar_data}


@users_router.delete("/{user_id}/avatar")
async def delete_avatar(
    user_id: str,
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Delete avatar for a user (admin only)."""
    user = await db.users.find_one(
        {"id": user_id, "team_id": current_user['team_id']}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get('avatar'):
        file_path = AVATARS_DIR / user['avatar'].get('file_key', '')
        if file_path.exists():
            file_path.unlink()
    
    await db.users.update_one(
        {"id": user_id},
        {"$unset": {"avatar": ""}}
    )
    
    # Log the action
    await log_action(
        action="Avatar Removed",
        category="user",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        team_id=current_user['team_id'],
        ip_address=get_client_ip(request),
        target_type="user",
        target_id=user_id,
        target_name=user.get('name')
    )
    
    return {"message": "Avatar removed"}


# ============== USER PREFERENCES ==============

@users_router.put("/me/preferences")
async def update_user_preferences(
    preferences: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update current user's preferences."""
    allowed_prefs = ['grouped_menu']  # Whitelist of allowed preference keys
    
    # Filter to only allowed preferences
    filtered_prefs = {k: v for k, v in preferences.items() if k in allowed_prefs}
    
    if not filtered_prefs:
        raise HTTPException(status_code=400, detail="No valid preferences provided")
    
    # Update nested preferences object
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {f"preferences.{k}": v for k, v in filtered_prefs.items()}}
    )
    
    return {"message": "Preferences updated", "preferences": filtered_prefs}


@users_router.get("/me/preferences")
async def get_user_preferences(current_user: dict = Depends(get_current_user)):
    """Get current user's preferences."""
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0, "preferences": 1})
    return user.get("preferences", {})

