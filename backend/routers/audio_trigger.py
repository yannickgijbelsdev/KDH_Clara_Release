"""Audio Trigger Router - API endpoints for audio trigger management."""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List
import uuid
import os
import logging
from datetime import datetime, timezone

from database import get_db
from services.auth import get_current_user

logger = logging.getLogger(__name__)

audio_trigger_router = APIRouter(prefix="/audio-triggers", tags=["Audio Triggers"])

# Upload directory for audio trigger files
AUDIO_TRIGGER_UPLOAD_DIR = "/app/backend/uploads/audio_triggers"
os.makedirs(AUDIO_TRIGGER_UPLOAD_DIR, exist_ok=True)


# Pydantic models
class TimeWindow(BaseModel):
    start_time: str = Field(..., description="Start time HH:MM")
    end_time: str = Field(..., description="End time HH:MM")
    days: List[int] = Field(default=[0, 1, 2, 3, 4, 5, 6], description="Days of week (0=Mon, 6=Sun)")


class AudioTriggerCreate(BaseModel):
    name: str = Field(..., description="Name of the audio trigger")
    station: str = Field(..., description="Station: mfy, grk, or both")
    time_windows: List[TimeWindow] = Field(default=[], description="Time windows to listen")
    in_action_type: str = Field(default="custom_text", description="Action when IN sound detected: custom_text, show_name")
    in_action_text: str = Field(default="", description="Text to show when IN sound detected")
    out_action_type: str = Field(default="now_playing", description="Action when OUT sound detected: now_playing, show_name, custom_text")
    out_action_text: str = Field(default="", description="Text to show when OUT sound detected (if custom_text)")
    timeout_minutes: int = Field(default=5, description="Auto-deactivate after N minutes if no OUT sound")
    threshold: float = Field(default=0.75, description="Match threshold (0-1, higher = stricter)")
    enabled: bool = Field(default=True, description="Whether trigger is active")


class AudioTriggerUpdate(BaseModel):
    name: Optional[str] = None
    station: Optional[str] = None
    time_windows: Optional[List[TimeWindow]] = None
    in_action_type: Optional[str] = None
    in_action_text: Optional[str] = None
    out_action_type: Optional[str] = None
    out_action_text: Optional[str] = None
    timeout_minutes: Optional[int] = None
    threshold: Optional[float] = None
    enabled: Optional[bool] = None


