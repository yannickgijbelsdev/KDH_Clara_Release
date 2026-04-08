"""Support Tickets — Full CRUD with messenger-style messages, status tracking, and email notifications."""
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response
from pydantic import BaseModel
from typing import Optional, List
from database import db
from services.auth import get_current_user
from services.object_storage import upload_file as s3_upload_file, get_object as s3_get_object

logger = logging.getLogger(__name__)

support_router = APIRouter(prefix="/support-tickets", tags=["Support Tickets"])

# --- Models ---

class CreateTicketBody(BaseModel):
    subject: str
    description: str
    error_message: Optional[str] = ""
    steps_tried: Optional[str] = ""
    page_url: Optional[str] = ""
    main_site_id: Optional[str] = ""

class UpdateStatusBody(BaseModel):
    status: str  # open, searching, solved, closed

class AddMessageBody(BaseModel):
    text: str
    attachments: Optional[List[dict]] = []

# --- Helpers ---

VALID_STATUSES = ["open", "searching", "solved", "closed"]
COUNTER_STATUSES = ["open"]  # Only "open" counts towards the badge

async def _send_ticket_email(ticket_id: str, subject: str, body_html: str, recipients: List[str]):
    """Send email notification to all relevant parties."""
    try:
        from services.email_service import send_email_with_config
        smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
        if not smtp_config or not smtp_config.get("password"):
            return
        for email in recipients:
            if email:
                asyncio.create_task(
                    send_email_with_config(smtp_config, email, subject, body_html)
                )
    except Exception:
        pass

async def _get_ticket_recipients(ticket: dict) -> List[str]:
    """Get all email recipients for a ticket: creator, support email, network admins."""
    recipients = set()
    # Ticket creator
    if ticket.get("user_email"):
        recipients.add(ticket["user_email"])
    # Support email
    recipients.add("support.clara@koodh.com")
    # Network admins
    admins = await db.users.find(
        {"is_network_admin": True},
        {"_id": 0, "email": 1}
    ).to_list(50)
    for a in admins:
        if a.get("email"):
            recipients.add(a["email"])
    return list(recipients)

