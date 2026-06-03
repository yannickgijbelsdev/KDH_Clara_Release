"""Authentication routes."""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid

from database import db, JWT_EXPIRATION_HOURS
from models.auth import (
    UserCreate, UserLogin, TokenResponse, UserWithTeamResponse
)
from services.auth import (
    hash_password, verify_password, create_token, get_current_user
)
from services.audit import log_action, get_client_ip
from services.firewall_service import handle_failed_login, handle_successful_login, check_ip_blocked
from services.zt_guard import verify_zt_access
from services.security.brute_force import is_locked as is_identity_locked, record_failure as record_login_failure, record_success as record_login_success
from services.security.device_trust import record_login_device
from services.two_factor import (
    generate_totp_secret, generate_qr_code_base64, verify_totp,
    generate_backup_codes, hash_backup_code, verify_backup_code
)

from services.permissions import get_user_permissions


async def check_user_requires_2fa(user: dict) -> bool:
    """Check if a user is required to set up 2FA.
    
    2FA is required if:
    1. The user is a Network Admin.
    2. Any main_site the user belongs to has require_2fa=True.
    """
    if user.get('is_network_admin'):
        return True
    
    # Check if any of the user's main sites require 2FA
    user_sites = await db.main_site_users.find(
        {"user_id": user["id"]},
        {"_id": 0, "main_site_id": 1}
    ).to_list(100)
    
    if user_sites:
        site_ids = [s["main_site_id"] for s in user_sites]
        enforcing_site = await db.main_sites.find_one(
            {"id": {"$in": site_ids}, "require_2fa": True},
            {"_id": 0, "id": 1}
        )
        if enforcing_site:
            return True
    
    return False


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
    client_ip = get_client_ip(request)

    # Check if IP is blocked (brute force protection)
    block = await check_ip_blocked(client_ip)
    if block:
        raise HTTPException(status_code=403, detail="IP temporarily blocked due to too many failed attempts. Try again later.")

    # Zero Trust: identity-scoped brute-force lockout (independent of IP)
    identity_key = f"email:{credentials.email.lower().strip()}"
    locked, retry = await is_identity_locked(identity_key)
    if locked:
        raise HTTPException(
            status_code=429,
            detail=f"Account temporarily locked due to failed attempts. Retry in {retry}s.",
            headers={"Retry-After": str(retry)},
        )

    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password_hash']):
        # Record failed attempt for brute force detection (both IP-level and identity-level)
        await handle_failed_login(client_ip, credentials.email)
        await record_login_failure(identity_key, client_ip, "invalid_credentials")
        await log_action(
            action="Login Failed",
            category="auth",
            user_email=credentials.email,
            ip_address=client_ip,
            details={"reason": "Invalid credentials"}
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Check if user is blocked
    if user.get('is_blocked'):
        raise HTTPException(status_code=403, detail="Account is blocked. Contact your administrator.")
    
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
            await record_login_failure(identity_key, client_ip, "invalid_2fa")
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
    
    # ZeroTier Network Guard: Network admins must be connected to the required ZT network
    if user.get('is_network_admin') and not user.get('is_system_admin'):
        zt_result = await verify_zt_access(client_ip)
        if not zt_result.get("allowed"):
            await log_action(
                action="Login Blocked - ZeroTier",
                category="auth",
                user_id=user['id'],
                user_email=user['email'],
                ip_address=client_ip,
                details={"reason": zt_result.get("reason", "ZeroTier verification failed")}
            )
            raise HTTPException(status_code=403, detail=zt_result.get("reason", "ZeroTier network access required."))

    # Log successful login
    await handle_successful_login(client_ip, user['id'], user['email'])
    await record_login_success(identity_key, client_ip)

    # Zero Trust: record device fingerprint and emit alert on new device
    try:
        await record_login_device(
            user=user,
            ip=client_ip,
            user_agent=request.headers.get("user-agent"),
            accept_lang=request.headers.get("accept-language"),
            country=request.headers.get("cf-ipcountry") or request.headers.get("x-country"),
            city=request.headers.get("cf-ipcity") or request.headers.get("x-city"),
        )
    except Exception:
        pass
    await log_action(
        action="Login",
        category="auth",
        user_id=user['id'],
        user_name=user['name'],
        user_email=user['email'],
        team_id=team_id,
        ip_address=client_ip,
        details={"role": role, "2fa_enabled": totp_enabled}
    )
    
    # Create session tracking record
    session_id = str(uuid.uuid4())
    user_agent = request.headers.get("user-agent", "Unknown")
    session_expires = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    session_doc = {
        "id": session_id,
        "user_id": user['id'],
        "user_name": user.get('name', ''),
        "user_email": user.get('email', ''),
        "ip": client_ip,
        "user_agent": user_agent,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "last_active": datetime.now(timezone.utc).isoformat(),
        "expires_at": session_expires.isoformat(),
        "active": True,
        "team_id": team_id,
    }
    await db.sessions.insert_one({**session_doc})

    token, expires_at = create_token(user['id'], session_id=session_id)
    user_response = UserWithTeamResponse(
        id=user['id'],
        email=user['email'],
        name=user['name'],
        role=role,
        team_id=team_id,
        team_name=team_name,
        created_at=user['created_at'],
        is_network_admin=user.get('is_network_admin', False),
        is_primary_network_admin=user.get('is_primary_network_admin', False),
        is_system_admin=user.get('is_system_admin', False) or user.get('is_primary_network_admin', False),
        totp_enabled=totp_enabled,
        totp_skip_count=user.get('totp_skip_count', 0)
    )
    
    # Check if 2FA setup is enforced for this user
    force_2fa = False
    if not totp_enabled:
        force_2fa = await check_user_requires_2fa(user)
    
    return {
        "requires_2fa": False,
        "token": token,
        "user": user_response,
        "expires_at": expires_at,
        "temp_token": None,
        "totp_skip_count": user.get('totp_skip_count', 0),
        "force_password_change": user.get('force_password_change', False),
        "force_2fa": force_2fa,
    }


@auth_router.post("/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    """Log out the current user."""
    # Mark all active sessions for this user as inactive
    await db.sessions.update_many(
        {"user_id": current_user['id'], "active": True},
        {"$set": {"active": False, "ended_at": datetime.now(timezone.utc).isoformat()}}
    )
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


# ---------- ZeroTier Guard Configuration ----------

class ZTGuardConfigUpdate(BaseModel):
    api_token: Optional[str] = None
    network_id: Optional[str] = None
    enabled: Optional[bool] = None


@auth_router.get("/zt-guard/config")
async def get_zt_guard(current_user: dict = Depends(get_current_user)):
    """Get ZeroTier guard configuration. Only system admins can access this."""
    if not current_user.get('is_system_admin') and not current_user.get('is_primary_network_admin'):
        raise HTTPException(403, "System admin access required")
    from services.zt_guard import get_zt_guard_config
    config = await get_zt_guard_config()
    safe = {**config}
    token = safe.get("api_token", "")
    safe["api_token_masked"] = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else ("****" if token else "")
    safe.pop("api_token", None)
    return safe


@auth_router.put("/zt-guard/config")
async def update_zt_guard(data: ZTGuardConfigUpdate, current_user: dict = Depends(get_current_user)):
    """Update ZeroTier guard configuration. Only system admins can access this."""
    if not current_user.get('is_system_admin') and not current_user.get('is_primary_network_admin'):
        raise HTTPException(403, "System admin access required")
    from services.zt_guard import get_zt_guard_config, save_zt_guard_config
    current = await get_zt_guard_config()
    api_token = data.api_token if data.api_token is not None else current.get("api_token", "")
    network_id = data.network_id if data.network_id is not None else current.get("network_id", "")
    enabled = data.enabled if data.enabled is not None else current.get("enabled", False)
    result = await save_zt_guard_config(api_token, network_id, enabled)
    await log_action(
        action="ZeroTier Guard Updated",
        category="security",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        details={"enabled": enabled, "network_id": network_id}
    )
    safe = {**result}
    token = safe.get("api_token", "")
    safe["api_token_masked"] = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else ("****" if token else "")
    safe.pop("api_token", None)
    return safe


@auth_router.post("/zt-guard/test")
async def test_zt_guard(request: Request, current_user: dict = Depends(get_current_user)):
    """Test the ZeroTier guard with the current request's IP."""
    if not current_user.get('is_system_admin') and not current_user.get('is_primary_network_admin'):
        raise HTTPException(403, "System admin access required")
    from services.zt_guard import verify_zt_access
    client_ip = get_client_ip(request)
    result = await verify_zt_access(client_ip)
    return {"client_ip": client_ip, **result}


# ---------- Cross-Subdomain Exchange Token System ----------

class ExchangeTokenRequest(BaseModel):
    redirect_url: Optional[str] = None


class ExchangeTokenRedeemRequest(BaseModel):
    exchange_token: str


@auth_router.post("/exchange-token/create")
async def create_exchange_token(
    data: ExchangeTokenRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Create a short-lived, single-use exchange token for cross-subdomain auth.
    
    Used when redirecting from login.koodh.com back to clara.koodh.com.
    Token is valid for 30 seconds and can only be used once.
    """
    exchange_token = str(uuid.uuid4())
    
    await db.exchange_tokens.insert_one({
        "token": exchange_token,
        "user_id": current_user["id"],
        "redirect_url": data.redirect_url,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat(),
        "used": False,
        "ip": get_client_ip(request),
    })
    
    return {"exchange_token": exchange_token, "expires_in": 30}


@auth_router.post("/exchange-token/redeem")
async def redeem_exchange_token(data: ExchangeTokenRedeemRequest, request: Request):
    """Redeem an exchange token for a real JWT session.
    
    This is called by the target subdomain (e.g. clara.koodh.com) after
    receiving the exchange token via URL parameter from login.koodh.com.
    The exchange token is invalidated immediately after use.
    """
    # Find the exchange token
    doc = await db.exchange_tokens.find_one({"token": data.exchange_token}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid exchange token")
    
    # Check if already used
    if doc.get("used"):
        raise HTTPException(status_code=401, detail="Exchange token already used")
    
    # Check if expired
    expires_at = datetime.fromisoformat(doc["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.exchange_tokens.delete_one({"token": data.exchange_token})
        raise HTTPException(status_code=401, detail="Exchange token expired")
    
    # Mark as used immediately
    await db.exchange_tokens.update_one(
        {"token": data.exchange_token},
        {"$set": {"used": True, "redeemed_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Get the user
    user = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Account is blocked")
    
    team = await db.teams.find_one({"id": user.get("team_id")}, {"_id": 0})
    team_name = team["name"] if team else "Unknown Team"
    role = user.get("role", "editor")
    team_id = user.get("team_id", "")
    
    # Create a new session
    session_id = str(uuid.uuid4())
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("user-agent", "Unknown")
    session_expires = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    
    session_doc = {
        "id": session_id,
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "ip": client_ip,
        "user_agent": user_agent,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "last_active": datetime.now(timezone.utc).isoformat(),
        "expires_at": session_expires.isoformat(),
        "active": True,
        "team_id": team_id,
        "auth_method": "exchange_token",
    }
    await db.sessions.insert_one({**session_doc})
    
    token, expires_at = create_token(user["id"], session_id=session_id)
    
    totp_enabled = user.get("totp_enabled", False)
    user_response = UserWithTeamResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=role,
        team_id=team_id,
        team_name=team_name,
        created_at=user["created_at"],
        is_network_admin=user.get("is_network_admin", False),
        is_primary_network_admin=user.get("is_primary_network_admin", False),
        is_system_admin=user.get("is_system_admin", False) or user.get("is_primary_network_admin", False),
        totp_enabled=totp_enabled,
        totp_skip_count=user.get("totp_skip_count", 0)
    )
    
    await log_action(
        action="Login (Exchange Token)",
        category="auth",
        user_id=user["id"],
        user_name=user["name"],
        user_email=user["email"],
        team_id=team_id,
        ip_address=client_ip,
        details={"auth_method": "exchange_token", "role": role}
    )
    
    return {
        "token": token,
        "user": user_response,
        "expires_at": expires_at,
    }


@auth_router.get("/subdomain-config")
async def get_subdomain_config():
    """Public endpoint: returns active subdomain routing config.
    
    This is called by the frontend to determine if subdomain-based
    auth redirects are enabled and where to redirect.
    """
    routes = await db.subdomain_routes.find(
        {"is_active": True},
        {"_id": 0, "subdomain": 1, "route_type": 1, "target_path": 1}
    ).to_list(50)
    
    cf_config = await db.cloudflare_config.find_one({"type": "global"}, {"_id": 0, "base_domain": 1})
    base_domain = cf_config.get("base_domain", "koodh.com") if cf_config else "koodh.com"
    
    # Find the auth route (login subdomain)
    auth_route = next((r for r in routes if r["route_type"] == "auth"), None)
    app_route = next((r for r in routes if r["route_type"] == "app"), None)
    
    return {
        "enabled": auth_route is not None,
        "base_domain": base_domain,
        "login_subdomain": auth_route["subdomain"] if auth_route else None,
        "login_url": f"https://{auth_route['subdomain']}.{base_domain}" if auth_route else None,
        "app_subdomain": app_route["subdomain"] if app_route else None,
        "app_url": f"https://{app_route['subdomain']}.{base_domain}" if app_route else None,
        "routes": routes,
    }


@auth_router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    team = await db.teams.find_one({"id": current_user.get('team_id')}, {"_id": 0})
    team_name = team['name'] if team else "Unknown Team"
    
    avatar = current_user.get('avatar')
    preferences = current_user.get('preferences', {})
    
    resp = UserWithTeamResponse(
        id=current_user['id'],
        email=current_user['email'],
        name=current_user['name'],
        role=current_user.get('role', 'editor'),
        team_id=current_user.get('team_id', ''),
        team_name=team_name,
        created_at=current_user['created_at'],
        avatar=avatar,
        preferences=preferences,
        is_network_admin=current_user.get('is_network_admin', False),
        is_primary_network_admin=current_user.get('is_primary_network_admin', False),
        is_system_admin=current_user.get('is_system_admin', False) or current_user.get('is_primary_network_admin', False),
        totp_enabled=current_user.get('totp_enabled', False),
        totp_skip_count=current_user.get('totp_skip_count', 0)
    )
    
    # Check if 2FA setup is enforced for this user
    force_2fa = False
    if not current_user.get('totp_enabled', False):
        force_2fa = await check_user_requires_2fa(current_user)
    
    return {
        **resp.dict(),
        "force_password_change": current_user.get('force_password_change', False),
        "is_blocked": current_user.get('is_blocked', False),
        "force_2fa": force_2fa,
    }


@auth_router.get("/me/permissions")
async def get_my_permissions(request: Request, current_user: dict = Depends(get_current_user)):
    """Get the current user's permissions for the main site in X-Main-Site-ID header."""
    permissions = await get_user_permissions(request, current_user)
    
    # Also get the effective role slug for this site
    main_site_id = request.headers.get("X-Main-Site-ID")
    role_slug = "admin" if current_user.get("is_network_admin") else current_user.get("role", "viewer")
    role_info = None
    
    if main_site_id and not current_user.get("is_network_admin"):
        site_access = await db.main_site_users.find_one(
            {"user_id": current_user["id"], "main_site_id": main_site_id},
            {"_id": 0, "role": 1},
        )
        if site_access:
            role_slug = site_access.get("role", "viewer")
        
        role_doc = await db.roles.find_one(
            {"main_site_id": main_site_id, "slug": role_slug},
            {"_id": 0, "name": 1, "slug": 1, "color": 1},
        )
        if role_doc:
            role_info = role_doc
    
    return {
        "permissions": permissions,
        "role_slug": role_slug,
        "role_info": role_info,
        "is_network_admin": current_user.get("is_network_admin", False),
    }


@auth_router.post("/2fa/skip")
async def skip_2fa_setup(current_user: dict = Depends(get_current_user)):
    """Skip 2FA setup. Users can skip up to 3 times, then it becomes mandatory."""
    current_skips = max(0, current_user.get('totp_skip_count', 0))
    
    if current_skips >= 3:
        raise HTTPException(status_code=400, detail="Maximum skips reached. 2FA setup is now required.")
    
    new_count = current_skips + 1
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {"totp_skip_count": new_count}}
    )
    
    return {"totp_skip_count": new_count, "skips_remaining": 3 - new_count}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


@auth_router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Change user's password."""
    user = await db.users.find_one({"id": current_user['id']})
    if not verify_password(body.current_password, user['password_hash']):
        raise HTTPException(status_code=400, detail="Invalid current password")
    
    await db.users.update_one(
        {"id": current_user['id']},
        {
            "$set": {"password_hash": hash_password(body.new_password), "password_changed_at": datetime.now(timezone.utc).isoformat()},
            "$unset": {"temp_password": "", "force_password_change": ""}
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
    
    # Send confirmation email
    import asyncio
    from services.email_service import send_password_changed_email
    asyncio.create_task(send_password_changed_email(current_user['email'], current_user.get('name', '')))
    
    return {"message": "Password changed successfully"}


@auth_router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request):
    """Send a temporary password to the user's email. No authentication required."""
    import secrets
    from services.email_service import send_temp_password_email

    user = await db.users.find_one({"email": body.email}, {"_id": 0})
    if not user:
        # Return success even if user not found (security: don't reveal if email exists)
        return {"message": "If the email exists, a temporary password has been sent."}

    # Generate random temporary password
    temp_password = secrets.token_urlsafe(10)

    # Update user: set temp password hash and force password change
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_password(temp_password),
            "force_password_change": True,
            "temp_password_issued_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Send email with temp password
    await send_temp_password_email(user["email"], temp_password, user.get("name", ""))

    # Log the action
    await log_action(
        action="Password Reset Requested",
        category="auth",
        user_id=user["id"],
        user_name=user.get("name", ""),
        user_email=user["email"],
        ip_address=get_client_ip(request),
        details={"method": "forgot_password"}
    )

    return {"message": "If the email exists, a temporary password has been sent."}


# ============== TWO-FACTOR AUTHENTICATION ==============

@auth_router.post("/2fa/setup")
async def setup_2fa(current_user: dict = Depends(get_current_user)):
    """Initialize 2FA setup - generates secret and QR code.
    
    The secret is stored temporarily until verified.
    Returns QR code for scanning with authenticator app.
    """
    # Generate new secret
    secret = generate_totp_secret()
    
    # Generate QR code
    qr_code = generate_qr_code_base64(secret, current_user['email'])
    
    # Generate backup codes
    backup_codes = generate_backup_codes(10)
    
    # Store secret temporarily (not enabled yet)
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {
            "totp_secret_pending": secret,
            "backup_codes_pending": backup_codes
        }}
    )
    
    return TwoFactorSetupResponse(
        secret=secret,
        qr_code=qr_code,
        backup_codes=backup_codes
    )


