"""Public News API — read-only endpoints scoped per main site + category.

URL layout:
    GET /api/news/{site_slug}/{category_slug}?limit=N
    GET /api/news/articles/{article_id}

These endpoints are intentionally `public` (no auth) so external websites and
mobile apps can render the news lists / detail pages directly. Only items with
`status in ('ready','published')` are returned.

The shape of the response matches what the GRK frontend (and similar Clara
Custom news sites) already expects:

    {
      "id": "...",
      "title": "...",
      "slug": "...",            # falls back to id when no slug stored
      "excerpt": "...",
      "image_url": "...",
      "category": {"id":"cat_3", "slug":"nieuws-uit-de-buurt", "name":"..."},
      "main_site_slug": "grk",
      "author_name": null,
      "tags": [],
      "published_at": "...",     # falls back to created_at
      "url": "/nieuws/<slug>"    # convenience deep-link for the consumer
    }

The detail endpoint additionally includes `body` (HTML).
"""
from fastapi import APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
import os
from typing import Optional

mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo_client[os.environ["DB_NAME"]]

news_public_router = APIRouter(prefix="/api/news", tags=["news-public"])


PUBLIC_STATUSES = ["published"]

# Public News API only returns items that have been explicitly:
#   • status == 'published'   (via /publish-clara, which now requires approval)
#   • approval_status == 'approved'
#   • not soft-deleted
# Items in draft / ready / trashed never reach the public API.
PUBLIC_BASE_QUERY = {
    "status": {"$in": PUBLIC_STATUSES},
    "approval_status": "approved",
    "deleted_at": {"$in": [None, ""]},
}


