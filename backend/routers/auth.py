"""Authentication routes."""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from database import db
from models.auth import (
    UserCreate, UserLogin, TokenResponse, UserWithTeamResponse
)
from services.auth import (
    hash_password, verify_password, create_token, get_current_user
)
from services.audit import log_action, get_client_ip
from services.two_factor import (
    generate_totp_secret, generate_qr_code_base64, verify_totp,
    generate_backup_codes, hash_backup_code, verify_backup_code
)

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])


# 2FA Models
class TwoFactorSetupResponse(BaseModel):
    secret: str
    qr_code: str  # Base64 encoded PNG
    backup_codes: List[str]


class TwoFactorVerifyRequest(BaseModel):
    code: str


class TwoFactorLoginRequest(BaseModel):
    email: str
    password: str
    totp_code: Optional[str] = None
    backup_code: Optional[str] = None


class LoginResponse(BaseModel):
    requires_2fa: bool = False
    token: Optional[str] = None
    user: Optional[UserWithTeamResponse] = None
    expires_at: Optional[str] = None
    temp_token: Optional[str] = None  # Temporary token for 2FA verification


@auth_router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate, request: Request):
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
    
    # Log registration
    await log_action(
        action="User Registered",
        category="auth",
        user_id=user_id,
        user_name=user_data.name,
        user_email=user_data.email,
        team_id=team_id,
        ip_address=get_client_ip(request),
        details={"role": role, "team_name": team_name}
    )
    
    token, expires_at = create_token(user_id)
    user_response = UserWithTeamResponse(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        role=role,
        team_id=team_id,
        team_name=team_name,
        created_at=now
    )
    
    return TokenResponse(token=token, user=user_response, expires_at=expires_at)


@auth_router.post("/login")
async def login(credentials: TwoFactorLoginRequest, request: Request):
    """Login with optional 2FA support.
    
    Flow:
    1. Validate email/password
    2. If 2FA enabled and no code provided: return requires_2fa=True with temp_token
    3. If 2FA enabled and code provided: verify code and return full token
    4. If 2FA not enabled: return full token with warning flag
    """
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password_hash']):
        await log_action(
            action="Login Failed",
            category="auth",
            user_email=credentials.email,
            ip_address=get_client_ip(request),
            details={"reason": "Invalid credentials"}
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    team = await db.teams.find_one({"id": user.get('team_id')}, {"_id": 0})
    team_name = team['name'] if team else "Unknown Team"
    
    role = user.get('role', 'editor')
    team_id = user.get('team_id', '')
    
    # Check if 2FA is enabled
    totp_enabled = user.get('totp_enabled', False)
    totp_secret = user.get('totp_secret')
    
    if totp_enabled and totp_secret:
        # 2FA is enabled - check if code was provided
        if not credentials.totp_code and not credentials.backup_code:
            # No code provided - return temp token for 2FA step
            temp_token, _ = create_token(user['id'], expires_minutes=5)  # Short-lived token
            return {
                "requires_2fa": True,
                "temp_token": temp_token,
                "token": None,
                "user": None,
                "expires_at": None
            }
        
        # Verify the provided code
        code_valid = False
        used_backup = False
        
        if credentials.totp_code:
            code_valid = verify_totp(totp_secret, credentials.totp_code)
        elif credentials.backup_code:
            backup_codes = user.get('backup_codes_hashed', [])
            code_valid, matched_hash = verify_backup_code(credentials.backup_code, backup_codes)
            if code_valid and matched_hash:
                used_backup = True
                # Remove used backup code
                await db.users.update_one(
                    {"id": user['id']},
                    {"$pull": {"backup_codes_hashed": matched_hash}}
                )
        
        if not code_valid:
            await log_action(
                action="Login Failed - Invalid 2FA",
                category="auth",
                user_id=user['id'],
                user_email=credentials.email,
                ip_address=get_client_ip(request),
                details={"reason": "Invalid 2FA code", "used_backup": credentials.backup_code is not None}
            )
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
        
        # Log if backup code was used
        if used_backup:
            await log_action(
                action="Backup Code Used",
                category="auth",
                user_id=user['id'],
                user_name=user['name'],
                user_email=user['email'],
                ip_address=get_client_ip(request)
            )
    
    # Log successful login
    await log_action(
        action="Login",
        category="auth",
        user_id=user['id'],
        user_name=user['name'],
        user_email=user['email'],
        team_id=team_id,
        ip_address=get_client_ip(request),
        details={"role": role, "2fa_enabled": totp_enabled}
    )
    
    token, expires_at = create_token(user['id'])
    user_response = UserWithTeamResponse(
        id=user['id'],
        email=user['email'],
        name=user['name'],
        role=role,
        team_id=team_id,
        team_name=team_name,
        created_at=user['created_at'],
        is_network_admin=user.get('is_network_admin', False),
        totp_enabled=totp_enabled
    )
    
    return {
        "requires_2fa": False,
        "token": token,
        "user": user_response,
        "expires_at": expires_at,
        "temp_token": None
    }


@auth_router.post("/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    """Log out the current user."""
    await log_action(
        action="Logout",
        category="auth",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        team_id=current_user.get('team_id'),
        ip_address=get_client_ip(request)
    )
    return {"message": "Logged out successfully"}


@auth_router.get("/me", response_model=UserWithTeamResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    team = await db.teams.find_one({"id": current_user.get('team_id')}, {"_id": 0})
    team_name = team['name'] if team else "Unknown Team"
    
    # Include avatar and preferences if exist
    avatar = current_user.get('avatar')
    preferences = current_user.get('preferences', {})
    
    return UserWithTeamResponse(
        id=current_user['id'],
        email=current_user['email'],
        name=current_user['name'],
        role=current_user.get('role', 'editor'),
        team_id=current_user.get('team_id', ''),
        team_name=team_name,
        created_at=current_user['created_at'],
        avatar=avatar,
        preferences=preferences,
        is_network_admin=current_user.get('is_network_admin', False)
    )


@auth_router.put("/change-password")
async def change_password(
    password_data: dict,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Change user's password."""
    old_password = password_data.get('old_password')
    new_password = password_data.get('new_password')
    
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
    
    # Log password change
    await log_action(
        action="Password Changed",
        category="auth",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        team_id=current_user.get('team_id'),
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Password changed successfully"}
