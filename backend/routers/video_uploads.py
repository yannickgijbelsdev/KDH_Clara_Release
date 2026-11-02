"""Chunked large-video uploads (up to 2 GB) with server-side FFmpeg compression.

Flow: POST /init -> PUT /{id}/chunks/{n} (S3 multipart) -> POST /{id}/complete
-> background FFmpeg (max 1080p H.264/AAC MP4) -> poll GET /{id} for the final URL.
"""
import asyncio
import logging
import math
import os
import tempfile
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import db
from services.auth import require_upload_access
from services.main_site_context import get_main_site_id_from_header
from services import s3_storage as s3

logger = logging.getLogger(__name__)

video_upload_router = APIRouter(prefix="/video-uploads", tags=["Video Uploads"])

MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
CHUNK_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/ogg", "video/x-msvideo"}
ALLOWED_EXTS = {"mp4", "webm", "mov", "m4v", "ogg", "ogv", "avi"}
AUDIO_EXTS = {"mp3", "wav", "m4a", "aac", "flac", "ogg", "oga", "opus", "aif", "aiff", "wma"}
TARGETS = {"video_endpoint", "liveblog", "article", "media"}
AUDIO_TARGETS = {"article", "media"}


def _detect_kind(ext: str, content_type: str) -> Optional[str]:
    ct = (content_type or "").lower()
    if ct.startswith("audio/") and ext in AUDIO_EXTS | {"webm", "mp4"}:
        return "audio"
    if ext in ALLOWED_EXTS and (not ct or ct in ALLOWED_TYPES or ct.startswith("video/") or ct == "application/octet-stream"):
        return "video"
    if ext in AUDIO_EXTS and (not ct or ct.startswith("audio/") or ct in ("application/octet-stream", "video/x-ms-asf")):
        return "audio"
    return None
PUBLIC_FIELDS = {"_id": 0, "id": 1, "status": 1, "progress": 1, "url": 1, "key": 1, "size": 1,
                 "original_size": 1, "error": 1, "filename": 1, "target": 1, "content_id": 1,
                 "kind": 1, "mime_type": 1, "asset_id": 1}

_compress_slots = asyncio.Semaphore(1)
_tasks: set = set()
HEARTBEAT_S = 30
STALE_PROCESSING_S = 5 * 60
ABANDONED_UPLOAD_S = 24 * 3600


