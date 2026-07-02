"""Iteration 162: per-station Now Playing casing (`now_playing_case`).

Covers:
- Unit tests of `services.shoutcast.format_now_playing` for the 4 cases
  (mixed | upper | lower | sentence) + edge cases (no separator, empty).
- HTTP tests of the PUT sanitizer + persistence for `now_playing_case`
  through PUT /api/rds-stations/{main_site_id}/{station_id}.
- DB-fixture tests of `services.rds_builder_scheduler.get_item_text`
  for the `now_playing` branch (safety fallback only when case=='mixed').
- Fast-path re-caches shoutcast when `now_playing_case` changes.
- Snapshot + restore now_playing_case for grk/mfy so shared preview state
  is preserved after the run.
"""

import asyncio
import os
import sys
import time
from datetime import datetime, timezone

import pymongo
import pytest
import requests

# Ensure backend package importable for unit tests
BACKEND_DIR = "/app/backend"
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Unit under test — imported once at module load
from services.shoutcast import format_now_playing  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASS = "KYLovie13monx"


# ── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def mongo_db():
    client = pymongo.MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def auth_headers():
    assert BASE_URL, "REACT_APP_BACKEND_URL not set"
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def radiogroep_ctx(auth_headers):
    r = requests.get(f"{BASE_URL}/api/rds-stations/by-slug/radiogroep", headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"by-slug failed {r.status_code} {r.text}"
    stations = r.json().get("stations", [])
    assert stations, "expected radiogroep to have stations"
    main_site_id = stations[0]["main_site_id"]
    by_code = {s["code"]: s for s in stations}
    assert "grk" in by_code, "grk station required for these tests"
    return {"main_site_id": main_site_id, "stations": by_code}


@pytest.fixture(scope="module", autouse=True)
def snapshot_case(mongo_db, auth_headers, radiogroep_ctx):
    """Snapshot now_playing_case for grk/mfy + shoutcast_cache for grk;
    restore on teardown so shared preview data doesn't drift."""
    db = mongo_db
    ctx = radiogroep_ctx

    # Snapshot now_playing_case
    case_snap = {code: (s.get("now_playing_case") or "mixed") for code, s in ctx["stations"].items()}

    # Snapshot shoutcast_cache for grk (we manipulate this in tests)
    grk_cache_snap = db.shoutcast_cache.find_one({"station": "grk"})
    if grk_cache_snap:
        grk_cache_snap = {k: v for k, v in grk_cache_snap.items() if k != "_id"}

    yield {"case_snap": case_snap, "grk_cache_snap": grk_cache_snap}

    # ── Teardown ──
    for code, orig in case_snap.items():
        st = ctx["stations"][code]
        try:
            requests.put(
                f"{BASE_URL}/api/rds-stations/{ctx['main_site_id']}/{st['id']}",
                headers=auth_headers,
                json={"now_playing_case": orig},
                timeout=30,
            )
        except Exception:
            pass

    # Restore grk shoutcast_cache
    if grk_cache_snap is not None:
        db.shoutcast_cache.update_one({"station": "grk"}, {"$set": grk_cache_snap}, upsert=True)


# ── Helpers ─────────────────────────────────────────────────────────────

def _put(auth_headers, ctx, code, body):
    st = ctx["stations"][code]
    return requests.put(
        f"{BASE_URL}/api/rds-stations/{ctx['main_site_id']}/{st['id']}",
        headers=auth_headers,
        json=body,
        timeout=30,
    )


def _get_stations(auth_headers, ctx):
    r = requests.get(
        f"{BASE_URL}/api/rds-stations/{ctx['main_site_id']}", headers=auth_headers, timeout=30
    )
    assert r.status_code == 200
    return {s["code"]: s for s in r.json().get("stations", [])}


# ────────────────────────────────────────────────────────────────────────
# 1. UNIT TESTS — format_now_playing()
# ────────────────────────────────────────────────────────────────────────

class TestFormatNowPlayingUnit:
    RAW = "phil collins - in the air tonight"

    def test_mixed_legacy_default(self):
        assert format_now_playing(self.RAW, case="mixed") == "PHIL COLLINS - In The Air Tonight"

    def test_mixed_is_default_when_kwarg_omitted(self):
        # Backward compatibility: no `case` kwarg still returns legacy mixed
        assert format_now_playing(self.RAW) == "PHIL COLLINS - In The Air Tonight"

    def test_upper_full_uppercase(self):
        assert format_now_playing(self.RAW, case="upper") == "PHIL COLLINS - IN THE AIR TONIGHT"

    def test_lower_full_lowercase(self):
        assert format_now_playing(self.RAW, case="lower") == "phil collins - in the air tonight"

    def test_sentence_title_case_both_parts(self):
        assert format_now_playing(self.RAW, case="sentence") == "Phil Collins - In The Air Tonight"

    def test_sentence_no_separator_title_cases_whole_string(self):
        # No " - " separator — whole string gets title-cased
        assert format_now_playing("SOME ARTIST WITHOUT SEP", case="sentence") == "Some Artist Without Sep"

    def test_empty_string_upper(self):
        assert format_now_playing("", case="upper") == ""

    def test_empty_string_lower(self):
        assert format_now_playing("", case="lower") == ""

    def test_empty_string_sentence(self):
        assert format_now_playing("", case="sentence") == ""

    def test_empty_string_mixed(self):
        assert format_now_playing("", case="mixed") == ""

    def test_unknown_case_falls_back_to_mixed(self):
        # An unknown case string should behave like 'mixed' (defensive default)
        assert format_now_playing(self.RAW, case="whatever") == "PHIL COLLINS - In The Air Tonight"

    def test_none_case_falls_back_to_mixed(self):
        assert format_now_playing(self.RAW, case=None) == "PHIL COLLINS - In The Air Tonight"

    def test_upper_preserves_no_separator(self):
        assert format_now_playing("solo artist", case="upper") == "SOLO ARTIST"

    def test_lower_preserves_no_separator(self):
        assert format_now_playing("SOLO ARTIST", case="lower") == "solo artist"


# ────────────────────────────────────────────────────────────────────────
# 2. HTTP TESTS — PUT sanitiser + persistence
# ────────────────────────────────────────────────────────────────────────

class TestNowPlayingCasePutPersistence:
    def test_put_upper_persists(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "upper"})
        assert r.status_code == 200, f"PUT failed {r.status_code} {r.text}"
        assert r.json().get("now_playing_case") == "upper"

        # Verify via GET list
        stations = _get_stations(auth_headers, radiogroep_ctx)
        assert stations["grk"].get("now_playing_case") == "upper"

    def test_put_lower_persists(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "lower"})
        assert r.status_code == 200
        assert r.json().get("now_playing_case") == "lower"

    def test_put_sentence_persists(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "sentence"})
        assert r.status_code == 200
        assert r.json().get("now_playing_case") == "sentence"

    def test_put_mixed_persists(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "mixed"})
        assert r.status_code == 200
        assert r.json().get("now_playing_case") == "mixed"

    def test_put_invalid_sanitized_to_mixed(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "invalid"})
        assert r.status_code == 200
        assert r.json().get("now_playing_case") == "mixed", (
            "sanitizer must coerce unknown value back to 'mixed'"
        )

    def test_put_case_insensitive(self, auth_headers, radiogroep_ctx):
        # sanitizer lowercases input
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "UPPER"})
        assert r.status_code == 200
        assert r.json().get("now_playing_case") == "upper"

    def test_put_whitespace_sanitized(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "  sentence  "})
        assert r.status_code == 200
        assert r.json().get("now_playing_case") == "sentence"

    def test_put_case_does_not_touch_other_fields(self, auth_headers, radiogroep_ctx):
        st = radiogroep_ctx["stations"]["grk"]
        orig_name = st["name"]
        orig_stream = st.get("stream_url", "")
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "upper"})
        assert r.status_code == 200
        body = r.json()
        assert body.get("name") == orig_name
        assert body.get("stream_url", "") == orig_stream


