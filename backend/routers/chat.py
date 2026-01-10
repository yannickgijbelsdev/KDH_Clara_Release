"""Team chat routes."""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from database import db
from models.chat import (
    ChatThreadCreate, ChatThreadResponse,
    ChatMessageCreate, ChatMessageResponse
)
from services.auth import get_current_user

chat_router = APIRouter(prefix="/chat", tags=["Chat"])


@chat_router.get("/threads", response_model=List[ChatThreadResponse])
async def get_chat_threads(
    current_user: dict = Depends(get_current_user)
):
    """Get all chat threads for the team."""
    threads = await db.chat_threads.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    
    for thread in threads:
        if thread.get("show_id"):
            show = await db.shows.find_one({"id": thread["show_id"]}, {"title": 1})
            thread["show_title"] = show.get("title") if show else None
        
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
    thread = await db.chat_threads.find_one(
        {"team_id": current_user.get('team_id'), "type": "team"},
        {"_id": 0}
    )
    
    if not thread:
        now = datetime.now(timezone.utc).isoformat()
        thread = {
            "id": str(uuid.uuid4()),
            "team_id": current_user.get('team_id'),
            "type": "team",
            "show_id": None,
            "created_by": current_user['id'],
            "created_at": now,
            "updated_at": now
        }
        await db.chat_threads.insert_one(thread)
        thread.pop("_id", None)
    
    return thread


@chat_router.post("/threads", response_model=ChatThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_thread(
    thread_data: ChatThreadCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new chat thread (show-specific)."""
    if thread_data.type == "team":
        return await get_or_create_team_thread(current_user)
    
    if thread_data.show_id:
        show = await db.shows.find_one(
            {"id": thread_data.show_id, "team_id": current_user.get('team_id')}
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
    
    now = datetime.now(timezone.utc).isoformat()
    thread_doc = {
        "id": str(uuid.uuid4()),
        "team_id": current_user.get('team_id'),
        "type": thread_data.type,
        "show_id": thread_data.show_id,
        "created_by": current_user['id'],
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
    thread = await db.chat_threads.find_one(
        {"id": thread_id, "team_id": current_user.get('team_id')}
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
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
    thread = await db.chat_threads.find_one(
        {"id": thread_id, "team_id": current_user.get('team_id')}
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    now = datetime.now(timezone.utc).isoformat()
    message_doc = {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "user_id": current_user['id'],
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
