"""Content library models."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal


class ContentItemCreate(BaseModel):
    title: str
    type: Literal["text", "audio", "link", "reference"] = "text"
    body: Optional[str] = ""
    excerpt: Optional[str] = ""
    external_url: Optional[str] = ""
    category_id: Optional[str] = None
    status: Literal["draft", "ready"] = "draft"


class ContentItemUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[Literal["text", "audio", "link", "reference"]] = None
    body: Optional[str] = None
    excerpt: Optional[str] = None
    external_url: Optional[str] = None
    category_id: Optional[str] = None
    status: Optional[Literal["draft", "ready", "published"]] = None
    is_liveblog: Optional[bool] = None


class ContentApprovalUpdate(BaseModel):
    """Admin approval for content publishing."""
    approval_status: Literal["pending", "approved", "rejected"]
    approval_notes: Optional[str] = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str


class FeaturedImageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    content_item_id: str
    wordpress_site_id: str
    wordpress_site_name: Optional[str] = None
    file_storage_key: str
    s3_url: Optional[str] = None
    file_name: str
    mime_type: str
    size: int
    wp_media_id: Optional[int] = None
    wp_media_url: Optional[str] = None
    sync_status: str = "not_synced"
    sync_error_message: Optional[str] = None
    last_synced_at: Optional[str] = None
    # Copyright / attribution — required to comply with photographer/agency
    # licensing. Pushed into WP media caption + News API article payload.
    photo_credit: Optional[str] = None
    photo_copyright: Optional[str] = None
    photo_source_url: Optional[str] = None
    photo_photographer: Optional[str] = None
    photo_license: Optional[str] = None
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
    wp_scheduled_date: Optional[str] = None  # Scheduled publication date
    sync_status: str = "not_synced"
    sync_error_message: Optional[str] = None
    last_synced_at: Optional[str] = None
    created_at: str
    updated_at: str


class ContentPublishStatusWithImage(ContentPublishStatus):
    featured_image: Optional[FeaturedImageResponse] = None


class ContentFeaturedImage(BaseModel):
    """Featured image attached directly to content item (not site-specific)."""
    model_config = ConfigDict(extra="ignore")
    file_storage_key: str
    s3_url: Optional[str] = None
    file_name: str
    mime_type: str
    size: int
    # Copyright / attribution metadata. Travels with the image so WordPress
    # publish (as media caption / alt) and News API publish (in the article
    # payload) can credit the rights holder consistently.
    photo_credit: Optional[str] = None
    photo_copyright: Optional[str] = None
    photo_source_url: Optional[str] = None
    photo_photographer: Optional[str] = None
    photo_license: Optional[str] = None


class ContentItemResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    type: str
    body: Optional[str] = ""
    excerpt: Optional[str] = ""
    external_url: Optional[str] = ""
    category_id: Optional[str] = None
    category: Optional[CategoryResponse] = None
    status: str
    # Approval workflow
    approval_status: Optional[str] = "pending"  # pending, approved, rejected
    approval_notes: Optional[str] = None
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_by_avatar: Optional[str] = None
    approved_at: Optional[str] = None
    # Other fields
    team_id: Optional[str] = None
    created_by: str
    created_by_name: Optional[str] = None  # Creator's display name
    created_by_avatar: Optional[str] = None
    created_at: str
    updated_at: str
    last_edited_by: Optional[str] = None
    last_edited_by_name: Optional[str] = None
    last_edited_by_avatar: Optional[str] = None
    last_edited_at: Optional[str] = None
    featured_image: Optional[ContentFeaturedImage] = None
    external_featured_image: Optional[str] = None  # URL from imported WordPress articles
    source: Optional[str] = None  # Source site name (e.g., "MFY", "GRK")
    source_url: Optional[str] = None  # Original article URL
    image_attributions: Optional[dict] = None  # URL → { credit, photographer, license, source_url }
    missing_image_attributions: Optional[bool] = None  # set by list / detail endpoints
    is_liveblog: Optional[bool] = False
    liveblog_ended_at: Optional[str] = None
    liveblog_entry_count: Optional[int] = None
    publish_statuses: List[ContentPublishStatusWithImage] = []
