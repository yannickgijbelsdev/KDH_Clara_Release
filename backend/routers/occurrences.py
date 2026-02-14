"""Show occurrences routes."""
from fastapi import APIRouter, HTTPException, Depends, status, Request
from fastapi.responses import HTMLResponse
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import jwt

from database import db, JWT_SECRET
from models.series import (
    ShowOccurrenceCreate, ShowOccurrenceUpdate, ShowOccurrenceResponse
)
from models.shows import RundownItemCreate, RundownItemUpdate, RundownItemResponse, ReorderRequest
from services.auth import get_current_user, require_admin, check_occurrence_assignment
from services.websocket import ws_manager
from services.main_site_context import get_main_site_id_from_header

occurrences_router = APIRouter(prefix="/occurrences", tags=["Show Occurrences"])


@occurrences_router.get("", response_model=List[ShowOccurrenceResponse])
async def get_occurrences(
    request: Request,
    series_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get show occurrences with optional filters."""
    # Check for main_site_id header (multisite context)
    main_site_id = await get_main_site_id_from_header(request)
    
    if main_site_id:
        query = {"main_site_id": main_site_id}
    else:
        query = {"team_id": current_user.get('team_id')}
    
    if series_id:
        query["show_series_id"] = series_id
    if status:
        query["status"] = status
    if date_from:
        query["date"] = {"$gte": date_from}
    if date_to:
        if "date" in query:
            query["date"]["$lte"] = date_to
        else:
            query["date"] = {"$lte": date_to}
    
    if current_user.get('role') not in ['admin']:
        user_series = await db.series_assignments.find(
            {"user_id": current_user['id']},
            {"series_id": 1}
        ).to_list(100)
        series_ids = [s['series_id'] for s in user_series]
        
        user_occs = await db.occurrence_assignments.find(
            {"user_id": current_user['id']},
            {"occurrence_id": 1}
        ).to_list(100)
        occ_ids = [o['occurrence_id'] for o in user_occs]
        
        query["$or"] = [
            {"show_series_id": {"$in": series_ids}},
            {"id": {"$in": occ_ids}}
        ]
    
    occurrences = await db.show_occurrences.find(
        query,
        {"_id": 0}
    ).sort("date", 1).to_list(1000)
    
    return occurrences


@occurrences_router.post("", response_model=ShowOccurrenceResponse, status_code=status.HTTP_201_CREATED)
async def create_occurrence(
    occ_data: ShowOccurrenceCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a one-off show occurrence (admin only)."""
    occ_id = str(uuid.uuid4())
    rundown_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    occ_doc = {
        "id": occ_id,
        "team_id": current_user.get('team_id'),
        "show_series_id": occ_data.show_series_id,
        "title": occ_data.title,
        "date": occ_data.date,
        "start_time": occ_data.start_time,
        "end_time": occ_data.end_time,
        "status": occ_data.status,
        "rundown_id": rundown_id,
        "created_at": now,
        "updated_at": now
    }
    
    rundown_doc = {
        "id": rundown_id,
        "occurrence_id": occ_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.show_occurrences.insert_one(occ_doc)
    await db.rundowns.insert_one(rundown_doc)
    
    occ_doc.pop("_id", None)
    return occ_doc


@occurrences_router.get("/{occurrence_id}", response_model=ShowOccurrenceResponse)
async def get_occurrence(
    occurrence_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    return occurrence


@occurrences_router.put("/{occurrence_id}", response_model=ShowOccurrenceResponse)
async def update_occurrence(
    occurrence_id: str,
    occ_data: ShowOccurrenceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an occurrence. Admins and editors can edit any, presenters need assignment."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    # Admins and editors can edit any occurrence
    if current_user.get('role') not in ['admin', 'editor']:
        # Presenters need to be assigned
        has_access = await check_occurrence_assignment(occurrence_id, current_user)
        if not has_access:
            raise HTTPException(status_code=403, detail="Not assigned to this occurrence")
    
    update_dict = {k: v for k, v in occ_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.show_occurrences.update_one(
        {"id": occurrence_id},
        {"$set": update_dict}
    )
    
    updated = await db.show_occurrences.find_one({"id": occurrence_id}, {"_id": 0})
    return updated


@occurrences_router.delete("/{occurrence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_occurrence(
    occurrence_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete an occurrence (admin only)."""
    result = await db.show_occurrences.delete_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    await db.rundowns.delete_many({"occurrence_id": occurrence_id})
    await db.rundown_items_v2.delete_many({"occurrence_id": occurrence_id})
    await db.occurrence_assignments.delete_many({"occurrence_id": occurrence_id})


# Occurrence Rundown Items
@occurrences_router.get("/{occurrence_id}/rundown", response_model=List[RundownItemResponse])
async def get_occurrence_rundown(
    occurrence_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get rundown items for an occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    items = await db.rundown_items_v2.find(
        {"occurrence_id": occurrence_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    
    for item in items:
        item["show_id"] = occurrence_id
    
    return items


@occurrences_router.post("/{occurrence_id}/rundown", response_model=RundownItemResponse, status_code=status.HTTP_201_CREATED)
async def create_occurrence_rundown_item(
    occurrence_id: str,
    item_data: RundownItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a rundown item to an occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    # Admins and editors can edit any occurrence, presenters need assignment
    if current_user.get('role') not in ['admin', 'editor']:
        has_access = await check_occurrence_assignment(occurrence_id, current_user)
        if not has_access:
            raise HTTPException(status_code=403, detail="Not assigned to this occurrence")
    
    last_item = await db.rundown_items_v2.find_one(
        {"occurrence_id": occurrence_id},
        sort=[("order", -1)]
    )
    next_order = (last_item['order'] + 1) if last_item else 0
    
    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    item_doc = {
        "id": item_id,
        "occurrence_id": occurrence_id,
        "show_id": occurrence_id,
        "type": item_data.type,
        "title": item_data.title,
        "notes": item_data.notes or "",
        "duration": item_data.duration or "",
        "order": next_order,
        "created_at": now
    }
    
    await db.rundown_items_v2.insert_one(item_doc)
    item_doc.pop("_id", None)
    
    await ws_manager.broadcast(occurrence_id, {
        "type": "item_created",
        "item": item_doc,
        "user": {"id": current_user['id'], "name": current_user.get('name')}
    })
    
    return item_doc


@occurrences_router.put("/{occurrence_id}/rundown/reorder", response_model=List[RundownItemResponse])
async def reorder_occurrence_rundown(
    occurrence_id: str,
    reorder_data: ReorderRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder rundown items for an occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    if current_user.get('role') != 'admin':
        has_access = await check_occurrence_assignment(occurrence_id, current_user)
        if not has_access:
            raise HTTPException(status_code=403, detail="Not assigned to this occurrence")
    
    for index, item_id in enumerate(reorder_data.item_ids):
        await db.rundown_items_v2.update_one(
            {"id": item_id, "occurrence_id": occurrence_id},
            {"$set": {"order": index}}
        )
    
    items = await db.rundown_items_v2.find(
        {"occurrence_id": occurrence_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    
    for item in items:
        item["show_id"] = occurrence_id
    
    await ws_manager.broadcast(occurrence_id, {
        "type": "items_reordered",
        "item_ids": reorder_data.item_ids,
        "items": items,
        "user": {"id": current_user['id'], "name": current_user.get('name')}
    })
    
    return items


@occurrences_router.put("/{occurrence_id}/rundown/{item_id}", response_model=RundownItemResponse)
async def update_occurrence_rundown_item(
    occurrence_id: str,
    item_id: str,
    item_data: RundownItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a rundown item in an occurrence."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    # Admins and editors can edit any occurrence, presenters need assignment
    if current_user.get('role') not in ['admin', 'editor']:
        has_access = await check_occurrence_assignment(occurrence_id, current_user)
        if not has_access:
            raise HTTPException(status_code=403, detail="Not assigned to this occurrence")
    
    item = await db.rundown_items_v2.find_one({"id": item_id, "occurrence_id": occurrence_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_dict = {k: v for k, v in item_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.rundown_items_v2.update_one(
            {"id": item_id},
            {"$set": update_dict}
        )
    
    updated_item = await db.rundown_items_v2.find_one({"id": item_id}, {"_id": 0})
    updated_item["show_id"] = occurrence_id
    
    await ws_manager.broadcast(occurrence_id, {
        "type": "item_updated",
        "item": updated_item,
        "user": {"id": current_user['id'], "name": current_user.get('name')}
    })
    
    return updated_item


@occurrences_router.delete("/{occurrence_id}/rundown/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_occurrence_rundown_item(
    occurrence_id: str,
    item_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a rundown item from an occurrence. Admin only."""
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    result = await db.rundown_items_v2.delete_one({"id": item_id, "occurrence_id": occurrence_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
    await ws_manager.broadcast(occurrence_id, {
        "type": "item_deleted",
        "item_id": item_id,
        "user": {"id": current_user['id'], "name": current_user.get('name')}
    })


# Print View
@occurrences_router.get("/{occurrence_id}/print", response_class=HTMLResponse)
async def get_rundown_print_view(
    occurrence_id: str,
    token: Optional[str] = None
):
    """Get print-friendly HTML view of a rundown."""
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("user_id")
            current_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
            if not current_user:
                raise HTTPException(status_code=401, detail="Invalid token")
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
    else:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    occurrence = await db.show_occurrences.find_one(
        {"id": occurrence_id, "team_id": current_user.get('team_id')},
        {"_id": 0}
    )
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    
    items = await db.rundown_items_v2.find(
        {"occurrence_id": occurrence_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    
    for item in items:
        media_attachments = await db.rundown_item_media.find(
            {"rundown_item_id": item["id"]},
            {"_id": 0}
        ).to_list(100)
        
        item["media"] = []
        for attachment in media_attachments:
            asset = await db.media_assets.find_one(
                {"id": attachment["media_asset_id"]},
                {"_id": 0}
            )
            if asset:
                item["media"].append(asset)
    
    series_title = None
    if occurrence.get("show_series_id"):
        series = await db.show_series.find_one(
            {"id": occurrence["show_series_id"]},
            {"title": 1}
        )
        if series:
            series_title = series.get("title")
    
    html = generate_occurrence_print_html(occurrence, items, series_title)
    return HTMLResponse(content=html)


def generate_occurrence_print_html(occurrence: dict, items: list, series_title: str = None) -> str:
    """Generate print-friendly HTML for occurrence rundown."""
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    status_labels = {"draft": "Draft", "scheduled": "Scheduled", "completed": "Completed"}
    
    items_html = ""
    for idx, item in enumerate(items, 1):
        media_html = ""
        if item.get("media"):
            media_links = ", ".join([f'{m["title"]} ({m["kind"]})' for m in item["media"]])
            media_html = f'<div class="media-attachments">📎 {media_links}</div>'
        
        notes_html = item.get("notes", "").replace("\n", "<br>") if item.get("notes") else "-"
        
        items_html += f'''
        <tr>
            <td class="order">{idx}</td>
            <td class="type"><span class="type-badge">{item.get("type", "-").upper()}</span></td>
            <td class="title">{item.get("title", "-")}</td>
            <td class="duration">{item.get("duration") or "-"}</td>
            <td class="notes">{notes_html}{media_html}</td>
        </tr>
        '''
    
    series_html = f'<div class="series-title">{series_title}</div>' if series_title else ''
    
    return f'''
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rundown - {occurrence.get("title", "Untitled")}</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12pt; line-height: 1.5; color: #1a1a1a; background: white; padding: 20mm; }}
            .header {{ border-bottom: 3px solid #e11d48; padding-bottom: 20px; margin-bottom: 30px; }}
            .show-title {{ font-size: 24pt; font-weight: bold; margin-bottom: 8px; }}
            .series-title {{ font-size: 14pt; color: #666; margin-bottom: 12px; }}
            .show-meta {{ display: flex; gap: 30px; font-size: 11pt; color: #444; }}
            .show-meta span {{ display: flex; align-items: center; gap: 6px; }}
            .status-badge {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 10pt; font-weight: 600; text-transform: uppercase; }}
            .status-draft {{ background: #f4f4f5; color: #71717a; }}
            .status-scheduled {{ background: #fef3c7; color: #d97706; }}
            .status-completed {{ background: #dcfce7; color: #16a34a; }}
            .rundown-table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
            .rundown-table th {{ background: #f8fafc; padding: 12px 10px; text-align: left; font-weight: 600; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }}
            .rundown-table td {{ padding: 12px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }}
            .rundown-table tr:last-child td {{ border-bottom: none; }}
            .order {{ width: 40px; text-align: center; font-weight: 600; color: #e11d48; }}
            .type {{ width: 80px; }}
            .type-badge {{ display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 9pt; font-weight: 600; background: #fce7f3; color: #be185d; }}
            .title {{ width: 180px; font-weight: 500; }}
            .duration {{ width: 80px; text-align: center; color: #64748b; }}
            .notes {{ font-size: 11pt; color: #475569; }}
            .media-attachments {{ margin-top: 8px; font-size: 10pt; color: #0891b2; }}
            .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10pt; color: #94a3b8; display: flex; justify-content: space-between; }}
            @media print {{ body {{ padding: 10mm; }} .header {{ page-break-after: avoid; }} .rundown-table {{ page-break-inside: auto; }} .rundown-table tr {{ page-break-inside: avoid; page-break-after: auto; }} @page {{ size: A4; margin: 15mm; }} .no-print {{ display: none; }} }}
            .no-print {{ margin-bottom: 20px; }}
            .print-button {{ background: #e11d48; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 500; }}
            .print-button:hover {{ background: #be123c; }}
        </style>
    </head>
    <body>
        <div class="no-print"><button class="print-button" onclick="window.print()">🖨️ Print Rundown</button></div>
        <div class="header">
            <h1 class="show-title">{occurrence.get("title", "Untitled Show")}</h1>
            {series_html}
            <div class="show-meta">
                <span>📅 {occurrence.get("date", "-")}</span>
                <span>🕐 {occurrence.get("start_time", "-")} - {occurrence.get("end_time", "-")}</span>
                <span class="status-badge status-{occurrence.get("status", "draft")}">{status_labels.get(occurrence.get("status", "draft"), "Draft")}</span>
            </div>
        </div>
        <table class="rundown-table">
            <thead><tr><th>#</th><th>Type</th><th>Title</th><th>Duration</th><th>Notes / Script</th></tr></thead>
            <tbody>{items_html if items_html else '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:40px;">No rundown items</td></tr>'}</tbody>
        </table>
        <div class="footer"><span>Generated: {now}</span><span>Radio Show Planner</span></div>
    </body>
    </html>
    '''
