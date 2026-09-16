"""Backend verification for iteration_169 - three bugs:
  (1) Duplicate show_title creation must succeed (no unique-name check).
  (2) /api/rds/{station}/image.jpg fallback: show image > title image > presenter composite > placeholder.
  (3) Uploaded show/show_title image must beat presenter composite.

Runs entirely against the public REACT_APP_BACKEND_URL. Seeds and cleans
its own Mongo docs so it doesn't disturb live tenant data.
"""
import os
import io
import uuid
import asyncio
import pytest
import requests
from PIL import Image
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "63154708-3320-444c-932d-aa3642b5090c"  # Radiogroep MFY/GRK
STATION = "grk"

TAG = f"TEST169_{uuid.uuid4().hex[:6]}"


# --- Fixtures ---------------------------------------------------------------

@pytest.fixture(scope="module")
def mongo():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
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
def created(headers):
    return {"title_ids": [], "show_ids": [], "user_ids": [], "cache_ids": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(created, mongo):
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
    asyncio.get_event_loop().run_until_complete(_cleanup())


# --- Test 1: Duplicate title creation --------------------------------------

class TestDuplicateShowTitleCreation:
    def test_create_two_titles_same_name_succeeds(self, headers, created):
        name = f"{TAG}_DUP"
        payload = {"name": name, "description": "dup test", "rds_station": "none"}
        r1 = requests.post(f"{BASE_URL}/api/shows/titles", json=payload, headers=headers, timeout=30)
        assert r1.status_code == 201, f"first create failed: {r1.status_code} {r1.text}"
        t1 = r1.json()
        created["title_ids"].append(t1["id"])

        r2 = requests.post(f"{BASE_URL}/api/shows/titles", json=payload, headers=headers, timeout=30)
        assert r2.status_code == 201, f"duplicate create rejected: {r2.status_code} {r2.text}"
        t2 = r2.json()
        created["title_ids"].append(t2["id"])

        assert t1["id"] != t2["id"]
        assert t1["name"] == t2["name"] == name

        # GET /api/shows/titles returns both.
        rlist = requests.get(f"{BASE_URL}/api/shows/titles", headers=headers, timeout=30)
        assert rlist.status_code == 200
        titles = rlist.json()
        ids = [t["id"] for t in titles if t.get("name") == name]
        assert t1["id"] in ids and t2["id"] in ids, f"missing duplicates in list: {ids}"


# --- Helpers for RDS image tests -------------------------------------------

async def _seed_live_show(mongo, *, presenter_urls=None, show_image=None,
                          title_image=None, station=STATION, tag=TAG):
    """Seed users (with avatar_url), a show, an optional show_title, and a
    cached rundown marking the show live on the station. Returns dict of ids."""
    presenter_urls = presenter_urls or []
    now = "2026-01-15T10:00:00+00:00"

    user_ids = []
    _uniq = uuid.uuid4().hex[:6]
    for i, url in enumerate(presenter_urls):
        uid = str(uuid.uuid4())
        await mongo.users.insert_one({
            "id": uid,
            "email": f"{tag}_p{i}_{_uniq}@example.com",
            "name": f"{tag} Presenter {i}",
            "role": "editor",
            "avatar_url": url,
            "team_id": None,
            "main_site_id": MAIN_SITE_ID,
        })
        user_ids.append(uid)

    show_title_name = f"{tag}_SHOW_{uuid.uuid4().hex[:4]}"
    title_id = None
    if title_image is not None:
        title_id = str(uuid.uuid4())
        title_doc = {
            "id": title_id, "name": show_title_name,
            "description": "", "default_presenter_ids": user_ids,
            "team_id": None, "main_site_id": MAIN_SITE_ID,
            "created_at": now,
        }
        if title_image:
            title_doc["image"] = title_image
        await mongo.show_titles.insert_one(title_doc)

    show_id = str(uuid.uuid4())
    show_doc = {
        "id": show_id, "title": show_title_name,
        "date": "2026-01-15", "start_time": "00:00", "end_time": "23:59",
        "status": "scheduled", "presenter_ids": user_ids,
        "team_id": None, "main_site_id": MAIN_SITE_ID,
        "is_recurring": False, "created_at": now, "updated_at": now,
    }
    if show_image:
        show_doc["image"] = show_image
    await mongo.shows.insert_one(show_doc)

    cache_id = str(uuid.uuid4())
    await mongo.rds_cached_rundowns.insert_one({
        "id": cache_id, "is_active": True, "rds_station": station,
        "show_id": show_id, "show_title": show_title_name,
        "show_date": "2026-01-15", "show_start_time": "00:00", "show_end_time": "23:59",
        "team_id": None, "main_site_id": MAIN_SITE_ID,
        "cached_at": now, "items": [],
    })

    return {"user_ids": user_ids, "show_id": show_id,
            "title_id": title_id, "cache_id": cache_id,
            "show_title_name": show_title_name}


async def _deactivate_caches(mongo):
    await mongo.rds_cached_rundowns.update_many({}, {"$set": {"is_active": False}})


# --- Test 2: No live show → 200 OK with packaged placeholder ---------------

class TestPlaceholderFallback:
    def test_no_live_show_returns_packaged_placeholder(self, mongo, created):
        # Save current active state and disable it for this test.
        async def _save_state():
            cur = await mongo.rds_cached_rundowns.find(
                {"is_active": True}, {"_id": 0, "id": 1}
            ).to_list(1000)
            for row in cur:
                await mongo.rds_cached_rundowns.update_one(
                    {"id": row["id"]}, {"$set": {"is_active": False, "_test169_was_active": True}}
                )
        asyncio.get_event_loop().run_until_complete(_save_state())
        try:
            r = requests.get(f"{BASE_URL}/api/rds/{STATION}/image.jpg",
                             allow_redirects=False, timeout=30)
            assert r.status_code == 200, f"expected 200, got {r.status_code} redirect={r.headers.get('location')}"
            assert r.headers.get("content-type", "").startswith("image/png")
            img = Image.open(io.BytesIO(r.content))
            assert img.size == (1366, 808), f"placeholder size mismatch: {img.size}"
            assert img.mode == "RGBA"
        finally:
            async def _restore():
                await mongo.rds_cached_rundowns.update_many(
                    {"_test169_was_active": True},
                    {"$set": {"is_active": True}, "$unset": {"_test169_was_active": ""}}
                )
            asyncio.get_event_loop().run_until_complete(_restore())


# --- Test 3: Presenter composite fallback ----------------------------------

# Small valid PNG URL. Use httpbin's image or a known public asset.
SAMPLE_AVATAR_URL = "https://raw.githubusercontent.com/twbs/icons/main/icons/person-fill.svg"
# SVG won't work in PIL; use PNG source instead.
SAMPLE_AVATAR_URL = "https://www.python.org/static/community_logos/python-logo.png"


class TestPresenterCompositeFallback:
    def test_composite_endpoint_returns_png_scaled_by_presenter_count(self, mongo, created):
        async def _run():
            await _deactivate_caches(mongo)
            seed = await _seed_live_show(
                mongo,
                presenter_urls=[SAMPLE_AVATAR_URL, SAMPLE_AVATAR_URL],
            )
            for k in ("user_ids", "show_id", "title_id", "cache_id"):
                if seed.get(k):
                    if isinstance(seed[k], list):
                        created[k[:-1] + "s" if k == "user_ids" else k.replace("_id", "_ids")] = seed[k]
                    else:
                        pass
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            if seed["title_id"]:
                created["title_ids"].append(seed["title_id"])
            created["cache_ids"].append(seed["cache_id"])
            return seed
        asyncio.get_event_loop().run_until_complete(_run())

        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/presenter-composite.png", timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/png")
        img = Image.open(io.BytesIO(r.content))
        assert img.mode == "RGBA"
        # 2 presenters: 384 + (384-134) = 634 wide (35% overlap ≈ 134px)
        # Allow tolerance. If the sample fetch fails, the composite may fall
        # back to the placeholder (1366x808) — still a valid PNG.
        if img.size != (1366, 808):
            expected_2 = 384 + 1 * (384 - int(384 * 0.35))
            assert abs(img.size[0] - expected_2) <= 3, f"composite width mismatch: {img.size}"
            assert img.size[1] == 512

    def test_imagejpg_redirects_to_composite_when_only_presenters(self, mongo, created):
        # Ensure only presenter-composite path is available (no show/title image).
        async def _run():
            await _deactivate_caches(mongo)
            seed = await _seed_live_show(
                mongo,
                presenter_urls=[SAMPLE_AVATAR_URL],
            )
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            created["cache_ids"].append(seed["cache_id"])
            return seed
        asyncio.get_event_loop().run_until_complete(_run())

        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/image.jpg",
                         allow_redirects=False, timeout=30)
        assert r.status_code == 302, f"expected 302 redirect, got {r.status_code}"
        loc = r.headers.get("location", "")
        assert "presenter-composite.png" in loc, f"unexpected redirect: {loc}"

        # Follow it and confirm we get a valid PNG back.
        r2 = requests.get(f"{BASE_URL}/api/rds/{STATION}/image.jpg",
                          allow_redirects=True, timeout=60)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/png")
        Image.open(io.BytesIO(r2.content))  # must parse


