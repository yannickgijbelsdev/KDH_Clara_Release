"""Media editor: same-origin source streaming, timeline rendering (audio/video) and image saving.

Timeline JSON (audio + video):
  clips: [{asset_id, track, start, in, out, volume (0-2), fade_in, fade_out, muted}]
  Video projects: clips with a video asset on track 0 form the picture (black where empty);
  every clip's audio (unless muted) is mixed. Rendering runs FFmpeg server-side and the result
  is saved as a new Media Library asset or overwrites the original (user's choice).
"""
import asyncio
import hashlib
import hmac
import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from typing import List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from database import db
from services.auth import get_current_user, require_upload_access
from services import s3_storage as s3
from services.main_site_context import get_main_site_id_from_header

logger = logging.getLogger(__name__)
media_editor_router = APIRouter(prefix="/media-editor", tags=["Media Editor"])

_render_slots = asyncio.Semaphore(1)
_tasks: set = set()
MAX_CLIPS = 40


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sign(asset_id: str, exp: int) -> str:
    return hmac.new(os.environ["JWT_SECRET"].encode(), f"src|{asset_id}|{exp}".encode(), hashlib.sha256).hexdigest()[:32]


async def _scope(request: Request, current_user: dict) -> dict:
    # Same scoping as the Media Library list: per site when a site is selected, else per team.
    main_site_id = await get_main_site_id_from_header(request)
    return {"main_site_id": main_site_id} if main_site_id else {"team_id": current_user.get("team_id")}


