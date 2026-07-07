import json
import logging
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from database import db
from routers.domains import require_system_admin

logger = logging.getLogger(__name__)
data_transfer_router = APIRouter(prefix="/data-transfer", tags=["data-transfer"])

UPLOAD_DIR = "/tmp/clara-transfers"
os.makedirs(UPLOAD_DIR, exist_ok=True)

SKIP_COLLECTIONS = {
    "sessions", "rds_cache_logs", "shoutcast_logs", "shoutcast_cache",
    "rds_output_history", "exchange_tokens", "log_read_status",
    "debug_snapshots", "platform_settings", "stale_config",
    "rds_output_states", "audio_trigger_states", "chat_read_status",
    "site_submission_views", "ticket_messages", "ticket_notifications",
    "firewall_blocks", "security_logs", "audit_logs",
}

CONTENT_CHILD_COLLECTIONS = {"content_item_publishes", "content_item_featured_images"}


def _detect_format(data):
    if "_meta" in data and "collections" in data:
        return "wrapped", data.get("collections", {})
    return "flat", {k: v for k, v in data.items() if isinstance(v, list)}


def _load_transfer_file(file_id):
    path = os.path.join(UPLOAD_DIR, f"{file_id}.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Upload not found. Please upload the file again.")
    with open(path, "r") as f:
        return json.load(f)


def _filter_docs_for_site(collections_data, main_site_id):
    site_user_ids = set()
    for doc in collections_data.get("main_site_users", []):
        if doc.get("main_site_id") == main_site_id:
            uid = doc.get("user_id")
            if uid:
                site_user_ids.add(uid)

    site_team_ids = set()
    for doc in collections_data.get("users", []):
        if doc.get("id") in site_user_ids:
            tid = doc.get("team_id")
            if tid:
                site_team_ids.add(tid)

    site_content_ids = set()
    for doc in collections_data.get("content_items", []):
        if doc.get("main_site_id") == main_site_id:
            cid = doc.get("id")
            if cid:
                site_content_ids.add(cid)

    filtered = {}
    for coll_name, docs in collections_data.items():
        if not isinstance(docs, list) or len(docs) == 0:
            continue
        if coll_name in SKIP_COLLECTIONS:
            continue

        matched = []
        for doc in docs:
            if coll_name == "main_sites":
                if doc.get("id") == main_site_id:
                    matched.append(doc)
                continue
            if coll_name == "users":
                if doc.get("id") in site_user_ids:
                    matched.append(doc)
                continue
            if coll_name == "teams":
                if doc.get("id") in site_team_ids:
                    matched.append(doc)
                continue
            if coll_name in CONTENT_CHILD_COLLECTIONS:
                if doc.get("content_item_id") in site_content_ids:
                    matched.append(doc)
                continue
            if "main_site_id" in doc:
                if doc["main_site_id"] == main_site_id:
                    matched.append(doc)
                continue
            if "team_id" in doc:
                if doc["team_id"] in site_team_ids:
                    matched.append(doc)
                continue

        if matched:
            filtered[coll_name] = matched
    return filtered


@data_transfer_router.post("/upload")
async def upload_export_file(file: UploadFile = File(...), current_user: dict = Depends(require_system_admin)):
    try:
        content = await file.read()
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Ongeldig JSON bestand: {e}")

    fmt, collections_data = _detect_format(data)
    main_sites_docs = collections_data.get("main_sites", [])
    if not main_sites_docs:
        raise HTTPException(status_code=400, detail="No main sites found")

    file_id = str(uuid.uuid4())
    path = os.path.join(UPLOAD_DIR, f"{file_id}.json")
    with open(path, "w") as f:
        json.dump(data, f)

    sites_summary = []
    for site in main_sites_docs:
        site_id = site.get("id")
        filtered = _filter_docs_for_site(collections_data, site_id)
        total_docs = sum(len(docs) for docs in filtered.values())
        collection_counts = {k: len(v) for k, v in filtered.items() if len(v) > 0}
        user_count = len([d for d in collections_data.get("main_site_users", []) if d.get("main_site_id") == site_id])

        sites_summary.append({
            "id": site_id,
            "name": site.get("name", "Unknown"),
            "slug": site.get("slug", ""),
            "logo_url": site.get("logo_url", ""),
            "user_count": user_count,
            "total_documents": total_docs,
            "collection_count": len(collection_counts),
            "top_collections": dict(sorted(collection_counts.items(), key=lambda x: -x[1])[:10]),
        })

    return {"file_id": file_id, "format": fmt, "total_collections": len(collections_data), "sites": sites_summary}


