"""Task Board Router — Kanban boards with tasks, columns, and calendar sync."""
import uuid
import os
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from database import db
from services.auth import get_current_user
from services.main_site_context import get_main_site_id_from_header
import logging

logger = logging.getLogger(__name__)

task_boards_router = APIRouter(prefix="/task-boards", tags=["task-boards"])


# ── Models ──

class BoardCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#f59e0b"


class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


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
    # Add task count per board
    for board in boards:
        board["task_count"] = await db.tasks.count_documents({"board_id": board["id"], "main_site_id": main_site_id})
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
    await db.tasks.update_one(
        {"id": task_id, "board_id": board_id, "main_site_id": main_site_id},
        {"$set": {"column_id": body.column_id, "order": body.order, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return task


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
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    filename = f"task_{task_id}_{uuid.uuid4().hex[:8]}.{ext}"

    if is_s3_configured():
        s3_key = f"task_attachments/{filename}"
        upload_file_to_s3(content, s3_key, file.content_type or "application/octet-stream")
        file_url = get_s3_url(s3_key)
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
