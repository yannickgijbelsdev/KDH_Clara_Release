"""WordPress integration models."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal


class WordPressSiteCreate(BaseModel):
    name: str
    wp_base_url: str
    username: str
    app_password: str
    default_post_type: Literal["post", "page"] = "post"
    default_publish_status: Literal["draft", "publish"] = "draft"
    is_active: bool = True


class WordPressSiteUpdate(BaseModel):
    name: Optional[str] = None
    wp_base_url: Optional[str] = None
    username: Optional[str] = None
    app_password: Optional[str] = None
    default_post_type: Optional[Literal["post", "page"]] = None
    default_publish_status: Optional[Literal["draft", "publish"]] = None
    is_active: Optional[bool] = None


class WordPressSiteResponse(BaseModel):
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


class PublishTarget(BaseModel):
    site_id: str
    post_type: Literal["post", "page"] = "post"
    wp_status: Literal["draft", "publish"] = "draft"


class PublishToWordPressRequest(BaseModel):
    targets: List[PublishTarget]


class PublishResult(BaseModel):
    site_id: str
    site_name: str
    success: bool
    message: str
    wp_post_id: Optional[int] = None
    wp_permalink: Optional[str] = None


class PublishResponse(BaseModel):
    results: List[PublishResult]
