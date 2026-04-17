import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from bson import ObjectId
from database import db
from routers.domains import require_system_admin

logger = logging.getLogger(__name__)
data_transfer_router = APIRouter(prefix="/data-transfer", tags=["data-transfer"])

TRANSFER_CATEGORIES = {
    "shows": {"label": "Shows & Schedule", "collections": ["shows", "show_series", "show_titles", "show_occurrences", "series_assignments", "occurrence_assignments", "rundowns", "rundown_items", "rundown_items_v2"]},
    "content": {"label": "Content Library", "collections": ["content_items", "content_item_publishes", "content_item_featured_images", "content_audit_logs", "categories"]},
    "media": {"label": "Media Library", "collections": ["media_assets", "media_folders", "media_share_links", "folder_shares"]},
    "sites": {"label": "Main Sites & Teams", "collections": ["main_sites", "main_site_users", "teams", "environments", "environment_admins"]},
    "users": {"label": "Users & Roles", "collections": ["users", "roles"]},
    "wordpress": {"label": "WordPress Sites", "collections": ["wordpress_sites"]},
    "studios": {"label": "Studios", "collections": ["studios"]},
    "rds": {"label": "RDS Settings", "collections": ["rds_settings", "rds_sequences", "rds_scheduled_texts", "rds_outputs"]},
    "tasks": {"label": "Tasks & Boards", "collections": ["tasks", "task_boards", "task_columns"]},
}

def _serialize_doc(doc):
    if doc is None: return None
    result = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId): result[key] = str(value)
        elif isinstance(value, datetime): result[key] = value.isoformat()
        elif isinstance(value, bytes): result[key] = value.decode("utf-8", errors="replace")
        elif isinstance(value, dict): result[key] = _serialize_doc(value)
        elif isinstance(value, list): result[key] = [_serialize_doc(v) if isinstance(v, dict) else str(v) if isinstance(v, ObjectId) else v for v in value]
        else: result[key] = value
    return result

@data_transfer_router.get("/categories")
async def get_transfer_categories(current_user: dict = Depends(require_system_admin)):
    result = []
    for key, cat in TRANSFER_CATEGORIES.items():
        total = 0
        collection_info = []
        for coll_name in cat["collections"]:
            count = await db[coll_name].count_documents({})
            total += count
            if count > 0: collection_info.append({"name": coll_name, "count": count})
        result.append({"key": key, "label": cat["label"], "total_documents": total, "collections": collection_info})
    return result

@data_transfer_router.post("/export")
async def export_data(body: dict, current_user: dict = Depends(require_system_admin)):
    categories = body.get("categories", [])
    if not categories: raise HTTPException(status_code=400, detail="No categories selected")
    export_data = {"_meta": {"exported_at": datetime.now(timezone.utc).isoformat(), "exported_by": current_user.get("email"), "source": "clara-data-transfer", "version": "1.0", "categories": categories}, "collections": {}}
    total_docs = 0
    for cat_key in categories:
        cat = TRANSFER_CATEGORIES.get(cat_key)
        if not cat: continue
        for coll_name in cat["collections"]:
            docs = await db[coll_name].find({}).to_list(None)
            serialized = [_serialize_doc(doc) for doc in docs]
            if serialized:
                export_data["collections"][coll_name] = serialized
                total_docs += len(serialized)
    export_data["_meta"]["total_documents"] = total_docs
    export_data["_meta"]["total_collections"] = len(export_data["collections"])
    return JSONResponse(content=export_data)

@data_transfer_router.post("/import")
async def import_data(file: UploadFile = File(...), current_user: dict = Depends(require_system_admin)):
    try:
        content = await file.read()
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {e}")
    meta = data.get("_meta", {})
    if meta.get("source") != "clara-data-transfer":
        raise HTTPException(status_code=400, detail="This file is not a valid Clara data transfer export")
    collections_data = data.get("collections", {})
    if not collections_data: raise HTTPException(status_code=400, detail="No data found in export file")
    results = []
    total_imported = 0
    total_skipped = 0
    for coll_name, docs in collections_data.items():
        inserted = 0
        updated = 0
        skipped = 0
        for doc in docs:
            doc.pop("_id", None)
            doc_id = doc.get("id")
            if doc_id:
                result = await db[coll_name].update_one({"id": doc_id}, {"$set": doc}, upsert=True)
                if result.upserted_id: inserted += 1
                elif result.modified_count > 0: updated += 1
                else: skipped += 1
            else:
                try:
                    await db[coll_name].insert_one(doc)
                    inserted += 1
                except Exception: skipped += 1
        total_imported += inserted + updated
        total_skipped += skipped
        results.append({"collection": coll_name, "inserted": inserted, "updated": updated, "skipped": skipped, "total": len(docs)})
    return {"status": "success", "imported": total_imported, "skipped": total_skipped, "source_exported_at": meta.get("exported_at"), "results": results}

@data_transfer_router.post("/preview-import")
async def preview_import(file: UploadFile = File(...), current_user: dict = Depends(require_system_admin)):
    try:
        content = await file.read()
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {e}")
    meta = data.get("_meta", {})
    if meta.get("source") != "clara-data-transfer":
        raise HTTPException(status_code=400, detail="Not a valid Clara export")
    collections_data = data.get("collections", {})
    preview = []
    total_new = 0
    total_update = 0
    for coll_name, docs in collections_data.items():
        new_count = 0
        update_count = 0
        for doc in docs:
            doc_id = doc.get("id")
            if doc_id:
                existing = await db[coll_name].find_one({"id": doc_id}, {"_id": 1})
                if existing: update_count += 1
                else: new_count += 1
            else: new_count += 1
        total_new += new_count
        total_update += update_count
        preview.append({"collection": coll_name, "total": len(docs), "new": new_count, "existing_update": update_count})
    return {"source_meta": meta, "total_new": total_new, "total_update": total_update, "total_documents": total_new + total_update, "collections": preview}
