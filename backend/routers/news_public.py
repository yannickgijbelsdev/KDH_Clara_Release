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
def _strip_entry_author(entry: dict) -> dict:
    """Remove editor identity from the public payload — readers should not
    see who wrote which timeline update."""
    out = dict(entry)
    out.pop("created_by", None)
    out.pop("created_by_name", None)
    return out


async def _maybe_archive_liveblog(item: dict) -> bool:
    """If the article is flagged as a liveblog but no entry has been
    created/updated in the last 6 hours, automatically un-flag it. The
    entries themselves stay in the DB so they remain visible as a static
    timeline — only the LIVE badge / auto-update behaviour disappears.

    Returns True if the article was just archived (caller should refresh
    ``item['is_liveblog']``).
    """
    from datetime import datetime as _dt, timezone as _tz, timedelta
    if not item.get("is_liveblog"):
        return False
    last = item.get("liveblog_last_activity_at")
    last_dt = None
    if last:
        try:
            last_dt = _dt.fromisoformat(str(last).replace("Z", "+00:00"))
        except Exception:
            last_dt = None
    if not last_dt:
        # No activity stamp — fall back to the newest entry's updated_at.
        newest = await db.liveblog_entries.find_one(
            {"content_id": item["id"]},
            {"_id": 0, "updated_at": 1},
            sort=[("updated_at", -1)],
        )
        if not newest:
            return False
        try:
            last_dt = _dt.fromisoformat(str(newest.get("updated_at") or "").replace("Z", "+00:00"))
        except Exception:
            return False
    now = _dt.now(_tz.utc)
    if last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=_tz.utc)
    if now - last_dt < timedelta(hours=6):
        return False
    await db.content_items.update_one(
        {"id": item["id"]},
        {"$set": {
            "is_liveblog": False,
            "liveblog_ended_at": now.isoformat(),
        }},
    )
    item["is_liveblog"] = False
    item["liveblog_ended_at"] = now.isoformat()
    return True



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


# Dutch month names so the rendered timeline header doesn't depend on the
# consumer's locale (grk.fm, mfy.fm, dbnt.be, … all render the body HTML
# verbatim).
_NL_MONTHS = [
    "", "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
]


def _format_entry_datetime_nl(ts: Optional[str]) -> str:
    """Format an ISO datetime as ``26 juni 2026 · 21:27`` (Brussels time)."""
    if not ts:
        return ""
    try:
        from datetime import datetime as _dt, timezone as _tz
        dt = _dt.fromisoformat(str(ts).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_tz.utc)
        # Brussels = UTC+1/+2 depending on DST. Use zoneinfo when available.
        try:
            from zoneinfo import ZoneInfo  # py3.9+
            dt = dt.astimezone(ZoneInfo("Europe/Brussels"))
        except Exception:
            pass
        month = _NL_MONTHS[dt.month] if 1 <= dt.month <= 12 else str(dt.month)
        return f"{dt.day} {month} {dt.year} · {dt.hour:02d}:{dt.minute:02d}"
    except Exception:
        return str(ts)


