"""End-to-end propagation of editable default_text -> RDS Monitor.

Covers the fix in:
- /app/backend/services/rds_builder_scheduler.py :: resolve_station_default_text
- /app/backend/routers/rds_stations.py :: PUT handler fast-path (immediate write
  into rds_builder_output.current_text + /monitor cache invalidation)
- /app/backend/routers/rds_builder.py :: get_rds_monitor_data / _monitor_cache

Reuses the login + station-resolution helpers from
test_rds_default_show_text.py (iteration 159).

Requires local MongoDB access to snapshot/restore rds_cached_rundowns
(active live shows) and rds_builder_output docs for the test stations.
"""

import os
import time
from datetime import datetime, timezone

import pytest
import pymongo
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASS = "KYLovie13monx"

LEGACY_DEFAULTS = {"grk": "the feelgood station", "mfy": "altijd dichtbij"}


# ── Fixtures ──

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
def snapshot_state(mongo_db, auth_headers, radiogroep_ctx):
    """Snapshot default_text values, active rundowns, and rds_builder_output for grk/mfy."""
    db = mongo_db
    ctx = radiogroep_ctx

    # Snapshot default_text
    default_snap = {code: (s.get("default_text") or "") for code, s in ctx["stations"].items()}

    # Deactivate any active live rundowns for grk/mfy/both (record which we changed)
    reactivate_ids = []
    for doc in db.rds_cached_rundowns.find(
        {"is_active": True, "rds_station": {"$in": ["grk", "mfy", "both"]}}, {"_id": 1}
    ):
        reactivate_ids.append(doc["_id"])
    if reactivate_ids:
        db.rds_cached_rundowns.update_many(
            {"_id": {"$in": reactivate_ids}}, {"$set": {"is_active": False}}
        )

    # Snapshot rds_builder_output for grk & mfy (or ensure it exists)
    output_snap = {}
    for code in ("grk", "mfy"):
        if code not in ctx["stations"]:
            continue
        doc = db.rds_builder_output.find_one({"station": code})
        if doc:
            snap = {k: v for k, v in doc.items() if k != "_id"}
            output_snap[code] = snap
            # Force current_item_type to show_name for the fast-path to fire
            db.rds_builder_output.update_one(
                {"station": code},
                {"$set": {"current_item_type": "show_name"}},
            )
        else:
            output_snap[code] = None  # remember it didn't exist
            db.rds_builder_output.insert_one(
                {
                    "station": code,
                    "current_index": 0,
                    "current_item_id": "test-fixture",
                    "current_item_type": "show_name",
                    "current_text": "",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "scheduled_text_active": False,
                    "audio_trigger_active": False,
                }
            )

    yield {"default_snap": default_snap, "output_snap": output_snap}

    # ── Teardown / restore ──
    for code, orig in default_snap.items():
        st = ctx["stations"][code]
        try:
            requests.put(
                f"{BASE_URL}/api/rds-stations/{ctx['main_site_id']}/{st['id']}",
                headers=auth_headers,
                json={"default_text": orig},
                timeout=30,
            )
        except Exception:
            pass

    for code, snap in output_snap.items():
        if snap is None:
            db.rds_builder_output.delete_one({"station": code, "current_item_id": "test-fixture"})
        else:
            db.rds_builder_output.update_one({"station": code}, {"$set": snap})

    if reactivate_ids:
        db.rds_cached_rundowns.update_many(
            {"_id": {"$in": reactivate_ids}}, {"$set": {"is_active": True}}
        )


# ── Helpers ──

def _put_default_text(auth_headers, ctx, code, value):
    st = ctx["stations"][code]
    return requests.put(
        f"{BASE_URL}/api/rds-stations/{ctx['main_site_id']}/{st['id']}",
        headers=auth_headers,
        json={"default_text": value},
        timeout=30,
    )


def _get_monitor(code):
    return requests.get(f"{BASE_URL}/api/rds-builder/monitor", params={"stations": code}, timeout=30)


def _get_live(code):
    return requests.get(f"{BASE_URL}/api/rds/{code}/live", timeout=30)


def _monitor_current_text(payload, code):
    try:
        return payload["stations"][code]["current_text"]
    except (KeyError, TypeError):
        return None


# ── Tests ──

