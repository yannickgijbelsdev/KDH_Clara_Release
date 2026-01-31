"""WordPress integration models."""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Literal


class WordPressSiteCreate(BaseModel):
    """Create a WordPress site connection.
    
    SECURITY NOTES:
    - Use Application Passwords, NOT normal login passwords
    - Create a dedicated service account (NOT Administrator)
    - Service account needs: edit_posts, publish_posts, upload_files capabilities
    - Consider creating a custom WordPress role with minimal permissions
    """
    name: str = Field(..., description="Display name for this WordPress site")
    wp_base_url: str = Field(..., description="WordPress site URL (e.g., https://example.com)")
    username: str = Field(..., description="WordPress username (dedicated service account recommended)")
    app_password: str = Field(..., description="WordPress Application Password (NOT normal password)")
    default_post_type: Literal["post", "page"] = "post"
    default_publish_status: Literal["draft", "publish"] = "draft"
    is_active: bool = True


class WordPressSiteUpdate(BaseModel):
    """Update WordPress site connection. Supports credential rotation."""
    name: Optional[str] = None
    wp_base_url: Optional[str] = None
    username: Optional[str] = None
    app_password: Optional[str] = Field(None, description="New Application Password for credential rotation")
    default_post_type: Optional[Literal["post", "page"]] = None
    default_publish_status: Optional[Literal["draft", "publish"]] = None
    is_active: Optional[bool] = Field(None, description="Set to false to disable without deleting")


class WordPressSiteResponse(BaseModel):
    """WordPress site info. Note: app_password is NEVER returned."""
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: str
    name: str
    wp_base_url: str
    username: str
    default_post_type: str
    default_publish_status: str
    is_active: bool
    created_at: str
    updated_at: str


class WordPressConnectionTestResponse(BaseModel):
    """Result of testing WordPress connection with capability checks."""
    success: bool
    message: str
    wp_user: Optional[str] = None
    wp_roles: Optional[List[str]] = None
    has_edit_posts: Optional[bool] = None
    has_upload_files: Optional[bool] = None
    has_publish_posts: Optional[bool] = None
    is_administrator: Optional[bool] = Field(None, description="True if connected as Administrator (security risk)")
    warnings: Optional[List[str]] = Field(None, description="Security warnings and missing capabilities")
    error: Optional[str] = None


class PublishTarget(BaseModel):
    site_id: str
    post_type: Literal["post", "page"] = "post"
    wp_status: Literal["draft", "publish", "future"] = "draft"
    scheduled_date: Optional[str] = None  # ISO format datetime for scheduled publishing


class PublishToWordPressRequest(BaseModel):
    targets: List[PublishTarget]


class PublishResult(BaseModel):
    site_id: str
    site_name: str
    success: bool
    message: str
    wp_post_id: Optional[int] = None
    wp_permalink: Optional[str] = None
    scheduled_date: Optional[str] = None


class PublishResponse(BaseModel):
    results: List[PublishResult]


class ScheduledPublishResponse(BaseModel):
    """Response for scheduled publish operations."""
    model_config = ConfigDict(extra="ignore")
    id: str
    content_id: str
    content_title: str
    site_id: str
    site_name: str
    scheduled_date: str
    post_type: str
    status: Literal["pending", "published", "failed", "cancelled"]
    created_at: str
    published_at: Optional[str] = None
    error_message: Optional[str] = None
