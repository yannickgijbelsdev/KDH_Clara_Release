"""
Zero Trust Encryption Migration
================================
Encrypts already-stored sensitive fields in MongoDB using the
SECURITY_ENCRYPTION_KEY. Idempotent — running it twice is safe.

Currently migrates:
  - wordpress_sites.app_password
  - clara_integrations.shared_secret

Run:
    cd /app/backend && python ../scripts/encrypt_existing_secrets.py
"""
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

from services.security.encryption import encrypt, is_encrypted, is_available  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("encrypt_migration")

TARGETS = [
    ("wordpress_sites", "app_password"),
    ("clara_integrations", "shared_secret"),
]


async def main():
    if not is_available():
        log.error("SECURITY_ENCRYPTION_KEY missing — cannot encrypt. Aborting.")
        return

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    grand_total = 0
    for collection, field in TARGETS:
        cursor = db[collection].find({field: {"$exists": True, "$ne": None}}, {"_id": 1, "id": 1, field: 1})
        migrated = 0
        skipped = 0
        async for doc in cursor:
            value = doc.get(field)
            if not value or not isinstance(value, str):
                continue
            if is_encrypted(value):
                skipped += 1
                continue
            new_val = encrypt(value)
            await db[collection].update_one({"_id": doc["_id"]}, {"$set": {field: new_val}})
            migrated += 1
        log.info(
            "Collection=%s field=%s migrated=%d already_encrypted=%d",
            collection, field, migrated, skipped,
        )
        grand_total += migrated

    log.info("✅ Encryption migration complete. Newly encrypted: %d", grand_total)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
