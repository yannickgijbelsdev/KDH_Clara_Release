"""Iteration 164: dynamic per-line padding (`line_width`) + per-item-type
opt-in (`two_lines_types`) for RDS Now Playing / show / default / presenter /
scheduled text formatting.

Covers:
- Unit tests of `services.shoutcast.apply_two_lines_padding` (separator
  detection, ljust behaviour, no-op edge cases).
- Unit tests of `services.shoutcast.format_now_playing` with the new
  `line_width` kwarg (padding requires two_lines=True; single-line ignores).
- HTTP tests of PUT sanitisation + persistence for `line_width` and
  `two_lines_types` through PUT /api/rds-stations/{main_site_id}/{station_id}
  (clamps, dedupes, drops unknown, keeps legacy `now_playing_two_lines`
  separate).
- Integration tests of `_apply_type_padding` / `get_item_text` — per-type
  opt-in gating (only listed types get padded), separator-less strings
  return unchanged, show_name fallback path uses `default_text` key.
- Fast-path re-cache verification (PUT with only line_width triggers
  cache_now_playing + process_rds_sequence + monitor cache reset).
- Regression: legacy calls with no new kwargs still produce identical output.
"""

import asyncio
import os
import sys
import time

import pymongo
import pytest
import requests

BACKEND_DIR = "/app/backend"
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.shoutcast import apply_two_lines_padding, format_now_playing  # noqa: E402
from services.rds_builder_scheduler import _apply_type_padding, get_item_text  # noqa: E402

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
def _event_loop():
    """Persistent event loop shared across all async tests in this module —
    motor's AsyncIOMotorClient binds to the loop at first use, so we cannot
    keep re-creating loops via run_async()."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def mongo_async_db(_event_loop):
    """Async motor db used by get_item_text / _apply_type_padding.
    Bound to the module-scope event loop."""
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def run_async(_event_loop):
    """Helper: run an async coroutine on the shared event loop."""
    def _run(coro):
        return _event_loop.run_until_complete(coro)
    return _run


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
    r = requests.get(
        f"{BASE_URL}/api/rds-stations/by-slug/radiogroep",
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200, f"by-slug failed {r.status_code} {r.text}"
    stations = r.json().get("stations", [])
    assert stations, "expected radiogroep to have stations"
    main_site_id = stations[0]["main_site_id"]
    by_code = {s["code"]: s for s in stations}
    assert "grk" in by_code, "grk station required for these tests"
    return {"main_site_id": main_site_id, "stations": by_code}


@pytest.fixture(scope="module", autouse=True)
def snapshot_all_format_fields(mongo_db, auth_headers, radiogroep_ctx):
    """Snapshot ALL format-related fields for grk/mfy so shared preview data
    doesn't drift. Restores now_playing_case, now_playing_two_lines,
    line_width, two_lines_types, default_text, and shoutcast_cache."""
    db = mongo_db
    ctx = radiogroep_ctx

    snap = {}
    for code, s in ctx["stations"].items():
        snap[code] = {
            "now_playing_case": s.get("now_playing_case") or "mixed",
            "now_playing_two_lines": bool(s.get("now_playing_two_lines")),
            "line_width": int(s.get("line_width") or 0),
            "two_lines_types": list(s.get("two_lines_types") or []),
            "default_text": s.get("default_text", ""),
        }

    grk_cache_snap = db.shoutcast_cache.find_one({"station": "grk"})
    if grk_cache_snap:
        grk_cache_snap = {k: v for k, v in grk_cache_snap.items() if k != "_id"}

    yield {"snap": snap, "grk_cache_snap": grk_cache_snap}

    # Teardown — restore all fields via a single PUT per station
    for code, st in ctx["stations"].items():
        try:
            requests.put(
                f"{BASE_URL}/api/rds-stations/{ctx['main_site_id']}/{st['id']}",
                headers=auth_headers,
                json={
                    "now_playing_case": snap[code]["now_playing_case"],
                    "now_playing_two_lines": snap[code]["now_playing_two_lines"],
                    "line_width": snap[code]["line_width"],
                    "two_lines_types": snap[code]["two_lines_types"],
                    "default_text": snap[code]["default_text"],
                },
                timeout=30,
            )
        except Exception:
            pass

    if grk_cache_snap is not None:
        db.shoutcast_cache.update_one(
            {"station": "grk"}, {"$set": grk_cache_snap}, upsert=True
        )


# ── HTTP helpers ────────────────────────────────────────────────────────

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
        f"{BASE_URL}/api/rds-stations/{ctx['main_site_id']}",
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200
    return {s["code"]: s for s in r.json().get("stations", [])}


# ═════════════════════════════════════════════════════════════════════════
# 1. UNIT — apply_two_lines_padding()
# ═════════════════════════════════════════════════════════════════════════

class TestApplyTwoLinesPadding:
    """Feature: `apply_two_lines_padding(text, line_width)` helper."""

    def test_pad_first_part_to_width(self):
        # 'phil'.ljust(10) = 'phil      ' (6 spaces)
        assert apply_two_lines_padding("phil - collins", 10) == "phil      \ncollins"

    def test_line_width_zero_disables(self):
        assert apply_two_lines_padding("phil - collins", 0) == "phil - collins"

    def test_line_width_negative_disables(self):
        assert apply_two_lines_padding("phil - collins", -5) == "phil - collins"

    def test_line_width_smaller_than_first_part_no_truncation(self):
        # 'phil' is 4 chars, width=3 → ljust leaves it unchanged; still splits
        assert apply_two_lines_padding("phil - collins", 3) == "phil\ncollins"

    def test_no_separator_returns_unchanged(self):
        assert apply_two_lines_padding("single-word-no-sep", 8) == "single-word-no-sep"

    def test_empty_string_returns_empty(self):
        assert apply_two_lines_padding("", 8) == ""

    def test_whitespace_only_returns_unchanged(self):
        # '   ' is truthy but has no separator → unchanged
        assert apply_two_lines_padding("   ", 8) == "   "

    def test_already_newline_input_is_repadded(self):
        # 'artist\ntitle' → split on '\n' → a='artist', ljust(8) = 'artist  '
        assert apply_two_lines_padding("artist\ntitle", 8) == "artist  \ntitle"

    def test_en_dash_separator(self):
        assert apply_two_lines_padding("phil – collins", 10) == "phil      \ncollins"

    def test_em_dash_separator(self):
        assert apply_two_lines_padding("phil — collins", 10) == "phil      \ncollins"

    def test_exact_fit_no_padding_added(self):
        # 'abba' is 4 chars, width=4 → no padding, but still splits
        assert apply_two_lines_padding("abba - queen", 4) == "abba\nqueen"

    def test_first_separator_only(self):
        # Only the FIRST ' - ' should split
        assert apply_two_lines_padding("a - b - c", 4) == "a   \nb - c"

    def test_idempotent_when_already_padded(self):
        # If input is already 'artist  \ntitle' width=8 → re-pads to same width
        already = "artist  \ntitle"
        result = apply_two_lines_padding(already, 8)
        # After split at '\n': a='artist  ', a.rstrip() → 'artist',
        # a.ljust(8) → 'artist  '. b='title'.lstrip() → 'title'.
        assert result == "artist  \ntitle"


# ═════════════════════════════════════════════════════════════════════════
# 2. UNIT — format_now_playing() with line_width
# ═════════════════════════════════════════════════════════════════════════

class TestFormatNowPlayingWithLineWidth:
    """Feature: format_now_playing gains a `line_width` kwarg that pads the
    first line to N chars when two_lines=True; ignored when two_lines=False."""

    def test_mixed_two_lines_exact_width(self):
        # 'PHIL COLLINS' is exactly 12 chars → no padding added
        assert format_now_playing(
            "phil collins - in the air tonight", case="mixed",
            two_lines=True, line_width=12,
        ) == "PHIL COLLINS\nIn The Air Tonight"

    def test_mixed_two_lines_pads_short_artist(self):
        # 'ABBA' padded to 8 chars → 'ABBA    '
        assert format_now_playing(
            "abba - dancing queen", case="mixed",
            two_lines=True, line_width=8,
        ) == "ABBA    \nDancing Queen"

    def test_padding_requires_two_lines_true(self):
        # two_lines=False → line_width ignored, single-line output
        assert format_now_playing(
            "abba - dancing queen", case="mixed",
            two_lines=False, line_width=8,
        ) == "ABBA - Dancing Queen"

    def test_upper_two_lines_with_padding(self):
        assert format_now_playing(
            "abba - dancing queen", case="upper",
            two_lines=True, line_width=8,
        ) == "ABBA    \nDANCING QUEEN"

    def test_lower_two_lines_with_padding(self):
        assert format_now_playing(
            "abba - dancing queen", case="lower",
            two_lines=True, line_width=8,
        ) == "abba    \ndancing queen"

    def test_no_separator_no_padding_two_lines_true(self):
        # No separator to split → returns single string, no padding
        assert format_now_playing(
            "SOME ARTIST", case="mixed",
            two_lines=True, line_width=8,
        ) == "SOME ARTIST"

    def test_sentence_two_lines_with_padding(self):
        assert format_now_playing(
            "abba - dancing queen", case="sentence",
            two_lines=True, line_width=8,
        ) == "Abba    \nDancing Queen"

    def test_line_width_zero_same_as_no_padding(self):
        assert format_now_playing(
            "abba - dancing queen", case="mixed",
            two_lines=True, line_width=0,
        ) == "ABBA\nDancing Queen"

    def test_regression_no_new_kwargs(self):
        # Legacy call — no two_lines / line_width kwargs → default behaviour
        assert format_now_playing("phil - collins", "mixed") == "PHIL - Collins"

    def test_regression_all_cases_default(self):
        # No new kwargs — must produce ' - ' separator, no '\n', no padding
        for case in ("mixed", "upper", "lower", "sentence"):
            r = format_now_playing("phil - collins", case=case)
            assert "\n" not in r
            assert " - " in r


# ═════════════════════════════════════════════════════════════════════════
# 3. HTTP — PUT sanitisation for line_width + two_lines_types
# ═════════════════════════════════════════════════════════════════════════

class TestPutSanitisation:
    """Feature: PUT sanitiser clamps line_width to [0..64], drops unknown
    two_lines_types, dedupes."""

    def test_persist_both_fields(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {
            "line_width": 8,
            "two_lines_types": ["now_playing", "show_name"],
        })
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("line_width") == 8
        assert set(body.get("two_lines_types", [])) == {"now_playing", "show_name"}

        stations = _get_stations(auth_headers, radiogroep_ctx)
        assert stations["grk"].get("line_width") == 8
        assert set(stations["grk"].get("two_lines_types", [])) == {"now_playing", "show_name"}

    def test_negative_line_width_clamps_to_zero(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"line_width": -5})
        assert r.status_code == 200
        assert r.json().get("line_width") == 0

    def test_line_width_over_64_clamps_to_64(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"line_width": 100})
        assert r.status_code == 200
        assert r.json().get("line_width") == 64

    def test_line_width_at_boundary_64(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"line_width": 64})
        assert r.status_code == 200
        assert r.json().get("line_width") == 64

    def test_unknown_two_lines_types_dropped(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {
            "two_lines_types": ["now_playing", "foobar", "banana"],
        })
        assert r.status_code == 200
        assert r.json().get("two_lines_types") == ["now_playing"]

    def test_duplicates_deduped(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {
            "two_lines_types": ["now_playing", "now_playing", "show_name", "now_playing"],
        })
        assert r.status_code == 200
        got = r.json().get("two_lines_types", [])
        assert len(got) == 2
        assert set(got) == {"now_playing", "show_name"}

    def test_empty_list_persists_empty(self, auth_headers, radiogroep_ctx):
        # First set something
        _put(auth_headers, radiogroep_ctx, "grk", {"two_lines_types": ["now_playing"]})
        # Then clear
        r = _put(auth_headers, radiogroep_ctx, "grk", {"two_lines_types": []})
        assert r.status_code == 200
        assert r.json().get("two_lines_types") == []

    def test_only_two_lines_types_persists_and_keeps_legacy_flag_separate(
        self, auth_headers, radiogroep_ctx,
    ):
        # First, ensure legacy flag is True
        _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": True})
        # Now PUT only two_lines_types — legacy flag must remain untouched
        r = _put(auth_headers, radiogroep_ctx, "grk", {
            "two_lines_types": ["now_playing"],
        })
        assert r.status_code == 200
        body = r.json()
        assert body.get("two_lines_types") == ["now_playing"]
        assert body.get("now_playing_two_lines") is True, (
            "legacy now_playing_two_lines must be preserved as a separate field"
        )

    def test_all_five_allowed_types(self, auth_headers, radiogroep_ctx):
        all_types = ["now_playing", "show_name", "default_text",
                     "presenter_name", "scheduled_text"]
        r = _put(auth_headers, radiogroep_ctx, "grk", {"two_lines_types": all_types})
        assert r.status_code == 200
        assert set(r.json().get("two_lines_types", [])) == set(all_types)


# ═════════════════════════════════════════════════════════════════════════
# 4. Integration — _apply_type_padding gates per-type opt-in
# ═════════════════════════════════════════════════════════════════════════

class TestApplyTypePaddingGating:
    """`_apply_type_padding(db, station, item_type, text)` should ONLY pad
    when the item_type is listed in the station's two_lines_types AND
    line_width > 0."""

    def test_type_opted_in_pads(self, mongo_async_db, run_async, auth_headers, radiogroep_ctx):
        _put(auth_headers, radiogroep_ctx, "grk", {
            "line_width": 8,
            "two_lines_types": ["scheduled_text"],
        })
        result = run_async(_apply_type_padding(
            mongo_async_db, "grk", "scheduled_text",
            "abba - dancing queen",
        ))
        assert result == "abba    \ndancing queen"

    def test_type_not_opted_in_returns_unchanged(self, mongo_async_db, run_async, auth_headers, radiogroep_ctx):
        # scheduled_text is NOT in the list — expect unchanged text
        _put(auth_headers, radiogroep_ctx, "grk", {
            "line_width": 8,
            "two_lines_types": ["now_playing"],
        })
        result = run_async(_apply_type_padding(
            mongo_async_db, "grk", "scheduled_text",
            "abba - dancing queen",
        ))
        assert result == "abba - dancing queen", (
            "Non-opted-in type must return the text unchanged"
        )

    def test_line_width_zero_no_padding_even_if_opted_in(
        self, mongo_async_db, run_async, auth_headers, radiogroep_ctx,
    ):
        _put(auth_headers, radiogroep_ctx, "grk", {
            "line_width": 0,
            "two_lines_types": ["show_name", "now_playing"],
        })
        result = run_async(_apply_type_padding(
            mongo_async_db, "grk", "show_name",
            "morning show - live",
        ))
        assert result == "morning show - live"

    def test_no_separator_returns_unchanged(self, mongo_async_db, run_async, auth_headers, radiogroep_ctx):
        _put(auth_headers, radiogroep_ctx, "grk", {
            "line_width": 10,
            "two_lines_types": ["show_name"],
        })
        # 'Morning Show' has no artist/title separator — must NOT be padded
        result = run_async(_apply_type_padding(
            mongo_async_db, "grk", "show_name", "Morning Show",
        ))
        assert result == "Morning Show"

    def test_presenter_name_ampersand_not_a_separator(
        self, mongo_async_db, run_async, auth_headers, radiogroep_ctx,
    ):
        _put(auth_headers, radiogroep_ctx, "grk", {
            "line_width": 8,
            "two_lines_types": ["presenter_name"],
        })
        # ' & ' is NOT one of the recognised separators (' - ', ' – ', ' — ', '\n')
        result = run_async(_apply_type_padding(
            mongo_async_db, "grk", "presenter_name",
            "John Doe & Jane Roe",
        ))
        assert result == "John Doe & Jane Roe"

    def test_empty_text_returns_empty(self, mongo_async_db, run_async, auth_headers, radiogroep_ctx):
        _put(auth_headers, radiogroep_ctx, "grk", {
            "line_width": 8,
            "two_lines_types": ["now_playing"],
        })
        result = run_async(_apply_type_padding(
            mongo_async_db, "grk", "now_playing", "",
        ))
        assert result == ""


# ═════════════════════════════════════════════════════════════════════════
# 5. Integration — get_item_text end-to-end with padding
# ═════════════════════════════════════════════════════════════════════════

class TestGetItemTextWithPadding:
    """`get_item_text` calls `_apply_type_padding` at every return-with-content
    site. Verify per-type gating in situ."""

    def test_show_name_fallback_pads_default_text(
        self, mongo_async_db, mongo_db, run_async, auth_headers, radiogroep_ctx,
    ):
        """When no live show is active, show_name falls back to
        `default_text` — padding MUST be gated on 'default_text' type,
        NOT 'show_name'."""
        # Set default_text = 'the feelgood - station', width=8, opt-in default_text
        _put(auth_headers, radiogroep_ctx, "grk", {
            "default_text": "the feelgood - station",
            "line_width": 8,
            "two_lines_types": ["default_text"],
        })

        # Ensure no active rundown for grk
        mongo_db.rds_cached_rundowns.update_many(
            {"rds_station": {"$in": ["grk", "both"]}},
            {"$set": {"is_active": False}},
        )

        result = run_async(get_item_text(
            mongo_async_db, "grk", {"type": "show_name"},
        ))
        # 'the feelgood - station' → 'the feelgood' is 12 chars > 8 → no padding,
        # but still split on ' - '
        assert result == "the feelgood\nstation", (
            f"Expected 'the feelgood\\nstation' (opted-in default_text with "
            f"split-on-separator, no truncation because 12>8), got {result!r}"
        )

    def test_show_name_fallback_not_padded_when_only_show_name_opted_in(
        self, mongo_async_db, mongo_db, run_async, auth_headers, radiogroep_ctx,
    ):
        """Fallback path uses 'default_text' key — enabling only 'show_name'
        should NOT pad the default text branch."""
        _put(auth_headers, radiogroep_ctx, "grk", {
            "default_text": "the feelgood - station",
            "line_width": 8,
            "two_lines_types": ["show_name"],  # note: NOT default_text
        })
        mongo_db.rds_cached_rundowns.update_many(
            {"rds_station": {"$in": ["grk", "both"]}},
            {"$set": {"is_active": False}},
        )

        result = run_async(get_item_text(
            mongo_async_db, "grk", {"type": "show_name"},
        ))
        assert result == "the feelgood - station", (
            "Fallback branch should NOT be padded when only 'show_name' is "
            "opted in (fallback uses 'default_text' key)"
        )

    def test_now_playing_padded_when_opted_in(
        self, mongo_async_db, mongo_db, run_async, auth_headers, radiogroep_ctx,
    ):
        """now_playing goes through _apply_type_padding at the final return."""
        _put(auth_headers, radiogroep_ctx, "grk", {
            "now_playing_case": "upper",
            "now_playing_two_lines": False,
            "line_width": 15,
            "two_lines_types": ["now_playing"],
        })

        # Seed shoutcast_cache with pre-formatted (upper) text
        mongo_db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": {
                "station": "grk",
                "song_title": "THE CRANBERRIES - ZOMBIE",
                "raw_song_title": "the cranberries - zombie",
                "is_stale": False,
                "stream_online": True,
            }},
            upsert=True,
        )

        result = run_async(get_item_text(
            mongo_async_db, "grk", {"type": "now_playing"},
        ))
        # 'THE CRANBERRIES' is 15 chars, ljust(15) = same → no extra spaces
        assert result == "THE CRANBERRIES\nZOMBIE", (
            f"Expected 'THE CRANBERRIES\\nZOMBIE', got {result!r}"
        )

    def test_now_playing_not_padded_when_not_opted_in(
        self, mongo_async_db, mongo_db, run_async, auth_headers, radiogroep_ctx,
    ):
        _put(auth_headers, radiogroep_ctx, "grk", {
            "now_playing_case": "upper",
            "now_playing_two_lines": False,
            "line_width": 15,
            "two_lines_types": [],  # nothing opted in
        })
        mongo_db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": {
                "station": "grk",
                "song_title": "THE CRANBERRIES - ZOMBIE",
                "raw_song_title": "the cranberries - zombie",
                "is_stale": False,
                "stream_online": True,
            }},
            upsert=True,
        )
        result = run_async(get_item_text(
            mongo_async_db, "grk", {"type": "now_playing"},
        ))
        assert result == "THE CRANBERRIES - ZOMBIE", (
            "now_playing must remain unchanged when not opted-in"
        )


# ═════════════════════════════════════════════════════════════════════════
# 6. Fast-path re-cache — PUT with only line_width reformats cache
# ═════════════════════════════════════════════════════════════════════════

class TestFastPathRecacheOnLineWidth:
    """Feature: PUT with only `{line_width: N}` (any format field change)
    must fire cache_now_playing so shoutcast_cache.song_title gets re-formatted
    with padding, AND invalidate the monitor cache."""

    def test_seeded_cranberries_width_15_repads(
        self, mongo_db, auth_headers, radiogroep_ctx,
    ):
        db = mongo_db

        # Prime: case=upper, two_lines opted-in via list, width=0 (no padding yet)
        _put(auth_headers, radiogroep_ctx, "grk", {
            "now_playing_case": "upper",
            "now_playing_two_lines": False,
            "line_width": 0,
            "two_lines_types": ["now_playing"],
        })

        # Seed shoutcast_cache with known raw title
        raw = "the cranberries - zombie"
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

        # PUT only line_width=15 — fast-path must fire
        r = _put(auth_headers, radiogroep_ctx, "grk", {"line_width": 15})
        assert r.status_code == 200
        assert r.json().get("line_width") == 15

        time.sleep(1.5)
        cache_doc = db.shoutcast_cache.find_one({"station": "grk"}, {"_id": 0})
        assert cache_doc is not None
        song_title = cache_doc.get("song_title", "")
        raw_after = cache_doc.get("raw_song_title", "")

        # Live fetch may or may not overwrite the seed. Two acceptable outcomes:
        if song_title:
            if raw_after == raw:
                # Seed intact → exact assertion
                assert song_title == "THE CRANBERRIES\nZOMBIE", (
                    f"Expected exact 'THE CRANBERRIES\\nZOMBIE', got {song_title!r}"
                )
            else:
                # Live fetch overwrote → format-only assertion
                assert "\n" in song_title, (
                    f"Expected '\\n' in cache after fast-path with line_width=15, "
                    f"got {song_title!r}"
                )

    def test_monitor_endpoint_still_responds_after_fast_path(
        self, auth_headers, radiogroep_ctx,
    ):
        # Prime monitor cache
        requests.get(
            f"{BASE_URL}/api/rds-builder/monitor",
            params={"stations": "grk"},
            timeout=30,
        )
        # Any format field change triggers monitor cache reset
        r = _put(auth_headers, radiogroep_ctx, "grk", {"line_width": 12})
        assert r.status_code == 200
        mr = requests.get(
            f"{BASE_URL}/api/rds-builder/monitor",
            params={"stations": "grk"},
            timeout=30,
        )
        assert mr.status_code == 200, (
            f"monitor failed after fast-path: {mr.status_code} {mr.text[:200]}"
        )

    def test_fast_path_fires_on_two_lines_types_change(
        self, mongo_db, auth_headers, radiogroep_ctx,
    ):
        """PUT with only two_lines_types must also trigger cache re-format."""
        db = mongo_db
        _put(auth_headers, radiogroep_ctx, "grk", {
            "now_playing_case": "upper",
            "line_width": 15,
            "two_lines_types": [],
            "now_playing_two_lines": False,
        })
        raw = "the cranberries - zombie"
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
        # PUT only two_lines_types=['now_playing'] → fast-path fires
        r = _put(auth_headers, radiogroep_ctx, "grk", {"two_lines_types": ["now_playing"]})
        assert r.status_code == 200

        time.sleep(1.5)
        cache_doc = db.shoutcast_cache.find_one({"station": "grk"}, {"_id": 0})
        song_title = (cache_doc or {}).get("song_title", "")
        raw_after = (cache_doc or {}).get("raw_song_title", "")
        if song_title and raw_after == raw:
            assert song_title == "THE CRANBERRIES\nZOMBIE", (
                f"Expected 'THE CRANBERRIES\\nZOMBIE' after two_lines_types "
                f"opt-in, got {song_title!r}"
            )
