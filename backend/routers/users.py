"""User management routes."""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Request
from typing import List
from datetime import datetime, timezone
from pathlib import Path
import uuid
import mimetypes
import aiofiles
import asyncio

from database import db, AVATARS_DIR
from models.auth import (
    UserResponse, InviteUserRequest, UpdateUserRoleRequest
)
from services.auth import (
    hash_password, generate_temp_password,
    get_current_user, require_admin
)
from services.audit import log_action, get_client_ip
from services.s3_storage import upload_file_to_s3, delete_file_from_s3, is_s3_configured
from services.main_site_context import get_main_site_id_from_header, get_effective_role


async def _send_invite_email_async(to_email, user_name, site_name, role, temp_password, inviter_name):
    """Fire-and-forget wrapper for invite email."""
    try:
        from services.email_service import send_invite_email
        await send_invite_email(to_email, user_name, site_name, role, temp_password, inviter_name)
    except Exception:
        pass

users_router = APIRouter(prefix="/users", tags=["Users"])

ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'}
MAX_AVATAR_SIZE = 10 * 1024 * 1024  # 10MB


async def _find_user_in_context(user_id: str, request: Request, current_user: dict):
    """Find a user, respecting multisite context.
    
    In multisite context (X-Main-Site-ID header): checks main_site_users access.
    Fallback: checks team_id matching.
    """
    main_site_id = await get_main_site_id_from_header(request)

    if main_site_id:
        # Multisite: verify user is part of this main site
        access = await db.main_site_users.find_one({
            "main_site_id": main_site_id, "user_id": user_id
        })
        if not access and not current_user.get("is_network_admin"):
            return None
        return await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})

    # Fallback: team_id based lookup
    team_id = current_user.get("team_id")
    if team_id:
        return await db.users.find_one(
            {"id": user_id, "team_id": team_id}, {"_id": 0, "password_hash": 0}
        )
    return None


