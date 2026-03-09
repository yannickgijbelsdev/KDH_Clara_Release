"""Branding settings router for platform-wide customization."""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import os

from services.auth import get_current_user
from services.s3_storage import upload_file_to_s3, delete_file_from_s3, is_s3_configured
from database import db

branding_router = APIRouter(prefix="/branding", tags=["branding"])


class BrandingUpdate(BaseModel):
    platform_name: Optional[str] = None
    logo_type: Optional[str] = None  # "text" or "image"
    login_layout: Optional[str] = None  # "left", "right", "fullscreen"
    login_image_type: Optional[str] = None  # "static" or "carousel"
    login_images: Optional[List[str]] = None


LOCAL_UPLOAD_DIR = "/app/backend/uploads/branding"
os.makedirs(LOCAL_UPLOAD_DIR, exist_ok=True)

DEFAULT_BRANDING = {
    "id": "platform_branding",
    "platform_name": "Clara",
    "logo_type": "text",
    "logo_url": None,
    "favicon_url": None,
    "login_layout": "left",
    "login_image_type": "static",
    "login_images": [
        "https://images.unsplash.com/photo-1654198340681-a2e0fc449f1b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwxfHxkYXJrJTIwcHVycGxlJTIwZ3JhZGllbnQlMjBhYnN0cmFjdCUyMHdhdmVzfGVufDB8fHx8MTc3MTExNTk5Mnww&ixlib=rb-4.1.0&q=85"
    ],
}


async def _upload_branding_file(content: bytes, filename: str, content_type: str, prefix: str) -> str:
    """Upload a branding file to S3 (preferred) or local storage. Returns URL."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    unique_name = f"{prefix}_{uuid.uuid4().hex[:8]}.{ext}"
    s3_key = f"branding/{unique_name}"

    if is_s3_configured():
        result = await upload_file_to_s3(content, s3_key, content_type)
        return result["url"]
    else:
        filepath = os.path.join(LOCAL_UPLOAD_DIR, unique_name)
        with open(filepath, "wb") as f:
            f.write(content)
        return f"/api/uploads/branding/{unique_name}"


async def _delete_branding_file(url: str):
    """Delete a branding file from S3 or local storage."""
    if not url:
        return
    if url.startswith("/api/uploads/branding/"):
        local_name = url.split("/")[-1]
        local_path = os.path.join(LOCAL_UPLOAD_DIR, local_name)
        if os.path.exists(local_path):
            os.unlink(local_path)
    elif is_s3_configured():
        # Extract S3 key from URL
        try:
            # S3 URLs contain the key after the bucket path
            key = "branding/" + url.split("branding/")[-1].split("?")[0]
            await delete_file_from_s3(key)
        except Exception:
            pass


async def get_branding():
    """Get branding settings, merge with defaults for missing fields."""
    doc = await db.platform_settings.find_one({"id": "platform_branding"}, {"_id": 0})
    if not doc:
        return {**DEFAULT_BRANDING}
    return {**DEFAULT_BRANDING, **doc}


@branding_router.get("")
async def get_branding_settings():
    """Get platform branding settings. Public endpoint (needed for login page)."""
    return await get_branding()


@branding_router.put("")
async def update_branding_settings(
    body: BrandingUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update platform branding settings. Network admin only."""
    if not current_user.get("is_network_admin") and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Network admin access required")

    update_dict = {k: v for k, v in body.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.platform_settings.update_one(
        {"id": "platform_branding"},
        {"$set": update_dict},
        upsert=True,
    )
    return await get_branding()


@branding_router.post("/upload-logo")
async def upload_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a platform logo image to S3."""
    if not current_user.get("is_network_admin") and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Network admin access required")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "svg", "webp"):
        raise HTTPException(status_code=400, detail="Invalid image format")

    content = await file.read()
    content_type = file.content_type or "image/png"

    # Delete old logo if exists
    branding = await get_branding()
    if branding.get("logo_url"):
        await _delete_branding_file(branding["logo_url"])

    url = await _upload_branding_file(content, file.filename, content_type, "logo")

    await db.platform_settings.update_one(
        {"id": "platform_branding"},
        {"$set": {"logo_url": url, "logo_type": "image", "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_branding()


@branding_router.post("/upload-favicon")
async def upload_favicon(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a custom favicon to S3."""
    if not current_user.get("is_network_admin") and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Network admin access required")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "ico"
    if ext not in ("ico", "png", "svg"):
        raise HTTPException(status_code=400, detail="Invalid favicon format. Use .ico, .png, or .svg")

    content = await file.read()
    content_type = file.content_type or "image/x-icon"

    # Delete old favicon if exists
    branding = await get_branding()
    if branding.get("favicon_url"):
        await _delete_branding_file(branding["favicon_url"])

    url = await _upload_branding_file(content, file.filename, content_type, "favicon")

    await db.platform_settings.update_one(
        {"id": "platform_branding"},
        {"$set": {"favicon_url": url, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_branding()


@branding_router.post("/upload-login-image")
async def upload_login_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a login page background image to S3."""
    if not current_user.get("is_network_admin") and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Network admin access required")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Invalid image format")

    content = await file.read()
    content_type = file.content_type or "image/jpeg"

    url = await _upload_branding_file(content, file.filename, content_type, "login")

    # Add to login_images array
    branding = await get_branding()
    images = branding.get("login_images", [])
    images.append(url)

    await db.platform_settings.update_one(
        {"id": "platform_branding"},
        {"$set": {"login_images": images, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_branding()


@branding_router.delete("/login-image")
async def delete_login_image(
    image_url: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove a login page background image."""
    if not current_user.get("is_network_admin") and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Network admin access required")

    # Delete from storage
    await _delete_branding_file(image_url)

    branding = await get_branding()
    images = branding.get("login_images", [])
    images = [img for img in images if img != image_url]

    await db.platform_settings.update_one(
        {"id": "platform_branding"},
        {"$set": {"login_images": images, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_branding()