# ────────────────────────────────────────────────────────────────────────
# 3. FAST-PATH — PUT re-caches shoutcast with new case
# ────────────────────────────────────────────────────────────────────────

class TestNowPlayingCaseFastPathRecache:
    """After PUT with a new case, cache_now_playing() must be invoked and
    the shoutcast_cache.song_title reformatted with the new case."""

    def test_upper_reformats_cached_song_title(self, mongo_db, auth_headers, radiogroep_ctx):
        db = mongo_db
        # Seed shoutcast_cache with a known raw title in lowercase
        raw = "the cranberries - zombie"
        db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": {
                "station": "grk",
                "raw_song_title": raw,
                "song_title": raw,  # will be reformatted by fast-path
                "original_song_title": raw,
                "is_stale": False,
                "stream_online": True,
            }},
            upsert=True,
        )

        # PUT case=upper
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "upper"})
        assert r.status_code == 200
        assert r.json().get("now_playing_case") == "upper"

        # Give the fast-path a moment. cache_now_playing does a live HTTP
        # fetch, which may fail in the preview env → we then only guarantee
        # the DB was set to the new case. If the fetch succeeds it will
        # overwrite raw_song_title with whatever the stream returned, so
        # we check that song_title is fully uppercased vs. its raw source.
        time.sleep(1.5)
        cache_doc = db.shoutcast_cache.find_one({"station": "grk"}, {"_id": 0})
        assert cache_doc is not None

        song_title = cache_doc.get("song_title", "")
        raw_after = cache_doc.get("raw_song_title", "")

        # Two acceptable outcomes:
        # (a) live fetch failed → song_title cleared (status=error path) OR
        # (b) song_title reflects the upper-case transformation applied to
        #     whatever raw_song_title we have now.
        if song_title:
            # song_title must be fully uppercase (or empty). Skip the assertion
            # only when the value is exactly the fallback text (stale).
            assert song_title == song_title.upper(), (
                f"Expected fully uppercased song_title after case='upper' PUT, "
                f"got '{song_title}' (raw='{raw_after}')"
            )

    def test_lower_reformats_cached_song_title(self, mongo_db, auth_headers, radiogroep_ctx):
        db = mongo_db
        raw = "PHIL COLLINS - IN THE AIR TONIGHT"
        db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": {
                "station": "grk",
                "raw_song_title": raw,
                "song_title": raw,
                "original_song_title": raw,
                "is_stale": False,
                "stream_online": True,
            }},
            upsert=True,
        )
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "lower"})
        assert r.status_code == 200
        assert r.json().get("now_playing_case") == "lower"

        time.sleep(1.5)
        cache_doc = db.shoutcast_cache.find_one({"station": "grk"}, {"_id": 0})
        song_title = cache_doc.get("song_title", "")
        if song_title:
            assert song_title == song_title.lower(), (
                f"Expected fully lowercased song_title after case='lower' PUT, got '{song_title}'"
            )


