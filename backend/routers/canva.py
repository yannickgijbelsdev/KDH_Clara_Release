"""Canva Director — Canva Connect API integration for server sites."""
import logging
import httpx
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel
from typing import Optional, List

from database import db
from services.auth import get_current_user
from services.main_site_context import get_main_site_id_from_header

logger = logging.getLogger(__name__)

canva_router = APIRouter(prefix="/canva", tags=["Canva Director"])

CANVA_API_BASE = "https://api.canva.com/rest/v1"
CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize"
CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token"


# ─── MODELS ───────────────────────────────────────────────────────

class CanvaConfigUpdate(BaseModel):
    client_id: str
    client_secret: str
    redirect_uri: Optional[str] = None


class CanvaDesignCreate(BaseModel):
    title: Optional[str] = None
    design_type: Optional[str] = None
    template_id: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None


class CanvaExportRequest(BaseModel):
    design_id: str
    format: str = "png"
    quality: Optional[str] = "regular"


# ─── HELPERS ──────────────────────────────────────────────────────

async def _get_canva_config(main_site_id: str) -> dict:
    """Get Canva config for a main site."""
    config = await db.canva_config.find_one(
        {"main_site_id": main_site_id}, {"_id": 0}
    )
    return config or {}


async def _get_canva_token(main_site_id: str, user_id: str) -> Optional[str]:
    """Get the user's Canva access token for a main site."""
    token_doc = await db.canva_tokens.find_one(
        {"main_site_id": main_site_id, "user_id": user_id}, {"_id": 0}
    )
    if not token_doc:
        return None

    # Check if token needs refresh
    expires_at = token_doc.get("expires_at", "")
    if expires_at and expires_at < datetime.now(timezone.utc).isoformat():
        refreshed = await _refresh_canva_token(main_site_id, user_id, token_doc)
        if refreshed:
            return refreshed
        return None

    return token_doc.get("access_token")


async def _refresh_canva_token(main_site_id: str, user_id: str, token_doc: dict) -> Optional[str]:
    """Refresh an expired Canva token."""
    config = await _get_canva_config(main_site_id)
    if not config.get("client_id") or not config.get("client_secret"):
        return None

    refresh_token = token_doc.get("refresh_token")
    if not refresh_token:
        return None

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                CANVA_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": config["client_id"],
                    "client_secret": config["client_secret"],
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.status_code != 200:
                logger.error(f"Canva token refresh failed: {resp.text}")
                return None

            data = resp.json()
            now = datetime.now(timezone.utc)
            expires_at = now.isoformat() if not data.get("expires_in") else \
                (now + __import__("datetime").timedelta(seconds=data["expires_in"])).isoformat()

            await db.canva_tokens.update_one(
                {"main_site_id": main_site_id, "user_id": user_id},
                {"$set": {
                    "access_token": data["access_token"],
                    "refresh_token": data.get("refresh_token", refresh_token),
                    "expires_at": expires_at,
                    "updated_at": now.isoformat(),
                }}
            )
            return data["access_token"]
    except Exception as e:
        logger.error(f"Canva token refresh error: {e}")
        return None


async def _canva_request(method: str, path: str, token: str, **kwargs) -> dict:
    """Make an authenticated request to the Canva API."""
    url = f"{CANVA_API_BASE}{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.request(method, url, headers=headers, **kwargs)
        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Canva token expired. Please reconnect your Canva account.")
        if resp.status_code >= 400:
            detail = resp.text[:500]
            logger.error(f"Canva API error {resp.status_code}: {detail}")
            raise HTTPException(status_code=resp.status_code, detail=f"Canva API error: {detail}")
        return resp.json() if resp.text else {}


# ─── CONFIGURATION ────────────────────────────────────────────────