@audio_trigger_router.get("")
async def get_audio_triggers(
    station: Optional[str] = None,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get all audio triggers, optionally filtered by station."""
    query = {"team_id": current_user["team_id"]}
    if station:
        query["$or"] = [{"station": station}, {"station": "both"}]
    
    triggers = await db.audio_triggers.find(query, {"_id": 0}).to_list(100)
    return triggers


@audio_trigger_router.get("/logs")
async def get_trigger_logs(
    trigger_id: Optional[str] = None,
    station: Optional[str] = None,
    limit: int = 100,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get audio trigger detection logs."""
    query = {}
    
    if trigger_id:
        query["trigger_id"] = trigger_id
    if station:
        query["station"] = station
    
    logs = await db.audio_trigger_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return logs


@audio_trigger_router.get("/{trigger_id}")
async def get_audio_trigger(
    trigger_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get a specific audio trigger."""
    trigger = await db.audio_triggers.find_one(
        {"id": trigger_id, "team_id": current_user["team_id"]},
        {"_id": 0}
    )
    
    if not trigger:
        raise HTTPException(status_code=404, detail="Audio trigger not found")
    
    return trigger


@audio_trigger_router.post("")
async def create_audio_trigger(
    trigger_data: AudioTriggerCreate,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Create a new audio trigger."""
    if current_user["role"] not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Only admins and editors can create audio triggers")
    
    timestamp = datetime.now(timezone.utc).isoformat()
    trigger_id = str(uuid.uuid4())
    
    trigger = {
        "id": trigger_id,
        "team_id": current_user["team_id"],
        "created_by": current_user["id"],
        "created_at": timestamp,
        "updated_at": timestamp,
        "in_sound_path": None,
        "out_sound_path": None,
        **trigger_data.model_dump()
    }
    
    # Convert time_windows to dict format
    trigger["time_windows"] = [w.model_dump() for w in trigger_data.time_windows]
    
    await db.audio_triggers.insert_one(trigger)
    
    # Remove MongoDB _id before returning
    trigger.pop("_id", None)
    
    return trigger


@audio_trigger_router.put("/{trigger_id}")
async def update_audio_trigger(
    trigger_id: str,
    trigger_data: AudioTriggerUpdate,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update an audio trigger."""
    if current_user["role"] not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Only admins and editors can update audio triggers")
    
    trigger = await db.audio_triggers.find_one(
        {"id": trigger_id, "team_id": current_user["team_id"]}
    )
    
    if not trigger:
        raise HTTPException(status_code=404, detail="Audio trigger not found")
    
    update_data = trigger_data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Convert time_windows if present
    if "time_windows" in update_data and update_data["time_windows"]:
        update_data["time_windows"] = [
            w.model_dump() if hasattr(w, 'model_dump') else w 
            for w in update_data["time_windows"]
        ]
    
    await db.audio_triggers.update_one(
        {"id": trigger_id},
        {"$set": update_data}
    )
    
    updated = await db.audio_triggers.find_one({"id": trigger_id}, {"_id": 0})
    return updated


@audio_trigger_router.delete("/{trigger_id}")
async def delete_audio_trigger(
    trigger_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete an audio trigger."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete audio triggers")
    
    trigger = await db.audio_triggers.find_one(
        {"id": trigger_id, "team_id": current_user["team_id"]}
    )
    
    if not trigger:
        raise HTTPException(status_code=404, detail="Audio trigger not found")
    
    # Delete audio files
    for path_field in ["in_sound_path", "out_sound_path"]:
        path = trigger.get(path_field)
        if path and os.path.exists(path):
            try:
                os.unlink(path)
            except Exception as e:
                logger.warning(f"Could not delete {path}: {e}")
    
    # Delete trigger
    await db.audio_triggers.delete_one({"id": trigger_id})
    
    # Delete associated states and logs
    await db.audio_trigger_states.delete_many({"trigger_id": trigger_id})
    
    return {"status": "success", "message": "Audio trigger deleted"}


@audio_trigger_router.post("/{trigger_id}/in-sound")
async def upload_in_sound(
    trigger_id: str,
    file: UploadFile = File(...),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Upload the IN sound (trigger activation sound) for an audio trigger."""
    if current_user["role"] not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Only admins and editors can upload sounds")
    
    trigger = await db.audio_triggers.find_one(
        {"id": trigger_id, "team_id": current_user["team_id"]}
    )
    
    if not trigger:
        raise HTTPException(status_code=404, detail="Audio trigger not found")
    
    # Validate file type
    if not file.filename.lower().endswith(('.mp3', '.wav', '.m4a', '.aac')):
        raise HTTPException(status_code=400, detail="Only MP3, WAV, M4A, and AAC files are allowed")
    
    # Delete old file if exists
    old_path = trigger.get("in_sound_path")
    if old_path and os.path.exists(old_path):
        try:
            os.unlink(old_path)
        except Exception:
            pass
    
    # Save new file
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{trigger_id}_in{ext}"
    file_path = os.path.join(AUDIO_TRIGGER_UPLOAD_DIR, filename)
    
    content = await file.read()
    # Clara Global Protect: scan before upload
    from services.global_protect import check_and_raise
    await check_and_raise(content, file.filename, file.content_type,
        user_id=current_user.get("id"), user_name=current_user.get("name"))
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Update trigger
    await db.audio_triggers.update_one(
        {"id": trigger_id},
        {"$set": {
            "in_sound_path": file_path,
            "in_sound_filename": file.filename,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "status": "success",
        "message": "IN sound uploaded",
        "filename": file.filename,
        "path": file_path
    }


@audio_trigger_router.post("/{trigger_id}/out-sound")
async def upload_out_sound(
    trigger_id: str,
    file: UploadFile = File(...),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Upload the OUT sound (trigger deactivation sound) for an audio trigger."""
    if current_user["role"] not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Only admins and editors can upload sounds")
    
    trigger = await db.audio_triggers.find_one(
        {"id": trigger_id, "team_id": current_user["team_id"]}
    )
    
    if not trigger:
        raise HTTPException(status_code=404, detail="Audio trigger not found")
    
    # Validate file type
    if not file.filename.lower().endswith(('.mp3', '.wav', '.m4a', '.aac')):
        raise HTTPException(status_code=400, detail="Only MP3, WAV, M4A, and AAC files are allowed")
    
    # Delete old file if exists
    old_path = trigger.get("out_sound_path")
    if old_path and os.path.exists(old_path):
        try:
            os.unlink(old_path)
        except Exception:
            pass
    
    # Save new file
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{trigger_id}_out{ext}"
    file_path = os.path.join(AUDIO_TRIGGER_UPLOAD_DIR, filename)
    
    content = await file.read()
    # Clara Global Protect: scan before upload
    from services.global_protect import check_and_raise
    await check_and_raise(content, file.filename, file.content_type,
        user_id=current_user.get("id"), user_name=current_user.get("name"))
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Update trigger
    await db.audio_triggers.update_one(
        {"id": trigger_id},
        {"$set": {
            "out_sound_path": file_path,
            "out_sound_filename": file.filename,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "status": "success",
        "message": "OUT sound uploaded",
        "filename": file.filename,
        "path": file_path
    }


@audio_trigger_router.delete("/{trigger_id}/in-sound")
async def delete_in_sound(
    trigger_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete the IN sound for an audio trigger."""
    if current_user["role"] not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Only admins and editors can delete sounds")
    
    trigger = await db.audio_triggers.find_one(
        {"id": trigger_id, "team_id": current_user["team_id"]}
    )
    
    if not trigger:
        raise HTTPException(status_code=404, detail="Audio trigger not found")
    
    path = trigger.get("in_sound_path")
    if path and os.path.exists(path):
        os.unlink(path)
    
    await db.audio_triggers.update_one(
        {"id": trigger_id},
        {"$set": {
            "in_sound_path": None,
            "in_sound_filename": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"status": "success", "message": "IN sound deleted"}


@audio_trigger_router.delete("/{trigger_id}/out-sound")
async def delete_out_sound(
    trigger_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete the OUT sound for an audio trigger."""
    if current_user["role"] not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Only admins and editors can delete sounds")
    
    trigger = await db.audio_triggers.find_one(
        {"id": trigger_id, "team_id": current_user["team_id"]}
    )
    
    if not trigger:
        raise HTTPException(status_code=404, detail="Audio trigger not found")
    
    path = trigger.get("out_sound_path")
    if path and os.path.exists(path):
        os.unlink(path)
    
    await db.audio_triggers.update_one(
        {"id": trigger_id},
        {"$set": {
            "out_sound_path": None,
            "out_sound_filename": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"status": "success", "message": "OUT sound deleted"}


@audio_trigger_router.get("/{trigger_id}/state")
async def get_trigger_state(
    trigger_id: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get the current state of an audio trigger."""
    trigger = await db.audio_triggers.find_one(
        {"id": trigger_id, "team_id": current_user["team_id"]},
        {"_id": 0}
    )
    
    if not trigger:
        raise HTTPException(status_code=404, detail="Audio trigger not found")
    
    state = await db.audio_trigger_states.find_one(
        {"trigger_id": trigger_id},
        {"_id": 0}
    )
    
    return {
        "trigger": trigger,
        "state": state or {"is_active": False}
    }


@audio_trigger_router.post("/{trigger_id}/test")
async def test_trigger_manually(
    trigger_id: str,
    action: str = "activate",
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Manually activate or deactivate a trigger for testing."""
    if current_user["role"] not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Only admins and editors can test triggers")
    
    trigger = await db.audio_triggers.find_one(
        {"id": trigger_id, "team_id": current_user["team_id"]},
        {"_id": 0}
    )
    
    if not trigger:
        raise HTTPException(status_code=404, detail="Audio trigger not found")
    
    timestamp = datetime.now(timezone.utc).isoformat()
    station = trigger.get("station", "mfy")
    
    if action == "activate":
        await db.audio_trigger_states.update_one(
            {"trigger_id": trigger_id, "station": station},
            {"$set": {
                "is_active": True,
                "activated_at": timestamp,
                "action_type": trigger.get("in_action_type", "custom_text"),
                "action_text": trigger.get("in_action_text", ""),
                "updated_at": timestamp,
                "manual_test": True
            }},
            upsert=True
        )
        return {"status": "success", "message": "Trigger manually activated"}
    else:
        await db.audio_trigger_states.update_one(
            {"trigger_id": trigger_id, "station": station},
            {"$set": {
                "is_active": False,
                "deactivated_at": timestamp,
                "updated_at": timestamp,
                "manual_test": True
            }},
            upsert=True
        )
        return {"status": "success", "message": "Trigger manually deactivated"}


@audio_trigger_router.get("/station/{station}/active")
async def get_active_trigger_for_station(
    station: str,
    db=Depends(get_db)
):
    """Get the currently active audio trigger for a station (public endpoint)."""
    state = await db.audio_trigger_states.find_one(
        {"station": {"$in": [station, "both"]}, "is_active": True},
        {"_id": 0}
    )
    
    if not state:
        return {"active": False, "trigger_id": None}
    
    return {
        "active": True,
        "trigger_id": state.get("trigger_id"),
        "action_type": state.get("action_type"),
        "action_text": state.get("action_text"),
        "activated_at": state.get("activated_at")
    }


@audio_trigger_router.get("/system/status")
async def get_audio_trigger_system_status(
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get the status of the audio trigger system (ffmpeg, libraries, etc.)."""
    import shutil
    
    # Check ffmpeg
    ffmpeg_available = shutil.which("ffmpeg") is not None
    
    # Check audio libraries
    try:
        import librosa
        import soundfile
        audio_libs_available = True
    except ImportError:
        audio_libs_available = False
    
    # Check if scheduler is running (via global variable in server.py)
    scheduler_running = False
    try:
        from server import audio_trigger_scheduler
        scheduler_running = audio_trigger_scheduler is not None and audio_trigger_scheduler.running
    except:
        pass
    
    return {
        "ffmpeg_available": ffmpeg_available,
        "audio_libs_available": audio_libs_available,
        "scheduler_running": scheduler_running,
        "fully_operational": ffmpeg_available and audio_libs_available and scheduler_running,
        "issues": [
            issue for issue in [
                None if ffmpeg_available else "FFmpeg is not installed - audio stream analysis will not work",
                None if audio_libs_available else "Audio libraries (librosa/soundfile) are missing",
                None if scheduler_running else "Audio trigger scheduler is not running"
            ] if issue
        ]
    }
