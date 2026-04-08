"""Voice Support — AI-powered real-time voice calls using ElevenLabs Conversational AI."""
import os
import uuid
import logging
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv

load_dotenv()

from database import db
from services.auth import get_current_user

logger = logging.getLogger(__name__)

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
ELEVENLABS_AGENT_ID = os.environ.get("ELEVENLABS_AGENT_ID")

voice_support_router = APIRouter(prefix="/voice-support", tags=["Voice Support"])


# --- Models ---

class SaveTranscriptBody(BaseModel):
    session_id: str
    main_site_id: str
    language: str = "en"
    messages: List[dict] = []
    duration_seconds: int = 0


# --- Endpoints ---

@voice_support_router.get("/signed-url")
async def get_signed_url(
    main_site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a signed URL from ElevenLabs to start a voice conversation. Enterprise only."""
    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not site or not site.get("clara_enterprise"):
        raise HTTPException(status_code=403, detail="Clara Enterprise is not enabled for this site")

    # Create a session record
    session_id = str(uuid.uuid4())
    session = {
        "session_id": session_id,
        "main_site_id": main_site_id,
        "user_id": current_user.get("id", ""),
        "user_name": current_user.get("name", ""),
        "status": "active",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "messages": [],
        "language": "",
        "duration_seconds": 0,
    }
    await db.voice_support_sessions.insert_one(session)

    # Get signed URL from ElevenLabs
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id={ELEVENLABS_AGENT_ID}",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            timeout=10,
        )
        if resp.status_code != 200:
            logger.error(f"ElevenLabs signed URL error: {resp.status_code} {resp.text}")
            raise HTTPException(status_code=502, detail="Failed to get voice session")
        data = resp.json()

    return {
        "signed_url": data["signed_url"],
        "session_id": session_id,
        "site_name": site.get("name", ""),
    }


@voice_support_router.post("/save-transcript")
async def save_transcript(
    body: SaveTranscriptBody,
    current_user: dict = Depends(get_current_user)
):
    """Save the transcript after a voice call ends."""
    await db.voice_support_sessions.update_one(
        {"session_id": body.session_id, "user_id": current_user.get("id", "")},
        {"$set": {
            "messages": body.messages,
            "language": body.language,
            "duration_seconds": body.duration_seconds,
            "status": "completed",
            "ended_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {"saved": True}


@voice_support_router.get("/sessions")
async def get_voice_sessions(
    main_site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get voice support session history for a user."""
    sessions = await db.voice_support_sessions.find(
        {"main_site_id": main_site_id, "user_id": current_user.get("id", "")},
        {"_id": 0, "session_id": 1, "language": 1, "duration_seconds": 1, "status": 1, "started_at": 1, "messages": {"$slice": 1}}
    ).sort("started_at", -1).to_list(20)
    return {"sessions": sessions}


@voice_support_router.get("/session/{session_id}")
async def get_voice_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get full transcript of a voice session."""
    session = await db.voice_support_sessions.find_one(
        {"session_id": session_id, "user_id": current_user.get("id", "")},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
