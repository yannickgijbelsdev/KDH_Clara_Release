"""Clara Enterprise Assistant — Code Assistant (Claude) & Enterprise Support."""
import os
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from dotenv import load_dotenv

load_dotenv()

from emergentintegrations.llm.chat import LlmChat, UserMessage
from database import db
from services.auth import get_current_user

enterprise_router = APIRouter(prefix="/enterprise-assistant", tags=["enterprise-assistant"])

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

# ─── Available site endpoints the Code Assistant can reference ──────────────
SITE_ENDPOINTS = [
    {
        "id": "now_playing",
        "name": "Now Playing (RDS Output)",
        "description": "Returns the current song/show playing on the radio station.",
        "method": "GET",
        "path": "/api/rds-builder/output/{station_slug}",
        "response_format": "JSON with fields: station, title, artist, show_name, timestamp",
        "public": True,
    },
    {
        "id": "now_playing_txt",
        "name": "Now Playing (Plain Text)",
        "description": "Returns the current RDS output as plain text.",
        "method": "GET",
        "path": "/api/rds-builder/output/{station_slug}/txt",
        "response_format": "Plain text string",
        "public": True,
    },
    {
        "id": "public_schedule",
        "name": "Public Schedule",
        "description": "Returns the full weekly broadcast schedule.",
        "method": "GET",
        "path": "/api/public-schedule/{main_site_id}",
        "response_format": "JSON array of schedule entries with day, time, show name, presenter",
        "public": True,
    },
    {
        "id": "public_schedule_today",
        "name": "Today's Schedule",
        "description": "Returns today's broadcast schedule.",
        "method": "GET",
        "path": "/api/public-schedule/{main_site_id}/today",
        "response_format": "JSON array of today's schedule entries",
        "public": True,
    },
    {
        "id": "public_site",
        "name": "Public Site Info",
        "description": "Returns public site information including name, description, and custom fields.",
        "method": "GET",
        "path": "/api/sites/public/{slug}",
        "response_format": "JSON with site metadata",
        "public": True,
    },
]


# ─── System Prompts ─────────────────────────────────────────────────────────

def get_code_system_prompt(main_site, available_endpoints, base_url):
    endpoints_text = "\n".join([
        f"- **{ep['name']}**: `{ep['method']} {base_url}{ep['path']}` — {ep['description']} (Response: {ep['response_format']})"
        for ep in available_endpoints
    ])
    return f"""You are the Clara Enterprise Code Assistant for the radio station "{main_site['name']}".

You generate production-ready HTML, CSS, and JavaScript code that integrates with the Clara platform API endpoints.

## Available API Endpoints for this station:
{endpoints_text}

## Rules:
1. ONLY generate code that uses the endpoints listed above. If the user asks for code that requires an endpoint not listed, tell them: "This endpoint is not available for your station. Please contact your administrator to enable this feature."
2. Replace placeholder slugs with the actual station slug: "{main_site['slug']}"
3. Generate clean, modern HTML/CSS/JS code. Use fetch() for API calls.
4. Always include error handling for API calls.
5. Make the code WordPress-compatible (can be pasted into a Custom HTML block).
6. Style the code to look professional — use modern CSS with flexbox/grid.
7. Always respond in English.
8. When generating code, wrap it in a complete, self-contained HTML snippet that can be previewed directly.
9. Add the base URL "{base_url}" to all API paths.
10. If the user asks about anything not related to code generation for their radio station, respond: "I'm the Clara Enterprise Code Assistant. I can only help you generate code that integrates with your Clara radio station endpoints. For other questions, please use Clara Enterprise Support."

Always wrap your code output in a ```html code block so it can be extracted for live preview."""


ENTERPRISE_SUPPORT_PROMPT = """You are Clara Enterprise Support, an advanced technical assistant for the Clara radio station management platform.

You provide detailed, technical troubleshooting without exposing internal backend implementation details (no database schemas, no server file paths, no internal API keys).

## Your capabilities:
1. **Technical Troubleshooting**: Explain WHY something might not work, including network issues, permission problems, caching, DNS propagation, SSL certificates, CORS, browser compatibility.
2. **Security Questions**: Explain 2FA policies, password requirements, session management, IP blocking, WAF rules — in user-friendly terms.
3. **Platform Knowledge**: Article counts, user statistics, activity summaries, feature availability.
4. **Admin Actions**: When the user is a Main Site Admin, you can help them toggle settings like 2FA for their site members.

## Permission Rules:
- Questions about site settings, user management, 2FA toggles, or viewing member information require **Main Site Admin** role.
- If a non-admin asks these questions, respond ONLY with: "Only an administrator can ask me this, please contact your administrator. Don't contact Clara Support, because they can't give you this information."

## Rules:
- Always respond in English.
- Be technical but accessible — explain concepts clearly.
- Never reveal internal backend details (file paths, database names, server configurations).
- Never generate code — redirect to Clara Enterprise Code Assistant for that.
- If asked about unrelated topics, redirect: "I'm Clara Enterprise Support. I can help you with technical questions about your Clara radio station platform."
"""


