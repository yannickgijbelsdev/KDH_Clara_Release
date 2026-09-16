"""Iteration 170 retest — verifies two fixes on top of iteration_169:

  (A) GET /api/rds/{station}/image.jpg 302 target must be **absolute**
      `/api/rds/{station}/presenter-composite.png` (not relative).

  (B) `_extract_avatar_url` now handles the modern `avatar` sub-document
      (`avatar.file_key` and `avatar.s3_url`), not just legacy top-level
      `avatar_url`. Local `/uploads/avatars/{file_key}` avatars are read
      from disk (no self-HTTP). Mixed populations should composite too.

  (C) Regression: two show_titles with the same name still both succeed.
  (D) Regression: NO presenter avatars in any format → placeholder 200.
"""
import os
import io
import uuid
import shutil
import asyncio
from pathlib import Path

import pytest
import requests
from PIL import Image
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "63154708-3320-444c-932d-aa3642b5090c"
STATION = "grk"
UPLOADS_AVATARS = Path("/app/backend/uploads/avatars")

TAG = f"TEST170_{uuid.uuid4().hex[:6]}"


# --- fixtures ---------------------------------------------------------------

@pytest.fixture(scope="module")
def mongo():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=30)
    r.raise_for_status()
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Main-Site-ID": MAIN_SITE_ID,
    }


@pytest.fixture(scope="module")
def created():
    return {"title_ids": [], "show_ids": [], "user_ids": [],
            "cache_ids": [], "avatar_files": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(created, mongo):
    """Also restores any live rundowns we deactivated during tests."""
    yield
    async def _cleanup():
        if created["title_ids"]:
            await mongo.show_titles.delete_many({"id": {"$in": created["title_ids"]}})
        if created["show_ids"]:
            await mongo.shows.delete_many({"id": {"$in": created["show_ids"]}})
        if created["user_ids"]:
            await mongo.users.delete_many({"id": {"$in": created["user_ids"]}})
        if created["cache_ids"]:
            await mongo.rds_cached_rundowns.delete_many({"id": {"$in": created["cache_ids"]}})
        # restore anything we had marked
        await mongo.rds_cached_rundowns.update_many(
            {"_test170_was_active": True},
            {"$set": {"is_active": True}, "$unset": {"_test170_was_active": ""}},
        )
    asyncio.get_event_loop().run_until_complete(_cleanup())
    for p in created["avatar_files"]:
        try:
            Path(p).unlink(missing_ok=True)
        except Exception:
            pass


# --- helpers ---------------------------------------------------------------

async def _deactivate_current_live(mongo):
    """Turn off any currently-active rundowns; mark them for restore."""
    cur = await mongo.rds_cached_rundowns.find(
        {"is_active": True}, {"_id": 0, "id": 1}
    ).to_list(1000)
    for row in cur:
        await mongo.rds_cached_rundowns.update_one(
            {"id": row["id"]},
            {"$set": {"is_active": False, "_test170_was_active": True}},
        )


def _make_avatar_png(size=256):
    """Create a small on-disk PNG under /app/backend/uploads/avatars/
    and return (file_key, absolute_path)."""
    UPLOADS_AVATARS.mkdir(parents=True, exist_ok=True)
    file_key = f"{TAG}_{uuid.uuid4().hex[:8]}.png"
    p = UPLOADS_AVATARS / file_key
    img = Image.new("RGBA", (size, size), (200, 50, 50, 255))
    img.save(p, "PNG")
    return file_key, str(p)


async def _seed_live_show(mongo, presenter_specs, station=STATION):
    """presenter_specs: list of dicts, each with either:
       {"avatar_url": "..."}                            (legacy string)
       {"avatar": {"file_key": "..."}}                  (modern local)
       {"avatar": {"s3_url": "..."}}                    (modern s3)
       {}                                               (no avatar)
    """
    now = "2026-01-15T10:00:00+00:00"
    user_ids = []
    _uniq = uuid.uuid4().hex[:6]
    for i, spec in enumerate(presenter_specs):
        uid = str(uuid.uuid4())
        doc = {
            "id": uid,
            "email": f"{TAG}_p{i}_{_uniq}@example.com",
            "name": f"{TAG} Presenter {i}",
            "role": "editor",
            "team_id": None,
            "main_site_id": MAIN_SITE_ID,
        }
        doc.update(spec)
        await mongo.users.insert_one(doc)
        user_ids.append(uid)

    show_title_name = f"{TAG}_SHOW_{uuid.uuid4().hex[:4]}"
    show_id = str(uuid.uuid4())
    await mongo.shows.insert_one({
        "id": show_id, "title": show_title_name,
        "date": "2026-01-15", "start_time": "00:00", "end_time": "23:59",
        "status": "scheduled", "presenter_ids": user_ids,
        "team_id": None, "main_site_id": MAIN_SITE_ID,
        "is_recurring": False, "created_at": now, "updated_at": now,
    })
    cache_id = str(uuid.uuid4())
    await mongo.rds_cached_rundowns.insert_one({
        "id": cache_id, "is_active": True, "rds_station": station,
        "show_id": show_id, "show_title": show_title_name,
        "show_date": "2026-01-15", "show_start_time": "00:00", "show_end_time": "23:59",
        "team_id": None, "main_site_id": MAIN_SITE_ID,
        "cached_at": now, "items": [],
    })
    return {"user_ids": user_ids, "show_id": show_id,
            "cache_id": cache_id, "show_title_name": show_title_name}


# --- Test A: absolute redirect target -------------------------------------

class TestAbsoluteRedirectTarget:
    def test_image_jpg_redirect_to_absolute_path(self, mongo, created):
        """When only presenter composite is available, /image.jpg must 302 to
        an absolute /api/rds/{station}/presenter-composite.png."""
        file_key, path = _make_avatar_png()
        created["avatar_files"].append(path)

        async def _run():
            await _deactivate_current_live(mongo)
            seed = await _seed_live_show(mongo, [
                {"avatar": {"file_key": file_key}},
            ])
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            created["cache_ids"].append(seed["cache_id"])
        asyncio.get_event_loop().run_until_complete(_run())

        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/image.jpg",
                         allow_redirects=False, timeout=30)
        assert r.status_code == 302, f"expected 302, got {r.status_code}"
        loc = r.headers.get("location", "")
        # Must be ABSOLUTE path (start with '/'), not a relative filename.
        assert loc.startswith(f"/api/rds/{STATION}/presenter-composite.png") \
            or loc.endswith(f"/api/rds/{STATION}/presenter-composite.png"), \
            f"redirect not absolute: {loc!r}"
        # Explicit: must NOT be a bare relative path like 'presenter-composite.png'
        assert loc != "presenter-composite.png", \
            f"redirect target is relative filename only: {loc!r}"
        assert "/api/rds/" in loc, f"redirect missing /api/rds/ prefix: {loc!r}"


