"""Authentication and user models."""
from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, Literal


class TeamCreate(BaseModel):
    name: str


class TeamResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    created_at: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    team_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    team_id: str
    created_at: str
    avatar: Optional[dict] = None
    is_network_admin: bool = False


class UserWithTeamResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    team_id: str
    team_name: str
    created_at: str
    avatar: Optional[dict] = None
    preferences: Optional[dict] = None
    is_network_admin: bool = False


class TokenResponse(BaseModel):
    token: str
    user: UserWithTeamResponse
    expires_at: Optional[float] = None  # Unix timestamp when session expires


class InviteUserRequest(BaseModel):
    email: EmailStr
    name: str
    role: Literal["admin", "news_admin", "editor", "presenter", "viewer"] = "editor"


class UpdateUserRoleRequest(BaseModel):
    role: Literal["admin", "news_admin", "editor", "presenter", "viewer"]
