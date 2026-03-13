"""Authentication helpers and dependencies."""
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone
import bcrypt
import jwt
import secrets

from database import db, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def create_token(user_id: str, expires_minutes: int = None, session_id: str = None) -> tuple[str, float]:
    """Create JWT token and return token + expiration timestamp.
    
    Args:
        user_id: The user ID to encode in the token
        expires_minutes: Optional override for expiration time in minutes.
                        If not provided, uses JWT_EXPIRATION_HOURS from config.
        session_id: Optional session ID to include in the token payload.
    """
    if expires_minutes:
        exp_timestamp = datetime.now(timezone.utc).timestamp() + (expires_minutes * 60)
    else:
        exp_timestamp = datetime.now(timezone.utc).timestamp() + (JWT_EXPIRATION_HOURS * 3600)
    
    payload = {
        'user_id': user_id,
        'exp': exp_timestamp
    }
    if session_id:
        payload['session_id'] = session_id
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, exp_timestamp


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
    # Check if user is blocked
    if user.get('is_blocked'):
        raise HTTPException(status_code=403, detail="Account is blocked. Contact your administrator.")
    # Check if session was terminated
    session_id = payload.get('session_id')
    if session_id:
        session = await db.sessions.find_one({"id": session_id}, {"_id": 0, "active": 1})
        if session and not session.get("active", True):
            raise HTTPException(status_code=401, detail="Session terminated by administrator")
    # Ensure is_network_admin field exists (defaults to False)
    if 'is_network_admin' not in user:
        user['is_network_admin'] = False
    return user


async def require_network_admin(current_user: dict = Depends(get_current_user)):
    """Require network admin access for multi-site management."""
    if not current_user.get('is_network_admin'):
        raise HTTPException(status_code=403, detail="Network admin access required")
    return current_user


async def require_admin(request: Request = None, current_user: dict = Depends(get_current_user)):
    # If the permission middleware already approved this request (role-based), allow it
    if request and getattr(request.state, 'permission_approved', False):
        return current_user
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def require_editor_or_admin(request: Request = None, current_user: dict = Depends(get_current_user)):
    """Editors, News Admins, and Admins have full content editing access."""
    # If the permission middleware already approved this request (role-based), allow it
    if request and getattr(request.state, 'permission_approved', False):
        return current_user
    if current_user.get('role') not in ['admin', 'news_admin', 'editor']:
        raise HTTPException(status_code=403, detail="Editor or admin access required")
    return current_user


async def require_can_approve_content(request: Request = None, current_user: dict = Depends(get_current_user)):
    """Only Admins and News Admins can approve/reject content."""
    if request and getattr(request.state, 'permission_approved', False):
        return current_user
    if current_user.get('role') not in ['admin', 'news_admin']:
        raise HTTPException(status_code=403, detail="Content approval access required")
    return current_user


async def require_can_edit_content(request: Request = None, current_user: dict = Depends(get_current_user)):
    """Editors, News Admins, Presenters, and Admins can manage content/media."""
    if request and getattr(request.state, 'permission_approved', False):
        return current_user
    if current_user.get('role') not in ['admin', 'news_admin', 'editor', 'presenter']:
        raise HTTPException(status_code=403, detail="Content editing access required")
    return current_user


async def check_show_assignment(show_id: str, user: dict) -> bool:
    """Check if user is assigned to a show (legacy shows model)."""
    if user.get('role') == 'admin':
        return True
    # Editors and News Admins can always edit shows
    if user.get('role') in ['editor', 'news_admin']:
        return True
    assignment = await db.show_assignments.find_one({
        "show_id": show_id,
        "user_id": user['id']
    })
    return assignment is not None


async def require_show_edit_permission(show_id: str, user: dict):
    """Check if user can edit a show (admin, news_admin, editor, or assigned presenter)."""
    if user.get('role') == 'admin':
        return True
    if user.get('role') in ['editor', 'news_admin']:
        return True
    if user.get('role') in ['presenter']:
        # Check if assigned to this show
        is_assigned = await check_show_assignment(show_id, user)
        if is_assigned:
            return True
    raise HTTPException(status_code=403, detail="You don't have permission to edit this show")


async def check_occurrence_assignment(occurrence_id: str, user: dict) -> bool:
    """Check if user is assigned to an occurrence's series or the occurrence itself."""
    if user.get('role') == 'admin':
        return True
    
    occurrence = await db.show_occurrences.find_one({"id": occurrence_id})
    if not occurrence:
        return False
    
    if occurrence.get('show_series_id'):
        series_assignment = await db.series_assignments.find_one({
            "series_id": occurrence['show_series_id'],
            "user_id": user['id']
        })
        if series_assignment:
            return True
    
    occ_assignment = await db.occurrence_assignments.find_one({
        "occurrence_id": occurrence_id,
        "user_id": user['id']
    })
    return occ_assignment is not None
