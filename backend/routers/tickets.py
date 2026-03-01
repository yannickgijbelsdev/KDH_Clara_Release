"""Ticketing Router — Support ticket system with conversations and user journey tracking."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from database import db
from services.auth import get_current_user
from services.main_site_context import get_main_site_id_from_header

ticket_router = APIRouter(prefix="/tickets", tags=["tickets"])


class TicketCreate(BaseModel):
    title: str
    description: str
    page_url: str
    page_name: str
    browser_info: Optional[str] = None
    user_journey: List[dict] = []
    priority: str = "normal"


class TicketMessageCreate(BaseModel):
    message: str


class TicketStatusUpdate(BaseModel):
    status: str  # open, in_progress, resolved, closed


@ticket_router.post("/")
async def create_ticket(
    body: TicketCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Create a new support ticket. Available to all authenticated users."""
    main_site_id = await get_main_site_id_from_header(request)

    # Get client IP
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")

    # Get site info
    site_name = ""
    if main_site_id:
        ms = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "name": 1})
        site_name = ms.get("name", "") if ms else ""

    ticket_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    ticket = {
        "id": ticket_id,
        "main_site_id": main_site_id,
        "site_name": site_name,
        "created_by": current_user.get("id"),
        "creator_name": current_user.get("name", ""),
        "creator_email": current_user.get("email", ""),
        "title": body.title,
        "description": body.description,
        "status": "open",
        "priority": body.priority,
        "page_url": body.page_url,
        "page_name": body.page_name,
        "browser_info": body.browser_info,
        "ip_address": ip.split(",")[0].strip() if ip else "unknown",
        "user_journey": body.user_journey,
        "message_count": 0,
        "created_at": now,
        "updated_at": now,
    }

    await db.tickets.insert_one({**ticket})

    # Create notification for all admins of this site
    if main_site_id:
        admin_users = await db.main_site_users.find(
            {"main_site_id": main_site_id, "role": {"$in": ["admin", "owner"]}},
            {"_id": 0, "user_id": 1},
        ).to_list(500)

        # Also notify network admins
        network_admins = await db.users.find(
            {"is_network_admin": True},
            {"_id": 0, "id": 1},
        ).to_list(100)

        notified_ids = set()
        for u in admin_users + [{"user_id": na["id"]} for na in network_admins]:
            uid = u.get("user_id") or u.get("id")
            if uid and uid != current_user.get("id") and uid not in notified_ids:
                notified_ids.add(uid)
                await db.ticket_notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": uid,
                    "ticket_id": ticket_id,
                    "type": "new_ticket",
                    "read": False,
                    "created_at": now,
                })

    return ticket


