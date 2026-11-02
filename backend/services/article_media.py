"""Mirror every S3 file used in articles into the Media Library.

Folder layout per site: "Artikels" / "<article title>". Covers inline body files (img/video/audio/source/a),
featured images (main + per site) and liveblog photos/videos. Removing a mirrored asset from the Media Library
never deletes the S3 object (it is still used by the article) and it is not re-added afterwards.
"""
import asyncio
import functools
import logging
import mimetypes
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import unquote, urlparse

from database import db
from services.s3_storage import S3_BUCKET, S3_ENDPOINT, get_s3_client

logger = logging.getLogger(__name__)

ARTICLES_FOLDER = "Artikels"
S3_PREFIX = f"{S3_ENDPOINT}/{S3_BUCKET}/"
SRC_RE = re.compile(r'<(?:img|video|audio|source|a)\b[^>]*?\b(?:src|href)=["\']([^"\']+)["\']', re.I)
KIND_BY_MIME = {"image": "image", "video": "video", "audio": "audio"}
_tasks: set = set()
_locks: dict = {}
GENERIC_MIMES = {None, "", "application/octet-stream", "binary/octet-stream"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _key_from_url(url: str) -> Optional[str]:
    url = (url or "").strip()
    if not url.startswith(S3_PREFIX):
        return None
    key = unquote(urlparse(url).path.split(f"/{S3_BUCKET}/", 1)[-1])
    return key if key and not key.startswith(("tmp/", "media/")) else None


def _kind_and_mime(key: str, *mimes: Optional[str]) -> tuple:
    # First specific type wins; generic octet-stream falls back to the file extension.
    mime = next((m for m in mimes if m not in GENERIC_MIMES), None) or mimetypes.guess_type(key)[0] or "application/octet-stream"
    return KIND_BY_MIME.get(mime.split("/")[0], "document"), mime


async def _s3_sizes(keys: list) -> dict:
    """Real object sizes/types from S3 for files we have no metadata for."""
    sem = asyncio.Semaphore(8)

    async def head(key):
        async with sem:
            try:
                r = await asyncio.to_thread(get_s3_client().head_object, Bucket=S3_BUCKET, Key=key)
                return key, {"size": r.get("ContentLength"), "mime": r.get("ContentType")}
            except Exception:
                return key, None

    return {k: v for k, v in await asyncio.gather(*[head(k) for k in keys]) if v}


def _collect_files(item: dict, entries: list) -> dict:
    """key -> {url, mime, name, size, source}"""
    files = {}

    def add(url, source, mime=None, name=None, size=None, key=None):
        key = key or _key_from_url(url)
        if key and key not in files:
            files[key] = {"url": url or f"{S3_PREFIX}{key}", "mime": mime, "name": name, "size": size, "source": source}

    for url in SRC_RE.findall(item.get("body") or ""):
        add(url, "body")
    for fi in [item.get("featured_image")] + list((item.get("featured_images") or {}).values()):
        if isinstance(fi, dict):
            add(fi.get("s3_url"), "featured_image", fi.get("mime_type"), fi.get("file_name"), fi.get("size"), fi.get("file_storage_key"))
    for e in entries:
        for url in SRC_RE.findall(e.get("body") or ""):
            add(url, "liveblog")
        for m in (e.get("images") or []) + (e.get("videos") or []):
            if isinstance(m, dict) and m.get("url"):
                add(m["url"], "liveblog", key=m.get("key") if (m.get("key") or "").startswith(("liveblog/", "editor/", "content/")) else None)
    return files


async def _ensure_folder(scope: dict, name: str, parent_id: Optional[str], created_by: str, content_id: Optional[str] = None) -> str:
    query = {**scope, "parent_id": parent_id}
    query.update({"article_content_id": content_id} if content_id else {"name": name})
    folder = await db.media_folders.find_one(query, {"_id": 0, "id": 1, "name": 1})
    if folder:
        if content_id and folder["name"] != name:
            await db.media_folders.update_one({"id": folder["id"]}, {"$set": {"name": name, "updated_at": _now()}})
        return folder["id"]
    doc = {"id": str(uuid.uuid4()), **scope, "name": name, "parent_id": parent_id, "color": None,
           "created_by": created_by, "article_content_id": content_id, "created_at": _now(), "updated_at": _now()}
    # Upsert so concurrent syncs never create the same folder twice.
    await db.media_folders.update_one(query, {"$setOnInsert": {k: v for k, v in doc.items() if k not in query}}, upsert=True)
    return (await db.media_folders.find_one(query, {"_id": 0, "id": 1}))["id"]


async def sync_article_media(content_id: str) -> int:
    """Add the article's S3 files to the Media Library. Returns the number of new assets."""
    lock = _locks.setdefault(content_id, asyncio.Lock())
    try:
        async with lock:
            return await _sync_article_media(content_id)
    finally:
        if not lock.locked():
            _locks.pop(content_id, None)


async def _sync_article_media(content_id: str) -> int:
    item = await db.content_items.find_one({"id": content_id}, {"_id": 0})
    if not item:
        return 0
    entries = await db.liveblog_entries.find({"content_id": content_id}, {"_id": 0, "body": 1, "images": 1, "videos": 1}).to_list(2000)
    files = _collect_files(item, entries)
    if not files:
        return 0
    main_site_id, team_id = item.get("main_site_id"), item.get("team_id")
    scope = {"main_site_id": main_site_id} if main_site_id else {"team_id": team_id}
    owner = item.get("created_by") or item.get("author_id") or "system"
    ignored = {d["file_storage_key"] async for d in db.media_sync_ignore.find({**scope, "file_storage_key": {"$in": list(files)}}, {"_id": 0, "file_storage_key": 1})}
    existing = {d["file_storage_key"] async for d in db.media_assets.find({**scope, "file_storage_key": {"$in": list(files)}}, {"_id": 0, "file_storage_key": 1})}
    todo = {k: v for k, v in files.items() if k not in ignored and k not in existing}
    title = (item.get("title") or "Untitled article").strip()[:120]
    if not todo:
        # Nothing new, but keep the article's subfolder name in sync with its title.
        await db.media_folders.update_one({**scope, "article_content_id": content_id, "name": {"$ne": title}},
                                          {"$set": {"name": title, "updated_at": _now()}})
        return 0
    root = await _ensure_folder(scope, ARTICLES_FOLDER, None, owner)
    sub = await _ensure_folder(scope, title, root, owner, content_id)
    now = _now()
    known = {d["file_storage_key"]: d async for d in db.editor_uploads.find(
        {"file_storage_key": {"$in": list(todo)}}, {"_id": 0})}
    heads = await _s3_sizes([key for key, f in todo.items() if not (f["size"] or known.get(key, {}).get("size"))])
    docs = []
    counters: dict = {}
    for key, f in todo.items():
        k = known.get(key, {})
        h = heads.get(key, {})
        head_mime = h.get("mime") if h.get("mime") not in (None, "binary/octet-stream", "application/octet-stream") else None
        kind, mime = _kind_and_mime(key, f["mime"], k.get("mime_type"), head_mime)
        f["size"] = f["size"] or k.get("size") or h.get("size")
        counters[kind] = counters.get(kind, 0) + 1
        ext = key.rsplit(".", 1)[-1] if "." in key.rsplit("/", 1)[-1] else ""
        label = {"image": "image", "audio": "audio", "video": "video"}.get(kind, "file")
        name = f["name"] or k.get("filename") or f"{title} – {label} {counters[kind]}{'.' + ext if ext else ''}"
        docs.append({
            "id": str(uuid.uuid4()), "team_id": team_id, "main_site_id": main_site_id, "uploaded_by": owner,
            "kind": kind, "title": name, "file_storage_key": key, "s3_url": f["url"], "original_filename": name,
            "mime_type": mime, "size": int(f["size"] or 0), "duration_seconds": None, "folder_id": sub,
            "source": "article", "source_detail": f["source"], "content_id": content_id,
            "created_at": item.get("created_at") or now, "updated_at": now,
        })
    added = 0
    for d in docs:
        r = await db.media_assets.update_one({**scope, "file_storage_key": d["file_storage_key"]},
                                             {"$setOnInsert": d}, upsert=True)
        added += 1 if r.upserted_id else 0
    return added


def schedule_article_media_sync(content_id: Optional[str]):
    if not content_id:
        return

    async def _run():
        try:
            await sync_article_media(content_id)
        except Exception as e:
            logger.warning("Article media sync failed for %s: %s", content_id, e)

    task = asyncio.create_task(_run())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def syncs_article_media(fn):
    """Endpoint decorator: after a successful call, mirror the article's files into the Media Library."""
    @functools.wraps(fn)
    async def wrapper(*args, **kwargs):
        result = await fn(*args, **kwargs)
        cid = kwargs.get("content_id") or (result.get("id") if isinstance(result, dict) else getattr(result, "id", None))
        schedule_article_media_sync(cid)
        return result
    return wrapper


async def backfill_article_media(force: bool = False, main_site_id: Optional[str] = None) -> dict:
    """One-time import of files from all existing articles (or re-scan of one site)."""
    flag = await db.system_flags.find_one({"id": "article_media_backfill_v1"})
    if flag and not force:
        return {"skipped": True}
    added = articles = 0
    query = {"main_site_id": main_site_id} if main_site_id else {}
    async for item in db.content_items.find(query, {"_id": 0, "id": 1}):
        try:
            n = await sync_article_media(item["id"])
        except Exception as e:
            logger.warning("Backfill failed for %s: %s", item["id"], e)
            continue
        articles += 1 if n else 0
        added += n
    if main_site_id:
        return {"added": added, "articles": articles}
    await db.system_flags.update_one({"id": "article_media_backfill_v1"},
                                     {"$set": {"id": "article_media_backfill_v1", "done_at": _now(), "added": added}}, upsert=True)
    logger.info("Article media backfill: %s assets from %s articles", added, articles)
    return {"added": added, "articles": articles}
