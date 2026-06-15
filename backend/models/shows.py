"""Show and rundown models."""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Literal


# ============== SHOW TITLE TEMPLATES ==============

class ShowTitleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    default_start_time: Optional[str] = None
    default_end_time: Optional[str] = None
    # Free-form RDS station code. Must be one of the RDS station codes
    # configured for the show's main site, "all" to broadcast on every
    # configured station, or "none" to skip RDS output entirely.
    rds_station: Optional[str] = "none"
    default_presenter_ids: Optional[List[str]] = None


class ShowTitleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_start_time: Optional[str] = None
    default_end_time: Optional[str] = None
    rds_station: Optional[str] = None
    default_presenter_ids: Optional[List[str]] = None


class PresenterInfo(BaseModel):
    """Basic presenter information."""
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    avatar: Optional[dict] = None


class ShowTitleResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    default_start_time: Optional[str] = None
    default_end_time: Optional[str] = None
    rds_station: Optional[str] = "none"
    team_id: Optional[str] = None
    created_by: str
    created_at: str
    image: Optional[dict] = None
    default_presenter_ids: Optional[List[str]] = None
    default_presenters: Optional[List[PresenterInfo]] = None


# ============== STUDIOS/ROOMS ==============

class StudioCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class StudioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class StudioResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    team_id: Optional[str] = None
    created_by: str
    created_at: str


# ============== SHOWS ==============

class ShowImage(BaseModel):
    """Image attached to a show."""
    model_config = ConfigDict(extra="ignore")
    # Support both new (file_storage_key) and legacy (file_key) field names
    file_storage_key: Optional[str] = Field(default=None, alias="file_storage_key")
    file_key: Optional[str] = None  # Legacy field
    file_name: Optional[str] = Field(default=None, alias="file_name")
    filename: Optional[str] = None  # Legacy field
    mime_type: str
    size: int
    s3_url: Optional[str] = None
    
    @property
    def storage_key(self) -> Optional[str]:
        """Get the storage key, supporting both naming conventions."""
        return self.file_storage_key or self.file_key
    
    @property
    def name(self) -> Optional[str]:
        """Get the filename, supporting both naming conventions."""
        return self.file_name or self.filename


class ShowCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    date: str
    start_time: str
    end_time: str
    status: str = "draft"
    studio_id: Optional[str] = None
    presenter_ids: Optional[List[str]] = None
    # Video reference — editor toggles "this show contains video"
    has_video: Optional[bool] = False
    video_endpoint_id: Optional[str] = None  # FK → video_endpoints.id
    video_embed_override: Optional[str] = None  # Inline embed code if no endpoint chosen
    # Recurrence fields
    recurrence_type: Literal["none", "weekly"] = "none"
    recurrence_interval: int = Field(default=1, ge=1, le=4, description="Repeat every N weeks (1-4)")
    recurrence_end_date: Optional[str] = None  # YYYY-MM-DD or None for no end


class ShowUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[str] = None
    studio_id: Optional[str] = None
    presenter_ids: Optional[List[str]] = None
    has_video: Optional[bool] = None
    video_endpoint_id: Optional[str] = None
    video_embed_override: Optional[str] = None
    # For updating single occurrence vs all
    update_all_occurrences: Optional[bool] = False


class ShowResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: str
    date: str
    start_time: str
    end_time: str
    status: str
    editor_id: str
    team_id: Optional[str] = ""
    studio_id: Optional[str] = None
    studio_name: Optional[str] = None
    presenter_ids: Optional[List[str]] = None
    presenters: Optional[List[PresenterInfo]] = None
    image: Optional[ShowImage] = None
    created_at: str
    updated_at: str
    # Recurrence info
    recurrence_type: Optional[str] = "none"
    recurrence_interval: Optional[int] = 1
    recurrence_end_date: Optional[str] = None
    parent_show_id: Optional[str] = None  # If this is an occurrence of a recurring show
    is_recurring: Optional[bool] = False
    rds_station: Optional[str] = "none"
    # Video reference (added 2026-06)
    has_video: Optional[bool] = False
    video_endpoint_id: Optional[str] = None
    video_embed_override: Optional[str] = None


class RundownItemCreate(BaseModel):
    type: str
    title: str
    notes: Optional[str] = ""
    duration: Optional[str] = ""


class RundownItemUpdate(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    duration: Optional[str] = None


class RundownItemResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    show_id: str
    type: str
    title: str
    notes: str
    duration: str
    order: int
    created_at: str
    created_by: Optional[dict] = None
    last_edited_by: Optional[dict] = None


class ReorderRequest(BaseModel):
    item_ids: List[str]


class AttachContentRequest(BaseModel):
    content_ids: List[str]


class RundownItemWithContentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    show_id: str
    type: str
    title: str
    notes: str
    duration: str
    order: int
    created_at: str
    created_by: Optional[dict] = None
    last_edited_by: Optional[dict] = None
    content_ids: List[str] = []


class DeleteShowRequest(BaseModel):
    delete_all_occurrences: bool = False
