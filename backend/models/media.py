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
    original_filename: str
    mime_type: str
    size: int
    duration_seconds: Optional[float] = None
    created_at: str
    updated_at: str


class MediaAssetUpdate(BaseModel):
    title: Optional[str] = None


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
