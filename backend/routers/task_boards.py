"""Task Board Router — Kanban boards with tasks, columns, and calendar sync."""
import uuid
import os
import asyncio
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from database import db
from services.auth import get_current_user
from services.main_site_context import get_main_site_id_from_header
from routers.shows import resolve_avatar_url
import logging

logger = logging.getLogger(__name__)

task_boards_router = APIRouter(prefix="/task-boards", tags=["task-boards"])


# ── Models ──

class BoardCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#f59e0b"
    members: List[str] = []  # list of user IDs


class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    members: Optional[List[str]] = None


class ColumnCreate(BaseModel):
    name: str
    color: str = "#3b82f6"


class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None


class ChecklistItem(BaseModel):
    id: str
    text: str
    done: bool = False


class CommentCreate(BaseModel):
    text: str


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    column_id: str
    priority: str = "medium"  # low, medium, high, urgent
    deadline: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    labels: List[str] = []
    checklist: List[ChecklistItem] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    column_id: Optional[str] = None
    priority: Optional[str] = None
    deadline: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    labels: Optional[List[str]] = None
    checklist: Optional[List[dict]] = None
    order: Optional[int] = None


class TaskMove(BaseModel):
    column_id: str
    order: int


class CalendarSyncConfig(BaseModel):
    provider: str  # "google" or "outlook"
    access_token: str
    refresh_token: Optional[str] = None
    calendar_id: Optional[str] = None


# ── Boards CRUD ──