@canva_router.get("/config")
async def get_config(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Get Canva configuration for the current main site."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    config = await _get_canva_config(main_site_id)
    # Mask the secret
    if config.get("client_secret"):
        config["client_secret"] = config["client_secret"][:4] + "****"
    return {
        "configured": bool(config.get("client_id")),
        "client_id": config.get("client_id", ""),
        "client_secret": config.get("client_secret", ""),
        "redirect_uri": config.get("redirect_uri", ""),
    }


@canva_router.put("/config")
async def update_config(
    request: Request,
    data: CanvaConfigUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update Canva configuration. Admin only."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    # Check admin access
    if current_user.get("role") not in ("admin",) and not current_user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    now = datetime.now(timezone.utc).isoformat()
    await db.canva_config.update_one(
        {"main_site_id": main_site_id},
        {"$set": {
            "main_site_id": main_site_id,
            "client_id": data.client_id,
            "client_secret": data.client_secret,
            "redirect_uri": data.redirect_uri or "",
            "updated_at": now,
        }},
        upsert=True,
    )
    return {"status": "ok", "message": "Canva configuration saved"}


# ─── OAUTH FLOW ───────────────────────────────────────────────────

@canva_router.get("/auth/url")
async def get_auth_url(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Generate the Canva OAuth authorization URL."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    config = await _get_canva_config(main_site_id)
    if not config.get("client_id"):
        raise HTTPException(status_code=400, detail="Canva not configured. Please set up Client ID first.")

    state = f"{main_site_id}:{current_user['id']}:{uuid.uuid4().hex[:8]}"
    await db.canva_oauth_states.insert_one({
        "state": state,
        "main_site_id": main_site_id,
        "user_id": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    redirect_uri = config.get("redirect_uri") or f"{request.base_url}api/canva/auth/callback"

    params = {
        "client_id": config["client_id"],
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": "design:content:read design:content:write design:meta:read asset:read asset:write folder:read folder:write",
        "state": state,
    }
    return {"url": f"{CANVA_AUTH_URL}?{urlencode(params)}"}


@canva_router.get("/auth/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
):
    """Handle the Canva OAuth callback."""
    state_doc = await db.canva_oauth_states.find_one({"state": state})
    if not state_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    main_site_id = state_doc["main_site_id"]
    user_id = state_doc["user_id"]
    await db.canva_oauth_states.delete_one({"state": state})

    config = await _get_canva_config(main_site_id)
    redirect_uri = config.get("redirect_uri") or ""

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                CANVA_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": config["client_id"],
                    "client_secret": config["client_secret"],
                    "redirect_uri": redirect_uri,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.status_code != 200:
                logger.error(f"Canva token exchange failed: {resp.text}")
                return {"error": "Token exchange failed", "detail": resp.text}

            data = resp.json()
            now = datetime.now(timezone.utc)
            from datetime import timedelta
            expires_in = data.get("expires_in", 3600)
            expires_at = (now + timedelta(seconds=expires_in)).isoformat()

            await db.canva_tokens.update_one(
                {"main_site_id": main_site_id, "user_id": user_id},
                {"$set": {
                    "main_site_id": main_site_id,
                    "user_id": user_id,
                    "access_token": data["access_token"],
                    "refresh_token": data.get("refresh_token", ""),
                    "expires_at": expires_at,
                    "updated_at": now.isoformat(),
                }},
                upsert=True,
            )

            # Return HTML that closes the popup and notifies the parent
            return __import__("fastapi.responses", fromlist=["HTMLResponse"]).HTMLResponse(
                content="""
                <html><body><script>
                    window.opener?.postMessage({type: 'canva-auth-success'}, '*');
                    window.close();
                </script><p>Connected! You can close this window.</p></body></html>
                """
            )
    except Exception as e:
        logger.error(f"Canva OAuth error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@canva_router.get("/auth/status")
async def auth_status(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Check if the user has connected their Canva account."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    token_doc = await db.canva_tokens.find_one(
        {"main_site_id": main_site_id, "user_id": current_user["id"]},
        {"_id": 0, "access_token": 0, "refresh_token": 0}
    )
    return {
        "connected": bool(token_doc),
        "expires_at": token_doc.get("expires_at", "") if token_doc else "",
    }


@canva_router.delete("/auth/disconnect")
async def disconnect(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Disconnect the user's Canva account."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    await db.canva_tokens.delete_one(
        {"main_site_id": main_site_id, "user_id": current_user["id"]}
    )
    return {"status": "disconnected"}


# ─── DESIGNS ──────────────────────────────────────────────────────

@canva_router.get("/designs")
async def list_designs(
    request: Request,
    current_user: dict = Depends(get_current_user),
    query: Optional[str] = None,
):
    """List user's Canva designs."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    token = await _get_canva_token(main_site_id, current_user["id"])
    if not token:
        raise HTTPException(status_code=401, detail="Canva account not connected")

    params = {}
    if query:
        params["query"] = query

    data = await _canva_request("GET", "/designs", token, params=params)
    return data


@canva_router.post("/designs")
async def create_design(
    request: Request,
    body: CanvaDesignCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new Canva design."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    token = await _get_canva_token(main_site_id, current_user["id"])
    if not token:
        raise HTTPException(status_code=401, detail="Canva account not connected")

    payload = {}
    if body.title:
        payload["title"] = body.title
    if body.design_type:
        payload["design_type"] = body.design_type
    if body.template_id:
        payload["template_id"] = body.template_id
    if body.width and body.height:
        payload["design_type"] = {
            "type": "custom",
            "width": body.width,
            "height": body.height,
        }

    data = await _canva_request("POST", "/designs", token, json=payload)

    # Log the creation
    await db.canva_activity.insert_one({
        "main_site_id": main_site_id,
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "action": "create_design",
        "design_id": data.get("design", {}).get("id", ""),
        "design_title": body.title or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return data


@canva_router.get("/designs/{design_id}")
async def get_design(
    design_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Get details of a specific design."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    token = await _get_canva_token(main_site_id, current_user["id"])
    if not token:
        raise HTTPException(status_code=401, detail="Canva account not connected")

    return await _canva_request("GET", f"/designs/{design_id}", token)


@canva_router.post("/designs/export")
async def export_design(
    request: Request,
    body: CanvaExportRequest,
    current_user: dict = Depends(get_current_user),
):
    """Export a design to an image/PDF."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    token = await _get_canva_token(main_site_id, current_user["id"])
    if not token:
        raise HTTPException(status_code=401, detail="Canva account not connected")

    payload = {
        "design_id": body.design_id,
        "format": {"type": body.format},
    }
    if body.quality:
        payload["format"]["quality"] = body.quality

    data = await _canva_request("POST", "/exports", token, json=payload)

    await db.canva_activity.insert_one({
        "main_site_id": main_site_id,
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "action": "export_design",
        "design_id": body.design_id,
        "format": body.format,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return data


@canva_router.get("/exports/{export_id}")
async def get_export_status(
    export_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Check the status of an export job."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    token = await _get_canva_token(main_site_id, current_user["id"])
    if not token:
        raise HTTPException(status_code=401, detail="Canva account not connected")

    return await _canva_request("GET", f"/exports/{export_id}", token)


# ─── ASSETS ───────────────────────────────────────────────────────

@canva_router.get("/assets")
async def list_assets(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """List user's Canva assets."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    token = await _get_canva_token(main_site_id, current_user["id"])
    if not token:
        raise HTTPException(status_code=401, detail="Canva account not connected")

    return await _canva_request("GET", "/assets", token)


# ─── ACTIVITY LOG ─────────────────────────────────────────────────

@canva_router.get("/activity")
async def get_activity(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Get Canva activity log for this site."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="Main site context required")

    activities = await db.canva_activity.find(
        {"main_site_id": main_site_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return activities