@ticket_router.get("/")
async def list_tickets(
    request: Request,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List tickets. Admins see all for the site, regular users see their own."""
    main_site_id = await get_main_site_id_from_header(request)

    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id

    # Check if user is admin for this site
    is_admin = current_user.get("is_network_admin", False)
    if not is_admin and main_site_id:
        site_user = await db.main_site_users.find_one(
            {"main_site_id": main_site_id, "user_id": current_user["id"]},
            {"_id": 0, "role": 1},
        )
        if site_user and site_user.get("role") in ("admin", "owner"):
            is_admin = True

    if not is_admin:
        query["created_by"] = current_user["id"]

    if status:
        query["status"] = status

    tickets = await db.tickets.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    return {"tickets": tickets}


@ticket_router.get("/notifications")
async def get_notifications(
    current_user: dict = Depends(get_current_user),
):
    """Get unread notification count for current user."""
    count = await db.ticket_notifications.count_documents(
        {"user_id": current_user["id"], "read": False}
    )
    return {"unread_count": count}


@ticket_router.post("/notifications/read")
async def mark_notifications_read(
    current_user: dict = Depends(get_current_user),
):
    """Mark all ticket notifications as read."""
    await db.ticket_notifications.update_many(
        {"user_id": current_user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return {"status": "ok"}


@ticket_router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single ticket with its messages."""
    ticket = await db.tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Check access
    is_admin = current_user.get("is_network_admin", False)
    if not is_admin:
        ms_id = ticket.get("main_site_id")
        if ms_id:
            site_user = await db.main_site_users.find_one(
                {"main_site_id": ms_id, "user_id": current_user["id"]},
                {"_id": 0, "role": 1},
            )
            if site_user and site_user.get("role") in ("admin", "owner"):
                is_admin = True

    if not is_admin and ticket["created_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get messages
    messages = await db.ticket_messages.find(
        {"ticket_id": ticket_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)

    # Mark related notifications as read
    await db.ticket_notifications.update_many(
        {"user_id": current_user["id"], "ticket_id": ticket_id, "read": False},
        {"$set": {"read": True}},
    )

    return {**ticket, "messages": messages}


@ticket_router.post("/{ticket_id}/messages")
async def add_message(
    ticket_id: str,
    body: TicketMessageCreate,
    current_user: dict = Depends(get_current_user),
):
    """Add a message to a ticket conversation."""
    ticket = await db.tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    now = datetime.now(timezone.utc).isoformat()
    msg_id = str(uuid.uuid4())

    message = {
        "id": msg_id,
        "ticket_id": ticket_id,
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_email": current_user.get("email", ""),
        "is_admin": current_user.get("is_network_admin", False),
        "message": body.message,
        "created_at": now,
    }

    # Check if this user is admin for the ticket's site
    if not message["is_admin"] and ticket.get("main_site_id"):
        site_user = await db.main_site_users.find_one(
            {"main_site_id": ticket["main_site_id"], "user_id": current_user["id"]},
            {"_id": 0, "role": 1},
        )
        if site_user and site_user.get("role") in ("admin", "owner"):
            message["is_admin"] = True

    await db.ticket_messages.insert_one({**message})

    # Update ticket
    await db.tickets.update_one(
        {"id": ticket_id},
        {"$set": {"updated_at": now}, "$inc": {"message_count": 1}},
    )

    # Notify the other party
    notify_user_id = None
    if message["is_admin"]:
        notify_user_id = ticket["created_by"]
    else:
        # Notify admins
        if ticket.get("main_site_id"):
            admins = await db.main_site_users.find(
                {"main_site_id": ticket["main_site_id"], "role": {"$in": ["admin", "owner"]}},
                {"_id": 0, "user_id": 1},
            ).to_list(500)
            network_admins = await db.users.find(
                {"is_network_admin": True}, {"_id": 0, "id": 1}
            ).to_list(100)

            for u in admins + [{"user_id": na["id"]} for na in network_admins]:
                uid = u.get("user_id") or u.get("id")
                if uid and uid != current_user["id"]:
                    await db.ticket_notifications.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": uid,
                        "ticket_id": ticket_id,
                        "type": "new_message",
                        "read": False,
                        "created_at": now,
                    })

    if notify_user_id and notify_user_id != current_user["id"]:
        await db.ticket_notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": notify_user_id,
            "ticket_id": ticket_id,
            "type": "new_message",
            "read": False,
            "created_at": now,
        })

    return message


@ticket_router.put("/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: str,
    body: TicketStatusUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Update ticket status. Admin only."""
    ticket = await db.tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if body.status not in ("open", "in_progress", "resolved", "closed"):
        raise HTTPException(status_code=400, detail="Invalid status")

    is_admin = current_user.get("is_network_admin", False)
    if not is_admin and ticket.get("main_site_id"):
        site_user = await db.main_site_users.find_one(
            {"main_site_id": ticket["main_site_id"], "user_id": current_user["id"]},
            {"_id": 0, "role": 1},
        )
        if site_user and site_user.get("role") in ("admin", "owner"):
            is_admin = True

    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    now = datetime.now(timezone.utc).isoformat()
    await db.tickets.update_one(
        {"id": ticket_id},
        {"$set": {"status": body.status, "updated_at": now}},
    )

    return {"status": body.status, "ticket_id": ticket_id}