@users_router.get("", response_model=List[UserResponse])
async def get_team_users(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get all users, filtered by main_site access if in multisite context."""
    main_site_id = await get_main_site_id_from_header(request)
    
    # Base filter to exclude system accounts
    base_filter = {"is_system_account": {"$ne": True}}
    
    # Network admins / system admins without site context: return ALL users
    if not main_site_id and (current_user.get('is_network_admin') or current_user.get('is_system_admin')):
        users = await db.users.find(
            base_filter,
            {"_id": 0, "password_hash": 0}
        ).to_list(500)
        return users
    
    if main_site_id:
        # Get users who have access to this main site
        user_accesses = await db.main_site_users.find(
            {"main_site_id": main_site_id},
            {"_id": 0, "user_id": 1}
        ).to_list(100)
        user_ids = [ua["user_id"] for ua in user_accesses]
        
        # Network admins can see all users in a main site even if not in main_site_users
        if current_user.get('is_network_admin') and current_user['id'] not in user_ids:
            user_ids.append(current_user['id'])
        
        if user_ids:
            users = await db.users.find(
                {"id": {"$in": user_ids}, **base_filter},
                {"_id": 0, "password_hash": 0}
            ).to_list(100)
        else:
            # No users linked to this main site yet - return empty list
            users = []
    else:
        # Fallback to team_id for backwards compatibility
        team_id = current_user.get('team_id')
        if team_id:
            users = await db.users.find(
                {"team_id": team_id, **base_filter},
                {"_id": 0, "password_hash": 0}
            ).to_list(100)
        else:
            users = []
    
    return users


@users_router.post("/invite", response_model=UserResponse)
async def invite_user(
    invite_data: InviteUserRequest,
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Invite a new user to the team (admin only), also grants access to current main_site."""
    existing = await db.users.find_one({"email": invite_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    temp_password = generate_temp_password()
    
    # Get main_site_id from header for multisite context
    main_site_id = await get_main_site_id_from_header(request)
    
    user_doc = {
        "id": user_id,
        "email": invite_data.email,
        "password_hash": hash_password(temp_password),
        "name": invite_data.name,
        "role": invite_data.role,
        "team_id": current_user['team_id'],
        "temp_password": temp_password,
        "force_password_change": True,
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    # If in multisite context, also grant access to this main site
    if main_site_id:
        access_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "main_site_id": main_site_id,
            "role": invite_data.role,
            "created_at": now
        }
        await db.main_site_users.insert_one(access_doc)
    
    # Send invitation email with temporary password
    site_name = "Clara"
    if main_site_id:
        main_site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "name": 1})
        if main_site:
            site_name = main_site["name"]
    
    asyncio.create_task(_send_invite_email_async(
        invite_data.email, invite_data.name, site_name,
        invite_data.role, temp_password, current_user.get('name', '')
    ))
    
    # Log the user invitation
    await log_action(
        action="Invited User",
        category="user",
        user_id=current_user['id'],
        user_name=current_user.get('name'),
        user_email=current_user.get('email'),
        team_id=current_user['team_id'],
        main_site_id=main_site_id,
        ip_address=get_client_ip(request),
        target_type="user",
        target_id=user_id,
        target_name=invite_data.name,
        details={
            "invited_email": invite_data.email,
            "role": invite_data.role
        }
    )
    
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
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Get temporary password for newly invited user (admin only)."""
    user = await _find_user_in_context(user_id, request, current_user)
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
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Update a user's role (admin only)."""
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    
    user = await _find_user_in_context(user_id, request, current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    old_role = user.get('role')
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": role_data.role}}
    )
    
    # Also update role in main_site_users if in multisite context
    main_site_id = await get_main_site_id_from_header(request)
    if main_site_id:
        await db.main_site_users.update_one(
            {"main_site_id": main_site_id, "user_id": user_id},
            {"$set": {"role": role_data.role}}
        )
    
    # Log role change
    await log_action(
        action="Changed User Role",
        category="user",
        user_id=current_user['id'],
        user_name=current_user.get('name'),
        user_email=current_user.get('email'),
        team_id=current_user['team_id'],
        ip_address=get_client_ip(request),
        target_type="user",
        target_id=user_id,
        target_name=user.get('name'),
        details={
            "old_role": old_role,
            "new_role": role_data.role
        }
    )
    
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user


@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user(
    user_id: str,
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Remove a user from the team (admin only)."""
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    
    # Get user info before deletion for logging
    user = await _find_user_in_context(user_id, request, current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Log user removal
    await log_action(
        action="Removed User",
        category="user",
        user_id=current_user['id'],
        user_name=current_user.get('name'),
        user_email=current_user.get('email'),
        team_id=current_user['team_id'],
        ip_address=get_client_ip(request),
        target_type="user",
        target_id=user_id,
        target_name=user.get('name'),
        details={
            "removed_email": user.get('email'),
            "removed_role": user.get('role')
        }
    )


@users_router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: dict,
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Update a user's profile (admin only)."""
    user = await _find_user_in_context(user_id, request, current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Only allow updating name and email
    update_fields = {}
    changes = {}
    if "name" in user_data and user_data["name"]:
        if user_data["name"] != user.get("name"):
            changes["name"] = {"old": user.get("name"), "new": user_data["name"]}
        update_fields["name"] = user_data["name"]
    if "email" in user_data and user_data["email"]:
        # Check if email is already taken by another user
        existing = await db.users.find_one({"email": user_data["email"], "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        if user_data["email"] != user.get("email"):
            changes["email"] = {"old": user.get("email"), "new": user_data["email"]}
        update_fields["email"] = user_data["email"]
    
    if update_fields:
        await db.users.update_one(
            {"id": user_id},
            {"$set": update_fields}
        )
        
        # Log profile update
        if changes:
            await log_action(
                action="Updated User Profile",
                category="user",
                user_id=current_user['id'],
                user_name=current_user.get('name'),
                user_email=current_user.get('email'),
                team_id=current_user['team_id'],
                ip_address=get_client_ip(request),
                target_type="user",
                target_id=user_id,
                target_name=update_fields.get("name", user.get("name")),
                details={"changes": changes}
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
    user = await _find_user_in_context(user_id, request, current_user)
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
    current_user: dict = Depends(get_current_user)
):
    """Upload avatar for a user to S3 (admin only, supports site-specific admin)."""
    # Check admin permission (global or site-specific)
    effective_role = await get_effective_role(request, current_user)
    if effective_role != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get main site context
    main_site_id = await get_main_site_id_from_header(request)
    
    # Find user - try by team first, then by main site membership
    user = await db.users.find_one(
        {"id": user_id, "team_id": current_user['team_id']}
    )
    
    if not user and main_site_id:
        # Check if user belongs to this main site
        site_user = await db.main_site_users.find_one({
            "user_id": user_id, "main_site_id": main_site_id
        })
        if site_user:
            user = await db.users.find_one({"id": user_id})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate file type
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image type. Allowed: JPEG, PNG, GIF, WebP, HEIC")
    
    # Read and validate file size
    content = await file.read()
    
    # Clara Global Protect: scan before upload
    from services.global_protect import check_and_raise
    await check_and_raise(content, file.filename, content_type,
        user_id=current_user.get("id"), user_name=current_user.get("name"))
    
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB")
    
    # Delete old avatar if exists
    if user.get('avatar'):
        old_key = user['avatar'].get('file_key', '')
        if old_key.startswith("avatars/") and is_s3_configured():
            try:
                await delete_file_from_s3(old_key)
            except Exception:
                pass
        else:
            old_path = AVATARS_DIR / old_key
            if old_path.exists():
                old_path.unlink()
    
    # Generate storage key and upload
    file_ext = Path(file.filename).suffix or '.jpg'
    scope_segment = current_user.get('team_id') or current_user.get('main_site_id') or 'shared'
    storage_key = f"avatars/{scope_segment}/{user_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    s3_url = None
    
    if is_s3_configured():
        try:
            result = await upload_file_to_s3(content, storage_key, content_type)
            s3_url = result['url']
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")
    else:
        local_key = f"{user_id}_{uuid.uuid4().hex[:8]}{file_ext}"
        file_path = AVATARS_DIR / local_key
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        storage_key = local_key
    
    # Update user record
    avatar_data = {
        "file_key": storage_key,
        "s3_url": s3_url,
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
    current_user: dict = Depends(get_current_user)
):
    """Delete avatar for a user (admin only, supports site-specific admin)."""
    effective_role = await get_effective_role(request, current_user)
    if effective_role != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    main_site_id = await get_main_site_id_from_header(request)
    
    user = await db.users.find_one(
        {"id": user_id, "team_id": current_user['team_id']}
    )
    
    if not user and main_site_id:
        site_user = await db.main_site_users.find_one({
            "user_id": user_id, "main_site_id": main_site_id
        })
        if site_user:
            user = await db.users.find_one({"id": user_id})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get('avatar'):
        storage_key = user['avatar'].get('file_key', '')
        if storage_key.startswith("avatars/") and is_s3_configured():
            try:
                await delete_file_from_s3(storage_key)
            except Exception:
                pass
        else:
            file_path = AVATARS_DIR / storage_key
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
    allowed_prefs = ['grouped_menu', 'network_view_mode', 'show_pwa_prompt', 'show_login_scan']  # Whitelist of allowed preference keys
    
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



# ============== NETWORK ADMIN MANAGEMENT ==============

def require_primary_network_admin(current_user: dict = Depends(get_current_user)):
    """Only the primary network admin can manage other network admins."""
    if not current_user.get('is_network_admin') or not current_user.get('is_primary_network_admin'):
        raise HTTPException(status_code=403, detail="Only the primary network admin can manage network admins")
    return current_user


@users_router.get("/network-admins")
async def get_network_admins(current_user: dict = Depends(get_current_user)):
    """Get all network admins. Only accessible by network admins."""
    if not current_user.get('is_network_admin'):
        raise HTTPException(status_code=403, detail="Network admin access required")
    
    admins = await db.users.find(
        {"is_network_admin": True},
        {"_id": 0, "password_hash": 0, "totp_secret": 0}
    ).to_list(50)
    
    return admins


@users_router.post("/network-admins")
async def create_network_admin(
    data: dict,
    request: Request,
    current_user: dict = Depends(require_primary_network_admin)
):
    """Create a new network admin. Only the primary admin can do this."""
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    na_permissions = data.get('network_permissions', {})
    
    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email are required")
    
    # Check if user already exists
    existing = await db.users.find_one({"email": email})
    if existing:
        # If user exists but is not a network admin, promote them
        if existing.get('is_network_admin'):
            raise HTTPException(status_code=400, detail="This user is already a network admin")
        
        await db.users.update_one(
            {"id": existing['id']},
            {"$set": {
                "is_network_admin": True,
                "is_primary_network_admin": False,
                "network_permissions": na_permissions,
            }}
        )
        
        await log_action(
            action="Network Admin Promoted",
            category="admin",
            user_id=current_user['id'],
            user_name=current_user['name'],
            user_email=current_user['email'],
            details=f"Promoted {email} to network admin",
            ip_address=get_client_ip(request)
        )
        
        return {"message": f"{email} promoted to network admin", "user_id": existing['id']}
    
    # Create new user as network admin
    temp_password = generate_temp_password()
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    new_user = {
        "id": user_id,
        "name": name,
        "email": email,
        "password_hash": hash_password(temp_password),
        "temp_password": temp_password,
        "role": "admin",
        "is_network_admin": True,
        "is_primary_network_admin": False,
        "network_permissions": na_permissions,
        "force_password_change": True,
        "created_at": now,
        "totp_enabled": False,
        "totp_skip_count": 0,
    }
    
    await db.users.insert_one(new_user)
    new_user.pop('_id', None)
    new_user.pop('password_hash', None)
    
    await log_action(
        action="Network Admin Created",
        category="admin",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        details=f"Created network admin: {email}",
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Network admin created", "user_id": user_id, "temp_password": temp_password}


@users_router.put("/network-admins/{admin_id}/permissions")
async def update_network_admin_permissions(
    admin_id: str,
    data: dict,
    request: Request,
    current_user: dict = Depends(require_primary_network_admin)
):
    """Update a network admin's permissions. Only the primary admin can do this."""
    target = await db.users.find_one({"id": admin_id, "is_network_admin": True}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Network admin not found")
    
    if target.get('is_primary_network_admin'):
        raise HTTPException(status_code=400, detail="Cannot modify primary admin permissions")
    
    na_permissions = data.get('network_permissions', {})
    
    await db.users.update_one(
        {"id": admin_id},
        {"$set": {"network_permissions": na_permissions}}
    )
    
    await log_action(
        action="Network Admin Permissions Updated",
        category="admin",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        details=f"Updated permissions for {target.get('email')}",
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Permissions updated"}


@users_router.delete("/network-admins/{admin_id}")
async def remove_network_admin(
    admin_id: str,
    request: Request,
    current_user: dict = Depends(require_primary_network_admin)
):
    """Remove network admin status. Cannot remove the primary admin."""
    target = await db.users.find_one({"id": admin_id, "is_network_admin": True}, {"_id": 0, "email": 1, "is_primary_network_admin": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Network admin not found")
    
    if target.get('is_primary_network_admin'):
        raise HTTPException(status_code=400, detail="Cannot remove the primary network admin")
    
    await db.users.update_one(
        {"id": admin_id},
        {"$set": {"is_network_admin": False}, "$unset": {"is_primary_network_admin": "", "network_permissions": ""}}
    )
    
    await log_action(
        action="Network Admin Removed",
        category="admin",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        details=f"Removed network admin: {target.get('email')}",
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Network admin status removed"}
