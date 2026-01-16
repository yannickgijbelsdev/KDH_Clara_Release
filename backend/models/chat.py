"""Chat system models."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal, List


class ChatThreadCreate(BaseModel):
    type: Literal["team", "show", "group", "private"] = "team"
    show_id: Optional[str] = None
    name: Optional[str] = None  # For group chats
    member_ids: Optional[List[str]] = None  # For group and private chats


class ChatThreadUpdate(BaseModel):
    name: Optional[str] = None


class ChatThreadMemberUpdate(BaseModel):
    action: Literal["add", "remove", "set_role"]
    member_id: str
    role: Optional[Literal["owner", "admin", "member"]] = None


class ChatThreadResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    type: str
    name: Optional[str] = None
    show_id: Optional[str] = None
    show_title: Optional[str] = None
    member_ids: Optional[List[str]] = None
    members: Optional[List[dict]] = None  # Populated with user info
    member_roles: Optional[dict] = None  # {user_id: role}
    created_by: str
    created_at: str
    updated_at: str
    last_message: Optional[str] = None
    last_message_at: Optional[str] = None


class ChatMessageCreate(BaseModel):
    body: str
    attachment_url: Optional[str] = None
    attachment_type: Optional[Literal["image", "audio", "file"]] = None
    attachment_name: Optional[str] = None


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    thread_id: str
    user_id: str
    user_name: Optional[str] = None
    body: str
    attachment_url: Optional[str] = None
    attachment_type: Optional[str] = None
    attachment_name: Optional[str] = None
    created_at: str


class TeamMemberResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    role: str