# ─── Request / Response Models ──────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    mode: str  # "code" or "support"
    session_id: Optional[str] = None
    main_site_id: str


class AdminActionRequest(BaseModel):
    action: str  # "toggle_2fa", "get_2fa_status", "get_article_count", "get_site_summary"
    main_site_id: str
    params: Optional[dict] = None


# ─── Helpers ────────────────────────────────────────────────────────────────

async def _require_enterprise(main_site_id: str):
    """Check that the main site has Clara Enterprise enabled."""
    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")
    if not site.get("clara_enterprise"):
        raise HTTPException(status_code=403, detail="Clara Enterprise is not enabled for this site")
    return site


async def _require_main_site_admin(user_id: str, main_site_id: str):
    """Check that the user is a main site admin."""
    msu = await db.main_site_users.find_one(
        {"user_id": user_id, "main_site_id": main_site_id},
        {"_id": 0}
    )
    if not msu or msu.get("role") != "admin":
        return False
    return True


def _get_available_endpoints(main_site):
    """Determine which endpoints are available based on enabled features."""
    features = main_site.get("enabled_features", [])
    available = []
    for ep in SITE_ENDPOINTS:
        # RDS endpoints need rds_builder feature
        if ep["id"] in ("now_playing", "now_playing_txt"):
            if "rds_builder" in features or "rds_settings" in features:
                available.append(ep)
        # Schedule needs shows feature
        elif ep["id"] in ("public_schedule", "public_schedule_today"):
            if "shows" in features or "calendar" in features:
                available.append(ep)
        # Public site is always available
        elif ep["id"] == "public_site":
            available.append(ep)
    return available


# ─── Chat sessions (in-memory, keyed by session_id) ────────────────────────
_chat_sessions: dict[str, LlmChat] = {}


# ─── Endpoints ──────────────────────────────────────────────────────────────

