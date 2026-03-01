"""Backup & Clone Router — Network admin endpoints for backup management."""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from database import db
from services.auth import get_current_user
from services.backup_service import (
    create_backup, restore_backup, clone_main_site,
    delete_clone, run_daily_backup, cleanup_expired_backups,
)

backup_router = APIRouter(prefix="/backups", tags=["backups"])


def require_network_admin(current_user: dict):
    if not current_user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Network admin only")


# ── List backups ────────────────────────────────────────────────────────

@backup_router.get("/{main_site_id}")
async def list_backups(
    main_site_id: str,
    current_user: dict = Depends(get_current_user),
):
    """List all backups for a main site, newest first."""
    require_network_admin(current_user)
    backups = await db.backups.find(
        {"main_site_id": main_site_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return {"backups": backups}


# ── Create manual backup ────────────────────────────────────────────────

@backup_router.post("/{main_site_id}")
async def create_manual_backup(
    main_site_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Trigger a manual backup for a main site. Runs in background."""
    require_network_admin(current_user)

    main_site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")

    # Run backup synchronously so user gets immediate feedback
    result = await create_backup(
        main_site_id,
        backup_type="manual",
        created_by=current_user.get("id", "unknown"),
    )
    return result


# ── Restore backup ──────────────────────────────────────────────────────

class RestoreRequest(BaseModel):
    backup_id: str


@backup_router.post("/{main_site_id}/restore")
async def restore_from_backup(
    main_site_id: str,
    body: RestoreRequest,
    current_user: dict = Depends(get_current_user),
):
    """Restore a main site from a backup. Creates safety backup first."""
    require_network_admin(current_user)

    backup = await db.backups.find_one({"id": body.backup_id}, {"_id": 0})
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
    if backup["main_site_id"] != main_site_id:
        raise HTTPException(status_code=400, detail="Backup does not belong to this site")

    try:
        result = await restore_backup(
            body.backup_id,
            created_by=current_user.get("id", "unknown"),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Delete backup ───────────────────────────────────────────────────────

@backup_router.delete("/{backup_id}")
async def delete_backup(
    backup_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a single backup."""
    require_network_admin(current_user)

    backup = await db.backups.find_one({"id": backup_id}, {"_id": 0})
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")

    # Delete from S3
    try:
        from services.s3_storage import get_s3_client, S3_BUCKET
        s3_client = get_s3_client()
        s3_client.delete_object(Bucket=S3_BUCKET, Key=backup["s3_key"])
    except Exception:
        pass

    await db.backups.delete_one({"id": backup_id})
    return {"status": "deleted", "backup_id": backup_id}


# ── Clone site ──────────────────────────────────────────────────────────

class CloneRequest(BaseModel):
    clone_name: str


@backup_router.post("/{main_site_id}/clone")
async def clone_site(
    main_site_id: str,
    body: CloneRequest,
    current_user: dict = Depends(get_current_user),
):
    """Clone a main site for testing purposes."""
    require_network_admin(current_user)

    main_site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")

    try:
        result = await clone_main_site(
            main_site_id,
            clone_name=body.clone_name,
            created_by=current_user.get("id", "unknown"),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Delete clone ────────────────────────────────────────────────────────

@backup_router.delete("/clone/{clone_main_site_id}")
async def remove_clone(
    clone_main_site_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a cloned main site and all its data."""
    require_network_admin(current_user)

    try:
        result = await delete_clone(clone_main_site_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── List clones ─────────────────────────────────────────────────────────

@backup_router.get("/{main_site_id}/clones")
async def list_clones(
    main_site_id: str,
    current_user: dict = Depends(get_current_user),
):
    """List all clones created from a main site."""
    require_network_admin(current_user)

    clones = await db.main_sites.find(
        {"cloned_from": main_site_id},
        {"_id": 0},
    ).to_list(100)
    return {"clones": clones}


# ── Trigger daily backup (admin utility) ────────────────────────────────

@backup_router.post("/system/run-daily")
async def trigger_daily_backup(
    current_user: dict = Depends(get_current_user),
):
    """Manually trigger the daily backup job for all main sites."""
    require_network_admin(current_user)
    results = await run_daily_backup()
    return {"results": results}


# ── Get all backups across all sites ────────────────────────────────────

@backup_router.get("/")
async def list_all_backups(
    current_user: dict = Depends(get_current_user),
):
    """List recent backups across all main sites."""
    require_network_admin(current_user)
    backups = await db.backups.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"backups": backups}
