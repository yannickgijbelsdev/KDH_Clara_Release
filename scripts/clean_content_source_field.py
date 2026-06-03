"""
Clean stale `source` values on content_items.

Until now, content carried a hardcoded `source` string (often "MFY" or "GRK")
that was completely independent of the main site's RDS station configuration.
That's the root cause of "phantom MFY/GRK options" showing up in the Content
Library source filter for main sites that don't even have those stations.

This migration:
  1. Lists every distinct (main_site_id, source) pair currently in use.
  2. For each main site, keeps `source` only when it matches one of the
     site's configured `rds_stations` (by code OR name, case-insensitive).
  3. Everything else is unset → forces the admin to re-tag via the new
     dynamic UI (drives off `rds_stations` per main site).

Idempotent. Run:
    cd /app && python scripts/clean_content_source_field.py
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
log = logging.getLogger("clean_source")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # Build a per-site allow-list of accepted source values (codes + names,
    # both lowercased for matching).
    allowed_per_site: dict[str, set[str]] = {}
    stations = await db.rds_stations.find({}, {"_id": 0, "main_site_id": 1, "code": 1, "name": 1}).to_list(2000)
    for st in stations:
        msid = st.get("main_site_id")
        if not msid:
            continue
        bucket = allowed_per_site.setdefault(msid, set())
        if st.get("code"):
            bucket.add(st["code"].lower())
        if st.get("name"):
            bucket.add(st["name"].lower())

    # Walk every content item that has a source set
    cursor = db.content_items.find(
        {"source": {"$exists": True, "$ne": None, "$ne": ""}},
        {"_id": 1, "main_site_id": 1, "source": 1},
    )

    kept = 0
    cleared = 0
    async for doc in cursor:
        src = (doc.get("source") or "").strip()
        msid = doc.get("main_site_id")
        if not src:
            continue
        allowed = allowed_per_site.get(msid, set())
        if src.lower() in allowed:
            kept += 1
            continue
        await db.content_items.update_one(
            {"_id": doc["_id"]},
            {"$unset": {"source": ""}},
        )
        cleared += 1

    log.info("✅ Source cleanup complete. Kept=%d Cleared=%d", kept, cleared)

    # Sanity report: what sources remain per site?
    pipeline = [
        {"$match": {"source": {"$ne": None, "$ne": ""}}},
        {"$group": {"_id": {"site": "$main_site_id", "source": "$source"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    sites = {s["id"]: s["slug"] for s in await db.main_sites.find({}, {"_id": 0, "id": 1, "slug": 1}).to_list(50)}
    log.info("Remaining sources after cleanup:")
    rows = await db.content_items.aggregate(pipeline).to_list(100)
    if not rows:
        log.info("  (none — all content is clean)")
    for r in rows:
        key = r.get("_id") or {}
        site_id = key.get("site")
        src = key.get("source")
        slug = sites.get(site_id, "?")
        log.info("  site=%-15s source=%-20s count=%d", slug, repr(src), r["count"])

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
