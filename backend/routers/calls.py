"""Calls Router — Audio profiles, invite links, and call session management."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from database import db
from services.auth import get_current_user
from models.calls import (
    AudioProfileCreate, AudioProfileUpdate,
    CallInviteCreate, CallActionRequest,
)

calls_router = APIRouter(prefix="/calls", tags=["calls"])

SHARE_BASE_URL = None

def _get_base_url():
    global SHARE_BASE_URL
    if not SHARE_BASE_URL:
        import os
        SHARE_BASE_URL = os.environ.get("SHARE_BASE_URL", os.environ.get("REACT_APP_BACKEND_URL", ""))
    return SHARE_BASE_URL


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# ============== AUDIO PROFILES ==============

@calls_router.get("/profiles")
async def list_profiles(current_user: dict = Depends(get_current_user)):
    """List audio profiles for the current user."""
    profiles = await db.audio_profiles.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"profiles": profiles}


@calls_router.post("/profiles")
async def create_profile(body: AudioProfileCreate, current_user: dict = Depends(get_current_user)):
    """Create a new audio profile."""
    profile = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": body.name,
        "input_device_id": body.input_device_id,
        "input_device_label": body.input_device_label,
        "output_device_id": body.output_device_id,
        "output_device_label": body.output_device_label,
        "created_at": _now_iso(),
    }
    await db.audio_profiles.insert_one({**profile})
    return profile


@calls_router.put("/profiles/{profile_id}")
async def update_profile(
    profile_id: str,
    body: AudioProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update an audio profile."""
    updates = {k: v for k, v in body.dict(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(400, "No updates provided")
    updates["updated_at"] = _now_iso()
    result = await db.audio_profiles.update_one(
        {"id": profile_id, "user_id": current_user["id"]},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Profile not found")
    profile = await db.audio_profiles.find_one({"id": profile_id}, {"_id": 0})
    return profile


@calls_router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an audio profile."""
    result = await db.audio_profiles.delete_one({"id": profile_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Profile not found")
    return {"deleted": True}


# ============== CALL INVITES ==============

@calls_router.get("/invites")
async def list_invites(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List call invites created by the current user."""
    query = {"created_by": current_user["id"]}
    if status:
        query["status"] = status
    invites = await db.call_invites.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    base_url = _get_base_url()
    for inv in invites:
        inv["url"] = f"{base_url}/call/{inv['token']}"
    return {"invites": invites}


@calls_router.post("/invites")
async def create_invite(body: CallInviteCreate, current_user: dict = Depends(get_current_user)):
    """Create a new call invite link."""
    token = str(uuid.uuid4())[:8]  # Short, shareable token
    invite = {
        "id": str(uuid.uuid4()),
        "token": token,
        "label": body.label or "",
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", ""),
        "status": "pending",  # pending -> active -> ended
        "caller_name": None,
        "caller_accepted_at": None,
        "call_started_at": None,
        "call_ended_at": None,
        "duration_seconds": None,
        "created_at": _now_iso(),
    }
    await db.call_invites.insert_one({**invite})
    base_url = _get_base_url()
    invite["url"] = f"{base_url}/call/{token}"
    return invite


@calls_router.delete("/invites/{invite_id}")
async def delete_invite(invite_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a call invite."""
    result = await db.call_invites.delete_one({"id": invite_id, "created_by": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Invite not found")
    return {"deleted": True}


# ============== PUBLIC INVITE JOIN (no auth) ==============

@calls_router.get("/join/{token}")
async def get_invite_info(token: str):
    """Public: Get invite info for a caller (no auth required)."""
    invite = await db.call_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise HTTPException(404, "Invite not found or expired")
    return {
        "id": invite["id"],
        "token": invite["token"],
        "label": invite.get("label", ""),
        "host_name": invite.get("created_by_name", ""),
        "status": invite["status"],
    }


@calls_router.post("/join/{token}/accept")
async def accept_invite(token: str, request: Request):
    """Public: Caller accepts the invite."""
    body = await request.json()
    caller_name = body.get("name", "Guest")

    invite = await db.call_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite["status"] == "ended":
        raise HTTPException(400, "This call has already ended")

    await db.call_invites.update_one(
        {"token": token},
        {"$set": {
            "status": "active",
            "caller_name": caller_name,
            "caller_accepted_at": _now_iso(),
            "call_started_at": _now_iso(),
        }},
    )
    updated = await db.call_invites.find_one({"token": token}, {"_id": 0})
    return {"status": "active", "room_id": updated["id"], "caller_name": caller_name}


@calls_router.post("/invites/{invite_id}/end")
async def end_call(invite_id: str, current_user: dict = Depends(get_current_user)):
    """End an active call."""
    invite = await db.call_invites.find_one(
        {"id": invite_id, "created_by": current_user["id"]}, {"_id": 0}
    )
    if not invite:
        raise HTTPException(404, "Invite not found")

    duration = None
    if invite.get("call_started_at"):
        started = datetime.fromisoformat(invite["call_started_at"])
        duration = int((datetime.now(timezone.utc) - started).total_seconds())

    await db.call_invites.update_one(
        {"id": invite_id},
        {"$set": {
            "status": "ended",
            "call_ended_at": _now_iso(),
            "duration_seconds": duration,
        }},
    )
    return {"ended": True, "duration_seconds": duration}


# ============== PUBLIC END CALL (for caller without auth) ==============

@calls_router.post("/join/{token}/end")
async def caller_end_call(token: str):
    """Public: Caller ends the call from their side."""
    invite = await db.call_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise HTTPException(404, "Invite not found")

    duration = None
    if invite.get("call_started_at"):
        started = datetime.fromisoformat(invite["call_started_at"])
        duration = int((datetime.now(timezone.utc) - started).total_seconds())

    await db.call_invites.update_one(
        {"token": token},
        {"$set": {
            "status": "ended",
            "call_ended_at": _now_iso(),
            "duration_seconds": duration,
        }},
    )
    return {"ended": True, "duration_seconds": duration}