@task_boards_router.get("/boards")
async def list_boards(
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    boards = await db.task_boards.find(
        {"main_site_id": main_site_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    # Add task count per board (exclude tasks in "Done" columns)
    for board in boards:
        done_cols = await db.task_columns.find(
            {"board_id": board["id"], "name": {"$regex": "^done$", "$options": "i"}},
            {"_id": 0, "id": 1}
        ).to_list(10)
        done_col_ids = [c["id"] for c in done_cols]
        query = {"board_id": board["id"], "main_site_id": main_site_id}
        if done_col_ids:
            query["column_id"] = {"$nin": done_col_ids}
        board["task_count"] = await db.tasks.count_documents(query)
    return boards


@task_boards_router.post("/boards")
async def create_board(
    body: BoardCreate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    board_id = str(uuid.uuid4())
    slug = body.name.lower().replace(" ", "-").replace("/", "-")[:50]
    board = {
        "id": board_id,
        "main_site_id": main_site_id,
        "name": body.name,
        "slug": slug,
        "description": body.description,
        "color": body.color,
        "members": body.members if body.members else [current_user.get("id")],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("id"),
    }
    await db.task_boards.insert_one(board)
    board.pop("_id", None)

    # Create default columns
    defaults = [
        {"name": "To Do", "color": "#6b7280", "order": 0},
        {"name": "In Progress", "color": "#3b82f6", "order": 1},
        {"name": "Review", "color": "#f59e0b", "order": 2},
        {"name": "Done", "color": "#10b981", "order": 3},
    ]
    for col_def in defaults:
        col = {
            "id": str(uuid.uuid4()),
            "board_id": board_id,
            "main_site_id": main_site_id,
            **col_def,
        }
        await db.task_columns.insert_one(col)

    board["task_count"] = 0
    return board


@task_boards_router.get("/boards/{board_id}")
async def get_board(
    board_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    board = await db.task_boards.find_one({"id": board_id, "main_site_id": main_site_id}, {"_id": 0})
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@task_boards_router.put("/boards/{board_id}")
async def update_board(
    board_id: str,
    body: BoardUpdate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    update = {k: v for k, v in body.dict().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.task_boards.update_one({"id": board_id, "main_site_id": main_site_id}, {"$set": update})
    board = await db.task_boards.find_one({"id": board_id}, {"_id": 0})
    return board


@task_boards_router.delete("/boards/{board_id}")
async def delete_board(
    board_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    await db.task_boards.delete_one({"id": board_id, "main_site_id": main_site_id})
    await db.task_columns.delete_many({"board_id": board_id})
    await db.tasks.delete_many({"board_id": board_id})
    return {"status": "deleted"}


@task_boards_router.get("/boards/{board_id}/members")
async def get_board_members(
    board_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """Get detailed member info for a board."""
    board = await db.task_boards.find_one({"id": board_id, "main_site_id": main_site_id}, {"_id": 0, "members": 1})
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    member_ids = board.get("members", [])
    if not member_ids:
        return []
    users = await db.users.find(
        {"id": {"$in": member_ids}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "avatar": 1}
    ).to_list(100)
    for u in users:
        avatar = u.pop("avatar", None)
        u["avatar_url"] = resolve_avatar_url(avatar)
    return users


# ── Columns CRUD ──

@task_boards_router.get("/boards/{board_id}/columns")
async def list_columns(
    board_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    columns = await db.task_columns.find(
        {"board_id": board_id, "main_site_id": main_site_id}, {"_id": 0}
    ).sort("order", 1).to_list(50)
    return columns


@task_boards_router.post("/boards/{board_id}/columns")
async def create_column(
    board_id: str,
    body: ColumnCreate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    max_order = await db.task_columns.find_one(
        {"board_id": board_id}, sort=[("order", -1)]
    )
    order = (max_order.get("order", 0) + 1) if max_order else 0

    col = {
        "id": str(uuid.uuid4()),
        "board_id": board_id,
        "main_site_id": main_site_id,
        "name": body.name,
        "color": body.color,
        "order": order,
    }
    await db.task_columns.insert_one(col)
    col.pop("_id", None)
    return col


class ColumnsReorder(BaseModel):
    column_ids: List[str]


@task_boards_router.put("/boards/{board_id}/columns/reorder")
async def reorder_columns(
    board_id: str,
    body: ColumnsReorder,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    for idx, col_id in enumerate(body.column_ids):
        await db.task_columns.update_one(
            {"id": col_id, "board_id": board_id},
            {"$set": {"order": idx}},
        )
    return {"status": "reordered"}


@task_boards_router.put("/boards/{board_id}/columns/{column_id}")
async def update_column(
    board_id: str,
    column_id: str,
    body: ColumnUpdate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    update = {k: v for k, v in body.dict().items() if v is not None}
    await db.task_columns.update_one({"id": column_id, "board_id": board_id}, {"$set": update})
    col = await db.task_columns.find_one({"id": column_id}, {"_id": 0})
    return col


@task_boards_router.delete("/boards/{board_id}/columns/{column_id}")
async def delete_column(
    board_id: str,
    column_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    await db.task_columns.delete_one({"id": column_id, "board_id": board_id})
    await db.tasks.delete_many({"column_id": column_id})
    return {"status": "deleted"}


@task_boards_router.delete("/boards/{board_id}/tasks/{task_id}/attachments/{attachment_id}")
async def delete_attachment(
    board_id: str,
    task_id: str,
    attachment_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    await db.tasks.update_one(
        {"id": task_id, "board_id": board_id, "main_site_id": main_site_id},
        {"$pull": {"attachments": {"id": attachment_id}}},
    )
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return task


@task_boards_router.delete("/boards/{board_id}/tasks/{task_id}/comments/{comment_id}")
async def delete_comment(
    board_id: str,
    task_id: str,
    comment_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    await db.tasks.update_one(
        {"id": task_id, "board_id": board_id, "main_site_id": main_site_id},
        {"$pull": {"comments": {"id": comment_id}}},
    )
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return task


# ── Tasks CRUD ──

@task_boards_router.get("/boards/{board_id}/tasks")
async def list_tasks(
    board_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    tasks = await db.tasks.find(
        {"board_id": board_id, "main_site_id": main_site_id}, {"_id": 0}
    ).sort("order", 1).to_list(5000)
    return tasks


@task_boards_router.post("/boards/{board_id}/tasks")
async def create_task(
    board_id: str,
    body: TaskCreate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    max_order = await db.tasks.find_one(
        {"board_id": board_id, "column_id": body.column_id}, sort=[("order", -1)]
    )
    order = (max_order.get("order", 0) + 1) if max_order else 0

    task = {
        "id": str(uuid.uuid4()),
        "board_id": board_id,
        "main_site_id": main_site_id,
        "column_id": body.column_id,
        "title": body.title,
        "description": body.description,
        "priority": body.priority,
        "deadline": body.deadline,
        "assignee_id": body.assignee_id,
        "assignee_name": body.assignee_name,
        "labels": body.labels,
        "checklist": [item.dict() for item in body.checklist],
        "attachments": [],
        "comments": [],
        "order": order,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name", ""),
    }
    await db.tasks.insert_one(task)
    task.pop("_id", None)
    return task


@task_boards_router.put("/boards/{board_id}/tasks/{task_id}")
async def update_task(
    board_id: str,
    task_id: str,
    body: TaskUpdate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    update = {k: v for k, v in body.dict().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tasks.update_one({"id": task_id, "board_id": board_id, "main_site_id": main_site_id}, {"$set": update})
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return task


@task_boards_router.delete("/boards/{board_id}/tasks/{task_id}")
async def delete_task(
    board_id: str,
    task_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    await db.tasks.delete_one({"id": task_id, "board_id": board_id, "main_site_id": main_site_id})
    return {"status": "deleted"}


@task_boards_router.put("/boards/{board_id}/tasks/{task_id}/move")
async def move_task(
    board_id: str,
    task_id: str,
    body: TaskMove,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    # Get old task state for status change detection
    old_task = await db.tasks.find_one({"id": task_id, "board_id": board_id}, {"_id": 0})
    old_column_id = old_task.get("column_id") if old_task else None

    await db.tasks.update_one(
        {"id": task_id, "board_id": board_id, "main_site_id": main_site_id},
        {"$set": {"column_id": body.column_id, "order": body.order, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})

    # Send status change notification if column changed
    if old_column_id and old_column_id != body.column_id:
        asyncio.create_task(_notify_task_status_change(
            task, board_id, main_site_id, old_column_id, body.column_id, current_user
        ))

    return task


async def _notify_task_status_change(task, board_id, main_site_id, old_col_id, new_col_id, mover):
    """Send email notifications when a task changes columns (status)."""
    try:
        from services.email_service import send_task_status_notification
        old_col = await db.task_columns.find_one({"id": old_col_id}, {"_id": 0, "name": 1})
        new_col = await db.task_columns.find_one({"id": new_col_id}, {"_id": 0, "name": 1})
        board = await db.task_boards.find_one({"id": board_id}, {"_id": 0, "name": 1, "members": 1})
        main_site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "name": 1})

        if not all([old_col, new_col, board]):
            return

        # Get emails of board members
        member_ids = board.get("members", [])
        notify_emails = []
        if member_ids:
            users = await db.users.find({"id": {"$in": member_ids}}, {"_id": 0, "email": 1}).to_list(100)
            notify_emails = [u["email"] for u in users if u.get("email") and u["email"] != mover.get("email")]

        # Also notify assignee if different from mover
        assignee_id = task.get("assignee_id")
        if assignee_id and assignee_id != mover.get("id"):
            assignee = await db.users.find_one({"id": assignee_id}, {"_id": 0, "email": 1})
            if assignee and assignee["email"] not in notify_emails:
                notify_emails.append(assignee["email"])

        if notify_emails:
            await send_task_status_notification(
                task_title=task.get("title", "Untitled"),
                board_name=board.get("name", ""),
                old_status=old_col.get("name", ""),
                new_status=new_col.get("name", ""),
                mover_name=mover.get("name", ""),
                notify_emails=notify_emails,
                site_name=main_site.get("name", "") if main_site else "",
            )
    except Exception as e:
        logger.error(f"Failed to send task status notification: {e}")


# ── Task Comments ──

@task_boards_router.post("/boards/{board_id}/tasks/{task_id}/comments")
async def add_comment(
    board_id: str,
    task_id: str,
    body: CommentCreate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    comment = {
        "id": str(uuid.uuid4()),
        "text": body.text,
        "author_id": current_user.get("id"),
        "author_name": current_user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tasks.update_one(
        {"id": task_id, "board_id": board_id, "main_site_id": main_site_id},
        {"$push": {"comments": comment}},
    )
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return task


# ── Task Attachments ──

@task_boards_router.post("/boards/{board_id}/tasks/{task_id}/attachments")
async def add_attachment(
    board_id: str,
    task_id: str,
    file: UploadFile = File(...),
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    from services.s3_storage import upload_file_to_s3, is_s3_configured, get_s3_url

    content = await file.read()
    
    # Clara Global Protect: scan before upload
    from services.global_protect import check_and_raise
    await check_and_raise(content, file.filename, file.content_type,
        user_id=current_user.get("id"), user_name=current_user.get("name"))
    
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    filename = f"task_{task_id}_{uuid.uuid4().hex[:8]}.{ext}"

    if is_s3_configured():
        s3_key = f"task_attachments/{filename}"
        await upload_file_to_s3(content, s3_key, file.content_type or "application/octet-stream")
        file_url = f"/api/task-boards/attachments/download/{s3_key}"
    else:
        uploads_dir = os.path.join(os.environ.get("UPLOADS_DIR", "/app/backend/uploads"), "task_attachments")
        os.makedirs(uploads_dir, exist_ok=True)
        filepath = os.path.join(uploads_dir, filename)
        with open(filepath, "wb") as f:
            f.write(content)
        file_url = f"/api/uploads/task_attachments/{filename}"

    attachment = {
        "id": str(uuid.uuid4()),
        "name": file.filename,
        "url": file_url,
        "content_type": file.content_type,
        "size": len(content),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.get("name", ""),
    }
    await db.tasks.update_one(
        {"id": task_id, "board_id": board_id, "main_site_id": main_site_id},
        {"$push": {"attachments": attachment}},
    )
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return task


# ── Calendar Sync Config ──

@task_boards_router.get("/calendar-config")
async def get_calendar_config(
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    config = await db.calendar_sync_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    if config:
        config.pop("access_token", None)
        config.pop("refresh_token", None)
    return config or {"provider": None, "connected": False}


@task_boards_router.post("/calendar-config")
async def save_calendar_config(
    body: CalendarSyncConfig,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    config = {
        "main_site_id": main_site_id,
        "provider": body.provider,
        "access_token": body.access_token,
        "refresh_token": body.refresh_token,
        "calendar_id": body.calendar_id,
        "connected": True,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.calendar_sync_configs.update_one(
        {"main_site_id": main_site_id}, {"$set": config}, upsert=True
    )
    return {"status": "connected", "provider": body.provider}


@task_boards_router.delete("/calendar-config")
async def disconnect_calendar(
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    await db.calendar_sync_configs.delete_one({"main_site_id": main_site_id})
    return {"status": "disconnected"}


# ── Attachment Download (S3 presigned URL) ──

@task_boards_router.get("/attachments/download/{file_key:path}")
async def download_attachment(file_key: str):
    """Generate a presigned URL for an S3 attachment and redirect to it."""
    from services.s3_storage import generate_presigned_url, is_s3_configured
    from fastapi.responses import RedirectResponse

    if not is_s3_configured():
        raise HTTPException(status_code=404, detail="S3 not configured")

    try:
        url = await generate_presigned_url(file_key, expiration=3600)
        return RedirectResponse(url=url, status_code=302)
    except Exception as e:
        logger.error(f"Failed to generate presigned URL for {file_key}: {e}")
        raise HTTPException(status_code=404, detail="File not found")


# ── Migrate existing S3 attachment URLs ──

@task_boards_router.post("/migrate-attachment-urls")
async def migrate_attachment_urls(
    current_user: dict = Depends(get_current_user),
):
    """Migrate existing direct S3 URLs in task attachments to use the download proxy.
    This fixes AccessDenied errors for files uploaded before the proxy was implemented."""
    if not current_user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Network admin required")

    from services.s3_storage import S3_ENDPOINT, S3_BUCKET

    s3_prefix = f"{S3_ENDPOINT}/{S3_BUCKET}/"
    proxy_prefix = "/api/task-boards/attachments/download/"

    tasks = await db.tasks.find(
        {"attachments": {"$exists": True, "$ne": []}},
        {"_id": 0, "id": 1, "board_id": 1, "main_site_id": 1, "attachments": 1}
    ).to_list(5000)

    updated = 0
    for task in tasks:
        changed = False
        for att in task.get("attachments", []):
            url = att.get("url", "")
            if url.startswith(s3_prefix):
                s3_key = url[len(s3_prefix):]
                att["url"] = f"{proxy_prefix}{s3_key}"
                changed = True
        if changed:
            await db.tasks.update_one(
                {"id": task["id"]},
                {"$set": {"attachments": task["attachments"]}}
            )
            updated += 1

    return {"migrated_tasks": updated, "total_tasks_with_attachments": len(tasks)}