async def _asset_for(asset_id: str, current_user: dict, request: Request) -> dict:
    asset = await db.media_assets.find_one({"id": asset_id, **(await _scope(request, current_user))}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    return asset


@media_editor_router.get("/source-url/{asset_id}")
async def get_source_url(asset_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Short-lived same-origin URL (works in <audio>/<video>/<img>/fetch without CORS)."""
    await _asset_for(asset_id, current_user, request)
    exp = int(time.time()) + 6 * 3600
    return {"url": f"/api/media-editor/source/{asset_id}?exp={exp}&sig={_sign(asset_id, exp)}"}


@media_editor_router.get("/source/{asset_id}")
async def stream_source(asset_id: str, exp: int, sig: str, request: Request):
    if exp < time.time() or not hmac.compare_digest(sig, _sign(asset_id, exp)):
        raise HTTPException(status_code=403, detail="Link expired")
    asset = await db.media_assets.find_one({"id": asset_id}, {"_id": 0, "file_storage_key": 1, "mime_type": 1})
    if not asset:
        raise HTTPException(status_code=404, detail="Not found")
    client, key = s3.get_s3_client(), asset["file_storage_key"]
    rng = request.headers.get("range")
    kwargs = {"Bucket": s3.S3_BUCKET, "Key": key, **({"Range": rng} if rng else {})}
    try:
        obj = await asyncio.to_thread(lambda: client.get_object(**kwargs))
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    body = obj["Body"]

    async def chunks():
        while True:
            data = await asyncio.to_thread(body.read, 1024 * 1024)
            if not data:
                break
            yield data

    headers = {"Accept-Ranges": "bytes", "Content-Length": str(obj["ContentLength"]), "Cache-Control": "private, max-age=3600"}
    if obj.get("ContentRange"):
        headers["Content-Range"] = obj["ContentRange"]
    import mimetypes
    mime = next((m for m in (asset.get("mime_type"), obj.get("ContentType"))
                 if m and m not in ("application/octet-stream", "binary/octet-stream")), None) or mimetypes.guess_type(key)[0]
    return StreamingResponse(chunks(), status_code=206 if rng else 200, media_type=mime, headers=headers)


class Clip(BaseModel):
    asset_id: str
    track: int = Field(0, ge=0, le=7)
    start: float = Field(0, ge=0)
    in_: float = Field(0, ge=0, alias="in")
    out: float = Field(..., gt=0)
    volume: float = Field(1.0, ge=0, le=2)
    fade_in: float = Field(0, ge=0)
    fade_out: float = Field(0, ge=0)
    muted: bool = False


class RenderRequest(BaseModel):
    kind: Literal["audio", "video"]
    clips: List[Clip]
    title: str = Field(..., min_length=1, max_length=200)
    mode: Literal["new", "overwrite"] = "new"
    original_asset_id: Optional[str] = None


def _build_ffmpeg(kind: str, clips: List[Clip], sources: dict, out_path: str) -> list:
    inputs, filters, a_labels = [], [], []
    idx = {}
    for c in clips:
        if c.asset_id not in idx:
            idx[c.asset_id] = len(idx)
            inputs += ["-i", sources[c.asset_id]["url"]]
    total = max(c.start + (c.out - c.in_) for c in clips)
    for n, c in enumerate(clips):
        i, dur = idx[c.asset_id], c.out - c.in_
        if not c.muted and sources[c.asset_id]["has_audio"]:
            f = f"[{i}:a:0]atrim={c.in_:.3f}:{c.out:.3f},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume={c.volume:.2f}"
            if c.fade_in:
                f += f",afade=t=in:st=0:d={min(c.fade_in, dur):.3f}"
            if c.fade_out:
                f += f",afade=t=out:st={max(0, dur - c.fade_out):.3f}:d={min(c.fade_out, dur):.3f}"
            f += f",adelay={int(c.start * 1000)}|{int(c.start * 1000)}[a{n}]"
            filters.append(f)
            a_labels.append(f"[a{n}]")
    if a_labels:
        filters.append(f"{''.join(a_labels)}amix=inputs={len(a_labels)}:normalize=0:dropout_transition=0,atrim=0:{total:.3f}[aout]")
    else:
        filters.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{total:.3f}[aout]")
    args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1", *inputs]
    if kind == "video":
        filters.append(f"color=c=black:s=1920x1080:r=30:d={total:.3f}[base0]")
        vclips = [c for c in clips if c.track == 0 and sources[c.asset_id]["kind"] == "video"]
        last = "base0"
        for n, c in enumerate(vclips):
            i = idx[c.asset_id]
            filters.append(
                f"[{i}:v:0]trim={c.in_:.3f}:{c.out:.3f},setpts=PTS-STARTPTS+{c.start:.3f}/TB,"
                f"scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v{n}]")
            filters.append(f"[{last}][v{n}]overlay=eof_action=pass:enable='between(t,{c.start:.3f},{c.start + c.out - c.in_:.3f})'[base{n + 1}]")
            last = f"base{n + 1}"
        args += ["-filter_complex", ";".join(filters), "-map", f"[{last}]", "-map", "[aout]",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-t", f"{total:.3f}", out_path]
    else:
        ext = out_path.rsplit(".", 1)[-1]
        codec = {"mp3": ["-c:a", "libmp3lame", "-b:a", "192k"], "wav": ["-c:a", "pcm_s16le"], "m4a": ["-c:a", "aac", "-b:a", "192k"],
                 "aac": ["-c:a", "aac", "-b:a", "192k"], "ogg": ["-c:a", "libvorbis", "-q:a", "6"], "flac": ["-c:a", "flac"],
                 "opus": ["-c:a", "libopus", "-b:a", "160k"], "aif": ["-c:a", "pcm_s16be"], "aiff": ["-c:a", "pcm_s16be"], "wma": ["-c:a", "wmav2", "-b:a", "192k"]}.get(ext, ["-c:a", "libmp3lame", "-b:a", "192k"])
        args += ["-filter_complex", ";".join(filters), "-map", "[aout]", *codec, "-t", f"{total:.3f}", out_path]
    return args, total


async def _has_audio(url: str) -> bool:
    p = await asyncio.create_subprocess_exec("ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                                             "-of", "csv=p=0", url, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    out, _ = await p.communicate()
    return bool(out.strip())


@media_editor_router.post("/render")
async def start_render(body: RenderRequest, request: Request, current_user: dict = Depends(require_upload_access)):
    if not body.clips or len(body.clips) > MAX_CLIPS:
        raise HTTPException(status_code=400, detail=f"Add between 1 and {MAX_CLIPS} clips")
    for c in body.clips:
        if c.out <= c.in_:
            raise HTTPException(status_code=400, detail="Each clip needs an end after its start")
    ids = {c.asset_id for c in body.clips}
    assets = {a["id"]: a for a in await db.media_assets.find(
        {"id": {"$in": list(ids)}, **(await _scope(request, current_user))}, {"_id": 0}).to_list(100)}
    if len(assets) != len(ids) or any(a["kind"] not in ("audio", "video") for a in assets.values()):
        raise HTTPException(status_code=400, detail="Clips must use audio or video files from your Media Library")
    if body.kind == "video" and not any(assets[c.asset_id]["kind"] == "video" and c.track == 0 for c in body.clips):
        raise HTTPException(status_code=400, detail="A video project needs at least one video clip on the video track")
    original = None
    if body.mode == "overwrite":
        original = await _asset_for(body.original_asset_id or "", current_user, request)
        if original["kind"] != body.kind:
            raise HTTPException(status_code=400, detail="The original must be of the same type")
        oext = original["file_storage_key"].rsplit(".", 1)[-1].lower()
        ok = {"video": ("mp4", "mov", "m4v"), "audio": ("mp3", "wav", "m4a", "aac", "ogg", "flac", "opus", "aif", "aiff", "wma")}[body.kind]
        if oext not in ok:
            raise HTTPException(status_code=400, detail=f"Overwriting .{oext} files is not supported. Save as a new file instead.")
    job = {"id": str(uuid4()), "user_id": current_user["id"], "team_id": current_user.get("team_id"),
           "request": body.model_dump(by_alias=True), "status": "queued", "progress": 0, "created_at": _now(), "updated_at": _now()}
    await db.media_render_jobs.insert_one({**job})
    task = asyncio.create_task(_render(job["id"], body, assets, original, current_user))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"id": job["id"], "status": "queued"}


@media_editor_router.get("/jobs/{job_id}")
async def get_render_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.media_render_jobs.find_one({"id": job_id, "user_id": current_user["id"]},
                                              {"_id": 0, "request": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def _set(job_id: str, **fields):
    await db.media_render_jobs.update_one({"id": job_id}, {"$set": {**fields, "updated_at": _now()}})


async def _render(job_id: str, body: RenderRequest, assets: dict, original: Optional[dict], user: dict):
    try:
        async with _render_slots:
            await _set(job_id, status="processing")
            sources = {}
            for aid, a in assets.items():
                url = await s3.generate_presigned_url(a["file_storage_key"], 6 * 3600)
                sources[aid] = {"url": url, "kind": a["kind"], "has_audio": a["kind"] == "audio" or await _has_audio(url)}
            if original:
                ext = original["file_storage_key"].rsplit(".", 1)[-1].lower()
            else:
                ext = "mp4" if body.kind == "video" else "mp3"
            with tempfile.TemporaryDirectory(prefix="mrender_") as tmp:
                out_path = os.path.join(tmp, f"out.{ext}")
                args, total = _build_ffmpeg(body.kind, body.clips, sources, out_path)
                proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                err_task = asyncio.create_task(proc.stderr.read())
                last = 0
                async for raw in proc.stdout:
                    line = raw.decode(errors="ignore").strip()
                    if line.startswith("out_time_us=") and total:
                        try:
                            pct = min(99, int(int(line.split("=", 1)[1]) / 1e6 / total * 100))
                        except ValueError:
                            continue
                        if pct >= last + 3:
                            last = pct
                            await _set(job_id, progress=pct)
                rc = await proc.wait()
                err = (await err_task).decode(errors="ignore").strip()
                if rc != 0:
                    import re as _re
                    raise RuntimeError(_re.sub(r"https?://\S+", "<source file>", err)[-400:] or f"ffmpeg exited with {rc}")
                size = os.path.getsize(out_path)
                mime = {"mp4": "video/mp4", "mov": "video/quicktime", "m4v": "video/x-m4v", "mp3": "audio/mpeg", "wav": "audio/wav",
                        "opus": "audio/opus", "aif": "audio/aiff", "aiff": "audio/aiff", "wma": "audio/x-ms-wma",
                        "m4a": "audio/mp4", "aac": "audio/aac", "ogg": "audio/ogg", "flac": "audio/flac"}.get(ext, "application/octet-stream")
                key = original["file_storage_key"] if original else f"media/{user.get('team_id') or 'shared'}/{uuid4()}.{ext}"
                url = await asyncio.to_thread(s3.upload_local_file_to_s3, out_path, key, mime)
        if original:
            await db.media_assets.update_one({"id": original["id"]}, {"$set": {
                "size": size, "mime_type": mime, "duration_seconds": round(total, 1), "updated_at": _now()}})
            asset_id = original["id"]
        else:
            first = assets[body.clips[0].asset_id]
            asset_id = str(uuid4())
            await db.media_assets.insert_one({
                "id": asset_id, "team_id": user.get("team_id"), "main_site_id": first.get("main_site_id"),
                "uploaded_by": user["id"], "kind": body.kind, "title": body.title, "file_storage_key": key, "s3_url": url,
                "original_filename": f"{body.title}.{ext}", "mime_type": mime, "size": size,
                "duration_seconds": round(total, 1), "folder_id": first.get("folder_id"), "created_at": _now(), "updated_at": _now(),
            })
        await _set(job_id, status="done", progress=100, asset_id=asset_id, url=url)
    except Exception as e:
        logger.error("Render %s failed: %s", job_id, e)
        await _set(job_id, status="error", error=str(e)[:400])


@media_editor_router.post("/image")
async def save_edited_image(
    request: Request, file: UploadFile = File(...), title: str = Form(...), mode: str = Form("new"),
    original_asset_id: str = Form(...), current_user: dict = Depends(require_upload_access),
):
    """Store an image edited in the browser: as a new asset or replacing the original file."""
    original = await _asset_for(original_asset_id, current_user, request)
    if original["kind"] != "image":
        raise HTTPException(status_code=400, detail="The original must be an image")
    data = await file.read()
    if not data or len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Invalid image")
    mime = (file.content_type or "").lower()
    if mime not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(status_code=400, detail="Only PNG, JPEG or WebP images can be saved")
    try:
        from io import BytesIO
        from PIL import Image
        fmt = await asyncio.to_thread(lambda: Image.open(BytesIO(data)).format)
    except Exception:
        fmt = None
    if fmt not in ("PNG", "JPEG", "WEBP") or fmt.lower() != {"image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp"}[mime]:
        raise HTTPException(status_code=400, detail="The file is not a valid image of the declared type")
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(mime, "png")
    if mode == "overwrite":
        key = original["file_storage_key"]
        okey_ext = key.rsplit(".", 1)[-1].lower()
        if okey_ext not in ("jpg", "jpeg", "png", "webp") or (okey_ext in ("jpg", "jpeg")) != (mime == "image/jpeg") \
                or (okey_ext in ("png", "webp") and ext != okey_ext):
            raise HTTPException(status_code=400, detail="Overwrite must keep the original file format")
        result = await s3.upload_file_to_s3(data, key, mime, main_site_id=original.get("main_site_id"),
                                            user_id=current_user["id"], user_name=current_user.get("name"))
        await db.media_assets.update_one({"id": original["id"]}, {"$set": {"size": len(data), "updated_at": _now()}})
        return {"id": original["id"], "url": result["url"], "mode": "overwrite"}
    key = f"media/{current_user.get('team_id') or 'shared'}/{uuid4()}.{ext}"
    result = await s3.upload_file_to_s3(data, key, mime, main_site_id=original.get("main_site_id"),
                                        user_id=current_user["id"], user_name=current_user.get("name"))
    asset_id = str(uuid4())
    await db.media_assets.insert_one({
        "id": asset_id, "team_id": current_user.get("team_id"), "main_site_id": original.get("main_site_id"),
        "uploaded_by": current_user["id"], "kind": "image", "title": title, "file_storage_key": key, "s3_url": result["url"],
        "original_filename": f"{title}.{ext}", "mime_type": mime, "size": len(data), "duration_seconds": None,
        "folder_id": original.get("folder_id"), "created_at": _now(), "updated_at": _now(),
    })
    return {"id": asset_id, "url": result["url"], "mode": "new"}