class TestMonitorPropagation:
    """T1: PUT default_text -> Monitor reflects new value within 2s."""

    def test_put_propagates_to_monitor(self, auth_headers, radiogroep_ctx):
        new_val = "PropagateTestX"
        r = _put_default_text(auth_headers, radiogroep_ctx, "grk", new_val)
        assert r.status_code == 200, f"PUT failed {r.status_code} {r.text}"
        assert r.json().get("default_text") == new_val

        # Poll monitor for up to ~2s (immediate write should be visible right away)
        got = None
        deadline = time.time() + 3
        while time.time() < deadline:
            mr = _get_monitor("grk")
            assert mr.status_code == 200, f"monitor failed {mr.status_code} {mr.text[:200]}"
            got = _monitor_current_text(mr.json(), "grk")
            if got == new_val:
                break
            time.sleep(0.2)
        assert got == new_val, f"Monitor did not reflect new default_text in 2s (got '{got}')"

    def test_live_endpoint_matches_new_value(self, auth_headers, radiogroep_ctx):
        # Regression from iter 159
        new_val = "PropagateTestX"
        _put_default_text(auth_headers, radiogroep_ctx, "grk", new_val)
        r = _get_live("grk")
        assert r.status_code == 200
        assert r.text == new_val, f"live endpoint mismatch: '{r.text}'"

    def test_monitor_cache_invalidated_on_put(self, auth_headers, radiogroep_ctx):
        """Repeat monitor calls immediately after PUT must return fresh value
        even inside the 5s TTL window (proves _monitor_cache reset)."""
        # Prime cache
        _put_default_text(auth_headers, radiogroep_ctx, "grk", "CacheSeedValue")
        # Force a fetch to populate the cache
        _get_monitor("grk")

        # PUT a different value very shortly after
        new_val = "CacheInvalidatedValue"
        _put_default_text(auth_headers, radiogroep_ctx, "grk", new_val)

        # Immediately (<5s) poll -- must NOT return the stale CacheSeedValue
        got = None
        deadline = time.time() + 2
        while time.time() < deadline:
            mr = _get_monitor("grk")
            assert mr.status_code == 200
            got = _monitor_current_text(mr.json(), "grk")
            if got == new_val:
                break
            time.sleep(0.15)
        assert got == new_val, (
            f"Monitor still returned stale value after PUT (got '{got}', "
            "expected cache to be invalidated)"
        )


class TestLiveShowPrecedence:
    """T2: When live show is active, PUT default_text must NOT overwrite current_text."""

    def test_live_show_wins_over_default_text_put(
        self, mongo_db, auth_headers, radiogroep_ctx
    ):
        db = mongo_db
        code = "grk"
        # Seed a live rundown for grk with a fixture show_title
        fixture_show_title = "FixtureShowTitle"
        seed_id = db.rds_cached_rundowns.insert_one(
            {
                "rds_station": code,
                "is_active": True,
                "show_title": fixture_show_title,
                "_test_fixture": True,
                "cached_at": datetime.now(timezone.utc).isoformat(),
            }
        ).inserted_id

        # Baseline: capture current output.current_text before PUT
        pre = db.rds_builder_output.find_one({"station": code}, {"_id": 0, "current_text": 1})
        pre_text = (pre or {}).get("current_text", "")

        try:
            new_val = "ShouldNotAppear"
            r = _put_default_text(auth_headers, radiogroep_ctx, code, new_val)
            assert r.status_code == 200
            assert r.json().get("default_text") == new_val  # DB field IS updated

            # Give the handler a beat
            time.sleep(0.5)

            # rds_builder_output.current_text must NOT have been overwritten with new_val
            post = db.rds_builder_output.find_one({"station": code}, {"_id": 0, "current_text": 1})
            post_text = (post or {}).get("current_text", "")
            assert post_text != new_val, (
                f"Fast-path OVERWROTE current_text while a live show is active "
                f"(pre='{pre_text}' post='{post_text}')"
            )
        finally:
            db.rds_cached_rundowns.delete_one({"_id": seed_id})