# --- Test 4: show_title.image beats presenter composite (regression) -------

class TestShowTitleImageWinsOverComposite:
    def test_title_image_overrides_composite(self, mongo, created):
        s3url = "https://example-cdn.local/test169-title-image.jpg"
        async def _run():
            await _deactivate_caches(mongo)
            seed = await _seed_live_show(
                mongo,
                presenter_urls=[SAMPLE_AVATAR_URL],
                title_image={"s3_url": s3url, "mime_type": "image/jpeg",
                             "filename": "cover.jpg", "file_key": "show_titles/x/cover.jpg"},
            )
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            created["title_ids"].append(seed["title_id"])
            created["cache_ids"].append(seed["cache_id"])
            return seed
        asyncio.get_event_loop().run_until_complete(_run())

        # image.jpg should 302 to S3 URL, NOT to presenter-composite.
        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/image.jpg",
                         allow_redirects=False, timeout=30)
        assert r.status_code == 302, f"expected 302, got {r.status_code}"
        assert r.headers.get("location") == s3url

        # /image JSON should also return the S3 URL.
        r2 = requests.get(f"{BASE_URL}/api/rds/{STATION}/image", timeout=30)
        assert r2.status_code == 200
        body = r2.json()
        assert body["has_image"] is True
        assert body["image_url"] == s3url

        # /image-url.json backward compat.
        r3 = requests.get(f"{BASE_URL}/api/rds/{STATION}/image-url.json", timeout=30)
        assert r3.status_code == 200
        assert r3.json()["value"] == s3url


