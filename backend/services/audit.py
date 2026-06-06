"""Audit logging service for tracking all user actions."""
from datetime import datetime, timezone
from typing import Optional
import uuid
import asyncio
import logging

from database import db

logger = logging.getLogger(__name__)

# Map audit categories to notification categories
AUDIT_TO_NOTIFICATION_CATEGORY = {
    "auth": "security",
    "user": "users",
    "show": "shows",
    "rundown": "shows",
    "content": "content",
    "media": "content",
    "team": "users",
    "settings": "shows",
    "wordpress": "wordpress",
    "firewall": "firewall",
    "system": "system",
}


async def _trigger_notification_from_audit(log_entry: dict):
    """Fire-and-forget notification trigger from audit log entry."""
    try:
        from routers.notifications import trigger_notification

        category = log_entry.get("category", "")
        action = log_entry.get("action", "")

        # Skip noisy events
        SKIP_ACTIONS = {"Login", "Logout", "Page view", "View"}
        if action in SKIP_ACTIONS:
            return

        notif_category = AUDIT_TO_NOTIFICATION_CATEGORY.get(category)
        if not notif_category:
            return

        details_dict = log_entry.get("details", {})
        target_name = log_entry.get("target_name", "")

        details_str = details_dict.get("description", "") if isinstance(details_dict, dict) else str(details_dict)
        if not details_str and target_name:
            details_str = f"{action}: {target_name}"
        if not details_str:
            details_str = action

        await trigger_notification(
            category=notif_category,
            event_type=action,
            details=details_str,
            main_site_id=log_entry.get("main_site_id", ""),
            actor_name=log_entry.get("user_name", ""),
            actor_email=log_entry.get("user_email", ""),
        )
    except Exception as e:
        logger.debug(f"Notification trigger skipped: {e}")


async def log_action(
    action: str,
    category: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    user_email: Optional[str] = None,
    team_id: Optional[str] = None,
    main_site_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[dict] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    target_name: Optional[str] = None
):
    """
    Log an action to the audit log and trigger notifications.
    
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
        "main_site_id": main_site_id,
        "ip_address": ip_address,
        "details": details or {},
        "target_type": target_type,
        "target_id": target_id,
        "target_name": target_name
    }
    
    await db.audit_logs.insert_one(log_entry)

    # Trigger notification in background (non-blocking)
    asyncio.create_task(_trigger_notification_from_audit(log_entry))

    # Strip the Mongo-injected `_id` so callers never accidentally serialize
    # a raw ObjectId in API responses.
    log_entry.pop("_id", None)
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
