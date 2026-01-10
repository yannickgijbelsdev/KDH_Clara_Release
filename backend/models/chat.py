"""Chat system models."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal


class ChatThreadCreate(BaseModel):
    type: Literal["team", "show"] = "team"
    show_id: Optional[str] = None


class ChatThreadResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    type: str
    show_id: Optional[str] = None
    show_title: Optional[str] = None
    created_by: str
    created_at: str
    updated_at: str
    last_message: Optional[str] = None
    last_message_at: Optional[str] = None


class ChatMessageCreate(BaseModel):
    body: str


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    thread_id: str
    user_id: str
    user_name: Optional[str] = None
    body: str
    created_at: str
