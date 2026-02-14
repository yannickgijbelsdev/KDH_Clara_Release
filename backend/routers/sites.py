"""Sites/Landing Pages management routes."""
import uuid
import hashlib
import os
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from database import db
from models.sites import (
    SiteCreate, SiteUpdate, SiteResponse, SitePublicResponse,
    SiteSubmissionCreate, SiteSubmissionResponse,
    SiteUserRole, SitePasswordCheck, FormField
)
from services.auth import get_current_user, require_admin
from services.s3_storage import upload_file_to_s3, is_s3_configured

import logging
logger = logging.getLogger(__name__)

sites_router = APIRouter(prefix="/sites", tags=["sites"])


def hash_password(password: str) -> str:
    """Hash a password for storage."""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    return hash_password(password) == hashed


# ============== SITE CRUD ==============

@sites_router.get("")
async def get_sites(current_user: dict = Depends(get_current_user)):
    """Get all sites for the current team."""
    team_id = current_user.get('team_id')
    user_id = current_user.get('id')
    is_admin = current_user.get('role') == 'admin'
    
    if is_admin:
        # Admins see all team sites
        sites = await db.sites.find(
            {"team_id": team_id},
            {"_id": 0, "password_hash": 0}
        ).to_list(100)
    else:
        # Non-admins see only sites they have access to
        user_site_access = await db.site_users.find(
            {"user_id": user_id},
            {"_id": 0, "site_id": 1}
        ).to_list(100)
        site_ids = [a["site_id"] for a in user_site_access]
        
        sites = await db.sites.find(
            {"id": {"$in": site_ids}, "team_id": team_id},
            {"_id": 0, "password_hash": 0}
        ).to_list(100)
    
    return sites


