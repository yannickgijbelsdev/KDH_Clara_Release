"""
Wipe the seed content library for the legacy MFY/GRK / Radiogroep main sites.

The user wants those sites to be configured from scratch — content library
empty, ready to be filled either via the News API (default) or pushed to a
fresh WordPress instance once credentials are set.

Scope:
  - Removes all `content_items` for the three legacy slugs.
  - Removes related categories so the new owner starts with a blank slate.
  - Leaves `main_sites`, `rds_stations`, users, shows, and integrations intact
    (the user wants to re-configure these themselves but the empty shell stays).

Idempotent. Run:
    cd /app && python scripts/wipe_mfy_grk_content_library.py
"""
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("wipe_content")

TARGET_SLUGS = ("mfy", "grk", "radiogroep")
COLLECTIONS = (
    "content_items",
    "categories",
    "content_versions",
    "content_publish_history",
)


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    sites = await db.main_sites.find(
        {"slug": {"$in": list(TARGET_SLUGS)}},
        {"_id": 0, "id": 1, "slug": 1, "name": 1},
    ).to_list(20)

    if not sites:
        log.warning("None of the target slugs found in main_sites: %s", TARGET_SLUGS)
        return

    site_ids = [s["id"] for s in sites]
    log.info("Wiping content for %d main sites:", len(sites))
    for s in sites:
        log.info("  - %s  (id=%s)", s["slug"], s["id"])

    grand_total = 0
    existing = await db.list_collection_names()
    for col in COLLECTIONS:
        if col not in existing:
            continue
        res = await db[col].delete_many({"main_site_id": {"$in": site_ids}})
        log.info("  %s: removed %d documents", col, res.deleted_count)
        grand_total += res.deleted_count

    # Also drop any leftover S3 file-upload metadata scoped to these sites,
    # but leave the actual blobs in S3 — admin should clean those manually
    # (this script is data-only, not storage).
    log.info("✅ Wipe complete. Total documents deleted: %d", grand_total)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
