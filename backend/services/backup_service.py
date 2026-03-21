"""Backup & Clone Service — Handles backup creation, restore, and site cloning.

Backups are stored as gzipped JSON in S3 under the key:
    backups/{main_site_id}/{backup_id}.json.gz

Metadata is stored in the MongoDB 'backups' collection.
"""
import uuid
import gzip
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from database import db
from services.s3_storage import (
    get_s3_client, S3_BUCKET, is_s3_configured,
)

logger = logging.getLogger(__name__)

# Collections to backup per main_site, grouped by filter type
MAIN_SITE_COLLECTIONS = [
    "sites", "main_site_users", "content_items",
    "wordpress_sites", "shows", "categories", "studios",
    "show_titles", "show_series", "show_occurrences",
    "media_assets", "media_folders", "roles",
    # Configuration collections
    "zerotier_config", "zerotier_member_meta", "zerotier_alerts",
    "canva_config", "audio_triggers",
    "endpoint_settings", "firewall_rules", "firewall_settings",
    "domain_configs", "folder_shares",
    "occurrence_assignments", "series_assignments",
]

TEAM_COLLECTIONS = [
    "rundowns", "rundown_items", "rundown_items_v2",
    "rds_settings", "rds_sequences", "rds_scheduled_texts",
    "shoutcast_settings",
]

CONTENT_LINKED = ["content_item_publishes"]

# Server-type site collections (filtered by main_site_id)
SERVER_COLLECTIONS = [
    "xml_imports", "xml_api_keys", "api_keys", "vmix_configs", "vmix_ticker_messages",
    "task_boards", "task_columns", "tasks",
]

BACKUP_RETENTION_DAYS = 30


async def _get_team_ids(main_site_id: str) -> list:
    """Get all team_ids for sites belonging to a main_site."""
    sites = await db.sites.find(
        {"main_site_id": main_site_id}, {"_id": 0, "team_id": 1}
    ).to_list(500)
    return list({s["team_id"] for s in sites if s.get("team_id")})


async def _collect_backup_data(main_site_id: str) -> dict:
    """Collect all data for a main_site into a serializable dict."""
    data = {}

    # Main site document itself
    ms_doc = await db.main_sites.find_one(
        {"id": main_site_id}, {"_id": 0}
    )
    data["main_sites"] = [ms_doc] if ms_doc else []

    # Team documents
    team_ids = await _get_team_ids(main_site_id)
    teams = await db.teams.find(
        {"id": {"$in": team_ids}}, {"_id": 0}
    ).to_list(500)
    data["teams"] = teams

    # Collections filtered by main_site_id
    for coll_name in MAIN_SITE_COLLECTIONS:
        coll = db[coll_name]
        docs = await coll.find(
            {"main_site_id": main_site_id}, {"_id": 0}
        ).to_list(50000)
        if not docs:
            # Try team_id filter for collections that might use that instead
            docs = await coll.find(
                {"team_id": {"$in": team_ids}}, {"_id": 0}
            ).to_list(50000)
        data[coll_name] = docs

    # Team-filtered collections
    for coll_name in TEAM_COLLECTIONS:
        coll = db[coll_name]
        docs = await coll.find(
            {"team_id": {"$in": team_ids}}, {"_id": 0}
        ).to_list(50000)
        data[coll_name] = docs

    # Content-linked collections
    content_ids = [item["id"] for item in data.get("content_items", [])]
    if content_ids:
        publishes = await db.content_item_publishes.find(
            {"content_item_id": {"$in": content_ids}}, {"_id": 0}
        ).to_list(50000)
        data["content_item_publishes"] = publishes
    else:
        data["content_item_publishes"] = []

    # Server/Technical-specific collections (filtered by main_site_id)
    for coll_name in SERVER_COLLECTIONS:
        coll = db[coll_name]
        docs = await coll.find(
            {"main_site_id": main_site_id}, {"_id": 0}
        ).to_list(50000)
        data[coll_name] = docs

    return data