@sites_router.post("")
async def create_site(
    site_data: SiteCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new site."""
    team_id = current_user.get('team_id')
    
    # Check if slug is unique
    existing = await db.sites.find_one({"slug": site_data.slug})
    if existing:
        raise HTTPException(status_code=400, detail="Deze URL is al in gebruik")
    
    # Validate slug format
    if not site_data.slug.isalnum() and not all(c.isalnum() or c == '-' for c in site_data.slug):
        raise HTTPException(status_code=400, detail="URL mag alleen letters, cijfers en streepjes bevatten")
    
    now = datetime.now(timezone.utc).isoformat()
    site_id = str(uuid.uuid4())
    
    site_doc = {
        "id": site_id,
        "team_id": team_id,
        "name": site_data.name,
        "slug": site_data.slug.lower(),
        "logo_url": None,
        "audio_enabled": False,
        "audio_type": None,
        "audio_url": None,
        "audio_format": None,
        "video_enabled": False,
        "video_type": None,
        "video_url": None,
        "form_enabled": False,
        "form_fields": [
            {"id": "name", "label": "Naam", "type": "text", "required": True},
            {"id": "phone", "label": "Telefoonnummer", "type": "tel", "required": False},
            {"id": "message", "label": "Bericht", "type": "textarea", "required": False},
        ],
        "password_protected": False,
        "password_hash": None,
        "created_at": now,
        "updated_at": now
    }
    
    await db.sites.insert_one(site_doc)
    
    # Remove password_hash from response
    del site_doc["password_hash"]
    return site_doc


@sites_router.get("/{site_id}")
async def get_site(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific site."""
    team_id = current_user.get('team_id')
    
    site = await db.sites.find_one(
        {"id": site_id, "team_id": team_id},
        {"_id": 0, "password_hash": 0}
    )
    
    if not site:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    return site


@sites_router.put("/{site_id}")
async def update_site(
    site_id: str,
    site_data: SiteUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a site."""
    team_id = current_user.get('team_id')
    user_id = current_user.get('id')
    is_admin = current_user.get('role') == 'admin'
    
    # Check if user has editor access
    if not is_admin:
        access = await db.site_users.find_one({
            "site_id": site_id,
            "user_id": user_id,
            "role": "editor"
        })
        if not access:
            raise HTTPException(status_code=403, detail="Geen bewerkingsrechten")
    
    site = await db.sites.find_one({"id": site_id, "team_id": team_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    # If slug is being changed, check uniqueness
    if site_data.slug and site_data.slug != site.get("slug"):
        existing = await db.sites.find_one({"slug": site_data.slug, "id": {"$ne": site_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Deze URL is al in gebruik")
    
    update_data = site_data.model_dump(exclude_unset=True)
    
    # Hash password if provided
    if "password" in update_data:
        if update_data["password"]:
            update_data["password_hash"] = hash_password(update_data["password"])
        del update_data["password"]
    
    # Convert form_fields to dict format
    if "form_fields" in update_data and update_data["form_fields"]:
        update_data["form_fields"] = [
            f.model_dump() if hasattr(f, 'model_dump') else f 
            for f in update_data["form_fields"]
        ]
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.sites.update_one(
        {"id": site_id},
        {"$set": update_data}
    )
    
    updated_site = await db.sites.find_one(
        {"id": site_id},
        {"_id": 0, "password_hash": 0}
    )
    
    return updated_site


@sites_router.delete("/{site_id}")
async def delete_site(
    site_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a site."""
    team_id = current_user.get('team_id')
    
    result = await db.sites.delete_one({"id": site_id, "team_id": team_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    # Also delete related data
    await db.site_submissions.delete_many({"site_id": site_id})
    await db.site_users.delete_many({"site_id": site_id})
    
    return {"message": "Site verwijderd"}


# ============== SITE LOGO UPLOAD ==============

@sites_router.post("/{site_id}/logo")
async def upload_site_logo(
    site_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a logo for a site."""
    team_id = current_user.get('team_id')
    
    site = await db.sites.find_one({"id": site_id, "team_id": team_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    # Validate file type
    allowed_types = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Alleen afbeeldingen toegestaan")
    
    # Create upload directory
    upload_dir = "/app/backend/uploads/site_logos"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Save file
    ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    filename = f"{site_id}.{ext}"
    filepath = os.path.join(upload_dir, filename)
    
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    
    # Update site
    logo_url = f"/uploads/site_logos/{filename}"
    await db.sites.update_one(
        {"id": site_id},
        {"$set": {"logo_url": logo_url, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"logo_url": logo_url}


# ============== SITE AUDIO UPLOAD ==============

@sites_router.post("/{site_id}/audio")
async def upload_site_audio(
    site_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an audio file for a site."""
    team_id = current_user.get('team_id')
    
    site = await db.sites.find_one({"id": site_id, "team_id": team_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    # Validate file type
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/aac", "audio/x-aac"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Alleen MP3 of AAC bestanden toegestaan")
    
    # Create upload directory
    upload_dir = "/app/backend/uploads/site_audio"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Save file
    ext = file.filename.split(".")[-1] if "." in file.filename else "mp3"
    filename = f"{site_id}.{ext}"
    filepath = os.path.join(upload_dir, filename)
    
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    
    audio_url = f"/uploads/site_audio/{filename}"
    audio_format = "aac" if ext.lower() == "aac" else "mp3"
    
    await db.sites.update_one(
        {"id": site_id},
        {"$set": {
            "audio_url": audio_url,
            "audio_type": "file",
            "audio_format": audio_format,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"audio_url": audio_url, "audio_format": audio_format}


# ============== SITE USER ACCESS ==============

@sites_router.get("/{site_id}/users")
async def get_site_users(
    site_id: str,
    current_user: dict = Depends(require_admin)
):
    """Get users with access to a site."""
    team_id = current_user.get('team_id')
    
    site = await db.sites.find_one({"id": site_id, "team_id": team_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    site_users = await db.site_users.find(
        {"site_id": site_id},
        {"_id": 0}
    ).to_list(100)
    
    # Get user details
    user_ids = [su["user_id"] for su in site_users]
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "name": 1, "email": 1}
    ).to_list(100)
    
    user_map = {u["id"]: u for u in users}
    
    result = []
    for su in site_users:
        user_info = user_map.get(su["user_id"], {})
        result.append({
            "user_id": su["user_id"],
            "role": su["role"],
            "name": user_info.get("name", ""),
            "email": user_info.get("email", "")
        })
    
    return result


@sites_router.post("/{site_id}/users")
async def add_site_user(
    site_id: str,
    user_role: SiteUserRole,
    current_user: dict = Depends(require_admin)
):
    """Add a user to a site with a specific role."""
    team_id = current_user.get('team_id')
    
    site = await db.sites.find_one({"id": site_id, "team_id": team_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    # Check if user exists in team
    user = await db.users.find_one({"id": user_role.user_id, "team_id": team_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    # Upsert user access
    await db.site_users.update_one(
        {"site_id": site_id, "user_id": user_role.user_id},
        {"$set": {"role": user_role.role}},
        upsert=True
    )
    
    return {"message": "Gebruiker toegevoegd"}


@sites_router.delete("/{site_id}/users/{user_id}")
async def remove_site_user(
    site_id: str,
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """Remove a user from a site."""
    team_id = current_user.get('team_id')
    
    site = await db.sites.find_one({"id": site_id, "team_id": team_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    await db.site_users.delete_one({"site_id": site_id, "user_id": user_id})
    
    return {"message": "Gebruiker verwijderd"}


# ============== SITE SUBMISSIONS ==============

@sites_router.get("/{site_id}/submissions")
async def get_site_submissions(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get form submissions for a site."""
    team_id = current_user.get('team_id')
    
    site = await db.sites.find_one({"id": site_id, "team_id": team_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    submissions = await db.site_submissions.find(
        {"site_id": site_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    return submissions


@sites_router.delete("/{site_id}/submissions/{submission_id}")
async def delete_submission(
    site_id: str,
    submission_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a submission."""
    team_id = current_user.get('team_id')
    
    site = await db.sites.find_one({"id": site_id, "team_id": team_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site niet gevonden")
    
    await db.site_submissions.delete_one({"id": submission_id, "site_id": site_id})
    
    return {"message": "Inzending verwijderd"}


# ============== PUBLIC ENDPOINTS ==============

@sites_router.get("/public/{slug}")
async def get_public_site(slug: str):
    """Get public site data by slug."""
    site = await db.sites.find_one(
        {"slug": slug.lower()},
        {"_id": 0, "password_hash": 0, "team_id": 0, "id": 0}
    )
    
    if not site:
        raise HTTPException(status_code=404, detail="Pagina niet gevonden")
    
    return site


@sites_router.post("/public/{slug}/verify-password")
async def verify_site_password(slug: str, data: SitePasswordCheck):
    """Verify password for a protected site."""
    site = await db.sites.find_one({"slug": slug.lower()})
    
    if not site:
        raise HTTPException(status_code=404, detail="Pagina niet gevonden")
    
    if not site.get("password_protected"):
        return {"valid": True}
    
    if verify_password(data.password, site.get("password_hash", "")):
        return {"valid": True}
    
    raise HTTPException(status_code=401, detail="Ongeldig wachtwoord")


@sites_router.post("/public/{slug}/submit")
async def submit_site_form(slug: str, submission: SiteSubmissionCreate):
    """Submit a form on a public site."""
    site = await db.sites.find_one({"slug": slug.lower()})
    
    if not site:
        raise HTTPException(status_code=404, detail="Pagina niet gevonden")
    
    if not site.get("form_enabled"):
        raise HTTPException(status_code=400, detail="Formulier is niet actief")
    
    now = datetime.now(timezone.utc).isoformat()
    submission_id = str(uuid.uuid4())
    
    submission_doc = {
        "id": submission_id,
        "site_id": site["id"],
        "name": submission.name,
        "phone": submission.phone,
        "message": submission.message,
        "custom_fields": submission.custom_fields or {},
        "created_at": now
    }
    
    await db.site_submissions.insert_one(submission_doc)
    
    return {"message": "Bericht verzonden", "id": submission_id}
