"""Team chat routes with real-time support."""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Request
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import os
import aiofiles

from database import db
from models.chat import (
    ChatThreadCreate, ChatThreadResponse, ChatThreadUpdate, ChatThreadMemberUpdate,
    ChatMessageCreate, ChatMessageResponse,
    TeamMemberResponse
)
from services.auth import get_current_user
from services.audit import log_action, get_client_ip
from services.s3_storage import upload_file_to_s3, is_s3_configured
from routers.main_sites import get_main_site_id_from_header

chat_router = APIRouter(prefix="/chat", tags=["Chat"])

UPLOAD_DIR = "/app/backend/uploads/chat"
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def get_chat_query_filter(request: Request, current_user: dict) -> dict:
    """Helper to build query filter for chat data - uses main_site_id if available, otherwise team_id."""
    main_site_id = await get_main_site_id_from_header(request)
    if main_site_id:
        return {"main_site_id": main_site_id}
    team_id = current_user.get('team_id')
    if team_id:
        return {"team_id": team_id}
    return {}


async def get_member_info(user_ids: List[str]) -> List[dict]:
    """Get user info for a list of user IDs."""
    members = []
    for uid in user_ids:
        user = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1})
        if user:
            members.append(user)
    return members


@chat_router.get("/members", response_model=List[TeamMemberResponse])
async def get_team_members(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get all team members for starting chats."""
    main_site_id = await get_main_site_id_from_header(request)
    
    if main_site_id:
        # Get users from main_site_users
        user_accesses = await db.main_site_users.find(
            {"main_site_id": main_site_id},
            {"_id": 0, "user_id": 1}
        ).to_list(100)
        user_ids = [ua["user_id"] for ua in user_accesses]
        
        members = await db.users.find(
            {"id": {"$in": user_ids}},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
        ).to_list(100)
    else:
        members = await db.users.find(
            {"team_id": current_user.get('team_id')},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
        ).to_list(100)
    
    return members


@chat_router.get("/threads", response_model=List[ChatThreadResponse])
async def get_chat_threads(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get all chat threads accessible to the current user."""
    query_filter = await get_chat_query_filter(request, current_user)
    user_id = current_user.get('id')
    
    if not query_filter:
        return []
    
    threads = await db.chat_threads.find(
        {
            **query_filter,
            "$or": [
                {"type": {"$in": ["team", "show"]}},
                {"member_ids": user_id}
            ]
        },
        {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    
    for thread in threads:
        if thread.get("show_id"):
            show = await db.shows.find_one({"id": thread["show_id"]}, {"title": 1})
            thread["show_title"] = show.get("title") if show else None
        
        if thread.get("member_ids"):
            thread["members"] = await get_member_info(thread["member_ids"])
        
        if thread.get("type") == "team":
            all_members = await db.users.find(
                {"team_id": team_id},
                {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
            ).to_list(100)
            thread["members"] = all_members
            thread["member_ids"] = [m["id"] for m in all_members]
        
        last_msg = await db.chat_messages.find_one(
            {"thread_id": thread["id"]},
            {"body": 1, "created_at": 1},
            sort=[("created_at", -1)]
        )
        if last_msg:
            thread["last_message"] = last_msg.get("body", "")[:100]
            thread["last_message_at"] = last_msg.get("created_at")
    
    return threads


@chat_router.get("/threads/team", response_model=ChatThreadResponse)
async def get_or_create_team_thread(
    current_user: dict = Depends(get_current_user)
):
    """Get or create the default team chat thread."""
    team_id = current_user.get('team_id')
    
    thread = await db.chat_threads.find_one(
        {"team_id": team_id, "type": "team"},
        {"_id": 0}
    )
    
    if not thread:
        now = datetime.now(timezone.utc).isoformat()
        thread = {
            "id": str(uuid.uuid4()),
            "team_id": team_id,
            "type": "team",
            "name": None,
            "show_id": None,
            "member_ids": [],
            "member_roles": {},
            "created_by": current_user['id'],
            "created_at": now,
            "updated_at": now
        }
        await db.chat_threads.insert_one(thread)
        thread.pop("_id", None)
    
    all_members = await db.users.find(
        {"team_id": team_id},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
    ).to_list(100)
    thread["members"] = all_members
    thread["member_ids"] = [m["id"] for m in all_members]
    
    return thread


@chat_router.post("/threads", response_model=ChatThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_thread(
    thread_data: ChatThreadCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new chat thread."""
    team_id = current_user.get('team_id')
    user_id = current_user.get('id')
    
    if thread_data.type == "team":
        return await get_or_create_team_thread(current_user)
    
    if thread_data.type == "show" and thread_data.show_id:
        show = await db.shows.find_one({"id": thread_data.show_id, "team_id": team_id})
        if not show:
            raise HTTPException(status_code=404, detail="Show not found")
        
        existing = await db.chat_threads.find_one({"show_id": thread_data.show_id, "type": "show"})
        if existing:
            existing.pop("_id", None)
            existing["show_title"] = show.get("title")
            return existing
    
    if thread_data.type == "private":
        if not thread_data.member_ids or len(thread_data.member_ids) != 1:
            raise HTTPException(status_code=400, detail="Private chat requires exactly one other member")
        
        other_user_id = thread_data.member_ids[0]
        other_user = await db.users.find_one({"id": other_user_id, "team_id": team_id})
        if not other_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        member_ids_sorted = sorted([user_id, other_user_id])
        existing = await db.chat_threads.find_one({
            "team_id": team_id,
            "type": "private",
            "member_ids": member_ids_sorted
        })
        if existing:
            existing.pop("_id", None)
            existing["members"] = await get_member_info(member_ids_sorted)
            return existing
        
        now = datetime.now(timezone.utc).isoformat()
        thread_doc = {
            "id": str(uuid.uuid4()),
            "team_id": team_id,
            "type": "private",
            "name": None,
            "show_id": None,
            "member_ids": member_ids_sorted,
            "member_roles": {user_id: "owner", other_user_id: "owner"},
            "created_by": user_id,
            "created_at": now,
            "updated_at": now
        }
        await db.chat_threads.insert_one(thread_doc)
        thread_doc.pop("_id", None)
        thread_doc["members"] = await get_member_info(member_ids_sorted)
        return thread_doc
    
    if thread_data.type == "group":
        if not thread_data.member_ids or len(thread_data.member_ids) < 1:
            raise HTTPException(status_code=400, detail="Group chat requires at least one other member")
        
        if not thread_data.name:
            raise HTTPException(status_code=400, detail="Group chat requires a name")
        
        for member_id in thread_data.member_ids:
            member = await db.users.find_one({"id": member_id, "team_id": team_id})
            if not member:
                raise HTTPException(status_code=404, detail=f"User {member_id} not found")
        
        all_member_ids = list(set([user_id] + thread_data.member_ids))
        member_roles = {user_id: "owner"}
        for mid in thread_data.member_ids:
            member_roles[mid] = "member"
        
        now = datetime.now(timezone.utc).isoformat()
        thread_doc = {
            "id": str(uuid.uuid4()),
            "team_id": team_id,
            "type": "group",
            "name": thread_data.name,
            "show_id": None,
            "member_ids": all_member_ids,
            "member_roles": member_roles,
            "created_by": user_id,
            "created_at": now,
            "updated_at": now
        }
        await db.chat_threads.insert_one(thread_doc)
        thread_doc.pop("_id", None)
        thread_doc["members"] = await get_member_info(all_member_ids)
        return thread_doc
    
    now = datetime.now(timezone.utc).isoformat()
    thread_doc = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "type": thread_data.type,
        "name": thread_data.name,
        "show_id": thread_data.show_id,
        "member_ids": thread_data.member_ids or [],
        "member_roles": {},
        "created_by": user_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.chat_threads.insert_one(thread_doc)
    thread_doc.pop("_id", None)
    return thread_doc


@chat_router.patch("/threads/{thread_id}", response_model=ChatThreadResponse)
async def update_chat_thread(
    thread_id: str,
    update_data: ChatThreadUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a chat thread (name, etc). Only owner/admin can update."""
    user_id = current_user.get('id')
    team_id = current_user.get('team_id')
    
    thread = await db.chat_threads.find_one({"id": thread_id, "team_id": team_id})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.get("type") not in ["group"]:
        raise HTTPException(status_code=400, detail="Can only update group threads")
    
    member_roles = thread.get("member_roles", {})
    user_role = member_roles.get(user_id)
    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner or admin can update the group")
    
    update_fields = {}
    if update_data.name is not None:
        update_fields["name"] = update_data.name
    
    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.chat_threads.update_one(
            {"id": thread_id},
            {"$set": update_fields}
        )
    
    updated_thread = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0})
    if updated_thread.get("member_ids"):
        updated_thread["members"] = await get_member_info(updated_thread["member_ids"])
    
    return updated_thread


@chat_router.delete("/threads/{thread_id}")
async def delete_chat_thread(
    thread_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a chat thread. Only owner can delete group threads. Either member can delete private chats."""
    user_id = current_user.get('id')
    team_id = current_user.get('team_id')
    
    thread = await db.chat_threads.find_one({"id": thread_id, "team_id": team_id})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    thread_type = thread.get("type")
    
    if thread_type == "team":
        raise HTTPException(status_code=400, detail="Cannot delete the team chat")
    
    if thread_type == "group":
        member_roles = thread.get("member_roles", {})
        user_role = member_roles.get(user_id)
        if user_role != "owner":
            raise HTTPException(status_code=403, detail="Only the owner can delete the group")
    
    if thread_type == "private":
        # Either member of the private chat can delete it
        if user_id not in thread.get("member_ids", []):
            raise HTTPException(status_code=403, detail="You are not a member of this chat")
    
    # Delete all messages in the thread
    await db.chat_messages.delete_many({"thread_id": thread_id})
    
    # Delete the thread
    await db.chat_threads.delete_one({"id": thread_id})
    
    return {"deleted": True, "message": "Chat deleted successfully"}


@chat_router.post("/threads/{thread_id}/members", response_model=ChatThreadResponse)
async def manage_thread_members(
    thread_id: str,
    member_update: ChatThreadMemberUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Add, remove, or change role of thread members. Only owner/admin can manage."""
    user_id = current_user.get('id')
    team_id = current_user.get('team_id')
    
    thread = await db.chat_threads.find_one({"id": thread_id, "team_id": team_id})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.get("type") not in ["group"]:
        raise HTTPException(status_code=400, detail="Can only manage members in group threads")
    
    member_roles = thread.get("member_roles", {})
    user_role = member_roles.get(user_id)
    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner or admin can manage members")
    
    member_ids = thread.get("member_ids", [])
    target_id = member_update.member_id
    
    if member_update.action == "add":
        # Verify user exists and is on the same team
        target_user = await db.users.find_one({"id": target_id, "team_id": team_id})
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if target_id not in member_ids:
            member_ids.append(target_id)
            member_roles[target_id] = "member"
    
    elif member_update.action == "remove":
        if target_id == thread.get("created_by"):
            raise HTTPException(status_code=400, detail="Cannot remove the group owner")
        if target_id in member_ids:
            member_ids.remove(target_id)
            member_roles.pop(target_id, None)
    
    elif member_update.action == "set_role":
        if target_id not in member_ids:
            raise HTTPException(status_code=400, detail="User is not a member of this group")
        
        target_role = member_roles.get(target_id)
        if target_role == "owner" and member_update.role != "owner":
            # Check if there's at least one other owner
            owners = [k for k, v in member_roles.items() if v == "owner" and k != target_id]
            if not owners:
                raise HTTPException(status_code=400, detail="Group must have at least one owner")
        
        # Only owners can make someone else owner or admin
        if member_update.role in ["owner", "admin"] and user_role != "owner":
            raise HTTPException(status_code=403, detail="Only owners can grant owner/admin roles")
        
        member_roles[target_id] = member_update.role
    
    await db.chat_threads.update_one(
        {"id": thread_id},
        {
            "$set": {
                "member_ids": member_ids,
                "member_roles": member_roles,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    updated_thread = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0})
    updated_thread["members"] = await get_member_info(updated_thread.get("member_ids", []))
    return updated_thread


@chat_router.get("/threads/{thread_id}", response_model=ChatThreadResponse)
async def get_thread(
    thread_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single thread with full details."""
    user_id = current_user.get('id')
    team_id = current_user.get('team_id')
    
    thread = await db.chat_threads.find_one({"id": thread_id, "team_id": team_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.get("type") in ["group", "private"]:
        if user_id not in thread.get("member_ids", []):
            raise HTTPException(status_code=403, detail="Not a member of this thread")
    
    if thread.get("member_ids"):
        thread["members"] = await get_member_info(thread["member_ids"])
    
    if thread.get("type") == "team":
        all_members = await db.users.find(
            {"team_id": team_id},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
        ).to_list(100)
        thread["members"] = all_members
        thread["member_ids"] = [m["id"] for m in all_members]
    
    return thread


@chat_router.get("/threads/{thread_id}/messages", response_model=List[ChatMessageResponse])
async def get_thread_messages(
    thread_id: str,
    limit: int = 50,
    after: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get messages in a thread. Supports pagination with 'after' timestamp for real-time."""
    user_id = current_user.get('id')
    team_id = current_user.get('team_id')
    
    thread = await db.chat_threads.find_one({"id": thread_id, "team_id": team_id})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.get("type") in ["group", "private"]:
        if user_id not in thread.get("member_ids", []):
            raise HTTPException(status_code=403, detail="Not a member of this thread")
    
    query = {"thread_id": thread_id}
    if after:
        query["created_at"] = {"$gt": after}
    
    messages = await db.chat_messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", 1 if after else -1).limit(limit).to_list(limit)
    
    for msg in messages:
        user = await db.users.find_one({"id": msg["user_id"]}, {"name": 1})
        msg["user_name"] = user.get("name") if user else "Unknown"
    
    if not after:
        messages.reverse()
    
    return messages


@chat_router.post("/threads/{thread_id}/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    thread_id: str,
    message_data: ChatMessageCreate,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Send a message to a thread."""
    user_id = current_user.get('id')
    team_id = current_user.get('team_id')
    
    thread = await db.chat_threads.find_one({"id": thread_id, "team_id": team_id})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.get("type") in ["group", "private"]:
        if user_id not in thread.get("member_ids", []):
            raise HTTPException(status_code=403, detail="Not a member of this thread")
    
    now = datetime.now(timezone.utc).isoformat()
    message_doc = {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "user_id": user_id,
        "body": message_data.body,
        "attachment_url": message_data.attachment_url,
        "attachment_type": message_data.attachment_type,
        "attachment_name": message_data.attachment_name,
        "created_at": now
    }
    
    await db.chat_messages.insert_one(message_doc)
    
    await db.chat_threads.update_one(
        {"id": thread_id},
        {"$set": {"updated_at": now}}
    )
    
    # Log the chat message
    thread_name = thread.get("name") or ("Team Chat" if thread.get("type") == "team" else "Private Chat")
    await log_action(
        action="Sent Chat Message",
        category="chat",
        user_id=user_id,
        user_name=current_user.get("name"),
        user_email=current_user.get("email"),
        team_id=team_id,
        ip_address=get_client_ip(request),
        target_type="chat_thread",
        target_id=thread_id,
        target_name=thread_name,
        details={
            "thread_type": thread.get("type"),
            "has_attachment": bool(message_data.attachment_url),
            "message_preview": message_data.body[:50] if message_data.body else None
        }
    )
    
    message_doc.pop("_id", None)
    message_doc["user_name"] = current_user.get("name")
    return message_doc


@chat_router.delete("/threads/{thread_id}/messages/{message_id}")
async def delete_message(
    thread_id: str,
    message_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a message for everyone. Only the message sender can delete their message."""
    user_id = current_user.get('id')
    team_id = current_user.get('team_id')
    
    # Verify thread exists and user has access
    thread = await db.chat_threads.find_one({"id": thread_id, "team_id": team_id})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # For group/private chats, verify membership
    if thread.get("type") in ["group", "private"]:
        if user_id not in thread.get("member_ids", []):
            raise HTTPException(status_code=403, detail="Not a member of this thread")
    
    # Find the message
    message = await db.chat_messages.find_one({"id": message_id, "thread_id": thread_id})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Only the sender can delete their own message
    if message.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
    
    # Delete the message
    await db.chat_messages.delete_one({"id": message_id})
    
    return {"deleted": True, "message_id": message_id}


@chat_router.post("/upload")
async def upload_chat_attachment(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an attachment for chat to S3 (image, audio, video, file)."""
    allowed_image_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"]
    allowed_audio_types = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", "audio/m4a", "audio/x-m4a"]
    allowed_video_types = ["video/mp4", "video/quicktime", "video/webm"]
    allowed_file_types = ["application/pdf", "text/plain"]
    
    content_type = file.content_type or ""
    
    if content_type in allowed_image_types:
        attachment_type = "image"
    elif content_type in allowed_audio_types:
        attachment_type = "audio"
    elif content_type in allowed_video_types:
        attachment_type = "video"
    elif content_type in allowed_file_types:
        attachment_type = "file"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type}")
    
    # Read file content
    content = await file.read()
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_filename = f"{uuid.uuid4()}{ext}"
    
    # Upload to S3 if configured
    if is_s3_configured():
        storage_key = f"chat/{current_user.get('team_id')}/{unique_filename}"
        try:
            result = await upload_file_to_s3(content, storage_key, content_type)
            return {
                "url": result['url'],
                "type": attachment_type,
                "name": file.filename,
                "size": len(content),
                "storage_key": storage_key
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")
    
    # Fallback to local storage
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    
    file_url = f"/api/chat/files/{unique_filename}"
    
    return {
        "url": file_url,
        "type": attachment_type,
        "name": file.filename,
        "size": len(content)
    }


@chat_router.get("/files/{filename}")
async def get_chat_file(filename: str):
    """Serve uploaded chat files from local storage."""
    from fastapi.responses import FileResponse
    
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)