@data_transfer_router.post("/preview-site")
async def preview_site_import(body: dict, current_user: dict = Depends(require_system_admin)):
    file_id = body.get("file_id")
    site_id = body.get("site_id")
    if not file_id or not site_id:
        raise HTTPException(status_code=400, detail="file_id and site_id are required")

    data = _load_transfer_file(file_id)
    _, collections_data = _detect_format(data)
    filtered = _filter_docs_for_site(collections_data, site_id)

    preview = []
    total_new = 0
    total_update = 0
    for coll_name, docs in filtered.items():
        new_count = 0
        update_count = 0
        for doc in docs:
            doc_id = doc.get("id")
            if doc_id:
                existing = await db[coll_name].find_one({"id": doc_id}, {"_id": 0, "id": 1})
                if existing:
                    update_count += 1
                else:
                    new_count += 1
            else:
                new_count += 1
        total_new += new_count
        total_update += update_count
        preview.append({"collection": coll_name, "total": len(docs), "new": new_count, "existing_update": update_count})

    return {"site_id": site_id, "total_new": total_new, "total_update": total_update, "total_documents": total_new + total_update, "collections": sorted(preview, key=lambda x: -x["total"])}


@data_transfer_router.post("/import-site")
async def import_site(body: dict, current_user: dict = Depends(require_system_admin)):
    file_id = body.get("file_id")
    site_id = body.get("site_id")
    if not file_id or not site_id:
        raise HTTPException(status_code=400, detail="file_id and site_id are required")

    data = _load_transfer_file(file_id)
    _, collections_data = _detect_format(data)
    filtered = _filter_docs_for_site(collections_data, site_id)

    results = []
    total_imported = 0
    total_skipped = 0

    # Get existing environment IDs and default env for remapping
    existing_env_ids = set()
    default_env_id = None
    async for env in db.environments.find({}, {"_id": 0, "id": 1, "is_default": 1}):
        existing_env_ids.add(env["id"])
        if env.get("is_default"):
            default_env_id = env["id"]
    if not default_env_id and existing_env_ids:
        default_env_id = next(iter(existing_env_ids))

    for coll_name, docs in filtered.items():
        inserted = 0
        updated = 0
        skipped = 0
        for doc in docs:
            doc.pop("_id", None)

            # Remap environment_id on main_sites if it doesn't exist locally
            if coll_name == "main_sites" and default_env_id:
                if doc.get("environment_id") not in existing_env_ids:
                    doc["environment_id"] = default_env_id

            doc_id = doc.get("id")
            if doc_id:
                try:
                    result = await db[coll_name].update_one({"id": doc_id}, {"$set": doc}, upsert=True)
                    if result.upserted_id:
                        inserted += 1
                    elif result.modified_count > 0:
                        updated += 1
                    else:
                        skipped += 1
                except Exception as e:
                    logger.warning(f"Error importing {coll_name} doc {doc_id}: {e}")
                    skipped += 1
            else:
                try:
                    await db[coll_name].insert_one(doc)
                    inserted += 1
                except Exception:
                    skipped += 1
        total_imported += inserted + updated
        total_skipped += skipped
        results.append({"collection": coll_name, "inserted": inserted, "updated": updated, "skipped": skipped, "total": len(docs)})

    return {"status": "success", "site_id": site_id, "total_imported": total_imported, "total_skipped": total_skipped, "results": sorted(results, key=lambda x: -x["total"])}


@data_transfer_router.post("/cleanup")
async def cleanup_upload(body: dict, current_user: dict = Depends(require_system_admin)):
    file_id = body.get("file_id")
    if not file_id:
        raise HTTPException(status_code=400, detail="file_id is required")
    path = os.path.join(UPLOAD_DIR, f"{file_id}.json")
    if os.path.exists(path):
        os.remove(path)
    return {"status": "ok"}
