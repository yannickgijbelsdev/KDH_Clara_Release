"""Models for the per-article liveblog feature.

A *LiveblogEntry* is a timeline point on a content article (like the VRT
NWS "tijdlijn" blocks). Each entry can carry rich HTML, a structured list
of images (with full copyright fields, mirroring the main article's
``image_attributions`` system) and/or videos (S3 upload OR embed).
"""
from datetime import datetime, timezone
from typing import List, Optional, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class LiveblogImage(BaseModel):
    """Photo attached to an entry — same rights fields as the main article."""
    url: str
    key: Optional[str] = None
    alt_text: Optional[str] = None
    credit: Optional[str] = None        # source / agency — REQUIRED to publish
    photographer: Optional[str] = None
    license: Optional[str] = None
    source_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None


class LiveblogVideo(BaseModel):
    """Video attached to an entry — either an uploaded mp4 (``url`` + ``key``
    set, ``embed_code`` empty) or a YouTube/Vimeo/Twitch link (``embed_code``
    set, ``url`` empty)."""
    url: Optional[str] = None        # S3 url when uploaded
    key: Optional[str] = None        # S3 key
    embed_code: Optional[str] = None  # YouTube/Vimeo URL or <iframe> snippet
    platform: Optional[str] = None    # derived
    embed_html: Optional[str] = None  # derived
    thumbnail_url: Optional[str] = None


class LiveblogEntryCreate(BaseModel):
    title: Optional[str] = ""
    body: Optional[str] = ""       # TinyMCE HTML
    timestamp: Optional[str] = None  # ISO datetime — defaults to now
    images: Optional[List[LiveblogImage]] = None
    videos: Optional[List[LiveblogVideo]] = None
    publish: Optional[bool] = None   # default true on create; set false for explicit draft


class LiveblogEntryUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    timestamp: Optional[str] = None
    images: Optional[List[LiveblogImage]] = None
    videos: Optional[List[LiveblogVideo]] = None


class LiveblogEntryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    content_id: str
    title: Optional[str] = ""
    body: Optional[str] = ""
    timestamp: str
    published: bool = False
    published_at: Optional[str] = None
    images: List[LiveblogImage] = Field(default_factory=list)
    videos: List[LiveblogVideo] = Field(default_factory=list)
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None


def serialize_entry(doc: dict) -> dict:
    """Strip Mongo internal fields and ensure derived video fields are set."""
    from services.video_embed import detect_platform, build_embed_html
    out = {k: v for k, v in doc.items() if not k.startswith("_")}
    vids = out.get("videos") or []
    for v in vids:
        if v.get("embed_code") and not v.get("embed_html"):
            det = detect_platform(v["embed_code"])
            v["platform"] = det.get("platform")
            v["embed_html"] = build_embed_html(det)
            v["thumbnail_url"] = v.get("thumbnail_url") or det.get("thumbnail_url")
    return out