@enterprise_router.post("/chat")
async def enterprise_chat(body: ChatRequest, current_user: dict = Depends(get_current_user)):
    """Main chat endpoint for both Code Assistant and Enterprise Support."""
    main_site = await _require_enterprise(body.main_site_id)

    if body.mode not in ("code", "support"):
        raise HTTPException(status_code=400, detail="Mode must be 'code' or 'support'")

    session_id = body.session_id or str(uuid.uuid4())
    chat_key = f"{session_id}_{body.mode}"

    # Get or create LlmChat instance
    if chat_key not in _chat_sessions:
        base_url = os.environ.get("PUBLIC_BASE_URL", "")
        if body.mode == "code":
            available_eps = _get_available_endpoints(main_site)
            system_msg = get_code_system_prompt(main_site, available_eps, base_url)
            chat = LlmChat(
                api_key=EMERGENT_KEY,
                session_id=chat_key,
                system_message=system_msg
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        else:
            system_msg = ENTERPRISE_SUPPORT_PROMPT
            chat = LlmChat(
                api_key=EMERGENT_KEY,
                session_id=chat_key,
                system_message=system_msg
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        _chat_sessions[chat_key] = chat

    chat = _chat_sessions[chat_key]

    # For support mode: enrich message with context if it looks like an admin query
    enriched_message = body.message
    if body.mode == "support":
        is_admin = await _require_main_site_admin(current_user["id"], body.main_site_id)
        lower_msg = body.message.lower()

        admin_keywords = ["2fa", "two-factor", "articles", "how many", "members", "users", "summary", "logs", "statistics"]
        is_admin_query = any(kw in lower_msg for kw in admin_keywords)

        if is_admin_query and not is_admin:
            return {
                "response": "Only an administrator can ask me this, please contact your administrator. Don't contact Clara Support, because they can't give you this information.",
                "session_id": session_id,
                "mode": body.mode,
            }

        if is_admin_query and is_admin:
            # Enrich with site data
            context_parts = []
            if any(kw in lower_msg for kw in ["2fa", "two-factor"]):
                require_2fa = main_site.get("require_2fa", False)
                user_count = await db.main_site_users.count_documents({"main_site_id": body.main_site_id})
                users_with_2fa = await db.users.count_documents({"two_factor_enabled": True})
                context_parts.append(f"[CONTEXT] Site 2FA policy: {'Enforced' if require_2fa else 'Optional'}. Total members: {user_count}. Users with 2FA enabled: {users_with_2fa}.")

            if any(kw in lower_msg for kw in ["articles", "how many", "content"]):
                article_count = await db.content.count_documents({"main_site_id": body.main_site_id})
                published_count = await db.content.count_documents({"main_site_id": body.main_site_id, "status": "published"})
                context_parts.append(f"[CONTEXT] Total articles: {article_count}. Published: {published_count}. Draft: {article_count - published_count}.")

            if any(kw in lower_msg for kw in ["members", "users", "team"]):
                members = await db.main_site_users.find({"main_site_id": body.main_site_id}, {"_id": 0, "user_id": 1, "role": 1}).to_list(500)
                role_counts = {}
                for m in members:
                    r = m.get("role", "viewer")
                    role_counts[r] = role_counts.get(r, 0) + 1
                context_parts.append(f"[CONTEXT] Team members by role: {role_counts}. Total: {len(members)}.")

            if any(kw in lower_msg for kw in ["summary", "overview", "statistics"]):
                article_count = await db.content.count_documents({"main_site_id": body.main_site_id})
                member_count = await db.main_site_users.count_documents({"main_site_id": body.main_site_id})
                show_count = await db.shows.count_documents({"main_site_id": body.main_site_id})
                site_count = await db.sites.count_documents({"main_site_id": body.main_site_id})
                context_parts.append(f"[CONTEXT] Site summary — Articles: {article_count}, Members: {member_count}, Shows: {show_count}, Sites: {site_count}.")

            if context_parts:
                enriched_message = "\n".join(context_parts) + f"\n\nUser question: {body.message}"

    # Send message to LLM
    user_msg = UserMessage(text=enriched_message)
    response_text = await chat.send_message(user_msg)

    # Save to DB for persistence
    now = datetime.now(timezone.utc).isoformat()
    await db.enterprise_chat_history.update_one(
        {"session_id": session_id, "main_site_id": body.main_site_id},
        {
            "$push": {
                "messages": {
                    "$each": [
                        {"role": "user", "text": body.message, "timestamp": now},
                        {"role": "assistant", "text": response_text, "timestamp": now},
                    ]
                }
            },
            "$set": {"mode": body.mode, "user_id": current_user["id"], "updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    return {
        "response": response_text,
        "session_id": session_id,
        "mode": body.mode,
    }


@enterprise_router.get("/sessions")
async def get_sessions(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Get all chat sessions for the current user on this main site."""
    await _require_enterprise(main_site_id)
    sessions = await db.enterprise_chat_history.find(
        {"main_site_id": main_site_id, "user_id": current_user["id"]},
        {"_id": 0, "session_id": 1, "mode": 1, "created_at": 1, "updated_at": 1, "messages": {"$slice": 1}},
    ).sort("updated_at", -1).to_list(50)

    result = []
    for s in sessions:
        first_msg = s.get("messages", [{}])[0] if s.get("messages") else {}
        result.append({
            "session_id": s["session_id"],
            "mode": s.get("mode", "code"),
            "title": (first_msg.get("text", "New conversation"))[:60],
            "created_at": s.get("created_at"),
            "updated_at": s.get("updated_at"),
        })
    return {"sessions": result}


@enterprise_router.get("/session/{session_id}")
async def get_session(session_id: str, main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Get full chat history for a session."""
    await _require_enterprise(main_site_id)
    session = await db.enterprise_chat_history.find_one(
        {"session_id": session_id, "main_site_id": main_site_id, "user_id": current_user["id"]},
        {"_id": 0},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@enterprise_router.delete("/session/{session_id}")
async def delete_session(session_id: str, main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a chat session."""
    await _require_enterprise(main_site_id)
    chat_key_code = f"{session_id}_code"
    chat_key_support = f"{session_id}_support"
    _chat_sessions.pop(chat_key_code, None)
    _chat_sessions.pop(chat_key_support, None)
    await db.enterprise_chat_history.delete_one(
        {"session_id": session_id, "main_site_id": main_site_id, "user_id": current_user["id"]},
    )
    return {"deleted": True}


@enterprise_router.post("/admin-action")
async def admin_action(body: AdminActionRequest, current_user: dict = Depends(get_current_user)):
    """Execute admin actions (e.g., toggle 2FA)."""
    main_site = await _require_enterprise(body.main_site_id)
    is_admin = await _require_main_site_admin(current_user["id"], body.main_site_id)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only an administrator can perform this action")

    if body.action == "toggle_2fa":
        new_value = not main_site.get("require_2fa", False)
        await db.main_sites.update_one(
            {"id": body.main_site_id},
            {"$set": {"require_2fa": new_value, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"action": "toggle_2fa", "new_value": new_value, "message": f"2FA has been {'enabled' if new_value else 'disabled'} for all members."}

    elif body.action == "get_2fa_status":
        members = await db.main_site_users.find({"main_site_id": body.main_site_id}, {"_id": 0, "user_id": 1}).to_list(500)
        user_ids = [m["user_id"] for m in members]
        users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "two_factor_enabled": 1}).to_list(500)
        return {"action": "get_2fa_status", "users": users, "site_require_2fa": main_site.get("require_2fa", False)}

    raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")


@enterprise_router.get("/endpoints")
async def get_available_endpoints(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Return the list of available API endpoints for this main site."""
    main_site = await _require_enterprise(main_site_id)
    available = _get_available_endpoints(main_site)
    return {"endpoints": available, "station_slug": main_site["slug"]}