def _render_liveblog_html(entries: list[dict], *, ended_at: Optional[str], is_live: bool) -> str:
    """Render published liveblog entries as a self-contained HTML timeline
    that every consumer site can drop straight into their existing article-
    body container. Inline styles are included so the timeline looks
    presentable on every consumer (grk.fm, mfy.fm, dbnt.be, …) without
    requiring a CSS file — consumers can still override via the
    ``clara-liveblog*`` class names.

    ``entries`` must already be sorted newest-first.
    """
    if not entries:
        return ""
    # Inline style snippets — kept conservative so consumer themes aren't
    # overridden too aggressively. Border radius + soft background give the
    # entries a card-like feel; no hard colours that would clash with a
    # dark theme.
    S_SECTION = "margin:2rem 0;font-family:inherit;"
    S_HEADER = "display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;margin:0 0 1rem 0;"
    S_TITLE = "margin:0;font-size:1.25rem;font-weight:700;letter-spacing:-.01em;"
    S_LIVE_BADGE = (
        "display:inline-flex;align-items:center;gap:.4rem;"
        "padding:.25rem .7rem;border-radius:9999px;"
        "background:#fee2e2;color:#b91c1c;font-size:.75rem;"
        "font-weight:600;text-transform:uppercase;letter-spacing:.04em;"
    )
    S_ENDED_BADGE = (
        "display:inline-flex;align-items:center;gap:.4rem;"
        "padding:.4rem .85rem;border-radius:9999px;"
        "background:#f4f4f5;color:#52525b;font-size:.8rem;"
        "font-weight:500;border:1px solid #e4e4e7;"
    )
    S_COUNT = "color:#71717a;font-size:.8rem;margin-left:auto;"
    S_LIST = "list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1rem;"
    S_ENTRY = (
        "list-style:none;border-left:3px solid #ef4444;background:#fafafa;"
        "border-radius:0 .75rem .75rem 0;padding:1rem 1.25rem;"
    )
    S_ENTRY_ENDED = (
        "list-style:none;border-left:3px solid #d4d4d8;background:#fafafa;"
        "border-radius:0 .75rem .75rem 0;padding:1rem 1.25rem;"
    )
    S_TIME = "display:block;font-size:.75rem;color:#71717a;font-weight:600;letter-spacing:.02em;margin-bottom:.4rem;text-transform:uppercase;"
    S_ENTRY_TITLE = "margin:0 0 .5rem 0;font-size:1.05rem;font-weight:700;color:#18181b;"
    S_ENTRY_BODY = "color:#27272a;line-height:1.55;font-size:1rem;"
    S_MEDIA = "margin-top:.75rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem;"
    S_FIGURE = "margin:0;border-radius:.5rem;overflow:hidden;background:#fff;border:1px solid #e4e4e7;"
    S_IMG = "display:block;width:100%;height:auto;object-fit:cover;"
    S_CAPTION = "font-size:.7rem;color:#71717a;padding:.4rem .6rem;background:#f4f4f5;"
    S_EMBED = "aspect-ratio:16/9;width:100%;border-radius:.5rem;overflow:hidden;background:#000;"
    S_VIDEO = "width:100%;border-radius:.5rem;background:#000;display:block;"

    if is_live:
        header_status = (
            f'<span class="clara-liveblog-status clara-liveblog-live" '
            f'style="{S_LIVE_BADGE}">'
            f'<span style="width:.5rem;height:.5rem;border-radius:9999px;background:#ef4444;display:inline-block;"></span>'
            f'LIVE</span>'
        )
    else:
        ended_label = "Liveblog beëindigd"
        if ended_at:
            ended_label = f"Liveblog beëindigd op {_format_entry_datetime_nl(ended_at)}"
        header_status = (
            f'<span class="clara-liveblog-status clara-liveblog-ended" '
            f'style="{S_ENDED_BADGE}">{_html.escape(ended_label)}</span>'
        )

    parts: list[str] = [
        f'<section class="clara-liveblog" data-clara-liveblog="true" style="{S_SECTION}">',
        f'<header class="clara-liveblog-header" style="{S_HEADER}">'
        f'<h2 class="clara-liveblog-title" style="{S_TITLE}">Liveblog</h2>'
        f'{header_status}'
        f'<span class="clara-liveblog-count" style="{S_COUNT}">{len(entries)} update{"s" if len(entries) != 1 else ""}</span>'
        f'</header>',
        f'<ul class="clara-liveblog-timeline" style="{S_LIST}">',
    ]
    entry_style = S_ENTRY if is_live else S_ENTRY_ENDED
    for e in entries:
        when = _format_entry_datetime_nl(e.get("timestamp"))
        title = (e.get("title") or "").strip()
        body = (e.get("body") or "").strip()
        parts.append(f'<li class="clara-liveblog-entry" style="{entry_style}">')
        if when:
            parts.append(
                f'<time class="clara-liveblog-time" style="{S_TIME}" '
                f'datetime="{_html.escape(e.get("timestamp") or "", quote=True)}">'
                f'{_html.escape(when)}</time>'
            )
        if title:
            parts.append(
                f'<h3 class="clara-liveblog-entry-title" style="{S_ENTRY_TITLE}">'
                f'{_html.escape(title)}</h3>'
            )
        if body:
            parts.append(
                f'<div class="clara-liveblog-entry-body" style="{S_ENTRY_BODY}">{body}</div>'
            )

        imgs = e.get("images") or []
        if imgs:
            parts.append(f'<div class="clara-liveblog-media clara-liveblog-images" style="{S_MEDIA}">')
            for img in imgs:
                src = (img.get("url") or "").strip()
                if not src:
                    continue
                alt = _html.escape((img.get("alt_text") or title or "") or "", quote=True)
                caption = _format_credit_line({
                    "credit": img.get("credit"),
                    "photographer": img.get("photographer"),
                    "license": img.get("license"),
                    "source_url": img.get("source_url"),
                })
                parts.append(f'<figure class="clara-liveblog-figure" style="{S_FIGURE}">')
                parts.append(
                    f'<img src="{_html.escape(src, quote=True)}" alt="{alt}" '
                    f'loading="lazy" style="{S_IMG}" />'
                )
                if caption:
                    parts.append(
                        f'<figcaption class="clara-liveblog-credit" style="{S_CAPTION}">'
                        f'{caption}</figcaption>'
                    )
                parts.append('</figure>')
            parts.append('</div>')

        vids = e.get("videos") or []
        if vids:
            parts.append(f'<div class="clara-liveblog-media clara-liveblog-videos" style="{S_MEDIA}">')
            for v in vids:
                if v.get("embed_html"):
                    parts.append(
                        f'<div class="clara-liveblog-embed" style="{S_EMBED}">'
                        f'{v["embed_html"]}</div>'
                    )
                elif v.get("url"):
                    safe_url = _html.escape(v["url"], quote=True)
                    parts.append(
                        f'<video class="clara-liveblog-video" src="{safe_url}" '
                        f'controls playsinline style="{S_VIDEO}"></video>'
                    )
            parts.append('</div>')
        parts.append('</li>')
    parts.append('</ul>')
    parts.append('</section>')
    return "".join(parts)


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
    """Public article detail, looked up by id OR slug.

    Slugs in the wild often get truncated by chat clients / social media
    (Telegram cuts after ~70 chars and ends with ``-``, Slack ellipses,
    Twitter t.co rewrites). When the exact lookup fails for what *looks
    like* a truncated slug, we attempt a single-match prefix lookup so
    the article still resolves instead of dead-ending in a 404.
    """
    item = await db.content_items.find_one(
        {
            "$or": [{"id": article_id}, {"slug": article_id}],
            **PUBLIC_BASE_QUERY,
        },
        {"_id": 0},
    )
    if not item:
        # Prefix fallback — only kick in when the lookup key looks like
        # a truncated slug (>= 20 chars and ends with ``-``). We escape
        # regex specials and anchor to start-of-slug to keep this O(N)
        # over the indexed ``slug`` field only.
        candidates: list[dict] = []
        key = article_id.strip()
        if len(key) >= 20 and key.endswith("-"):
            stem = key.rstrip("-")
            safe = re.escape(stem)
            cur = db.content_items.find(
                {"slug": {"$regex": f"^{safe}"}, **PUBLIC_BASE_QUERY},
                {"_id": 0, "id": 1, "slug": 1, "title": 1},
            ).limit(5)
            candidates = [c async for c in cur]
            if len(candidates) == 1:
                # Re-fetch the full doc — the projected one above is too thin
                # for the serializer.
                item = await db.content_items.find_one(
                    {"id": candidates[0]["id"], **PUBLIC_BASE_QUERY},
                    {"_id": 0},
                )
        if not item:
            # 404 with did-you-mean suggestions when we have any prefix hits.
            # FastAPI wraps ``detail`` in {"detail": ...} so we shape the
            # payload as a flat dict that becomes ``{"detail": {message, candidates}}``.
            if candidates:
                payload = {
                    "message": "Article not found — did you mean one of these?",
                    "candidates": [
                        {"slug": c.get("slug"), "title": c.get("title")}
                        for c in candidates
                    ],
                }
                raise HTTPException(status_code=404, detail=payload)
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
    # Auto-archive if no activity in the last 6 hours — the live badge
    # then disappears, but the entries stay so the article reads as a
    # static timeline ("ended liveblog").
    await _maybe_archive_liveblog(item)
    out["is_liveblog"] = bool(item.get("is_liveblog"))
    out["liveblog_ended_at"] = item.get("liveblog_ended_at")
    # Always surface published entries (even after archive) so consumers
    # can render them as a static timeline. Strip editor identity per
    # privacy spec.
    from models.liveblog import serialize_entry as _ser_entry  # noqa: WPS433
    cur = db.liveblog_entries.find(
        {"content_id": item["id"], "published": True}
    ).sort("timestamp", -1)
    entries = [_strip_entry_author(_ser_entry(e)) async for e in cur]
    out["liveblog_entries"] = entries
    # Inject the timeline DIRECTLY into the body HTML so every consumer
    # site (grk.fm, mfy.fm, dbnt.be, …) that already renders ``body`` gets
    # the timeline for free — no consumer-side code change needed. The
    # raw ``liveblog_entries`` array stays in the response for clients
    # that want to render it themselves with custom styling.
    timeline_html = _render_liveblog_html(
        entries,
        ended_at=item.get("liveblog_ended_at"),
        is_live=bool(item.get("is_liveblog")),
    )
    if timeline_html:
        out["body"] = (out.get("body") or "") + timeline_html
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
        {"_id": 0, "id": 1, "is_liveblog": 1, "liveblog_last_activity_at": 1, "liveblog_ended_at": 1},
    )
    if not item:
        raise HTTPException(status_code=404, detail="Article not found")
    await _maybe_archive_liveblog(item)

    from models.liveblog import serialize_entry as _ser_entry  # noqa: WPS433
    q: dict = {"content_id": item["id"], "published": True}
    if since:
        q["updated_at"] = {"$gt": since}
    cur = db.liveblog_entries.find(q).sort("timestamp", -1).limit(limit)
    entries = [_strip_entry_author(_ser_entry(e)) async for e in cur]
    return {
        "entries": entries,
        "count": len(entries),
        "is_liveblog": bool(item.get("is_liveblog")),
        "liveblog_ended_at": item.get("liveblog_ended_at"),
    }


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
