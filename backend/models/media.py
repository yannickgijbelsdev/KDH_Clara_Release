"""Media library models."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class MediaAssetResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    uploaded_by: str
    uploaded_by_name: Optional[str] = None
    kind: str
    title: str
    file_storage_key: str
    s3_url: Optional[str] = None  # Direct S3 URL if uploaded to S3
    original_filename: str
    mime_type: str
    size: int
    duration_seconds: Optional[float] = None
    folder_id: Optional[str] = None
    created_at: str
    updated_at: str


class MediaAssetUpdate(BaseModel):
    title: Optional[str] = None
    folder_id: Optional[str] = None


class AttachMediaRequest(BaseModel):
    media_asset_ids: List[str]


class ShowMediaResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    show_id: Optional[str] = None
    occurrence_id: Optional[str] = None
    media_asset_id: str
    media_asset: Optional[MediaAssetResponse] = None
    created_at: str


class RundownItemMediaResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    rundown_item_id: str
    media_asset_id: str
    media_asset: Optional[MediaAssetResponse] = None
    created_at: str


# ============== FOLDER MODELS ==============

class MediaFolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None  # For nested folders
    color: Optional[str] = None  # Optional color tag


class MediaFolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    color: Optional[str] = None


class MediaFolderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    name: str
    parent_id: Optional[str] = None
    color: Optional[str] = None
    created_by: str
    created_by_name: Optional[str] = None
    created_at: str
    updated_at: str
    asset_count: Optional[int] = 0
    children: Optional[List["MediaFolderResponse"]] = None


class FolderShareRequest(BaseModel):
    user_ids: Optional[List[str]] = None
    show_ids: Optional[List[str]] = None
    series_ids: Optional[List[str]] = None


class FolderShareResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    folder_id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    show_id: Optional[str] = None
    show_title: Optional[str] = None
    series_id: Optional[str] = None
    series_title: Optional[str] = None
    created_at: str