# --- Test B: avatar.file_key loaded from disk ------------------------------

class TestAvatarFileKeyFromDisk:
    def test_composite_from_avatar_subdoc_file_key(self, mongo, created):
        """avatar.file_key → /uploads/avatars/{file_key} loaded from disk."""
        file_key1, path1 = _make_avatar_png()
        file_key2, path2 = _make_avatar_png()
        created["avatar_files"].extend([path1, path2])

        async def _run():
            await _deactivate_current_live(mongo)
            seed = await _seed_live_show(mongo, [
                {"avatar": {"file_key": file_key1}},
                {"avatar": {"file_key": file_key2}},
            ])
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            created["cache_ids"].append(seed["cache_id"])
        asyncio.get_event_loop().run_until_complete(_run())

        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/presenter-composite.png",
                         timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/png")
        img = Image.open(io.BytesIO(r.content))
        assert img.mode == "RGBA"
        # 2 presenters: width should be > placeholder (or specifically
        # scaled with count). Placeholder is 1366×808; composite for 2
        # presenters is much smaller ≈ 634 wide.
        # Must NOT be placeholder (1366×808).
        assert img.size != (1366, 808), \
            f"file_key avatar not loaded from disk — got placeholder (size {img.size})"
        # Width should scale with presenter count.
        # For n=2: canvas_w = 384 + (384-134) = 634
        avatar_size = 384
        overlap = int(avatar_size * 0.35)  # 134
        expected_w = avatar_size + (2 - 1) * (avatar_size - overlap)  # 634
        assert abs(img.size[0] - expected_w) <= 3, \
            f"expected width ~{expected_w}, got {img.size[0]}"
        assert img.size[1] == 512

    def test_composite_width_scales_with_presenter_count(self, mongo, created):
        """3 presenters must produce a wider canvas than 1."""
        keys = []
        for _ in range(3):
            fk, path = _make_avatar_png()
            created["avatar_files"].append(path)
            keys.append(fk)

        async def _run():
            await _deactivate_current_live(mongo)
            seed = await _seed_live_show(mongo, [
                {"avatar": {"file_key": k}} for k in keys
            ])
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            created["cache_ids"].append(seed["cache_id"])
        asyncio.get_event_loop().run_until_complete(_run())

        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/presenter-composite.png",
                         timeout=60)
        assert r.status_code == 200
        img = Image.open(io.BytesIO(r.content))
        avatar_size, overlap = 384, int(384 * 0.35)
        expected_w = avatar_size + 2 * (avatar_size - overlap)  # 884
        assert abs(img.size[0] - expected_w) <= 3, \
            f"3-presenter composite width mismatch: got {img.size[0]}, expected ~{expected_w}"