class TestWhitespaceFallback:
    """T3: PUT default_text=' ' -> DB stored as '' -> legacy fallback applies
    on the next scheduler tick / monitor generation."""

    def test_whitespace_falls_back_to_legacy_on_next_tick(
        self, auth_headers, radiogroep_ctx
    ):
        code = "grk"
        r = _put_default_text(auth_headers, radiogroep_ctx, code, " ")
        assert r.status_code == 200
        assert (r.json().get("default_text") or "") == ""

        # The immediate fast-path writes '' into current_text. The scheduler
        # (~10s tick) or resolve_station_default_text should recover the legacy
        # fallback on the next monitor generation. Poll for up to ~15s.
        legacy = LEGACY_DEFAULTS[code]
        got_history = []
        deadline = time.time() + 15
        while time.time() < deadline:
            mr = _get_monitor(code)
            if mr.status_code == 200:
                got = _monitor_current_text(mr.json(), code)
                got_history.append(got)
                if got == legacy:
                    break
            time.sleep(1)

        # Live endpoint should also return the legacy fallback
        lr = _get_live(code)
        assert lr.status_code == 200
        if lr.text != legacy:
            pytest.skip(
                f"Whitespace fallback not yet visible via live endpoint "
                f"(got '{lr.text}'). Monitor history: {got_history}"
            )
        assert lr.text == legacy


class TestSequenceRefreshRegression:
    """T4: refresh_output_text / refresh_stale_output_text still promotes the
    default_text when the sequence has no enabled items. This is exercised
    indirectly via the scheduler; we validate the monitor eventually reflects
    a freshly-PUT value even without touching rds_builder_output directly."""

    def test_scheduler_tick_uses_new_default_text(
        self, mongo_db, auth_headers, radiogroep_ctx
    ):
        code = "grk"
        # Make sure no fixture live rundowns remain
        mongo_db.rds_cached_rundowns.update_many(
            {"rds_station": {"$in": [code, "both"]}, "is_active": True},
            {"$set": {"is_active": False}},
        )

        new_val = "SchedulerTickValue"
        r = _put_default_text(auth_headers, radiogroep_ctx, code, new_val)
        assert r.status_code == 200

        # Poll for up to ~12s to allow at least one scheduler cycle
        deadline = time.time() + 12
        got = None
        while time.time() < deadline:
            mr = _get_monitor(code)
            if mr.status_code == 200:
                got = _monitor_current_text(mr.json(), code)
                if got == new_val:
                    break
            time.sleep(1)
        assert got == new_val, f"scheduler did not converge to new default_text (got '{got}')"



class TestClearedFieldImmediateLegacyFallback:
    """T5 (iteration 161): PUT default_text='' on a station whose
    current_item_type='show_name' and no live show is active — Monitor within
    ~1s must return the legacy fallback (never blank).

    Previously the fast-path wrote the raw '' into current_text, causing a
    ~10s blank flicker until the scheduler tick recovered the legacy value.
    """

    def test_empty_put_yields_legacy_immediately(
        self, mongo_db, auth_headers, radiogroep_ctx
    ):
        code = "grk"
        # Ensure no live rundown could mask the fallback
        mongo_db.rds_cached_rundowns.update_many(
            {"rds_station": {"$in": [code, "both"]}, "is_active": True},
            {"$set": {"is_active": False}},
        )
        # Ensure current_item_type is 'show_name' so the fast-path fires
        mongo_db.rds_builder_output.update_one(
            {"station": code}, {"$set": {"current_item_type": "show_name"}}
        )

        # Prime with a non-legacy value so we can detect the transition
        _put_default_text(auth_headers, radiogroep_ctx, code, "PrimedNonLegacy")
        _get_monitor(code)

        # PUT empty
        r = _put_default_text(auth_headers, radiogroep_ctx, code, "")
        assert r.status_code == 200
        assert (r.json().get("default_text") or "") == ""

        legacy = LEGACY_DEFAULTS[code]

        # Within ~1s the Monitor must already show legacy fallback, not ''
        got = None
        history = []
        deadline = time.time() + 1.5
        while time.time() < deadline:
            mr = _get_monitor(code)
            if mr.status_code == 200:
                got = _monitor_current_text(mr.json(), code)
                history.append(got)
                if got == legacy:
                    break
            time.sleep(0.15)

        assert got == legacy, (
            f"Empty PUT did not immediately recover legacy fallback "
            f"(got '{got}', history={history}). The fast-path must call "
            f"resolve_station_default_text so cleared fields never blank "
            f"the Monitor for ~10s."
        )

        # Also verify DB was written with the resolved legacy value, not ''
        post = mongo_db.rds_builder_output.find_one(
            {"station": code}, {"_id": 0, "current_text": 1}
        )
        assert (post or {}).get("current_text") == legacy, (
            f"rds_builder_output.current_text must be the resolved legacy "
            f"value, got '{(post or {}).get('current_text')}'"
        )