@auth_router.post("/2fa/verify-setup")
async def verify_2fa_setup(
    verify_data: TwoFactorVerifyRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Verify 2FA setup by confirming a code from the authenticator app.
    
    This activates 2FA for the user.
    """
    # Get pending secret
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    pending_secret = user.get('totp_secret_pending')
    pending_backup_codes = user.get('backup_codes_pending', [])
    
    if not pending_secret:
        raise HTTPException(status_code=400, detail="No 2FA setup in progress")
    
    # Verify the code
    if not verify_totp(pending_secret, verify_data.code):
        raise HTTPException(status_code=400, detail="Invalid verification code")
    
    # Hash backup codes for storage
    hashed_backup_codes = [hash_backup_code(code) for code in pending_backup_codes]
    
    # Activate 2FA
    await db.users.update_one(
        {"id": current_user['id']},
        {
            "$set": {
                "totp_secret": pending_secret,
                "totp_enabled": True,
                "backup_codes_hashed": hashed_backup_codes,
                "totp_enabled_at": datetime.now(timezone.utc).isoformat()
            },
            "$unset": {
                "totp_secret_pending": "",
                "backup_codes_pending": ""
            }
        }
    )
    
    await log_action(
        action="2FA Enabled",
        category="auth",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        ip_address=get_client_ip(request)
    )
    
    return {"message": "2FA enabled successfully", "backup_codes_count": len(pending_backup_codes)}


@auth_router.post("/2fa/disable")
async def disable_2fa(
    verify_data: TwoFactorVerifyRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Disable 2FA for the current user.
    
    Requires a valid 2FA code to confirm.
    """
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    
    if not user.get('totp_enabled'):
        raise HTTPException(status_code=400, detail="2FA is not enabled")
    
    # Verify the code
    if not verify_totp(user.get('totp_secret', ''), verify_data.code):
        raise HTTPException(status_code=400, detail="Invalid verification code")
    
    # Disable 2FA
    await db.users.update_one(
        {"id": current_user['id']},
        {
            "$set": {"totp_enabled": False},
            "$unset": {
                "totp_secret": "",
                "backup_codes_hashed": "",
                "totp_enabled_at": ""
            }
        }
    )
    
    await log_action(
        action="2FA Disabled",
        category="auth",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        ip_address=get_client_ip(request)
    )
    
    return {"message": "2FA disabled successfully"}


@auth_router.get("/2fa/status")
async def get_2fa_status(current_user: dict = Depends(get_current_user)):
    """Get current 2FA status for the user."""
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    
    backup_codes_remaining = len(user.get('backup_codes_hashed', []))
    
    return {
        "enabled": user.get('totp_enabled', False),
        "enabled_at": user.get('totp_enabled_at'),
        "backup_codes_remaining": backup_codes_remaining
    }


@auth_router.post("/2fa/regenerate-backup-codes")
async def regenerate_backup_codes(
    verify_data: TwoFactorVerifyRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Regenerate backup codes. Requires valid 2FA code."""
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    
    if not user.get('totp_enabled'):
        raise HTTPException(status_code=400, detail="2FA is not enabled")
    
    # Verify the code
    if not verify_totp(user.get('totp_secret', ''), verify_data.code):
        raise HTTPException(status_code=400, detail="Invalid verification code")
    
    # Generate new backup codes
    new_codes = generate_backup_codes(10)
    hashed_codes = [hash_backup_code(code) for code in new_codes]
    
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {"backup_codes_hashed": hashed_codes}}
    )
    
    await log_action(
        action="Backup Codes Regenerated",
        category="auth",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        ip_address=get_client_ip(request)
    )
    
    return {"backup_codes": new_codes}



class EmailBackupCodesRequest(BaseModel):
    codes: List[str]


@auth_router.post("/2fa/email-backup-codes")
async def email_backup_codes(
    data: EmailBackupCodesRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Email backup codes to the current user via the configured SMTP integration."""
    from services.email_service import send_email_with_config, _get_branding_info, _build_dynamic_header

    if not data.codes:
        raise HTTPException(status_code=400, detail="No backup codes provided")

    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        raise HTTPException(status_code=503, detail="Email service is not configured")

    branding = await _get_branding_info()
    brand_name = branding["brand_name"]
    brand_logo_url = branding["brand_logo_url"]
    header = _build_dynamic_header(brand_name, brand_logo_url, "2FA Backup Codes", "linear-gradient(135deg,#f97316,#ea580c)")

    codes_html = "".join(
        f'<div style="background:#27272a;border-radius:6px;padding:8px 16px;font-family:monospace;font-size:14px;color:#f97316;letter-spacing:1px;">{code}</div>'
        for code in data.codes
    )

    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#18181b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
        {header}
        <div style="padding:24px;">
            <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;">
                Hello {current_user.get('name', '')},
            </p>
            <p style="margin:0 0 16px;font-size:13px;color:#a1a1aa;">
                Here are your 2FA backup codes. Store them in a safe place. Each code can only be used once.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
                {codes_html}
            </div>
            <div style="background:#27272a;border:1px solid #ef444444;border-radius:8px;padding:12px 16px;margin-top:12px;">
                <p style="margin:0;font-size:12px;color:#ef4444;">
                    Keep these codes secure. Do not share them with anyone. If you suspect they have been compromised, regenerate them immediately.
                </p>
            </div>
        </div>
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Global Protect</div>
    </div>"""

    subject = f"{brand_name} - Your 2FA Backup Codes"
    success = await send_email_with_config(smtp_config, current_user['email'], subject, html)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to send email")

    await log_action(
        action="Backup Codes Emailed",
        category="auth",
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        ip_address=get_client_ip(request)
    )

    return {"message": "Backup codes sent to your email"}


@auth_router.get("/2fa/enforcement-status")
async def get_2fa_enforcement_status(current_user: dict = Depends(get_current_user)):
    """Check if the current user is required to set up 2FA."""
    totp_enabled = current_user.get('totp_enabled', False)
    force_2fa = False
    if not totp_enabled:
        force_2fa = await check_user_requires_2fa(current_user)
    return {
        "force_2fa": force_2fa,
        "totp_enabled": totp_enabled,
        "totp_skip_count": current_user.get('totp_skip_count', 0),
        "skips_remaining": max(0, 3 - current_user.get('totp_skip_count', 0)),
    }
