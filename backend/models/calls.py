"""Models for the calling system — audio profiles, invite links, call sessions."""
from pydantic import BaseModel
from typing import Optional


class AudioProfileCreate(BaseModel):
    name: str  # e.g. "Studio A", "Thuiswerkplek"
    input_device_id: Optional[str] = None
    input_device_label: Optional[str] = None
    output_device_id: Optional[str] = None
    output_device_label: Optional[str] = None


class AudioProfileUpdate(BaseModel):
    name: Optional[str] = None
    input_device_id: Optional[str] = None
    input_device_label: Optional[str] = None
    output_device_id: Optional[str] = None
    output_device_label: Optional[str] = None


class CallInviteCreate(BaseModel):
    label: Optional[str] = None  # e.g. caller name or description


class CallInviteResponse(BaseModel):
    id: str
    token: str
    label: Optional[str] = None
    url: str
    status: str  # "pending", "active", "ended"
    created_at: str
    caller_name: Optional[str] = None
    duration_seconds: Optional[int] = None


class CallActionRequest(BaseModel):
    action: str  # "mute", "unmute", "hangup", "set_volume"
    value: Optional[float] = None  # for volume: 0.0 - 1.0
