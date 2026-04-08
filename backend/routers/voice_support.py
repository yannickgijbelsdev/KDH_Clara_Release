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
from services.auth import get_current_user, require_network_admin

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



CLARA_VOICE_PROMPT = """You are Clara, the voice support assistant for the Clara radio station management platform.

IMPORTANT RULES ABOUT THE PLATFORM UI:
- The main navigation is a HORIZONTAL TOP BAR at the top of the screen, NOT a sidebar or left menu.
- Users switch between sites using a dropdown in the top-right avatar area.
- Pages include: Shows, Content, Media Library, RDS Builder, Stream Monitor, WordPress, Tasks, and Settings.
- You CANNOT highlight, select, click, or visually interact with any UI elements. You are a voice-only assistant.
- NEVER say you will highlight, point to, or show something on screen. Instead, describe WHERE the user can find things by name and location.

YOUR CAPABILITIES:
- Explain how features work step by step
- Help troubleshoot common issues (WordPress publishing, RDS data, stream monitoring, Cloudflare)
- Guide users through the platform navigation by describing menu locations
- Suggest creating a support ticket if the issue cannot be resolved

CONVERSATION STYLE:
- Be concise and friendly. Keep answers short (3-5 sentences max).
- Always speak English. Do not switch to other languages even if the user speaks another language.
- Use simple, non-technical language. The users are radio professionals, not developers.
- If you don't know something, say so honestly and suggest contacting support."""


class UpdateAgentPromptBody(BaseModel):
    prompt: str = CLARA_VOICE_PROMPT
    first_message: str = "Hi! I'm Clara, your voice support assistant. How can I help you today?"
    language: str = "en"


@voice_support_router.post("/update-agent-prompt")
async def update_agent_prompt(
    body: UpdateAgentPromptBody = UpdateAgentPromptBody(),
    current_user: dict = Depends(require_network_admin)
):
    """Update the ElevenLabs agent prompt and language. Network admin only."""
    if not ELEVENLABS_API_KEY or not ELEVENLABS_AGENT_ID:
        raise HTTPException(status_code=500, detail="ElevenLabs not configured")

    payload = {
        "conversation_config": {
            "agent": {
                "prompt": {
                    "prompt": body.prompt,
                },
                "first_message": body.first_message,
                "language": body.language,
            }
        }
    }

    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"https://api.elevenlabs.io/v1/convai/agents/{ELEVENLABS_AGENT_ID}",
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if resp.status_code != 200:
            logger.error(f"ElevenLabs agent update failed: {resp.status_code} {resp.text}")
            raise HTTPException(status_code=502, detail=f"Failed to update agent: {resp.text[:200]}")

    return {"updated": True, "agent_id": ELEVENLABS_AGENT_ID}
