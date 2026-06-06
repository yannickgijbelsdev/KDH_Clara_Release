"""Clara AI Assistant - SEO writing help and error troubleshooting."""
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from services.auth import get_current_user
from database import db

from emergentintegrations.llm.chat import LlmChat, UserMessage

clara_router = APIRouter(prefix="/clara-assistant", tags=["Clara Assistant"])

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

SEO_SYSTEM_PROMPT = """You are Clara, an expert SEO content writer and assistant for a radio station management platform called Clara. 

Your capabilities:
1. Generate SEO-optimized articles with proper heading structure (H1, H2, H3), meta descriptions, keyword placement, and readability.
2. Improve existing content for better SEO: optimize headings, add internal linking suggestions, improve keyword density, and enhance readability.
3. Provide SEO scores and actionable suggestions.

STRICT SCOPE RULES:
- You ONLY answer questions related to the Clara radio management platform, SEO content writing, radio broadcasting, and WordPress content management.
- If the user asks about programming, coding, development, APIs, scripts, databases, or any technical code-related question, you MUST respond ONLY with:
  "This question requires the **Clara Enterprise Code Assistant**, which is part of the Clara Enterprise package. Please contact **Clara Support** to enable this feature for your account."
- If the user asks about topics completely unrelated to Clara or radio management (e.g. cooking, travel, math homework), politely redirect them: "I'm Clara, your radio station assistant. I can help you with content creation, SEO optimization, and managing your radio platform. How can I help you with that?"

Rules:
- ALWAYS respond in English.
- Use proper HTML formatting for articles (h2, h3, p, ul, li, strong, em tags). Never use h1 (that's the title).
- Keep paragraphs short (2-3 sentences max) for web readability.
- Include a suggested meta description (max 155 characters) at the end.
- Focus keywords should appear in the first paragraph, at least one H2, and naturally throughout.
- Write in an engaging, professional tone appropriate for radio/media industry.
"""

ERROR_SYSTEM_PROMPT = """You are Clara, a friendly assistant for a radio station management platform called Clara.

Your role is to help non-technical users resolve errors. The platform includes:
- WordPress publishing (content management)
- RDS (Radio Data System) configuration
- Stream monitoring (Shoutcast/Icecast)
- Cloudflare WAF/DNS management
- ZeroTier networking
- Backup management
- User/team management

STRICT SCOPE RULES:
- You ONLY answer questions related to the Clara radio management platform and its features listed above.
- If the user asks about programming, coding, development, APIs, scripts, databases, HTML/CSS/JavaScript, or any technical code-related question, you MUST respond ONLY with:
  "This question requires the **Clara Enterprise Code Assistant**, which is part of the Clara Enterprise package. Please contact **Clara Support** to enable this feature for your account."
- If the user asks about topics completely unrelated to Clara or radio management, politely redirect them: "I'm Clara, your radio station assistant. I can help you troubleshoot platform issues and manage your radio station. What seems to be the problem?"

Rules:
- ALWAYS respond in English.
- Keep it SIMPLE. The user is NOT a developer.
- Give exactly 3 clear steps they can try, numbered 1-3. Each step should be ONE action.
- Start with the easiest fix first (e.g. refresh page, check connection).
- Use short sentences. No technical jargon.
- If you don't know the exact fix, give general troubleshooting steps.
- Be warm and encouraging - errors happen to everyone.
- End with: "Did none of these steps help? Click 'Contact Support' below."

Format your response EXACTLY like this:
**What happened:** [1 sentence explaining the problem in plain language]

**Try these steps:**

1. **[Step title]** - [Clear instruction in 1-2 sentences]

2. **[Step title]** - [Clear instruction in 1-2 sentences]

3. **[Step title]** - [Clear instruction in 1-2 sentences]
"""


class SEOGenerateRequest(BaseModel):
    topic: str
    keywords: Optional[str] = ""
    tone: Optional[str] = "professional"
    length: Optional[str] = "medium"  # short/medium/long


class SEOImproveRequest(BaseModel):
    content: str
    title: Optional[str] = ""
    keywords: Optional[str] = ""


class ErrorHelpRequest(BaseModel):
    error_message: str
    context: Optional[str] = ""  # e.g. "WordPress publishing", "RDS settings"


class SupportTicketRequest(BaseModel):
    subject: str
    description: str
    error_message: Optional[str] = ""
    steps_tried: Optional[str] = ""
    page_url: Optional[str] = ""


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    mode: str = "seo"  # "seo" or "error"
    content_context: Optional[str] = ""  # current editor content for context


def _get_chat(session_id: str, mode: str) -> LlmChat:
    system_msg = SEO_SYSTEM_PROMPT if mode == "seo" else ERROR_SYSTEM_PROMPT
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=session_id,
        system_message=system_msg,
    )
    chat.with_model("openai", "gpt-5.2")
    return chat


