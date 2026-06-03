"""
Enable `clara_publish` (News API publishing) on every main_site that
doesn't have it yet. Idempotent.

Run:
    cd /app && python scripts/enable_clara_publish_everywhere.py
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
log = logging.getLogger("enable_clara_publish")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    sites = await db.main_sites.find({}, {"_id": 0, "id": 1, "name": 1, "enabled_features": 1}).to_list(500)
    updated = 0
    for s in sites:
        feats = s.get("enabled_features") or []
        if "clara_publish" in feats:
            continue
        await db.main_sites.update_one(
            {"id": s["id"]},
            {"$set": {"enabled_features": feats + ["clara_publish"]}},
        )
        log.info("Enabled clara_publish on '%s'", s.get("name"))
        updated += 1

    log.info("✅ Done. %d main sites updated.", updated)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
