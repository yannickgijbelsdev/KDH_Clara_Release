#!/usr/bin/env python3
"""Focused backend verification for the RDS/show-cover inheritance bug.

Test plan:
- Create isolated team-scoped show templates with S3-like cover metadata.
- Verify new recurring and non-recurring shows do not persist the template image.
- Verify enabling recurrence does not copy template image, but does copy a true
  per-show image from the parent.
- Seed station-specific active RDS cache entries and verify the public RDS image
  endpoints choose per-show image first, template fallback second, and empty PNG
  when no image exists.
"""

from __future__ import annotations

import io
import json
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
import jwt
from dotenv import load_dotenv
from PIL import Image
from pymongo import MongoClient


ROOT = Path("/app")
load_dotenv(ROOT / "backend" / ".env")

BASE_URL = os.environ.get("TEST_BACKEND_URL", "http://localhost:8001/api").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]

RUN_ID = f"qa-cover-{int(time.time())}-{uuid.uuid4().hex[:6]}"
STATION = f"qa{uuid.uuid4().hex[:6]}"
PASSWORD = "QAcover123!"

TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe"
    b"A\xd5\x89\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


class CheckFailure(AssertionError):
    pass


class Runner:
    def __init__(self) -> None:
        self.client = MongoClient(MONGO_URL)
        self.db = self.client[DB_NAME]
        # Best-effort cleanup of stale artifacts from interrupted prior runs.
        self.db.users.delete_many({"email": {"$regex": "^qa-cover-.*@example\\.com$"}})
        self.db.teams.delete_many({"name": {"$regex": "^QA Cover Team qa-cover-"}})
        self.db.shows.delete_many({"title": {"$regex": "^qa-cover-"}})
        self.db.show_titles.delete_many({"name": {"$regex": "^qa-cover-"}})
        self.db.rds_cached_rundowns.delete_many({"rds_station": {"$regex": "^qa[0-9a-f]{6}$"}})
        self.session = requests.Session()
        self.token = None
        self.user = None
        self.team_id = None
        self.created_show_ids: list[str] = []
        self.created_title_ids: list[str] = []
        self.uploaded_s3_keys: list[str] = []
        self.results: list[dict] = []
        self.failures: list[str] = []

    def record(self, name: str, ok: bool, detail: str, data: dict | None = None) -> None:
        entry = {"name": name, "ok": ok, "detail": detail, "data": data or {}}
        self.results.append(entry)
        print(("PASS" if ok else "FAIL") + f" - {name}: {detail}")
        if not ok:
            self.failures.append(f"{name}: {detail}")

    def require(self, condition: bool, message: str) -> None:
        if not condition:
            raise CheckFailure(message)

    def request(self, method: str, path: str, **kwargs) -> requests.Response:
        url = f"{BASE_URL}{path}"
        resp = self.session.request(method, url, timeout=40, **kwargs)
        return resp

    def api_json(self, method: str, path: str, expected: int | tuple[int, ...] = (200,), **kwargs):
        if isinstance(expected, int):
            expected = (expected,)
        resp = self.request(method, path, **kwargs)
        if resp.status_code not in expected:
            raise CheckFailure(f"{method} {path} returned {resp.status_code}: {resp.text[:500]}")
        if resp.text:
            return resp.json()
        return None

    def setup_auth(self) -> None:
        # Seed an isolated team admin directly to avoid unrelated registration
        # side effects (email notifications) slowing down this focused test.
        email = f"{RUN_ID}@example.com"
        now = datetime.now(timezone.utc).isoformat()
        self.team_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        self.db.teams.insert_one({"id": self.team_id, "name": f"QA Cover Team {RUN_ID}", "created_at": now})
        self.user = {
            "id": user_id,
            "email": email,
            "name": "QA Cover Tester",
            "role": "admin",
            "team_id": self.team_id,
            "created_at": now,
            "is_network_admin": False,
            "is_system_admin": False,
            "is_blocked": False,
        }
        self.db.users.insert_one(dict(self.user))
        self.token = jwt.encode(
            {"user_id": user_id, "exp": datetime.now(timezone.utc).timestamp() + 3600},
            JWT_SECRET,
            algorithm="HS256",
        )
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        self.require(bool(self.team_id), "registered test admin did not receive a team_id")
        self.record("seed isolated admin auth context", True, f"team_id={self.team_id}")

    def create_title(self, suffix: str, image_url: str | None = None) -> dict:
        name = f"{RUN_ID}-{suffix}"
        title = self.api_json(
            "POST",
            "/shows/titles",
            expected=201,
            json={
                "name": name,
                "description": "QA template for RDS cover bug verification",
                "default_start_time": "10:00",
                "default_end_time": "11:00",
                "rds_station": STATION,
                "default_presenter_ids": [],
            },
        )
        self.created_title_ids.append(title["id"])
        if image_url:
            image_doc = {
                "file_key": f"show_titles/{self.team_id}/{title['id']}.png",
                "s3_url": image_url,
                "filename": f"{suffix}.png",
                "mime_type": "image/png",
                "size": len(TINY_PNG),
            }
            self.db.show_titles.update_one({"id": title["id"]}, {"$set": {"image": image_doc}})
            title["image"] = image_doc
        return title

    def create_show(self, title: str, suffix_days: int = 0, recurring: bool = False, status: str = "scheduled") -> dict:
        base_date = datetime.now(timezone.utc).date() + timedelta(days=3 + suffix_days)
        payload = {
            "title": title,
            "description": "QA show for cover inheritance verification",
            "date": base_date.isoformat(),
            "start_time": "10:00",
            "end_time": "11:00",
            "status": status,
            "studio_id": None,
            "presenter_ids": [],
            "recurrence_type": "weekly" if recurring else "none",
            "recurrence_interval": 1,
            "recurrence_end_date": (base_date + timedelta(days=14)).isoformat() if recurring else None,
            "has_video": False,
            "blocks_room": False,
        }
        show = self.api_json("POST", "/shows", expected=201, json=payload)
        self.created_show_ids.append(show["id"])
        if recurring:
            children = list(self.db.shows.find({"parent_show_id": show["id"]}, {"_id": 0, "id": 1}))
            self.created_show_ids.extend([c["id"] for c in children])
        return show

    def fetch_show(self, show_id: str) -> dict:
        return self.api_json("GET", f"/shows/{show_id}", expected=200)

    def assert_show_has_no_image(self, show_id: str, context: str) -> None:
        api_show = self.fetch_show(show_id)
        db_show = self.db.shows.find_one({"id": show_id}, {"_id": 0})
        self.require(api_show.get("image") is None, f"{context}: GET /shows/{show_id} image is not null: {api_show.get('image')}")
        self.require(("image" not in db_show) or db_show.get("image") is None, f"{context}: DB show has copied image: {db_show.get('image')}")

    def upload_show_image(self, show_id: str, filename: str) -> dict:
        files = {"file": (filename, TINY_PNG, "image/png")}
        data = self.api_json("POST", f"/shows/{show_id}/image", expected=200, files=files)
        image = data.get("image") or {}
        self.require(image.get("s3_url"), f"show image upload did not return s3_url: {image}")
        if image.get("file_storage_key"):
            self.uploaded_s3_keys.append(image["file_storage_key"])
        return image

    def set_show_image(self, show_id: str, image_url: str, filename: str = "legacy.png") -> dict:
        image_doc = {
            "file_storage_key": f"shows/{self.team_id}/{show_id}.png",
            "s3_url": image_url,
            "file_name": filename,
            "mime_type": "image/png",
            "size": len(TINY_PNG),
        }
        self.db.shows.update_one({"id": show_id}, {"$set": {"image": image_doc}})
        return image_doc

    def cache_live(self, show_id: str, title: str, show_image: dict | None = None) -> None:
        self.db.rds_cached_rundowns.delete_many({"rds_station": STATION})
        show = self.db.shows.find_one({"id": show_id}, {"_id": 0}) or {}
        doc = {
            "id": str(uuid.uuid4()),
            "show_id": show_id,
            "show_title": title,
            "show_date": show.get("date", datetime.now(timezone.utc).date().isoformat()),
            "show_start_time": show.get("start_time", "10:00"),
            "show_end_time": show.get("end_time", "11:00"),
            "items": [],
            "cached_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True,
            "rds_station": STATION,
            "team_id": self.team_id,
        }
        if show_image is not None:
            doc["show_image"] = show_image
        self.db.rds_cached_rundowns.insert_one(doc)

    def run_required_checks(self) -> None:
        template_url = f"https://nbg1.your-objectstorage.com/koodh-clara/show_titles/{RUN_ID}/template.png"

        # 1. Recurring weekly show matching a template with image must not copy it.
        title_rec = self.create_title("recurring-template", template_url)
        rec_show = self.create_show(title_rec["name"], suffix_days=0, recurring=True)
        self.assert_show_has_no_image(rec_show["id"], "recurring parent")
        rec_docs = list(self.db.shows.find({"$or": [{"id": rec_show["id"]}, {"parent_show_id": rec_show["id"]}]}, {"_id": 0, "id": 1, "image": 1}))
        self.require(len(rec_docs) >= 2, f"recurring show generated too few occurrences: {len(rec_docs)}")
        for doc in rec_docs:
            self.require(("image" not in doc) or doc.get("image") is None, f"recurring occurrence {doc['id']} copied template image")
        self.record("POST /shows weekly recurrence does not copy template image", True, f"checked {len(rec_docs)} parent/child docs")

        # 2. Non-recurring show matching a template with image must not copy it.
        title_single = self.create_title("single-template", template_url.replace("template", "template-single"))
        single_show = self.create_show(title_single["name"], suffix_days=1, recurring=False)
        self.assert_show_has_no_image(single_show["id"], "non-recurring show")
        self.record("POST /shows non-recurring does not copy template image", True, f"show_id={single_show['id']}")

        # 3. Enable recurrence on a show WITHOUT own image must not copy the template image.
        title_enable_no_img = self.create_title("enable-no-own-image", template_url.replace("template", "template-enable"))
        enable_no_img_show = self.create_show(title_enable_no_img["name"], suffix_days=2, recurring=False)
        base_date = datetime.fromisoformat(enable_no_img_show["date"]).date()
        self.api_json("POST", f"/shows/{enable_no_img_show['id']}/enable-recurrence?recurrence_interval=1&recurrence_end_date={(base_date + timedelta(days=14)).isoformat()}", expected=200)
        no_img_children = list(self.db.shows.find({"parent_show_id": enable_no_img_show["id"]}, {"_id": 0, "id": 1, "image": 1}))
        self.require(len(no_img_children) >= 1, "enable-recurrence without image generated no child occurrences")
        for child in no_img_children:
            self.require(("image" not in child) or child.get("image") is None, f"enable-recurrence child {child['id']} copied template image")
        self.created_show_ids.extend([c["id"] for c in no_img_children])
        self.record("enable-recurrence without parent image does not copy template image", True, f"checked {len(no_img_children)} children")

        # 4. Enable recurrence on a show WITH own uploaded image should propagate it.
        title_enable_own = self.create_title("enable-own-image", template_url.replace("template", "template-own"))
        enable_own_show = self.create_show(title_enable_own["name"], suffix_days=3, recurring=False)
        parent_image = self.upload_show_image(enable_own_show["id"], "parent-own-cover.png")
        own_base_date = datetime.fromisoformat(enable_own_show["date"]).date()
        self.api_json("POST", f"/shows/{enable_own_show['id']}/enable-recurrence?recurrence_interval=1&recurrence_end_date={(own_base_date + timedelta(days=14)).isoformat()}", expected=200)
        own_children = list(self.db.shows.find({"parent_show_id": enable_own_show["id"]}, {"_id": 0, "id": 1, "image": 1}))
        self.require(len(own_children) >= 1, "enable-recurrence with image generated no child occurrences")
        for child in own_children:
            self.require(child.get("image", {}).get("s3_url") == parent_image.get("s3_url"), f"child {child['id']} did not inherit parent's per-show image")
        self.created_show_ids.extend([c["id"] for c in own_children])
        self.record("enable-recurrence propagates parent per-show uploaded image", True, f"checked {len(own_children)} children")

        # 5. RDS resolver falls back to template when show has no image.
        self.cache_live(single_show["id"], title_single["name"])
        img_json = self.api_json("GET", f"/rds/{STATION}/image", expected=200)
        url_json = self.api_json("GET", f"/rds/{STATION}/image-url.json", expected=200)
        self.require(img_json.get("has_image") is True and img_json.get("image_url") == title_single["image"]["s3_url"], f"/image did not return template fallback: {img_json}")
        self.require(url_json.get("value") == title_single["image"]["s3_url"], f"/image-url.json did not return template fallback: {url_json}")
        self.record("RDS image endpoints use template fallback when show has no image", True, title_single["image"]["s3_url"])

        # 6. RDS resolver returns per-show image when both show and template have one.
        self.cache_live(enable_own_show["id"], title_enable_own["name"])
        own_img_json = self.api_json("GET", f"/rds/{STATION}/image", expected=200)
        own_url_json = self.api_json("GET", f"/rds/{STATION}/image-url.json", expected=200)
        self.require(own_img_json.get("image_url") == parent_image.get("s3_url"), f"/image did not prefer per-show image: {own_img_json}")
        self.require(own_url_json.get("value") == parent_image.get("s3_url"), f"/image-url.json did not prefer per-show image: {own_url_json}")
        self.record("RDS image endpoints prefer per-show image over template", True, parent_image.get("s3_url"))

        # 7. No image anywhere returns 1x1 PNG with HTTP 200 for /image.jpg.
        title_empty = self.create_title("no-image-anywhere", None)
        no_image_show = self.create_show(title_empty["name"], suffix_days=4, recurring=False)
        self.cache_live(no_image_show["id"], title_empty["name"])
        resp = self.request("GET", f"/rds/{STATION}/image.jpg", allow_redirects=False)
        self.require(resp.status_code == 200, f"image.jpg without images returned {resp.status_code}")
        self.require(resp.headers.get("content-type", "").startswith("image/png"), f"image.jpg returned non-PNG content-type {resp.headers.get('content-type')}")
        with Image.open(io.BytesIO(resp.content)) as im:
            self.require(im.size == (1, 1), f"empty image placeholder size was {im.size}, expected (1, 1)")
        self.record("RDS image.jpg no-image fallback is 1x1 PNG with HTTP 200", True, f"bytes={len(resp.content)}")

        # 8. Legacy baked-in image field on show still surfaces correctly.
        title_legacy = self.create_title("legacy-baked-image", None)
        legacy_show = self.create_show(title_legacy["name"], suffix_days=5, recurring=False)
        legacy_url = f"https://nbg1.your-objectstorage.com/koodh-clara/shows/{RUN_ID}/legacy.png"
        self.set_show_image(legacy_show["id"], legacy_url, "legacy.png")
        self.cache_live(legacy_show["id"], title_legacy["name"])
        legacy_img_json = self.api_json("GET", f"/rds/{STATION}/image", expected=200)
        legacy_url_json = self.api_json("GET", f"/rds/{STATION}/image-url.json", expected=200)
        self.require(legacy_img_json.get("image_url") == legacy_url, f"legacy /image did not return show.image: {legacy_img_json}")
        self.require(legacy_url_json.get("value") == legacy_url, f"legacy /image-url.json did not return show.image: {legacy_url_json}")
        self.record("RDS resolver supports legacy baked-in show.image", True, legacy_url)

    def cleanup(self) -> None:
        try:
            for key in self.uploaded_s3_keys:
                try:
                    import boto3
                    from botocore.config import Config
                    boto3.client(
                        "s3",
                        endpoint_url=os.environ.get("S3_ENDPOINT"),
                        aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
                        aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),
                        region_name=os.environ.get("S3_REGION"),
                        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
                    ).delete_object(Bucket=os.environ.get("S3_BUCKET"), Key=key)
                except Exception as exc:
                    print(f"WARN - S3 cleanup failed for {key}: {exc}")
            self.db.rds_cached_rundowns.delete_many({"rds_station": STATION})
            self.db.shows.delete_many({"$or": [{"id": {"$in": self.created_show_ids}}, {"title": {"$regex": f"^{RUN_ID}"}}]})
            self.db.show_titles.delete_many({"name": {"$regex": f"^{RUN_ID}"}})
            if self.user:
                self.db.users.delete_one({"id": self.user["id"]})
                self.db.sessions.delete_many({"user_id": self.user["id"]})
            if self.team_id:
                self.db.teams.delete_one({"id": self.team_id})
            self.db.audit_logs.delete_many({"user_email": f"{RUN_ID}@example.com"})
        except Exception as exc:  # cleanup best effort
            print(f"WARN - cleanup failed: {exc}")

    def run(self) -> int:
        try:
            self.setup_auth()
            self.run_required_checks()
        except Exception as exc:
            self.record("unexpected failure", False, repr(exc))
        finally:
            self.cleanup()
        print("\nRESULTS_JSON=" + json.dumps({"run_id": RUN_ID, "station": STATION, "failures": self.failures, "results": self.results}, indent=2))
        return 1 if self.failures else 0


if __name__ == "__main__":
    sys.exit(Runner().run())