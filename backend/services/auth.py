"""Authentication helpers and dependencies."""
from fastapi import HTTPException, Depends
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


def create_token(user_id: str) -> tuple[str, float]:
    """Create JWT token and return token + expiration timestamp."""
    exp_timestamp = datetime.now(timezone.utc).timestamp() + (JWT_EXPIRATION_HOURS * 3600)
    payload = {
        'user_id': user_id,
        'exp': exp_timestamp
    }
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
    # Editors can always edit shows (existing behavior)
    if user.get('role') == 'editor':
        return True
    assignment = await db.show_assignments.find_one({
        "show_id": show_id,
        "user_id": user['id']
    })
    return assignment is not None


async def require_show_edit_permission(show_id: str, user: dict):
    """Check if user can edit a show (admin, editor, or assigned presenter)."""
    if user.get('role') == 'admin':
        return True
    if user.get('role') == 'editor':
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
