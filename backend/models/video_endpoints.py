"""Pydantic models for the Video Endpoints feature.

A *VideoEndpoint* is a reusable video reference (embed or uploaded file) that
can be attached to one or more shows, or surfaced publicly via the
``/api/videos`` endpoint. Typical use cases:

  * A weekly Twitch livestream link that gets reused every Monday show
  * A pre-roll ad video (mp4) uploaded to S3 and served on multiple shows
  * A YouTube replay link the editor wants to surface in the schedule API
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal


VideoType = Literal["show", "ad", "promo", "other"]


class VideoEndpointCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    type: VideoType = "show"
    # Embed source — exactly one of (embed_code, uploaded_url) is required
    embed_code: Optional[str] = None      # YouTube/Vimeo URL or raw <iframe>
    uploaded_url: Optional[str] = None    # S3 URL for ad files (set by /upload)
    uploaded_key: Optional[str] = None    # S3 key (for delete cleanup)
    poster_url: Optional[str] = None      # Override thumbnail (else auto)
    tags: Optional[list[str]] = None


class VideoEndpointUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[VideoType] = None
    embed_code: Optional[str] = None
    uploaded_url: Optional[str] = None
    uploaded_key: Optional[str] = None
    poster_url: Optional[str] = None
    tags: Optional[list[str]] = None


class VideoEndpointResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = ""
    type: VideoType = "show"
    embed_code: Optional[str] = None
    uploaded_url: Optional[str] = None
    uploaded_key: Optional[str] = None
    # Derived (computed on read)
    platform: Optional[str] = None        # "youtube" | "vimeo" | "twitch" | "dailymotion" | "iframe" | "upload"
    embed_html: Optional[str] = None      # Ready-to-paste <iframe>
    thumbnail_url: Optional[str] = None   # Auto-detected or poster override
    poster_url: Optional[str] = None
    tags: Optional[list[str]] = None
    main_site_id: Optional[str] = None
    team_id: Optional[str] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
