"""
ProRadio Data Cleanup Migration
================================
Removes deprecated ProRadio sync collections and any ProRadio-related fields
from existing documents. Safe to run multiple times (idempotent).

Run:
    cd /app/backend && python ../scripts/cleanup_proradio_data.py
"""
import asyncio
import os
import sys
import logging

# Allow imports from /app/backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("proradio_cleanup")

PRORADIO_COLLECTIONS = [
    "proradio_sync",
    "proradio_credentials",
    "proradio_logs",
]

PRORADIO_FIELDS = [
    "proradio_synced",
    "proradio_post_id",
    "proradio_sync_status",
    "proradio_last_sync",
    "proradio_error",
]


async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    log.info("Connected to MongoDB db=%s", db_name)

    existing = await db.list_collection_names()

    # 1. Drop ProRadio collections
    dropped = 0
    for col in PRORADIO_COLLECTIONS:
        if col in existing:
            await db.drop_collection(col)
            log.info("Dropped collection: %s", col)
            dropped += 1
    log.info("Dropped %d ProRadio collection(s)", dropped)

    # 2. Strip ProRadio fields from shows
    unset = {f: "" for f in PRORADIO_FIELDS}
    res = await db.shows.update_many(
        {"$or": [{f: {"$exists": True}} for f in PRORADIO_FIELDS]},
        {"$unset": unset},
    )
    log.info("Cleaned ProRadio fields from %d show document(s)", res.modified_count)

    # 3. Remove proradio from clara_integrations / main_sites enabled_integrations if present
    res2 = await db.main_sites.update_many(
        {"enabled_integrations": "proradio"},
        {"$pull": {"enabled_integrations": "proradio"}},
    )
    log.info("Removed 'proradio' from enabled_integrations on %d main_sites", res2.modified_count)

    log.info("✅ ProRadio cleanup complete.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