class VideoUploadInit(BaseModel):
    filename: str
    size: int
    content_type: Optional[str] = None
    target: str
    content_id: Optional[str] = None
    folder_id: Optional[str] = None
    title: Optional[str] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_job(upload_id: str, current_user: dict) -> dict:
    job = await db.video_uploads.find_one({"id": upload_id, "user_id": current_user.get("id")}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Upload not found")
    return job


async def _dest_prefix(body: VideoUploadInit, request: Request, current_user: dict) -> tuple:
    main_site_id = await get_main_site_id_from_header(request)
    scope = main_site_id or current_user.get("team_id") or "shared"
    if body.target == "liveblog":
        if not body.content_id:
            raise HTTPException(status_code=400, detail="content_id is required for liveblog uploads")
        from routers.liveblog import _load_article
        article = await _load_article(body.content_id, request, current_user)
        scope = article.get("main_site_id") or current_user.get("team_id") or "shared"
        return f"liveblog/{scope}/{body.content_id}", article.get("main_site_id")
    if body.target == "article":
        return f"editor/videos/{scope}", main_site_id
    if body.target == "media":
        return f"media/{current_user.get('team_id') or main_site_id or 'shared'}", main_site_id
    return f"videos/{scope}", main_site_id


@video_upload_router.post("/init")
async def init_video_upload(body: VideoUploadInit, request: Request,
                            current_user: dict = Depends(require_upload_access)):
    if not s3.is_s3_configured():
        raise HTTPException(status_code=503, detail="Object storage is not configured")
    if body.target not in TARGETS:
        raise HTTPException(status_code=400, detail="Invalid upload target")
    ext = body.filename.rsplit(".", 1)[-1].lower() if "." in body.filename else ""
    kind = _detect_kind(ext, body.content_type)
    if kind == "audio" and body.target not in AUDIO_TARGETS:
        kind = None
    if not kind:
        allowed = "video (mp4, webm, mov, m4v, avi, ogg)" + (
            " or audio (mp3, wav, m4a, aac, flac, ogg, opus, aiff, wma)" if body.target in AUDIO_TARGETS else "")
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Use {allowed}.")
    if body.size <= 0 or body.size > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Max 2 GB.")

    prefix, main_site_id = await _dest_prefix(body, request, current_user)
    upload_id = str(uuid4())
    src_key = f"tmp/video_uploads/{upload_id}/source.{ext or 'bin'}"
    try:
        mp_id = await asyncio.to_thread(s3.create_multipart_upload, src_key, body.content_type or "application/octet-stream")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not start upload: {e}")

    await db.video_uploads.insert_one({
        "id": upload_id, "user_id": current_user.get("id"), "user_name": current_user.get("name"),
        "main_site_id": main_site_id, "target": body.target, "content_id": body.content_id, "kind": kind,
        "team_id": current_user.get("team_id"), "folder_id": body.folder_id, "title": body.title,
        "filename": body.filename, "content_type": body.content_type, "original_size": body.size,
        "total_chunks": math.ceil(body.size / CHUNK_BYTES), "parts": {},
        "src_key": src_key, "s3_upload_id": mp_id, "dest_prefix": prefix,
        "status": "uploading", "progress": 0, "created_at": _now(), "updated_at": _now(),
    })
    return {"upload_id": upload_id, "kind": kind, "chunk_size": CHUNK_BYTES, "total_chunks": math.ceil(body.size / CHUNK_BYTES)}


@video_upload_router.put("/{upload_id}/chunks/{index}")
async def upload_video_chunk(upload_id: str, index: int, request: Request,
                             current_user: dict = Depends(require_upload_access)):
    job = await _get_job(upload_id, current_user)
    if job["status"] != "uploading":
        raise HTTPException(status_code=409, detail="Upload is no longer accepting chunks")
    if index < 0 or index >= job["total_chunks"]:
        raise HTTPException(status_code=400, detail="Invalid chunk index")
    data = await request.body()
    is_last = index == job["total_chunks"] - 1
    expected = job["original_size"] - index * CHUNK_BYTES if is_last else CHUNK_BYTES
    if len(data) != expected:
        raise HTTPException(status_code=400, detail=f"Invalid chunk size: expected {expected} bytes, got {len(data)}")
    if index == 0:
        from services.global_protect import check_and_raise
        await check_and_raise(data, job["filename"], job.get("content_type"), job.get("main_site_id"),
                              current_user.get("id"), current_user.get("name"))
    try:
        etag = await asyncio.to_thread(s3.upload_multipart_part, job["src_key"], job["s3_upload_id"], index + 1, data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Chunk upload failed: {e}")
    await db.video_uploads.update_one({"id": upload_id}, {"$set": {f"parts.{index}": etag, "updated_at": _now()}})
    return {"index": index, "received": len(data)}


@video_upload_router.post("/{upload_id}/complete")
async def complete_video_upload(upload_id: str, current_user: dict = Depends(require_upload_access)):
    job = await _get_job(upload_id, current_user)
    if job["status"] != "uploading":
        return {k: job.get(k) for k in PUBLIC_FIELDS if k != "_id"}
    parts = job.get("parts") or {}
    missing = [i for i in range(job["total_chunks"]) if str(i) not in parts]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing chunks: {missing[:10]}")
    try:
        await asyncio.to_thread(s3.complete_multipart_upload, job["src_key"], job["s3_upload_id"],
                                [{"ETag": parts[str(i)], "PartNumber": i + 1} for i in range(job["total_chunks"])])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not finalize upload: {e}")
    await db.video_uploads.update_one({"id": upload_id}, {"$set": {"status": "queued", "progress": 0, "updated_at": _now()}})
    task = asyncio.create_task(_compress(upload_id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"id": upload_id, "status": "queued", "progress": 0}


@video_upload_router.get("/{upload_id}")
async def get_video_upload(upload_id: str, current_user: dict = Depends(require_upload_access)):
    await _get_job(upload_id, current_user)
    return await db.video_uploads.find_one({"id": upload_id}, PUBLIC_FIELDS)


@video_upload_router.delete("/{upload_id}")
async def cancel_video_upload(upload_id: str, current_user: dict = Depends(require_upload_access)):
    job = await _get_job(upload_id, current_user)
    if job["status"] == "uploading":
        try:
            await asyncio.to_thread(s3.abort_multipart_upload, job["src_key"], job["s3_upload_id"])
        except Exception as e:
            logger.warning("Abort multipart failed for %s: %s", upload_id, e)
        await db.video_uploads.update_one({"id": upload_id}, {"$set": {"status": "cancelled", "updated_at": _now()}})
    return {"id": upload_id, "status": "cancelled" if job["status"] == "uploading" else job["status"]}


async def _probe_duration(url: str) -> float:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", url,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    out, _ = await proc.communicate()
    try:
        return float(out.decode().strip() or 0)
    except ValueError:
        return 0.0


def _ffmpeg_audio_args(src_url: str, out_path: str) -> list:
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1",
        "-i", src_url, "-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-b:a", "192k",
        "-map_metadata", "0", "-id3v2_version", "3", out_path,
    ]


def _ffmpeg_args(src_url: str, out_path: str) -> list:
    # Long edge capped at 1920 (1080p landscape / 1080x1920 portrait), even dimensions.
    scale = "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))'"
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1",
        "-i", src_url, "-map", "0:v:0", "-map", "0:a:0?", "-vf", scale,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "6M", "-bufsize", "12M",
        "-pix_fmt", "yuv420p", "-threads", "2", "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-movflags", "+faststart", out_path,
    ]


async def _run_ffmpeg(upload_id: str, src_url: str, out_path: str, duration: float, kind: str = "video"):
    args = _ffmpeg_audio_args(src_url, out_path) if kind == "audio" else _ffmpeg_args(src_url, out_path)
    proc = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stderr_task = asyncio.create_task(proc.stderr.read())
    last, last_beat = 0, asyncio.get_running_loop().time()
    async for raw in proc.stdout:
        line = raw.decode(errors="ignore").strip()
        if not (duration and line.startswith("out_time_us=")):
            continue
        try:
            pct = min(99, int(int(line.split("=", 1)[1]) / 1_000_000 / duration * 100))
        except ValueError:
            continue
        now = asyncio.get_running_loop().time()
        if pct >= last + 2 or now - last_beat >= HEARTBEAT_S:
            last, last_beat = max(last, pct), now
            await db.video_uploads.update_one({"id": upload_id}, {"$set": {"progress": last, "updated_at": _now()}})
    rc = await proc.wait()
    err = (await stderr_task).decode(errors="ignore").strip()
    if rc != 0:
        raise RuntimeError(err[-500:] or f"ffmpeg exited with code {rc}")


async def _acquire_slot(upload_id: str):
    # Heartbeat while queued so the janitor doesn't treat the job as stale.
    while True:
        try:
            await asyncio.wait_for(_compress_slots.acquire(), timeout=HEARTBEAT_S)
            return
        except asyncio.TimeoutError:
            await db.video_uploads.update_one({"id": upload_id}, {"$set": {"updated_at": _now()}})


async def _register_media_asset(job: dict, key: str, url: str, size: int, mime: str, duration: float) -> str:
    base = os.path.splitext(job["filename"])[0]
    asset = {
        "id": str(uuid4()), "team_id": job.get("team_id"), "main_site_id": job.get("main_site_id"),
        "uploaded_by": job["user_id"], "kind": job.get("kind") or "video",
        "title": job.get("title") or job["filename"], "file_storage_key": key, "s3_url": url,
        "original_filename": f"{base}.{key.rsplit('.', 1)[-1]}", "mime_type": mime, "size": size,
        "duration_seconds": round(duration, 1) if duration else None,
        "folder_id": job.get("folder_id"), "created_at": _now(), "updated_at": _now(),
    }
    await db.media_assets.insert_one({**asset})
    return asset["id"]


async def _compress(upload_id: str):
    job = await db.video_uploads.find_one({"id": upload_id}, {"_id": 0})
    try:
        await _acquire_slot(upload_id)
        try:
            await db.video_uploads.update_one({"id": upload_id}, {"$set": {"status": "processing", "updated_at": _now()}})
            src_url = await s3.generate_presigned_url(job["src_key"], 6 * 3600)
            duration = await _probe_duration(src_url)
            kind = job.get("kind") or "video"
            ext, mime = ("mp3", "audio/mpeg") if kind == "audio" else ("mp4", "video/mp4")
            with tempfile.TemporaryDirectory(prefix="vidc_") as tmp:
                out_path = os.path.join(tmp, f"out.{ext}")
                await _run_ffmpeg(upload_id, src_url, out_path, duration, kind)
                size = os.path.getsize(out_path)
                key = f"{job['dest_prefix']}/{uuid4()}.{ext}"
                url = await asyncio.to_thread(s3.upload_local_file_to_s3, out_path, key, mime)
        finally:
            _compress_slots.release()
        asset_id = await _register_media_asset(job, key, url, size, mime, duration) if job.get("target") == "media" else None
        await db.video_uploads.update_one({"id": upload_id}, {"$set": {
            "status": "done", "progress": 100, "url": url, "key": key, "size": size, "mime_type": mime,
            "asset_id": asset_id, "updated_at": _now(),
        }})
        logger.info("Video %s compressed: %s -> %s bytes", upload_id, job["original_size"], size)
    except Exception as e:
        logger.error("Video compression failed for %s: %s", upload_id, e)
        await db.video_uploads.update_one({"id": upload_id}, {"$set": {
            "status": "error", "error": f"Compression failed: {str(e)[:300]}", "updated_at": _now(),
        }})
    finally:
        try:
            await s3.delete_file_from_s3(job["src_key"])
        except Exception as e:
            logger.warning("Could not delete source %s: %s", job["src_key"], e)


async def cleanup_video_uploads():
    """Fail jobs orphaned by a restart and abort abandoned multipart uploads."""
    now = datetime.now(timezone.utc).timestamp()
    async for job in db.video_uploads.find({"status": {"$in": ["queued", "processing", "uploading"]}}, {"_id": 0}):
        age = now - datetime.fromisoformat(job["updated_at"]).timestamp()
        if job["status"] == "uploading" and age > ABANDONED_UPLOAD_S:
            try:
                await asyncio.to_thread(s3.abort_multipart_upload, job["src_key"], job["s3_upload_id"])
            except Exception as e:
                logger.warning("Abort multipart failed for %s: %s", job["id"], e)
            await db.video_uploads.update_one({"id": job["id"]}, {"$set": {"status": "expired", "updated_at": _now()}})
        elif job["status"] in ("queued", "processing") and age > STALE_PROCESSING_S:
            try:
                await s3.delete_file_from_s3(job["src_key"])
            except Exception as e:
                logger.warning("Could not delete source %s: %s", job["src_key"], e)
            await db.video_uploads.update_one({"id": job["id"]}, {"$set": {
                "status": "error", "error": "Compression was interrupted (server restart). Please upload again.",
                "updated_at": _now(),
            }})


async def video_upload_janitor():
    while True:
        try:
            await cleanup_video_uploads()
        except Exception as e:
            logger.error("Video upload cleanup failed: %s", e)
        await asyncio.sleep(15 * 60)
