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
from services.auth import require_editor_or_admin
from services.main_site_context import get_main_site_id_from_header
from services import s3_storage as s3

logger = logging.getLogger(__name__)

video_upload_router = APIRouter(prefix="/video-uploads", tags=["Video Uploads"])

MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
CHUNK_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/ogg", "video/x-msvideo"}
ALLOWED_EXTS = {"mp4", "webm", "mov", "m4v", "ogg", "ogv", "avi"}
TARGETS = {"video_endpoint", "liveblog", "article"}
PUBLIC_FIELDS = {"_id": 0, "id": 1, "status": 1, "progress": 1, "url": 1, "key": 1, "size": 1,
                 "original_size": 1, "error": 1, "filename": 1, "target": 1, "content_id": 1}

_compress_slots = asyncio.Semaphore(1)


class VideoUploadInit(BaseModel):
    filename: str
    size: int
    content_type: Optional[str] = None
    target: str
    content_id: Optional[str] = None


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
    return f"videos/{scope}", main_site_id


@video_upload_router.post("/init")
async def init_video_upload(body: VideoUploadInit, request: Request,
                            current_user: dict = Depends(require_editor_or_admin)):
    if not s3.is_s3_configured():
        raise HTTPException(status_code=503, detail="Object storage is not configured")
    if body.target not in TARGETS:
        raise HTTPException(status_code=400, detail="Invalid upload target")
    ext = body.filename.rsplit(".", 1)[-1].lower() if "." in body.filename else ""
    if body.content_type not in ALLOWED_TYPES and ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="Unsupported video type. Use mp4, webm, mov, m4v, avi or ogg.")
    if body.size <= 0 or body.size > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="Video too large. Max 2 GB.")

    prefix, main_site_id = await _dest_prefix(body, request, current_user)
    upload_id = str(uuid4())
    src_key = f"tmp/video_uploads/{upload_id}/source.{ext or 'bin'}"
    try:
        mp_id = await asyncio.to_thread(s3.create_multipart_upload, src_key, body.content_type or "application/octet-stream")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not start upload: {e}")

    await db.video_uploads.insert_one({
        "id": upload_id, "user_id": current_user.get("id"), "user_name": current_user.get("name"),
        "main_site_id": main_site_id, "target": body.target, "content_id": body.content_id,
        "filename": body.filename, "content_type": body.content_type, "original_size": body.size,
        "total_chunks": math.ceil(body.size / CHUNK_BYTES), "parts": {},
        "src_key": src_key, "s3_upload_id": mp_id, "dest_prefix": prefix,
        "status": "uploading", "progress": 0, "created_at": _now(), "updated_at": _now(),
    })
    return {"upload_id": upload_id, "chunk_size": CHUNK_BYTES, "total_chunks": math.ceil(body.size / CHUNK_BYTES)}


@video_upload_router.put("/{upload_id}/chunks/{index}")
async def upload_video_chunk(upload_id: str, index: int, request: Request,
                             current_user: dict = Depends(require_editor_or_admin)):
    job = await _get_job(upload_id, current_user)
    if job["status"] != "uploading":
        raise HTTPException(status_code=409, detail="Upload is no longer accepting chunks")
    if index < 0 or index >= job["total_chunks"]:
        raise HTTPException(status_code=400, detail="Invalid chunk index")
    data = await request.body()
    if not data or len(data) > CHUNK_BYTES:
        raise HTTPException(status_code=400, detail="Invalid chunk size")
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
async def complete_video_upload(upload_id: str, current_user: dict = Depends(require_editor_or_admin)):
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
    await db.video_uploads.update_one({"id": upload_id}, {"$set": {"status": "processing", "progress": 0, "updated_at": _now()}})
    asyncio.create_task(_compress(upload_id))
    return {"id": upload_id, "status": "processing", "progress": 0}


@video_upload_router.get("/{upload_id}")
async def get_video_upload(upload_id: str, current_user: dict = Depends(require_editor_or_admin)):
    await _get_job(upload_id, current_user)
    return await db.video_uploads.find_one({"id": upload_id}, PUBLIC_FIELDS)


@video_upload_router.delete("/{upload_id}")
async def cancel_video_upload(upload_id: str, current_user: dict = Depends(require_editor_or_admin)):
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


async def _run_ffmpeg(upload_id: str, src_url: str, out_path: str, duration: float):
    proc = await asyncio.create_subprocess_exec(
        *_ffmpeg_args(src_url, out_path), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stderr_task = asyncio.create_task(proc.stderr.read())
    last = 0
    async for raw in proc.stdout:
        line = raw.decode(errors="ignore").strip()
        if duration and line.startswith("out_time_us="):
            try:
                pct = min(99, int(int(line.split("=", 1)[1]) / 1_000_000 / duration * 100))
            except ValueError:
                continue
            if pct >= last + 2:
                last = pct
                await db.video_uploads.update_one({"id": upload_id}, {"$set": {"progress": pct, "updated_at": _now()}})
    rc = await proc.wait()
    err = (await stderr_task).decode(errors="ignore").strip()
    if rc != 0:
        raise RuntimeError(err[-500:] or f"ffmpeg exited with code {rc}")


async def _compress(upload_id: str):
    job = await db.video_uploads.find_one({"id": upload_id}, {"_id": 0})
    try:
        async with _compress_slots:
            src_url = await s3.generate_presigned_url(job["src_key"], 6 * 3600)
            duration = await _probe_duration(src_url)
            with tempfile.TemporaryDirectory(prefix="vidc_") as tmp:
                out_path = os.path.join(tmp, "out.mp4")
                await _run_ffmpeg(upload_id, src_url, out_path, duration)
                size = os.path.getsize(out_path)
                key = f"{job['dest_prefix']}/{uuid4()}.mp4"
                url = await asyncio.to_thread(s3.upload_local_file_to_s3, out_path, key, "video/mp4")
        await db.video_uploads.update_one({"id": upload_id}, {"$set": {
            "status": "done", "progress": 100, "url": url, "key": key, "size": size, "updated_at": _now(),
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