async def _resolve_site(site_slug: str) -> dict:
    site = await db.main_sites.find_one({"slug": site_slug}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    if not site:
        raise HTTPException(status_code=404, detail=f"Main site '{site_slug}' not found")
    return site


async def _resolve_category(main_site_id: str, category_slug: str) -> dict:
    cat = await db.categories.find_one(
        {"main_site_id": main_site_id, "slug": category_slug},
        {"_id": 0, "id": 1, "name": 1, "slug": 1, "main_site_id": 1},
    )
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category '{category_slug}' not found for this site")
    return cat


import re

_INLINE_IMG_PATTERN = re.compile(
    r'<img[^>]+src=["\']([^"\']+)["\']',
    re.IGNORECASE,
)


def _first_inline_body_image(body: str | None) -> Optional[str]:
    """Return the first ``<img src>`` URL embedded in the article body.

    Used as a final fallback when no featured image has been uploaded, so
    articles that contain only TinyMCE-inline images still get a thumbnail
    and a proper Open Graph image.
    """
    if not body:
        return None
    for match in _INLINE_IMG_PATTERN.finditer(body):
        url = (match.group(1) or "").strip()
        if not url:
            continue
        if url.startswith("data:"):
            # Skip base64 inlines — those bloat the response.
            continue
        if "/None/" in url or "/None_" in url:
            # Skip corrupt legacy paths.
            continue
        return url
    return None


def _build_image_url(item: dict) -> Optional[str]:
    """Return the best available image url for a content item.

    Lookup order (most specific → most general):
      1. inline `featured_image` (s3_url or storage key — set by /featured-image upload)
      2. legacy `featured_image_url` / `image_url` / `cover_image_url`
      3. `external_featured_image` / `imported_image_url` (carried over from
         WordPress imports for legacy content).
      4. First ``<img>`` embedded in the body via TinyMCE (so articles with
         only inline images still get a thumbnail).
    """
    def _clean(u: Optional[str]) -> Optional[str]:
        if not u:
            return None
        if "/None/" in u or "/None_" in u:
            return None
        return u

    fi = item.get("featured_image") or {}
    if isinstance(fi, dict):
        candidate = _clean(
            fi.get("s3_url")
            or fi.get("url")
            or (f"/api/files/{fi['file_storage_key']}" if fi.get("file_storage_key") else None)
        )
        if candidate:
            return candidate
    explicit = _clean(
        item.get("featured_image_url")
        or item.get("image_url")
        or item.get("cover_image_url")
        or item.get("external_featured_image")
        or item.get("imported_image_url")
    )
    if explicit:
        return explicit
    return _first_inline_body_image(item.get("body"))


def _build_image_attribution(item: dict) -> Optional[dict]:
    """Return photo credit/copyright bundle if present on the featured image
    or directly on the content item. None when nothing is set.
    """
    fi = item.get("featured_image") or {}
    credit = fi.get("photo_credit") or item.get("photo_credit")
    copy = fi.get("photo_copyright") or item.get("photo_copyright")
    src = fi.get("photo_source_url") or item.get("photo_source_url")
    photographer = fi.get("photo_photographer") or item.get("photo_photographer")
    license_ = fi.get("photo_license") or item.get("photo_license")
    if not (credit or copy or src or photographer or license_):
        return None
    return {
        "credit": credit,
        "copyright": copy,
        "source_url": src,
        "photographer": photographer,
        "license": license_,
    }


import html as _html
import re as _re

_BODY_IMG_TAG_RE = _re.compile(r'(<img[^>]+src=["\']([^"\']+)["\'][^>]*>)', _re.IGNORECASE)


def _format_credit_line(entry) -> str:
    """Render an attribution entry to a human-readable single-line caption.

    Accepts both legacy strings and structured dicts. Returns an empty
    string when nothing usable is set.
    """
    if not entry:
        return ""
    if isinstance(entry, str):
        clean = entry.strip()
        return f"© {_html.escape(clean)}" if clean else ""
    if not isinstance(entry, dict):
        return ""
    credit = (entry.get("credit") or "").strip()
    photographer = (entry.get("photographer") or "").strip()
    license_ = (entry.get("license") or "").strip()
    source_url = (entry.get("source_url") or "").strip()

    parts = []
    if photographer and credit and photographer.lower() != credit.lower():
        parts.append(f"Foto: {_html.escape(photographer)}")
        parts.append(f"© {_html.escape(credit)}")
    elif photographer:
        parts.append(f"Foto: {_html.escape(photographer)}")
        if credit:
            parts.append(f"© {_html.escape(credit)}")
    elif credit:
        parts.append(f"© {_html.escape(credit)}")
    if license_:
        parts.append(_html.escape(license_))
    line = " · ".join(parts)
    if source_url:
        safe_url = _html.escape(source_url, quote=True)
        line = f'<a href="{safe_url}" rel="nofollow noopener" target="_blank">{line or safe_url}</a>'
    return line


def _collect_body_images(item: dict) -> list[dict]:
    """Extract every inline ``<img>`` from the article body and pair each
    with its stored attribution (if any). Returned as a list of dicts so
    consumers can render thumbnails / credits without parsing the body HTML
    themselves.

    Order matches their appearance in the body, duplicates preserved.
    """
    body = item.get("body") or ""
    if not body:
        return []
    attrs = item.get("image_attributions") or {}
    if not isinstance(attrs, dict):
        attrs = {}
    out: list[dict] = []
    for m in _INLINE_IMG_PATTERN.finditer(body):
        src = (m.group(1) or "").strip()
        if not src or src.startswith("data:"):
            continue
        if "/None/" in src or "/None_" in src:
            continue
        entry = attrs.get(src) or {}
        if isinstance(entry, str):
            entry = {"credit": entry}
        credit = (entry.get("credit") or "").strip() or None
        photographer = (entry.get("photographer") or "").strip() or None
        license_ = (entry.get("license") or "").strip() or None
        source_url = (entry.get("source_url") or "").strip() or None
        caption_html = _format_credit_line({
            "credit": credit, "photographer": photographer,
            "license": license_, "source_url": source_url,
        })
        out.append({
            "src": src,
            "credit": credit,
            "photographer": photographer,
            "license": license_,
            "source_url": source_url,
            "caption_html": caption_html or None,
            "has_credit": bool(credit),
        })
    return out


def _inject_body_attributions(body: str, attributions: dict) -> str:
    """Wrap every ``<img>`` whose ``src`` has an attribution entry inside a
    ``<figure>…<figcaption>…</figcaption></figure>`` block so consumer
    websites can render the copyright line below each photo automatically.

    Supports both legacy string entries and structured objects with
    ``credit / photographer / license / source_url`` fields.

    Images without an attribution are left untouched.
    """
    if not body or not isinstance(attributions, dict) or not attributions:
        return body or ""

    def _wrap(m: _re.Match) -> str:
        img_tag = m.group(1)
        src = m.group(2)
        entry = attributions.get(src)
        line = _format_credit_line(entry)
        if not line:
            return img_tag
        return (
            f'<figure class="clara-img-figure">{img_tag}'
            f'<figcaption class="clara-img-credit">{line}</figcaption>'
            f'</figure>'
        )

    return _BODY_IMG_TAG_RE.sub(_wrap, body)


def _has_missing_image_attribution(item: dict) -> bool:
    """Heuristic for the list endpoint / Content Library badges: True iff
    the article has any featured image (uploaded / imported / external)
    without a credit OR at least one inline body image lacks an entry in
    ``image_attributions``."""
    if _build_image_url(item):
        fi = item.get("featured_image") or {}
        credit = (
            (fi.get("photo_credit") if isinstance(fi, dict) else None)
            or item.get("photo_credit")
            or ""
        ).strip()
        if not credit:
            return True
    body = item.get("body") or ""
    if not body:
        return False
    attrs = item.get("image_attributions") or {}
    if not isinstance(attrs, dict):
        attrs = {}
    for m in _INLINE_IMG_PATTERN.finditer(body):
        url = (m.group(1) or "").strip()
        if not url or url.startswith("data:") or "/None/" in url or "/None_" in url:
            continue
        entry = attrs.get(url)
        if isinstance(entry, str):
            if not entry.strip():
                return True
        elif isinstance(entry, dict):
            if not (entry.get("credit") or "").strip():
                return True
        else:
            return True
    return False


def _featured_image_caption_html(item: dict) -> str:
    """Pre-rendered single-line HTML snippet for the featured image credit,
    wrapped in a ``<p class='clara-image-credit'>`` so it can sit directly
    under the consumer's hero image.

    Empty string when the featured image has no attribution.
    """
    attr = _build_image_attribution(item)
    if not attr:
        return ""
    line = _format_credit_line({
        "credit": attr.get("credit") or attr.get("copyright"),
        "photographer": attr.get("photographer"),
        "license": attr.get("license"),
        "source_url": attr.get("source_url"),
    })
    if not line:
        return ""
    return f'<p class="clara-image-credit">{line}</p>'


def _serialize_item(item: dict, category: Optional[dict], site_slug: str, *, include_body: bool = False) -> dict:
    out = {
        "id": item["id"],
        "title": item.get("title", ""),
        "slug": item.get("slug") or item["id"],
        "excerpt": item.get("excerpt", ""),
        "image_url": _build_image_url(item),
        "image_attribution": _build_image_attribution(item),
        "image_caption_html": _featured_image_caption_html(item),
        "category": (
            {"id": category["id"], "slug": category["slug"], "name": category["name"]}
            if category else None
        ),
        "main_site_slug": site_slug,
        "author_name": item.get("author_name") or item.get("created_by_name"),
        "tags": item.get("tags") or [],
        "published_at": item.get("published_at") or item.get("created_at"),
        "url": f"/nieuws/{item.get('slug') or item['id']}",
        "missing_image_attributions": _has_missing_image_attribution(item),
        "body_images": _collect_body_images(item),
    }
    if include_body:
        # The body already contains the intro paragraph that was reused as
        # excerpt (especially for WordPress-imported items where WP auto-
        # generates the excerpt from the first ~55 words of the body).
        # Returning both makes every consumer that renders excerpt + body
        # show the intro twice, so we drop the excerpt on the detail
        # response. The list endpoint still returns excerpt only — body is
        # never included there.
        body_html = _inject_body_attributions(item.get("body", ""), item.get("image_attributions") or {})
        # Prepend the featured-image caption so it visually sits directly
        # under the consumer's hero image without requiring frontend code
        # changes on each consumer (GRK, MFY, DBNT, …).
        caption = _featured_image_caption_html(item)
        if caption:
            body_html = caption + body_html
        out["body"] = body_html
        out.pop("excerpt", None)
    return out


@news_public_router.get("/articles/{article_id}")
async def get_article_detail(article_id: str):
    """Public article detail, looked up by id OR slug. Returns the full body HTML."""
    item = await db.content_items.find_one(
        {
            "$or": [{"id": article_id}, {"slug": article_id}],
            **PUBLIC_BASE_QUERY,
        },
        {"_id": 0},
    )
    if not item:
        raise HTTPException(status_code=404, detail="Article not found")
    category = None
    if item.get("category_id"):
        category = await db.categories.find_one(
            {"id": item["category_id"]},
            {"_id": 0, "id": 1, "name": 1, "slug": 1, "main_site_id": 1},
        )
    site_slug = ""
    if item.get("main_site_id"):
        site = await db.main_sites.find_one({"id": item["main_site_id"]}, {"_id": 0, "slug": 1})
        site_slug = (site or {}).get("slug", "")
    out = _serialize_item(item, category, site_slug, include_body=True)
    out["is_liveblog"] = bool(item.get("is_liveblog"))
    # Attach published liveblog entries (reverse-chrono so consumers can
    # render the newest at the top, VRT NWS-style).
    if out["is_liveblog"]:
        from models.liveblog import serialize_entry as _ser_entry  # noqa: WPS433
        cur = db.liveblog_entries.find(
            {"content_id": item["id"], "published": True}
        ).sort("timestamp", -1)
        out["liveblog_entries"] = [_ser_entry(e) async for e in cur]
    else:
        out["liveblog_entries"] = []
    return out


@news_public_router.get("/articles/{article_id}/liveblog")
async def public_liveblog_entries(
    article_id: str,
    since: Optional[str] = Query(None, description="ISO timestamp — only entries updated after this"),
    limit: int = Query(100, ge=1, le=500),
):
    """Polling endpoint for consumer sites without WebSocket: returns the
    published entries (optionally filtered by ``updated_at > since``).
    Newest first.
    """
    item = await db.content_items.find_one(
        {"$or": [{"id": article_id}, {"slug": article_id}], **PUBLIC_BASE_QUERY},
        {"_id": 0, "id": 1, "is_liveblog": 1},
    )
    if not item:
        raise HTTPException(status_code=404, detail="Article not found")
    if not item.get("is_liveblog"):
        return {"entries": [], "count": 0}

    from models.liveblog import serialize_entry as _ser_entry  # noqa: WPS433
    q: dict = {"content_id": item["id"], "published": True}
    if since:
        q["updated_at"] = {"$gt": since}
    cur = db.liveblog_entries.find(q).sort("timestamp", -1).limit(limit)
    entries = [_ser_entry(e) async for e in cur]
    return {"entries": entries, "count": len(entries)}


@news_public_router.get("/{site_slug}/{category_slug}")
async def list_news_by_category(
    site_slug: str,
    category_slug: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List public news items for one main site + category, newest first."""
    site = await _resolve_site(site_slug)
    category = await _resolve_category(site["id"], category_slug)
    cursor = (
        db.content_items.find(
            {
                "main_site_id": site["id"],
                "category_id": category["id"],
                **PUBLIC_BASE_QUERY,
            },
            {"_id": 0},
        )
        .sort([("published_at", -1), ("created_at", -1)])
        .skip(offset)
        .limit(limit)
    )
    items = await cursor.to_list(limit)
    return {
        "site": {"id": site["id"], "slug": site["slug"], "name": site["name"]},
        "category": category,
        "items": [_serialize_item(it, category, site["slug"]) for it in items],
        "count": len(items),
        "offset": offset,
        "limit": limit,
    }