# ────────────────────────────────────────────────────────────────────────
# 4. get_item_text('now_playing') respects per-station case
# ────────────────────────────────────────────────────────────────────────

class TestGetItemTextNowPlayingCase:
    """The safety `is_unformatted_title` fallback in get_item_text must only
    fire for `mixed` mode. For upper/lower/sentence, get_item_text returns
    the cached song_title as-is (never blanks it)."""

    def _seed_cache_and_case(self, mongo_db, case, song_title, raw_title="the cranberries - zombie"):
        # Set the case in the station doc
        mongo_db.rds_stations.update_one(
            {"code": "grk"}, {"$set": {"now_playing_case": case}}
        )
        # Force the shoutcast cache to a known state
        mongo_db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": {
                "station": "grk",
                "song_title": song_title,
                "raw_song_title": raw_title,
                "is_stale": False,
            }},
            upsert=True,
        )

    def _call_get_item_text(self):
        # Call get_item_text directly. Instantiate a fresh AsyncIOMotorClient
        # inside an isolated event loop so we don't collide with the shared
        # module-level `database.db` client (whose loop closes between
        # asyncio.run() invocations).
        from motor.motor_asyncio import AsyncIOMotorClient
        from services.rds_builder_scheduler import get_item_text

        async def _run():
            client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
            local_db = client[DB_NAME]
            try:
                return await get_item_text(local_db, "grk", {"type": "now_playing"})
            finally:
                client.close()

        return asyncio.run(_run())

    def test_mixed_unformatted_returns_empty(self, mongo_db):
        # song_title == raw_title == fully lowercase → is_unformatted → ""
        self._seed_cache_and_case(mongo_db, "mixed", "the cranberries - zombie")
        result = self._call_get_item_text()
        assert result == "", (
            f"Expected '' (unformatted safety fallback) in mixed mode, got '{result}'"
        )

    def test_lower_returns_lowercased_title(self, mongo_db):
        self._seed_cache_and_case(mongo_db, "lower", "the cranberries - zombie")
        result = self._call_get_item_text()
        assert result == "the cranberries - zombie", (
            f"Expected lowercase song_title returned as-is in lower mode, got '{result}'"
        )

    def test_upper_returns_uppercased_title(self, mongo_db):
        self._seed_cache_and_case(
            mongo_db,
            "upper",
            "THE CRANBERRIES - ZOMBIE",
            raw_title="the cranberries - zombie",
        )
        result = self._call_get_item_text()
        assert result == "THE CRANBERRIES - ZOMBIE", (
            f"Expected uppercased song_title returned as-is in upper mode, got '{result}'"
        )

    def test_sentence_returns_title_cased(self, mongo_db):
        self._seed_cache_and_case(
            mongo_db,
            "sentence",
            "The Cranberries - Zombie",
            raw_title="the cranberries - zombie",
        )
        result = self._call_get_item_text()
        assert result == "The Cranberries - Zombie", (
            f"Expected title-cased song_title in sentence mode, got '{result}'"
        )

    def test_mixed_properly_formatted_returned(self, mongo_db):
        # In mixed mode, a properly formatted "ARTIST - Title" MUST be returned
        self._seed_cache_and_case(
            mongo_db,
            "mixed",
            "THE CRANBERRIES - Zombie",
            raw_title="the cranberries - zombie",
        )
        result = self._call_get_item_text()
        assert result == "THE CRANBERRIES - Zombie", (
            f"Expected properly formatted mixed title returned as-is, got '{result}'"
        )


