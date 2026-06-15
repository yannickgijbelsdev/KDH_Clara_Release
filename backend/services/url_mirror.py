"""Mirror remote URLs (e.g. WordPress featured images) into our S3 bucket
so we own the asset and can survive the source site being taken down or
rotating its CDN. Used by the WordPress import pipeline.
"""
from __future__ import annotations

import logging
import mimetypes
from uuid import uuid4
from typing import Optional
from urllib.parse import urlparse

import httpx

from services.s3_storage import (
    upload_file_to_s3,
    is_s3_configured,
    S3_ENDPOINT,
    S3_BUCKET,
)

logger = logging.getLogger(__name__)

# Reject anything larger than this (avoids accidentally pulling a 100 MB raw
# print-resolution photo from a misconfigured WP site).
_MAX_BYTES = 20 * 1024 * 1024  # 20 MB

# Recognised image content-types we'll mirror. Anything else (gif, svg, …)
# we skip and let the original URL pass through.
_OK_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}

_EXT_BY_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
}


def _is_our_s3(url: str) -> bool:
    """True if the URL already points at our own S3 endpoint."""
    if not url or not S3_ENDPOINT:
        return False
    try:
        host = urlparse(url).netloc
        endpoint_host = urlparse(S3_ENDPOINT).netloc
        return bool(host) and host == endpoint_host
    except Exception:
        return False


async def mirror_url_to_s3(
    url: str,
    *,
    main_site_id: Optional[str] = None,
    team_id: Optional[str] = None,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    folder: str = "imported-wp",
) -> Optional[dict]:
    """Download ``url`` and re-upload it to our S3 bucket.

    Returns ``{ s3_url, file_storage_key, mirrored_from, content_type, size }``
    on success, or ``None`` if the URL is empty, unreachable, too big, of an
    unsupported type, or already hosted on our S3 (no-op).

    Failures never raise — we want WordPress imports to keep working even
    when an individual photo is gone.
    """
    if not url or not url.startswith(("http://", "https://")):
        return None
    if not is_s3_configured():
        return None
    if _is_our_s3(url):
        return None

    try:
        timeout = httpx.Timeout(30.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Clara/1.0 (+koodh.com)"})
            r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.warning("mirror_url_to_s3: download failed for %s — %s", url, exc)
        return None

    body = r.content
    if not body:
        return None
    if len(body) > _MAX_BYTES:
        logger.warning("mirror_url_to_s3: skipping %s — %d bytes exceeds %d cap",
                       url, len(body), _MAX_BYTES)
        return None

    content_type = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type not in _OK_TYPES:
        # Guess from URL extension as a fallback (WP sometimes serves jpg as
        # application/octet-stream when behind certain caches).
        guessed, _ = mimetypes.guess_type(url)
        if guessed and guessed.lower() in _OK_TYPES:
            content_type = guessed.lower()
        else:
            logger.info("mirror_url_to_s3: skipping %s — unsupported type %r",
                        url, content_type)
            return None

    # S3 path fallback chain — mirrors the rule used for content uploads to
    # avoid `/None/` segments when the editor has no team/main-site context.
    scope = main_site_id or team_id or "shared"
    ext = _EXT_BY_TYPE.get(content_type, "jpg")
    key = f"{folder}/{scope}/{uuid4()}.{ext}"

    try:
        result = await upload_file_to_s3(
            file_content=body,
            file_key=key,
            content_type=content_type,
            main_site_id=main_site_id,
            user_id=user_id,
            user_name=user_name,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("mirror_url_to_s3: S3 upload failed for %s — %s", url, exc)
        return None

    return {
        "s3_url": result["url"],
        "file_storage_key": result["key"],
        "mirrored_from": url,
        "content_type": content_type,
        "size": len(body),
        "bucket": S3_BUCKET,
    }
