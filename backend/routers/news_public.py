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


def _build_image_url(item: dict) -> Optional[str]:
    """Return the best available image url for a content item.

    Lookup order (most specific → most general):
      1. inline `featured_image` (s3_url or storage key — set by /featured-image upload)
      2. legacy `featured_image_url` / `image_url` / `cover_image_url`
      3. `external_featured_image` / `imported_image_url` (carried over from
         WordPress imports for legacy content).
    """
    fi = item.get("featured_image") or {}
    if isinstance(fi, dict):
        candidate = (
            fi.get("s3_url")
            or fi.get("url")
            or (f"/api/files/{fi['file_storage_key']}" if fi.get("file_storage_key") else None)
        )
        if candidate:
            return candidate
    return (
        item.get("featured_image_url")
        or item.get("image_url")
        or item.get("cover_image_url")
        or item.get("external_featured_image")
        or item.get("imported_image_url")
        or None
    )


def _build_image_attribution(item: dict) -> Optional[dict]:
    """Return photo credit/copyright bundle if present on the featured image
    or directly on the content item. None when nothing is set.
    """
    fi = item.get("featured_image") or {}
    credit = fi.get("photo_credit") or item.get("photo_credit")
    copy = fi.get("photo_copyright") or item.get("photo_copyright")
    src = fi.get("photo_source_url") or item.get("photo_source_url")
    if not (credit or copy or src):
        return None
    return {
        "credit": credit,
        "copyright": copy,
        "source_url": src,
    }


def _serialize_item(item: dict, category: Optional[dict], site_slug: str, *, include_body: bool = False) -> dict:
    out = {
        "id": item["id"],
        "title": item.get("title", ""),
        "slug": item.get("slug") or item["id"],
        "excerpt": item.get("excerpt", ""),
        "image_url": _build_image_url(item),
        "image_attribution": _build_image_attribution(item),
        "category": (
            {"id": category["id"], "slug": category["slug"], "name": category["name"]}
            if category else None
        ),
        "main_site_slug": site_slug,
        "author_name": item.get("author_name") or item.get("created_by_name"),
        "tags": item.get("tags") or [],
        "published_at": item.get("published_at") or item.get("created_at"),
        "url": f"/nieuws/{item.get('slug') or item['id']}",
    }
    if include_body:
        out["body"] = item.get("body", "")
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
    return _serialize_item(item, category, site_slug, include_body=True)


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