# ────────────────────────────────────────────────────────────────────────
# 5. Public /api/rds/grk/now-playing endpoint honours case
# ────────────────────────────────────────────────────────────────────────

class TestNowPlayingEndpointCase:
    """The public GET /api/rds/grk/now-playing endpoint returns
    get_cached_now_playing which reads shoutcast_cache directly. After
    a case switch + cache seed, the returned song_title must reflect
    the DB-cached value (which the fast-path re-formats)."""

    def test_endpoint_returns_cached_song_title(self, mongo_db, auth_headers, radiogroep_ctx):
        db = mongo_db
        # Seed cache with a known upper-cased song title (simulating the
        # state produced by the fast-path with case='upper').
        db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": {
                "station": "grk",
                "song_title": "PHIL COLLINS - IN THE AIR TONIGHT",
                "raw_song_title": "phil collins - in the air tonight",
                "is_stale": False,
                "stream_online": True,
            }},
            upsert=True,
        )

        r = requests.get(f"{BASE_URL}/api/rds/grk/now-playing", timeout=30)
        assert r.status_code == 200, f"endpoint failed {r.status_code} {r.text[:200]}"
        payload = r.json()
        # Endpoint should return the cached (uppercased) title as-is.
        assert payload.get("song_title") == "PHIL COLLINS - IN THE AIR TONIGHT", (
            f"Endpoint did not honour cached uppercased title (got '{payload.get('song_title')}')"
        )