@clara_router.post("/seo/generate")
async def seo_generate(req: SEOGenerateRequest, current_user: dict = Depends(get_current_user)):
    """Generate a full SEO-optimized article from a topic."""
    if not EMERGENT_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    session_id = f"seo-gen-{uuid.uuid4().hex[:12]}"
    chat = _get_chat(session_id, "seo")

    length_guide = {"short": "400-600 words", "medium": "800-1200 words", "long": "1500-2000 words"}.get(req.length, "800-1200 words")

    prompt = f"""Write a complete SEO-optimized article about: {req.topic}

Target keywords: {req.keywords or req.topic}
Tone: {req.tone}
Target length: {length_guide}

Please provide:
1. A compelling SEO title (as plain text on the first line, prefixed with "TITLE: ")
2. The full article in HTML format (h2, h3, p, ul, li, strong, em)
3. End with "META: " followed by a meta description (max 155 chars)"""

    msg = UserMessage(text=prompt)
    response = await chat.send_message(msg)

    # Parse title and meta from response
    lines = response.strip().split('\n')
    title = ""
    meta = ""
    body_lines = []

    for line in lines:
        if line.strip().startswith("TITLE:"):
            title = line.replace("TITLE:", "").strip()
        elif line.strip().startswith("META:"):
            meta = line.replace("META:", "").strip()
        else:
            body_lines.append(line)

    body = '\n'.join(body_lines).strip()

    # Store in DB
    await db.clara_assistant_history.insert_one({
        "id": session_id,
        "user_id": current_user.get("id"),
        "type": "seo_generate",
        "topic": req.topic,
        "keywords": req.keywords,
        "response_title": title,
        "response_meta": meta,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "title": title,
        "body": body,
        "meta_description": meta,
        "session_id": session_id,
    }


@clara_router.post("/seo/improve")
async def seo_improve(req: SEOImproveRequest, current_user: dict = Depends(get_current_user)):
    """Analyze and improve existing content for SEO."""
    if not EMERGENT_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    session_id = f"seo-imp-{uuid.uuid4().hex[:12]}"
    chat = _get_chat(session_id, "seo")

    prompt = f"""Analyze this content and provide SEO improvements:

Title: {req.title or '(no title)'}
Target keywords: {req.keywords or '(none specified)'}

Content:
{req.content[:5000]}

Please provide:
1. An SEO score (0-100) with brief explanation
2. A list of specific improvements (as bullet points)
3. An improved version of the content in HTML format
4. A suggested meta description (max 155 chars)

Format your response as:
SCORE: [number]/100
ANALYSIS:
[bullet points of what to improve]

IMPROVED:
[the improved HTML content]

META: [meta description]"""

    msg = UserMessage(text=prompt)
    response = await chat.send_message(msg)

    # Parse response
    score = ""
    analysis = ""
    improved = ""
    meta = ""
    
    sections = response.split("IMPROVED:")
    if len(sections) >= 2:
        header = sections[0]
        rest = sections[1]
        
        # Extract score
        for line in header.split('\n'):
            if line.strip().startswith("SCORE:"):
                score = line.replace("SCORE:", "").strip()
            elif "ANALYSIS:" in line:
                continue
            elif line.strip():
                analysis += line + "\n"
        
        # Extract improved content and meta
        meta_parts = rest.split("META:")
        improved = meta_parts[0].strip()
        if len(meta_parts) > 1:
            meta = meta_parts[1].strip()
    else:
        improved = response

    return {
        "score": score,
        "analysis": analysis.strip(),
        "improved_content": improved,
        "meta_description": meta,
        "session_id": session_id,
    }


@clara_router.post("/chat")
async def clara_chat(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    """General chat with Clara - supports both SEO and error help modes."""
    if not EMERGENT_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    session_id = req.session_id or f"chat-{uuid.uuid4().hex[:12]}"

    # Get previous messages for this session
    history = await db.clara_assistant_messages.find(
        {"session_id": session_id},
        {"_id": 0}
    ).sort("created_at", 1).limit(20).to_list(20)

    # Build chat with history context
    chat = _get_chat(session_id, req.mode)

    # If content context is provided, add it as context
    context_prefix = ""
    if req.content_context:
        context_prefix = f"[Current editor content for context: {req.content_context[:3000]}]\n\n"

    # Rebuild conversation history
    for msg in history:
        if msg.get("role") == "user":
            chat_msg = UserMessage(text=msg["text"])
            await chat.send_message(chat_msg)

    # Send new message
    user_msg = UserMessage(text=context_prefix + req.message)
    response = await chat.send_message(user_msg)

    # Store messages
    now = datetime.now(timezone.utc).isoformat()
    await db.clara_assistant_messages.insert_many([
        {"session_id": session_id, "role": "user", "text": req.message, "mode": req.mode, "user_id": current_user.get("id"), "created_at": now},
        {"session_id": session_id, "role": "assistant", "text": response, "mode": req.mode, "created_at": now},
    ])

    return {
        "response": response,
        "session_id": session_id,
    }


@clara_router.post("/error-help")
async def error_help(req: ErrorHelpRequest, current_user: dict = Depends(get_current_user)):
    """Get help understanding and resolving an error."""
    if not EMERGENT_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    session_id = f"err-{uuid.uuid4().hex[:12]}"
    chat = _get_chat(session_id, "error")

    prompt = f"""The user encountered this error:

Error: {req.error_message}
Where: {req.context or 'General platform usage'}

Give them 3 simple steps to try in English. Remember: they are NOT a developer."""

    msg = UserMessage(text=prompt)
    response = await chat.send_message(msg)

    return {
        "explanation": response,
        "session_id": session_id,
    }


@clara_router.post("/support-ticket")
async def submit_support_ticket(req: SupportTicketRequest, current_user: dict = Depends(get_current_user)):
    """Submit a support ticket when AI steps didn't resolve the issue."""
    ticket = {
        "user_id": str(current_user.get("id") or current_user.get("_id", "")),
        "user_name": current_user.get("name", ""),
        "user_email": current_user.get("email", ""),
        "subject": req.subject,
        "description": req.description,
        "error_message": req.error_message,
        "steps_tried": req.steps_tried,
        "page_url": req.page_url,
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.support_tickets.insert_one(ticket)
    return {"ticket_id": str(result.inserted_id), "status": "submitted"}