def _serialize_data(data: dict) -> bytes:
    """Serialize backup data to gzipped JSON bytes."""

    def default_serializer(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    json_str = json.dumps(data, default=default_serializer, ensure_ascii=False)
    return gzip.compress(json_str.encode("utf-8"))


def _deserialize_data(compressed: bytes) -> dict:
    """Decompress and parse backup data."""
    json_str = gzip.decompress(compressed).decode("utf-8")
    return json.loads(json_str)


async def create_backup(
    main_site_id: str,
    backup_type: str = "manual",
    created_by: str = "system",
) -> dict:
    """Create a full backup of a main_site and upload to S3."""
    backup_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    s3_key = f"backups/{main_site_id}/{backup_id}.json.gz"

    main_site = await db.main_sites.find_one(
        {"id": main_site_id}, {"_id": 0, "name": 1}
    )
    site_name = main_site.get("name", "Unknown") if main_site else "Unknown"

    # Create metadata record
    backup_meta = {
        "id": backup_id,
        "main_site_id": main_site_id,
        "main_site_name": site_name,
        "type": backup_type,
        "status": "in_progress",
        "s3_key": s3_key,
        "size_bytes": 0,
        "collections_backed_up": [],
        "document_count": 0,
        "error_message": None,
        "created_at": now.isoformat(),
        "created_by": created_by,
        "expires_at": (now + timedelta(days=BACKUP_RETENTION_DAYS)).isoformat(),
    }
    await db.backups.insert_one({**backup_meta})

    try:
        # Collect data
        data = await _collect_backup_data(main_site_id)

        # Count docs and collection names
        collections_backed_up = []
        total_docs = 0
        for coll_name, docs in data.items():
            if docs:
                collections_backed_up.append(f"{coll_name} ({len(docs)})")
                total_docs += len(docs)

        # Compress and upload to S3
        compressed = _serialize_data(data)
        s3_client = get_s3_client()
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=compressed,
            ContentType="application/gzip",
        )

        # Update metadata
        await db.backups.update_one(
            {"id": backup_id},
            {"$set": {
                "status": "completed",
                "size_bytes": len(compressed),
                "collections_backed_up": collections_backed_up,
                "document_count": total_docs,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )

        logger.info(f"Backup {backup_id} completed: {total_docs} docs, {len(compressed)} bytes")
        backup_meta.update({
            "status": "completed",
            "size_bytes": len(compressed),
            "collections_backed_up": collections_backed_up,
            "document_count": total_docs,
        })
        return backup_meta

    except Exception as e:
        logger.error(f"Backup {backup_id} failed: {e}")
        await db.backups.update_one(
            {"id": backup_id},
            {"$set": {"status": "failed", "error_message": str(e)}},
        )
        backup_meta.update({"status": "failed", "error_message": str(e)})
        return backup_meta


async def restore_backup(
    backup_id: str,
    created_by: str = "system",
) -> dict:
    """Restore a main_site from a backup. Creates a safety backup first."""
    backup = await db.backups.find_one({"id": backup_id}, {"_id": 0})
    if not backup:
        raise ValueError("Backup not found")
    if backup["status"] != "completed":
        raise ValueError("Cannot restore from an incomplete backup")

    main_site_id = backup["main_site_id"]

    # Safety net: create auto-backup before restore
    safety = await create_backup(
        main_site_id, backup_type="pre-restore", created_by=created_by
    )
    if safety["status"] != "completed":
        raise ValueError(f"Pre-restore safety backup failed: {safety.get('error_message')}")

    try:
        # Download backup from S3
        s3_client = get_s3_client()
        response = s3_client.get_object(Bucket=S3_BUCKET, Key=backup["s3_key"])
        compressed = response["Body"].read()
        data = _deserialize_data(compressed)

        team_ids = await _get_team_ids(main_site_id)

        # Delete existing data for this main_site
        for coll_name in MAIN_SITE_COLLECTIONS:
            await db[coll_name].delete_many({"main_site_id": main_site_id})
            await db[coll_name].delete_many({"team_id": {"$in": team_ids}})

        for coll_name in TEAM_COLLECTIONS:
            await db[coll_name].delete_many({"team_id": {"$in": team_ids}})

        # Delete server/technical-specific collections
        for coll_name in SERVER_COLLECTIONS:
            await db[coll_name].delete_many({"main_site_id": main_site_id})

        # Delete content-linked
        content_ids = []
        async for item in db.content_items.find({"main_site_id": main_site_id}, {"_id": 0, "id": 1}):
            content_ids.append(item["id"])
        if content_ids:
            await db.content_item_publishes.delete_many({"content_item_id": {"$in": content_ids}})

        # Delete main_site doc and teams
        await db.main_sites.delete_one({"id": main_site_id})
        await db.teams.delete_many({"id": {"$in": team_ids}})

        # Re-insert all backed up data
        for coll_name, docs in data.items():
            if docs:
                await db[coll_name].insert_many(docs)

        logger.info(f"Restore from backup {backup_id} completed")
        return {
            "status": "completed",
            "backup_id": backup_id,
            "safety_backup_id": safety["id"],
            "main_site_id": main_site_id,
        }

    except Exception as e:
        logger.error(f"Restore from backup {backup_id} failed: {e}")
        raise ValueError(f"Restore failed: {str(e)}")


async def clone_main_site(
    source_main_site_id: str,
    clone_name: str,
    created_by: str = "system",
) -> dict:
    """Clone a main_site with all its data for testing."""
    source_site = await db.main_sites.find_one(
        {"id": source_main_site_id}, {"_id": 0}
    )
    if not source_site:
        raise ValueError("Source main site not found")

    # Collect all data
    data = await _collect_backup_data(source_main_site_id)

    # Generate new IDs
    new_main_site_id = str(uuid.uuid4())
    id_map = {source_main_site_id: new_main_site_id}

    # Map old team_ids to new team_ids
    for team in data.get("teams", []):
        old_id = team["id"]
        id_map[old_id] = str(uuid.uuid4())

    # Map old site IDs to new site IDs
    for site in data.get("sites", []):
        old_id = site["id"]
        id_map[old_id] = str(uuid.uuid4())

    # Map content, WP sites, shows
    for coll_name in ["content_items", "wordpress_sites", "shows",
                       "show_titles", "show_series", "show_occurrences",
                       "studios", "categories", "rundowns",
                       "media_assets", "media_folders",
                       "xml_imports", "api_keys", "vmix_configs", "vmix_ticker_messages"]:
        for doc in data.get(coll_name, []):
            if doc.get("id"):
                id_map[doc["id"]] = str(uuid.uuid4())

    for doc in data.get("content_item_publishes", []):
        if doc.get("id"):
            id_map[doc["id"]] = str(uuid.uuid4())

    def remap_ids(doc: dict) -> dict:
        """Replace known IDs in a document with their new mappings."""
        remapped = {}
        for key, val in doc.items():
            if isinstance(val, str) and val in id_map:
                remapped[key] = id_map[val]
            elif isinstance(val, dict):
                remapped[key] = remap_ids(val)
            elif isinstance(val, list):
                remapped[key] = [
                    remap_ids(item) if isinstance(item, dict)
                    else (id_map.get(item, item) if isinstance(item, str) else item)
                    for item in val
                ]
            else:
                remapped[key] = val
        return remapped

    # Clone main site
    cloned_ms = remap_ids(source_site)
    cloned_ms["id"] = new_main_site_id
    cloned_ms["name"] = clone_name
    cloned_ms["slug"] = f"clone-{source_site.get('slug', 'test')}-{uuid.uuid4().hex[:6]}"
    cloned_ms["created_at"] = datetime.now(timezone.utc).isoformat()
    cloned_ms["cloned_from"] = source_main_site_id
    await db.main_sites.insert_one({**cloned_ms})

    total_docs = 1
    # Clone all other collections
    for coll_name, docs in data.items():
        if coll_name == "main_sites" or not docs:
            continue
        cloned_docs = []
        for doc in docs:
            cloned = remap_ids(doc)
            # Rename sites with [CLONE] prefix
            if coll_name == "sites" and "name" in cloned:
                cloned["name"] = f"[CLONE] {cloned['name']}"
            cloned_docs.append(cloned)
        if cloned_docs:
            await db[coll_name].insert_many(cloned_docs)
            total_docs += len(cloned_docs)

    logger.info(f"Cloned {source_main_site_id} -> {new_main_site_id}: {total_docs} docs")
    return {
        "status": "completed",
        "clone_main_site_id": new_main_site_id,
        "clone_name": clone_name,
        "source_main_site_id": source_main_site_id,
        "document_count": total_docs,
    }


async def delete_clone(clone_main_site_id: str) -> dict:
    """Delete a cloned main site and all its data."""
    ms = await db.main_sites.find_one(
        {"id": clone_main_site_id}, {"_id": 0}
    )
    if not ms:
        raise ValueError("Clone site not found")
    if not ms.get("cloned_from"):
        raise ValueError("This is not a cloned site — cannot delete via this endpoint")

    team_ids = await _get_team_ids(clone_main_site_id)
    deleted = 0

    for coll_name in MAIN_SITE_COLLECTIONS:
        r = await db[coll_name].delete_many({"main_site_id": clone_main_site_id})
        deleted += r.deleted_count
        r = await db[coll_name].delete_many({"team_id": {"$in": team_ids}})
        deleted += r.deleted_count

    for coll_name in TEAM_COLLECTIONS:
        r = await db[coll_name].delete_many({"team_id": {"$in": team_ids}})
        deleted += r.deleted_count

    content_ids = []
    async for item in db.content_items.find({"main_site_id": clone_main_site_id}, {"_id": 0, "id": 1}):
        content_ids.append(item["id"])
    if content_ids:
        r = await db.content_item_publishes.delete_many({"content_item_id": {"$in": content_ids}})
        deleted += r.deleted_count

    await db.teams.delete_many({"id": {"$in": team_ids}})
    await db.main_sites.delete_one({"id": clone_main_site_id})
    deleted += 1

    return {"status": "completed", "documents_deleted": deleted}


async def cleanup_expired_backups():
    """Delete backups older than retention period."""
    now = datetime.now(timezone.utc).isoformat()
    expired = await db.backups.find(
        {"expires_at": {"$lt": now}, "status": "completed"},
        {"_id": 0, "id": 1, "s3_key": 1},
    ).to_list(1000)

    deleted_count = 0
    for backup in expired:
        try:
            s3_client = get_s3_client()
            s3_client.delete_object(Bucket=S3_BUCKET, Key=backup["s3_key"])
        except Exception as e:
            logger.warning(f"Failed to delete S3 object {backup['s3_key']}: {e}")
        await db.backups.delete_one({"id": backup["id"]})
        deleted_count += 1

    if deleted_count:
        logger.info(f"Cleaned up {deleted_count} expired backups")
    return deleted_count


async def run_daily_backup():
    """Run automatic daily backup for all main sites."""
    main_sites = await db.main_sites.find(
        {"cloned_from": {"$exists": False}},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(100)

    results = []
    for site in main_sites:
        result = await create_backup(
            site["id"], backup_type="automatic", created_by="system"
        )
        results.append({
            "site": site["name"],
            "status": result["status"],
            "backup_id": result.get("id"),
        })

    # Also clean up expired
    await cleanup_expired_backups()

    logger.info(f"Daily backup complete: {len(results)} sites processed")
    return results
