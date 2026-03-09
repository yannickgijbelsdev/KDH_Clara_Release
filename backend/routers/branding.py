"""Branding settings router for platform-wide customization."""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import os

from services.auth import get_current_user
from database import db

branding_router = APIRouter(prefix="/branding", tags=["branding"])


class BrandingUpdate(BaseModel):
    platform_name: Optional[str] = None
    logo_type: Optional[str] = None  # "text" or "image"
    login_layout: Optional[str] = None  # "left", "right", "fullscreen"
    login_image_type: Optional[str] = None  # "static" or "carousel"
    login_images: Optional[List[str]] = None


UPLOAD_DIR = "/app/backend/uploads/branding"
os.makedirs(UPLOAD_DIR, exist_ok=True)

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
    """Upload a platform logo image."""
    if not current_user.get("is_network_admin") and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Network admin access required")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "svg", "webp"):
        raise HTTPException(status_code=400, detail="Invalid image format")

    filename = f"logo_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    url = f"/api/uploads/branding/{filename}"
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
    """Upload a custom favicon."""
    if not current_user.get("is_network_admin") and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Network admin access required")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "ico"
    if ext not in ("ico", "png", "svg"):
        raise HTTPException(status_code=400, detail="Invalid favicon format. Use .ico, .png, or .svg")

    filename = f"favicon_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    url = f"/api/uploads/branding/{filename}"
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
    """Upload a login page background image."""
    if not current_user.get("is_network_admin") and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Network admin access required")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Invalid image format")

    filename = f"login_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    url = f"/api/uploads/branding/{filename}"

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

    branding = await get_branding()
    images = branding.get("login_images", [])
    images = [img for img in images if img != image_url]

    await db.platform_settings.update_one(
        {"id": "platform_branding"},
        {"$set": {"login_images": images, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_branding()
