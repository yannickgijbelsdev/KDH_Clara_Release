"""Show and series assignment models."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal


class ShowAssignmentCreate(BaseModel):
    show_id: str
    user_id: str
    role_on_show: Literal["editor", "presenter"] = "editor"


class ShowAssignmentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    show_id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    role_on_show: str
    created_at: str
