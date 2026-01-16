"""Team chat routes."""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from database import db
from models.chat import (
    ChatThreadCreate, ChatThreadResponse,
    ChatMessageCreate, ChatMessageResponse,
    TeamMemberResponse
)
from services.auth import get_current_user

chat_router = APIRouter(prefix="/chat", tags=["Chat"])


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
    current_user: dict = Depends(get_current_user)
):
    """Get all team members for starting chats."""
    members = await db.users.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
    ).to_list(100)
    return members


@chat_router.get("/threads", response_model=List[ChatThreadResponse])
async def get_chat_threads(
    current_user: dict = Depends(get_current_user)
):
    """Get all chat threads accessible to the current user."""
    team_id = current_user.get('team_id')
    user_id = current_user.get('id')
    
    # Get threads where:
    # - team thread (everyone sees)
    # - show thread (everyone sees)
    # - group/private thread where user is a member
    threads = await db.chat_threads.find(
        {
            "team_id": team_id,
            "$or": [
                {"type": {"$in": ["team", "show"]}},
                {"member_ids": user_id}
            ]
        },
        {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    
    for thread in threads:
        # Add show title if applicable
        if thread.get("show_id"):
            show = await db.shows.find_one({"id": thread["show_id"]}, {"title": 1})
            thread["show_title"] = show.get("title") if show else None
        
        # Add member info for group/private threads
        if thread.get("member_ids"):
            thread["members"] = await get_member_info(thread["member_ids"])
        
        # For team threads, add all team members
        if thread.get("type") == "team":
            all_members = await db.users.find(
                {"team_id": team_id},
                {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
            ).to_list(100)
            thread["members"] = all_members
            thread["member_ids"] = [m["id"] for m in all_members]
        
        # Get last message
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
            "created_by": current_user['id'],
            "created_at": now,
            "updated_at": now
        }
        await db.chat_threads.insert_one(thread)
        thread.pop("_id", None)
    
    # Add all team members
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
    
    # Handle team thread
    if thread_data.type == "team":
        return await get_or_create_team_thread(current_user)
    
    # Handle show thread
    if thread_data.type == "show" and thread_data.show_id:
        show = await db.shows.find_one(
            {"id": thread_data.show_id, "team_id": team_id}
        )
        if not show:
            raise HTTPException(status_code=404, detail="Show not found")
        
        existing = await db.chat_threads.find_one({
            "show_id": thread_data.show_id,
            "type": "show"
        })
        if existing:
            existing.pop("_id", None)
            existing["show_title"] = show.get("title")
            return existing
    
    # Handle private (1-on-1) thread
    if thread_data.type == "private":
        if not thread_data.member_ids or len(thread_data.member_ids) != 1:
            raise HTTPException(status_code=400, detail="Private chat requires exactly one other member")
        
        other_user_id = thread_data.member_ids[0]
        
        # Verify the other user exists and is on the same team
        other_user = await db.users.find_one({"id": other_user_id, "team_id": team_id})
        if not other_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if private chat already exists between these two users
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
        
        # Create new private thread
        now = datetime.now(timezone.utc).isoformat()
        thread_doc = {
            "id": str(uuid.uuid4()),
            "team_id": team_id,
            "type": "private",
            "name": None,
            "show_id": None,
            "member_ids": member_ids_sorted,
            "created_by": user_id,
            "created_at": now,
            "updated_at": now
        }
        await db.chat_threads.insert_one(thread_doc)
        thread_doc.pop("_id", None)
        thread_doc["members"] = await get_member_info(member_ids_sorted)
        return thread_doc
    
    # Handle group thread
    if thread_data.type == "group":
        if not thread_data.member_ids or len(thread_data.member_ids) < 1:
            raise HTTPException(status_code=400, detail="Group chat requires at least one other member")
        
        if not thread_data.name:
            raise HTTPException(status_code=400, detail="Group chat requires a name")
        
        # Verify all members exist and are on the same team
        for member_id in thread_data.member_ids:
            member = await db.users.find_one({"id": member_id, "team_id": team_id})
            if not member:
                raise HTTPException(status_code=404, detail=f"User {member_id} not found")
        
        # Include the creator in the members
        all_member_ids = list(set([user_id] + thread_data.member_ids))
        
        now = datetime.now(timezone.utc).isoformat()
        thread_doc = {
            "id": str(uuid.uuid4()),
            "team_id": team_id,
            "type": "group",
            "name": thread_data.name,
            "show_id": None,
            "member_ids": all_member_ids,
            "created_by": user_id,
            "created_at": now,
            "updated_at": now
        }
        await db.chat_threads.insert_one(thread_doc)
        thread_doc.pop("_id", None)
        thread_doc["members"] = await get_member_info(all_member_ids)
        return thread_doc
    
    # Generic thread creation (fallback)
    now = datetime.now(timezone.utc).isoformat()
    thread_doc = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "type": thread_data.type,
        "name": thread_data.name,
        "show_id": thread_data.show_id,
        "member_ids": thread_data.member_ids or [],
        "created_by": user_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.chat_threads.insert_one(thread_doc)
    thread_doc.pop("_id", None)
    return thread_doc


@chat_router.get("/threads/{thread_id}/messages", response_model=List[ChatMessageResponse])
async def get_thread_messages(
    thread_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get messages in a thread."""
    user_id = current_user.get('id')
    team_id = current_user.get('team_id')
    
    thread = await db.chat_threads.find_one(
        {"id": thread_id, "team_id": team_id}
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Check access for group/private threads
    if thread.get("type") in ["group", "private"]:
        if user_id not in thread.get("member_ids", []):
            raise HTTPException(status_code=403, detail="Not a member of this thread")
    
    query = {"thread_id": thread_id}
    if before:
        query["created_at"] = {"$lt": before}
    
    messages = await db.chat_messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    for msg in messages:
        user = await db.users.find_one({"id": msg["user_id"]}, {"name": 1})
        msg["user_name"] = user.get("name") if user else "Unknown"
    
    messages.reverse()
    return messages


@chat_router.post("/threads/{thread_id}/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    thread_id: str,
    message_data: ChatMessageCreate,
    current_user: dict = Depends(get_current_user)
):
    """Send a message to a thread."""
    user_id = current_user.get('id')
    team_id = current_user.get('team_id')
    
    thread = await db.chat_threads.find_one(
        {"id": thread_id, "team_id": team_id}
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Check access for group/private threads
    if thread.get("type") in ["group", "private"]:
        if user_id not in thread.get("member_ids", []):
            raise HTTPException(status_code=403, detail="Not a member of this thread")
    
    now = datetime.now(timezone.utc).isoformat()
    message_doc = {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "user_id": user_id,
        "body": message_data.body,
        "created_at": now
    }
    
    await db.chat_messages.insert_one(message_doc)
    
    await db.chat_threads.update_one(
        {"id": thread_id},
        {"$set": {"updated_at": now}}
    )
    
    message_doc.pop("_id", None)
    message_doc["user_name"] = current_user.get("name")
    return message_doc
