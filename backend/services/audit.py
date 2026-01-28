"""Audit logging service for tracking all user actions."""
from datetime import datetime, timezone
from typing import Optional
import uuid

from database import db


async def log_action(
    action: str,
    category: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    user_email: Optional[str] = None,
    team_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[dict] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    target_name: Optional[str] = None
):
    """
    Log an action to the audit log.
    
    Categories:
    - auth: Login, logout, password changes
    - user: User management (create, update, delete)
    - show: Show management (create, update, delete)
    - rundown: Rundown item changes
    - content: Content library changes
    - media: Media library changes
    - team: Team settings changes
    - settings: Show titles, studios management
    """
    log_entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "category": category,
        "user_id": user_id,
        "user_name": user_name,
        "user_email": user_email,
        "team_id": team_id,
        "ip_address": ip_address,
        "details": details or {},
        "target_type": target_type,
        "target_id": target_id,
        "target_name": target_name
    }
    
    await db.audit_logs.insert_one(log_entry)
    return log_entry


def get_client_ip(request) -> str:
    """Extract client IP from request headers."""
    # Check for forwarded headers (behind proxy/load balancer)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip
    
    # Fallback to direct connection
    if request.client:
        return request.client.host
    
    return "unknown"