# --- Test C: mixed populations (avatar_url + avatar sub-doc) --------------

class TestMixedAvatarPopulations:
    def test_mixed_legacy_and_modern_avatars_composite_ok(self, mongo, created):
        file_key, path = _make_avatar_png()
        created["avatar_files"].append(path)

        # Legacy avatar_url points to a real PNG (Python logo).
        legacy_url = "https://www.python.org/static/community_logos/python-logo.png"

        async def _run():
            await _deactivate_current_live(mongo)
            seed = await _seed_live_show(mongo, [
                {"avatar_url": legacy_url},
                {"avatar": {"file_key": file_key}},
            ])
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            created["cache_ids"].append(seed["cache_id"])
        asyncio.get_event_loop().run_until_complete(_run())

        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/presenter-composite.png",
                         timeout=60)
        assert r.status_code == 200, r.text[:200]
        img = Image.open(io.BytesIO(r.content))
        # Should be composite (not placeholder).
        assert img.size != (1366, 808), \
            f"mixed populations returned placeholder — should composite: {img.size}"
        assert img.mode == "RGBA"


# --- Test D: image.jpg follow-through returns a valid PNG composite -------

class TestImageJpgFollowsToComposite:
    def test_full_follow_returns_rgba_png(self, mongo, created):
        file_key, path = _make_avatar_png()
        created["avatar_files"].append(path)

        async def _run():
            await _deactivate_current_live(mongo)
            seed = await _seed_live_show(mongo, [
                {"avatar": {"file_key": file_key}},
            ])
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            created["cache_ids"].append(seed["cache_id"])
        asyncio.get_event_loop().run_until_complete(_run())

        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/image.jpg",
                         allow_redirects=True, timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        img = Image.open(io.BytesIO(r.content))
        assert img.mode == "RGBA"
        assert len(r.content) > 100  # non-empty


# --- Test E: No avatars in either format → placeholder 200 ----------------

class TestNoAvatarsPlaceholder:
    def test_show_with_presenters_no_avatars_returns_placeholder(self, mongo, created):
        async def _run():
            await _deactivate_current_live(mongo)
            seed = await _seed_live_show(mongo, [{}, {}])  # 2 users, no avatars
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            created["cache_ids"].append(seed["cache_id"])
        asyncio.get_event_loop().run_until_complete(_run())

        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/image.jpg",
                         allow_redirects=False, timeout=30)
        # No avatars at all → not composite path → placeholder 200
        assert r.status_code == 200, \
            f"expected 200 placeholder, got {r.status_code} loc={r.headers.get('location')}"
        assert r.headers.get("content-type", "").startswith("image/png")
        img = Image.open(io.BytesIO(r.content))
        assert img.size == (1366, 808), f"expected placeholder 1366x808, got {img.size}"


# --- Test F: Duplicate show_title regression ------------------------------

class TestDuplicateShowTitleCreation:
    def test_duplicate_names_both_succeed(self, headers, created):
        name = f"{TAG}_DUP"
        payload = {"name": name, "description": "dup", "rds_station": "none"}
        r1 = requests.post(f"{BASE_URL}/api/shows/titles",
                           json=payload, headers=headers, timeout=30)
        assert r1.status_code == 201, r1.text
        r2 = requests.post(f"{BASE_URL}/api/shows/titles",
                           json=payload, headers=headers, timeout=30)
        assert r2.status_code == 201, r2.text
        created["title_ids"].append(r1.json()["id"])
        created["title_ids"].append(r2.json()["id"])
        assert r1.json()["id"] != r2.json()["id"]
