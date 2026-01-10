"""Content library models."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal


class ContentItemCreate(BaseModel):
    title: str
    type: Literal["text", "link", "reference"] = "text"
    body: Optional[str] = ""
    excerpt: Optional[str] = ""
    external_url: Optional[str] = ""
    tags: Optional[List[str]] = []
    status: Literal["draft", "ready"] = "draft"


class ContentItemUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[Literal["text", "link", "reference"]] = None
    body: Optional[str] = None
    excerpt: Optional[str] = None
    external_url: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[Literal["draft", "ready"]] = None


class FeaturedImageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    content_item_id: str
    wordpress_site_id: str
    wordpress_site_name: Optional[str] = None
    file_storage_key: str
    file_name: str
    mime_type: str
    size: int
    wp_media_id: Optional[int] = None
    wp_media_url: Optional[str] = None
    sync_status: str = "not_synced"
    sync_error_message: Optional[str] = None
    last_synced_at: Optional[str] = None
    created_at: str
    updated_at: str


class ContentPublishStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    content_item_id: str
    wordpress_site_id: str
    wordpress_site_name: str
    wp_post_id: Optional[int] = None
    wp_post_type: str = "post"
    wp_status: str = "draft"
    wp_permalink: Optional[str] = None
    sync_status: str = "not_synced"
    sync_error_message: Optional[str] = None
    last_synced_at: Optional[str] = None
    created_at: str
    updated_at: str


class ContentPublishStatusWithImage(ContentPublishStatus):
    featured_image: Optional[FeaturedImageResponse] = None


class ContentItemResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    type: str
    body: str
    excerpt: str
    external_url: str
    tags: List[str]
    status: str
    team_id: str
    created_by: str
    created_at: str
    updated_at: str
    publish_statuses: List[ContentPublishStatusWithImage] = []