def _ticket_email_html(ticket_id: str, ticket_subject: str, action: str, detail: str, actor_name: str) -> str:
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: #f8f8f8; border-radius: 16px; padding: 24px; border: 1px solid #e4e4e7;">
        <h2 style="margin: 0 0 8px; font-size: 16px; color: #18181b;">Support Ticket Update</h2>
        <p style="margin: 0 0 16px; font-size: 13px; color: #71717a;">Ticket: {ticket_subject}</p>
        <div style="background: white; border-radius: 12px; padding: 16px; border: 1px solid #e4e4e7;">
          <p style="margin: 0 0 4px; font-size: 12px; color: #a1a1aa;">{actor_name} &mdash; {action}</p>
          <p style="margin: 0; font-size: 14px; color: #27272a;">{detail}</p>
        </div>
        <p style="margin: 16px 0 0; font-size: 11px; color: #a1a1aa;">Ticket ID: {ticket_id}</p>
      </div>
    </div>
    """

# --- Endpoints ---

@support_router.post("")
async def create_ticket(body: CreateTicketBody, current_user: dict = Depends(get_current_user)):
    """Create a new support ticket."""
    ticket_id = str(uuid.uuid4())[:12]
    ticket = {
        "id": ticket_id,
        "subject": body.subject,
        "description": body.description,
        "error_message": body.error_message or "",
        "steps_tried": body.steps_tried or "",
        "page_url": body.page_url or "",
        "main_site_id": body.main_site_id or "",
        "status": "open",
        "user_id": current_user.get("id", ""),
        "user_name": current_user.get("name", ""),
        "user_email": current_user.get("email", ""),
        "messages": [
            {
                "id": str(uuid.uuid4())[:8],
                "sender_id": current_user.get("id", ""),
                "sender_name": current_user.get("name", ""),
                "sender_role": "user",
                "text": body.description,
                "attachments": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
        "has_unread_user": False,
        "has_unread_admin": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.support_tickets.insert_one(ticket)

    # Notify in background (don't block the response)
    async def _notify():
        recipients = await _get_ticket_recipients(ticket)
        html = _ticket_email_html(ticket_id, body.subject, "New ticket created", body.description, current_user.get("name", "User"))
        await _send_ticket_email(ticket_id, f"[Clara Support] New: {body.subject}", html, recipients)
    asyncio.create_task(_notify())

    return {"id": ticket_id, "status": "open"}


@support_router.get("")
async def list_tickets(current_user: dict = Depends(get_current_user)):
    """List tickets. Network/system admins see all, users see their own."""
    is_admin = current_user.get("is_system_admin") or current_user.get("is_network_admin")
    query = {} if is_admin else {"user_id": current_user.get("id", "")}
    tickets = await db.support_tickets.find(
        query,
        {"_id": 0, "messages": 0}
    ).sort("updated_at", -1).to_list(200)
    return {"tickets": tickets}


@support_router.get("/counts")
async def ticket_counts(current_user: dict = Depends(get_current_user)):
    """Get open ticket counts for badge display."""
    is_admin = current_user.get("is_system_admin") or current_user.get("is_network_admin")
    user_id = current_user.get("id", "")

    if is_admin:
        # Admin: count all open tickets
        open_count = await db.support_tickets.count_documents({"status": "open"})
        unread_count = await db.support_tickets.count_documents({"has_unread_admin": True})
    else:
        # User: count their own open tickets
        open_count = await db.support_tickets.count_documents({"user_id": user_id, "status": "open"})
        unread_count = await db.support_tickets.count_documents({"user_id": user_id, "has_unread_user": True})

    return {"open": open_count, "unread": unread_count}


@support_router.get("/user-updates")
async def user_ticket_updates(current_user: dict = Depends(get_current_user)):
    """Check if user has any unread ticket updates (for login popup)."""
    user_id = current_user.get("id", "")
    updated_tickets = await db.support_tickets.find(
        {"user_id": user_id, "has_unread_user": True},
        {"_id": 0, "id": 1, "subject": 1, "status": 1, "updated_at": 1}
    ).to_list(10)
    return {"has_updates": len(updated_tickets) > 0, "tickets": updated_tickets}


@support_router.get("/{ticket_id}")
async def get_ticket(ticket_id: str, current_user: dict = Depends(get_current_user)):
    """Get full ticket with messages."""
    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    is_admin = current_user.get("is_system_admin") or current_user.get("is_network_admin")
    if not is_admin and ticket.get("user_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Mark as read
    if is_admin:
        await db.support_tickets.update_one({"id": ticket_id}, {"$set": {"has_unread_admin": False}})
    else:
        await db.support_tickets.update_one({"id": ticket_id}, {"$set": {"has_unread_user": False}})

    return ticket


@support_router.put("/{ticket_id}/status")
async def update_ticket_status(ticket_id: str, body: UpdateStatusBody, current_user: dict = Depends(get_current_user)):
    """Update ticket status. Only admins can change status."""
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {VALID_STATUSES}")

    is_admin = current_user.get("is_system_admin") or current_user.get("is_network_admin")
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only admins can change ticket status")

    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    status_labels = {"open": "Open", "searching": "Searching for a solution", "solved": "Solution found", "closed": "Closed"}

    # Add system message about status change
    system_msg = {
        "id": str(uuid.uuid4())[:8],
        "sender_id": current_user.get("id", ""),
        "sender_name": current_user.get("name", ""),
        "sender_role": "admin",
        "text": f"Status changed to: {status_labels.get(body.status, body.status)}",
        "is_system": True,
        "attachments": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.support_tickets.update_one(
        {"id": ticket_id},
        {
            "$set": {
                "status": body.status,
                "has_unread_user": True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            "$push": {"messages": system_msg}
        }
    )

    # Notify in background (don't block the response)
    async def _notify():
        recipients = await _get_ticket_recipients(ticket)
        html = _ticket_email_html(ticket_id, ticket["subject"], "Status updated", status_labels.get(body.status, body.status), current_user.get("name", "Admin"))
        await _send_ticket_email(ticket_id, f"[Clara Support] Status: {status_labels.get(body.status, body.status)} — {ticket['subject']}", html, recipients)
    asyncio.create_task(_notify())

    return {"status": body.status}


@support_router.post("/{ticket_id}/messages")
async def add_message(ticket_id: str, body: AddMessageBody, current_user: dict = Depends(get_current_user)):
    """Add a message to a ticket."""
    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    is_admin = current_user.get("is_system_admin") or current_user.get("is_network_admin")
    if not is_admin and ticket.get("user_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")

    sender_role = "admin" if is_admin else "user"
    message = {
        "id": str(uuid.uuid4())[:8],
        "sender_id": current_user.get("id", ""),
        "sender_name": current_user.get("name", ""),
        "sender_role": sender_role,
        "text": body.text,
        "attachments": body.attachments or [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    update_fields = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if sender_role == "admin":
        update_fields["has_unread_user"] = True
        update_fields["has_unread_admin"] = False
    else:
        update_fields["has_unread_admin"] = True
        update_fields["has_unread_user"] = False

    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$set": update_fields, "$push": {"messages": message}}
    )

    # Notify in background (don't block the response)
    async def _notify():
        recipients = await _get_ticket_recipients(ticket)
        recipients = [r for r in recipients if r != current_user.get("email", "")]
        html = _ticket_email_html(ticket_id, ticket["subject"], "New message", body.text[:200], current_user.get("name", ""))
        await _send_ticket_email(ticket_id, f"[Clara Support] Reply: {ticket['subject']}", html, recipients)
    asyncio.create_task(_notify())

    return {"message_id": message["id"]}


@support_router.post("/{ticket_id}/messages/attachment")
async def upload_attachment(
    ticket_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an image/screenshot attachment to S3 and return its URL."""
    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0, "user_id": 1})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    is_admin = current_user.get("is_system_admin") or current_user.get("is_network_admin")
    if not is_admin and ticket.get("user_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=413, detail="File too large (max 5MB)")

    content_type = file.content_type or "image/png"
    filename = file.filename or "attachment.png"

    try:
        result = await asyncio.to_thread(s3_upload_file, content, filename, content_type, "tickets")
        storage_path = result["storage_path"]
        url = f"/api/support-tickets/files/{storage_path}"
    except Exception as e:
        logger.error(f"S3 upload failed: {e}")
        raise HTTPException(status_code=500, detail="File upload failed")

    attachment = {
        "id": str(uuid.uuid4())[:8],
        "filename": filename,
        "content_type": content_type,
        "storage_path": storage_path,
        "url": url,
        "size": len(content),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    return {"attachment": attachment}


@support_router.post("/{ticket_id}/recording")
async def upload_recording(
    ticket_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a screen recording to S3."""
    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0, "user_id": 1})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    is_admin = current_user.get("is_system_admin") or current_user.get("is_network_admin")
    if not is_admin and ticket.get("user_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=413, detail="Recording too large (max 50MB)")

    content_type = file.content_type or "video/webm"
    filename = file.filename or "recording.webm"

    try:
        result = await asyncio.to_thread(s3_upload_file, content, filename, content_type, "recordings")
        storage_path = result["storage_path"]
        url = f"/api/support-tickets/files/{storage_path}"
    except Exception as e:
        logger.error(f"S3 upload failed: {e}")
        raise HTTPException(status_code=500, detail="Recording upload failed")

    attachment = {
        "id": str(uuid.uuid4())[:8],
        "filename": filename,
        "content_type": content_type,
        "storage_path": storage_path,
        "url": url,
        "size": len(content),
        "is_recording": True,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    return {"attachment": attachment}


@support_router.get("/files/{storage_path:path}")
async def serve_file(storage_path: str, auth: Optional[str] = Query(None)):
    """Proxy endpoint to serve files from S3 storage. Supports ?auth=token for img/video tags."""
    if not auth:
        raise HTTPException(status_code=401, detail="Authentication required")
    # Validate token
    from services.auth import decode_token
    try:
        decode_token(auth)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        data, content_type = await asyncio.to_thread(s3_get_object, storage_path)
        return Response(content=data, media_type=content_type)
    except Exception as e:
        logger.error(f"S3 download failed for {storage_path}: {e}")
        raise HTTPException(status_code=404, detail="File not found")
