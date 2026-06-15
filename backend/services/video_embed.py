"""Platform detection + embed helpers for VideoEndpoints.

Detects YouTube / Vimeo / Twitch / Dailymotion from a URL or pasted
``<iframe>`` snippet and produces:
    - a normalised ``platform`` slug
    - a clean ``<iframe>`` ready to drop into a page
    - a ``thumbnail_url`` (poster) when the platform exposes one
"""
import re
import html as _html
from typing import Optional


_YT_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{6,15})"),
]
_VIMEO_PATTERNS = [
    re.compile(r"vimeo\.com/(?:video/|channels/[^/]+/)?(\d{5,})"),
    re.compile(r"player\.vimeo\.com/video/(\d{5,})"),
]
_TWITCH_VIDEO = re.compile(r"twitch\.tv/videos/(\d{5,})")
_TWITCH_CHANNEL = re.compile(r"twitch\.tv/([A-Za-z0-9_]{3,})$")
_DAILYMOTION = re.compile(r"dailymotion\.com/(?:video|embed/video)/([A-Za-z0-9]+)")
_IFRAME_SRC = re.compile(r'<iframe[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)


def _extract_src_from_iframe(snippet: str) -> Optional[str]:
    if not snippet:
        return None
    m = _IFRAME_SRC.search(snippet)
    return m.group(1) if m else None


def detect_platform(embed_code: str) -> dict:
    """Inspect a pasted URL or ``<iframe>`` and return platform metadata.

    Returns: ``{platform, video_id?, embed_url, thumbnail_url?}``

    ``platform`` is always set. Unknown sources fall back to
    ``platform="iframe"`` and reuse the user's raw snippet/URL.
    """
    text = (embed_code or "").strip()
    if not text:
        return {"platform": None}

    # If the user pasted a full <iframe>, prefer its src for detection
    candidate_url = _extract_src_from_iframe(text) or text

    # YouTube
    for rx in _YT_PATTERNS:
        m = rx.search(candidate_url)
        if m:
            vid = m.group(1)
            return {
                "platform": "youtube",
                "video_id": vid,
                "embed_url": f"https://www.youtube.com/embed/{vid}",
                "thumbnail_url": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            }

    # Vimeo
    for rx in _VIMEO_PATTERNS:
        m = rx.search(candidate_url)
        if m:
            vid = m.group(1)
            return {
                "platform": "vimeo",
                "video_id": vid,
                "embed_url": f"https://player.vimeo.com/video/{vid}",
                # Vimeo thumbnail needs a separate API call (vimeo.com/api/v2/video/{id}.json),
                # so we leave thumbnail_url blank — the frontend can lazy-fetch.
                "thumbnail_url": None,
            }

    # Twitch (video / channel)
    m = _TWITCH_VIDEO.search(candidate_url)
    if m:
        vid = m.group(1)
        return {
            "platform": "twitch",
            "video_id": vid,
            "embed_url": f"https://player.twitch.tv/?video=v{vid}&parent=clr.koodh.com&autoplay=false",
            "thumbnail_url": None,
        }
    m = _TWITCH_CHANNEL.search(candidate_url)
    if m:
        channel = m.group(1)
        return {
            "platform": "twitch",
            "video_id": channel,
            "embed_url": f"https://player.twitch.tv/?channel={channel}&parent=clr.koodh.com&autoplay=false",
            "thumbnail_url": None,
        }

    # Dailymotion
    m = _DAILYMOTION.search(candidate_url)
    if m:
        vid = m.group(1)
        return {
            "platform": "dailymotion",
            "video_id": vid,
            "embed_url": f"https://www.dailymotion.com/embed/video/{vid}",
            "thumbnail_url": f"https://www.dailymotion.com/thumbnail/video/{vid}",
        }

    # Unknown source — surface as a raw iframe if it looks like a URL,
    # otherwise echo the user's snippet verbatim.
    if candidate_url.startswith(("http://", "https://")):
        return {
            "platform": "iframe",
            "embed_url": candidate_url,
            "thumbnail_url": None,
        }

    return {
        "platform": "iframe",
        "embed_url": None,
        "raw": text,
        "thumbnail_url": None,
    }


def build_embed_html(detection: dict) -> str:
    """Render a ready-to-paste ``<iframe>`` from a ``detect_platform`` result."""
    if not detection:
        return ""
    if detection.get("raw") and not detection.get("embed_url"):
        # User pasted a raw snippet we couldn't normalise; return as-is.
        return detection["raw"]
    src = detection.get("embed_url")
    if not src:
        return ""
    safe = _html.escape(src, quote=True)
    return (
        f'<iframe src="{safe}" width="100%" height="450" '
        f'frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" '
        f'allowfullscreen></iframe>'
    )


def build_upload_embed_html(uploaded_url: str, poster_url: str | None = None) -> str:
    """Render an HTML5 ``<video>`` block for an S3-uploaded file."""
    if not uploaded_url:
        return ""
    src = _html.escape(uploaded_url, quote=True)
    poster = f' poster="{_html.escape(poster_url, quote=True)}"' if poster_url else ""
    return (
        f'<video controls preload="metadata" width="100%"{poster}>'
        f'<source src="{src}" type="video/mp4">'
        f'Your browser does not support the video tag.'
        f'</video>'
    )


def serialize_video(item: dict) -> dict:
    """Augment a stored VideoEndpoint dict with derived ``platform``,
    ``embed_html`` and ``thumbnail_url`` fields for API responses."""
    out = dict(item)
    out.pop("_id", None)
    uploaded_url = (item.get("uploaded_url") or "").strip()
    embed_code = (item.get("embed_code") or "").strip()
    poster = (item.get("poster_url") or "").strip() or None

    if uploaded_url:
        out["platform"] = "upload"
        out["embed_html"] = build_upload_embed_html(uploaded_url, poster)
        out["thumbnail_url"] = poster
    elif embed_code:
        det = detect_platform(embed_code)
        out["platform"] = det.get("platform")
        out["embed_html"] = build_embed_html(det)
        out["thumbnail_url"] = poster or det.get("thumbnail_url")
    else:
        out["platform"] = None
        out["embed_html"] = ""
        out["thumbnail_url"] = poster
    return out
