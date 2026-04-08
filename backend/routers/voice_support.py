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

PLATFORM UI:
- The main navigation is a HORIZONTAL TOP BAR at the top of the screen, NOT a sidebar or left menu.
- Users switch between sites using a dropdown in the top-right avatar area.
- Available pages: Dashboard, Shows, Calendar, Show Management, Content Library, Media Library, Team Chat, RDS Settings, RDS Builder, RDS Monitor, Stream Monitor, Sites, Team Settings, WordPress, Activity Logs, Firewall, Support Tickets, Enterprise Assistant, Task Boards, Radioplayer, Security Dashboard.

YOUR TOOLS — USE THEM:
- When a user asks WHERE something is, use the highlight_element tool to visually show them the element on screen. Always highlight instead of just describing.
- When a user asks to GO TO a page, use the navigate_to_page tool to take them there.
- When a user asks to hang up or end the call, use the hang_up tool.
- You can combine navigation and highlighting: first navigate, then highlight.

EXAMPLES OF TOOL USE:
- User: "Where are my shows?" → Use highlight_element with element_name="shows" and description="Click here to see all your shows"
- User: "Take me to the RDS builder" → Use navigate_to_page with page_name="rds builder"
- User: "Where can I find my stream settings?" → Use highlight_element with element_name="stream monitor" and description="Your stream settings are here"
- User: "Hang op" or "End the call" → Use hang_up tool

CONVERSATION STYLE:
- Be concise and friendly. Keep answers short (2-4 sentences max).
- Always speak English. Do not switch to other languages even if the user speaks another language.
- Use simple, non-technical language. The users are radio professionals, not developers.
- When you highlight or navigate, briefly tell the user what you did ("I've highlighted the Shows tab for you" or "I've taken you to the RDS Builder page").
- If you don't know something, say so honestly and suggest contacting support."""


# Client tool definitions for ElevenLabs (JSON Schema format)
CLIENT_TOOL_DEFINITIONS = [
    {
        "type": "client",
        "name": "hang_up",
        "description": "End the voice call. Use this when the user says goodbye, wants to hang up, says 'stop', 'end call', 'hang op', 'tot ziens', or any similar phrase indicating they want to end the conversation.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "type": "client",
        "name": "highlight_element",
        "description": "Visually highlight a UI element on the user's screen with a glowing spotlight effect. Use this to SHOW the user where something is located in the interface. Always use this instead of just describing locations.",
        "parameters": {
            "type": "object",
            "properties": {
                "element_name": {
                    "type": "string",
                    "description": "The name of the UI element to highlight. Valid values: dashboard, shows, calendar, show management, content, content library, media, media library, team chat, rds settings, rds builder, rds monitor, stream monitor, sites, team settings, wordpress, activity logs, firewall, support tickets, enterprise assistant, task boards, radioplayer, security dashboard, user menu, top bar, navigation"
                },
                "description": {
                    "type": "string",
                    "description": "A short helpful description to show next to the highlighted element, e.g. 'Click here to manage your shows'"
                }
            },
            "required": ["element_name", "description"]
        }
    },
    {
        "type": "client",
        "name": "navigate_to_page",
        "description": "Navigate the user to a specific page in the application. Use this when the user asks to go to a page, open something, or when you need to show them a specific section.",
        "parameters": {
            "type": "object",
            "properties": {
                "page_name": {
                    "type": "string",
                    "description": "The page to navigate to. Valid values: dashboard, shows, calendar, show management, content, content library, media, media library, team chat, rds settings, rds builder, rds monitor, stream monitor, sites, team settings, wordpress, activity logs, firewall, support tickets, enterprise assistant, task boards, radioplayer, security dashboard"
                },
                "description": {
                    "type": "string",
                    "description": "Optional description to show after navigation"
                }
            },
            "required": ["page_name"]
        }
    }
]


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


@voice_support_router.post("/setup-agent-tools")
async def setup_agent_tools(
    current_user: dict = Depends(require_network_admin)
):
    """Create client tools on ElevenLabs and assign them to the agent. Run once."""
    if not ELEVENLABS_API_KEY or not ELEVENLABS_AGENT_ID:
        raise HTTPException(status_code=500, detail="ElevenLabs not configured")

    el_headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    created_tool_ids = []

    async with httpx.AsyncClient() as client:
        # First get existing tools to avoid duplicates
        existing_resp = await client.get(
            "https://api.elevenlabs.io/v1/convai/tools",
            headers=el_headers,
            timeout=10,
        )
        existing_names = set()
        if existing_resp.status_code == 200:
            for tool in existing_resp.json().get("tools", []):
                tc = tool.get("tool_config", {})
                existing_names.add(tc.get("name", ""))
                # Collect IDs of our tools that already exist
                if tc.get("name") in [t["name"] for t in CLIENT_TOOL_DEFINITIONS]:
                    created_tool_ids.append(tool["id"])

        # Create missing tools
        for tool_def in CLIENT_TOOL_DEFINITIONS:
            if tool_def["name"] in existing_names:
                logger.info(f"Tool '{tool_def['name']}' already exists, skipping creation")
                continue

            resp = await client.post(
                "https://api.elevenlabs.io/v1/convai/tools",
                headers=el_headers,
                json={"tool_config": tool_def},
                timeout=10,
            )
            if resp.status_code in (200, 201):
                tool_id = resp.json().get("id")
                created_tool_ids.append(tool_id)
                logger.info(f"Created tool '{tool_def['name']}' with id: {tool_id}")
            else:
                logger.error(f"Failed to create tool '{tool_def['name']}': {resp.status_code} {resp.text}")

        # Assign all tool IDs to the agent + update prompt
        if created_tool_ids:
            patch_payload = {
                "conversation_config": {
                    "agent": {
                        "prompt": {
                            "prompt": CLARA_VOICE_PROMPT,
                            "tool_ids": created_tool_ids,
                        },
                        "first_message": "Hi! I'm Clara, your voice support assistant. How can I help you today?",
                        "language": "en",
                    }
                }
            }
            resp = await client.patch(
                f"https://api.elevenlabs.io/v1/convai/agents/{ELEVENLABS_AGENT_ID}",
                headers=el_headers,
                json=patch_payload,
                timeout=15,
            )
            if resp.status_code != 200:
                logger.error(f"Failed to assign tools to agent: {resp.status_code} {resp.text}")
                raise HTTPException(status_code=502, detail=f"Failed to assign tools: {resp.text[:200]}")

    return {
        "setup_complete": True,
        "tool_ids": created_tool_ids,
        "agent_id": ELEVENLABS_AGENT_ID,
    }