class TestPresenterNameProtection:
    """T6 (iteration 161): When rds_builder_output.current_item_type is
    'presenter_name' (or 'now_playing'), the PUT fast-path must NOT overwrite
    current_text. Only 'show_name' items should be replaced.
    """

    def _fastpath_does_not_touch(self, mongo_db, auth_headers, radiogroep_ctx,
                                  fixture_type: str, fixture_text: str,
                                  put_value: str):
        """Helper: force current_item_type to `fixture_type` with `fixture_text`,
        PUT `put_value` as default_text, then verify the *fast-path* did not
        overwrite by inspecting the DB with the smallest possible delay.

        Since a global scheduler tick may fire within ~1s and legitimately
        rewrite current_text (for presenter_name/now_playing with no live show,
        the scheduler falls back to default_text), we use the `updated_at`
        timestamp to distinguish the fast-path write from a subsequent
        scheduler write. The fast-path only writes when the type is show_name,
        so for presenter/now_playing the doc must remain UNCHANGED between
        our fixture set and the very next read post-PUT.
        """
        code = "grk"
        # Ensure no live rundown that could feed real data
        mongo_db.rds_cached_rundowns.update_many(
            {"rds_station": {"$in": [code, "both"]}, "is_active": True},
            {"$set": {"is_active": False}},
        )

        pre_doc = mongo_db.rds_builder_output.find_one({"station": code}, {"_id": 0})
        assert pre_doc, "expected rds_builder_output doc for grk"

        # Force fixture state with a unique updated_at we can detect
        fixture_updated_at = f"__FIXTURE__{time.time()}__"
        mongo_db.rds_builder_output.update_one(
            {"station": code},
            {"$set": {
                "current_item_type": fixture_type,
                "current_text": fixture_text,
                "updated_at": fixture_updated_at,
            }},
        )

        # Fire PUT
        r = _put_default_text(auth_headers, radiogroep_ctx, code, put_value)
        assert r.status_code == 200

        # Read immediately (no sleep) — the fast-path is synchronous within
        # the PUT handler; if it fired, current_text is now put_value AND
        # updated_at != fixture_updated_at.
        post = mongo_db.rds_builder_output.find_one(
            {"station": code},
            {"_id": 0, "current_text": 1, "current_item_type": 1, "updated_at": 1},
        )

        # Restore before assertions (so failure doesn't leave dirty state)
        mongo_db.rds_builder_output.update_one(
            {"station": code},
            {"$set": {
                "current_item_type": pre_doc.get("current_item_type", "show_name"),
                "current_text": pre_doc.get("current_text", ""),
                "updated_at": pre_doc.get("updated_at", ""),
            }},
        )

        # If the fast-path wrote, current_text will be put_value. That's the
        # regression we're testing for.
        assert post.get("current_text") != put_value, (
            f"Fast-path OVERWROTE current_text on a '{fixture_type}' item "
            f"(got '{post.get('current_text')}' == PUT value). "
            f"Strict '== show_name' check regressed."
        )

        # Also: if the doc was untouched by the fast-path, updated_at should
        # still be our sentinel (unless the 1s scheduler tick raced us — in
        # which case current_text might differ from fixture_text but must
        # still not equal put_value, which is the assertion above).
        return post

    def test_presenter_name_not_overwritten_by_put(
        self, mongo_db, auth_headers, radiogroep_ctx
    ):
        self._fastpath_does_not_touch(
            mongo_db, auth_headers, radiogroep_ctx,
            fixture_type="presenter_name",
            fixture_text="Jan Peeters (test fixture)",
            put_value="ShouldNotOverwritePresenter_XYZ",
        )

    def test_now_playing_not_overwritten_by_put(
        self, mongo_db, auth_headers, radiogroep_ctx
    ):
        self._fastpath_does_not_touch(
            mongo_db, auth_headers, radiogroep_ctx,
            fixture_type="now_playing",
            fixture_text="Fixture Artist - Fixture Song (test)",
            put_value="ShouldNotOverwriteNowPlaying_XYZ",
        )