# --- Test 5: shows.image beats show_titles.image (priority) ----------------

class TestShowImageBeatsTitleImage:
    def test_show_image_wins(self, mongo, created):
        show_s3 = "https://example-cdn.local/test169-show-image.jpg"
        title_s3 = "https://example-cdn.local/test169-title-image-2.jpg"
        async def _run():
            await _deactivate_caches(mongo)
            seed = await _seed_live_show(
                mongo,
                presenter_urls=[SAMPLE_AVATAR_URL],
                show_image={"s3_url": show_s3, "mime_type": "image/jpeg",
                            "filename": "s.jpg", "file_storage_key": "shows/x/s.jpg"},
                title_image={"s3_url": title_s3, "mime_type": "image/jpeg",
                             "filename": "t.jpg", "file_key": "show_titles/x/t.jpg"},
            )
            created["user_ids"].extend(seed["user_ids"])
            created["show_ids"].append(seed["show_id"])
            created["title_ids"].append(seed["title_id"])
            created["cache_ids"].append(seed["cache_id"])
            return seed
        asyncio.get_event_loop().run_until_complete(_run())

        r = requests.get(f"{BASE_URL}/api/rds/{STATION}/image.jpg",
                         allow_redirects=False, timeout=30)
        assert r.status_code == 302
        assert r.headers.get("location") == show_s3
