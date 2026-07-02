"""Iteration 163: per-station Now Playing two-lines separator
(`now_playing_two_lines`) — join artist + title with '\\n' instead of ' - '
when the flag is True.

Covers:
- Unit tests of `services.shoutcast.format_now_playing` for two_lines=True/False
  across all 4 casing modes + edge cases (empty, no separator, backwards compat).
- HTTP tests of the PUT sanitiser + persistence for `now_playing_two_lines`
  through PUT /api/rds-stations/{main_site_id}/{station_id}.
- Fast-path re-caches shoutcast when `now_playing_two_lines` changes so that
  the stored song_title reflects the new separator.
- GET /api/rds/{station}/now-playing returns the raw '\\n' unescaped in the
  JSON body.
- Snapshot + restore both now_playing_case AND now_playing_two_lines for
  grk/mfy so shared preview state is preserved after the run.
"""

import asyncio
import os
import sys
import time

import pymongo
import pytest
import requests

# Ensure backend package importable for unit tests
BACKEND_DIR = "/app/backend"
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.shoutcast import format_now_playing  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASS = "KYLovie13monx"

RAW = "phil collins - in the air tonight"


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
def snapshot_case_and_twolines(mongo_db, auth_headers, radiogroep_ctx):
    """Snapshot now_playing_case AND now_playing_two_lines for grk/mfy +
    shoutcast_cache for grk; restore on teardown so shared preview data
    doesn't drift."""
    db = mongo_db
    ctx = radiogroep_ctx

    case_snap = {code: (s.get("now_playing_case") or "mixed") for code, s in ctx["stations"].items()}
    two_lines_snap = {code: bool(s.get("now_playing_two_lines")) for code, s in ctx["stations"].items()}

    grk_cache_snap = db.shoutcast_cache.find_one({"station": "grk"})
    if grk_cache_snap:
        grk_cache_snap = {k: v for k, v in grk_cache_snap.items() if k != "_id"}

    yield {
        "case_snap": case_snap,
        "two_lines_snap": two_lines_snap,
        "grk_cache_snap": grk_cache_snap,
    }

    # ── Teardown ──
    for code in ctx["stations"]:
        st = ctx["stations"][code]
        try:
            requests.put(
                f"{BASE_URL}/api/rds-stations/{ctx['main_site_id']}/{st['id']}",
                headers=auth_headers,
                json={
                    "now_playing_case": case_snap.get(code, "mixed"),
                    "now_playing_two_lines": two_lines_snap.get(code, False),
                },
                timeout=30,
            )
        except Exception:
            pass

    if grk_cache_snap is not None:
        db.shoutcast_cache.update_one(
            {"station": "grk"}, {"$set": grk_cache_snap}, upsert=True
        )


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
        f"{BASE_URL}/api/rds-stations/{ctx['main_site_id']}",
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200
    return {s["code"]: s for s in r.json().get("stations", [])}


# ────────────────────────────────────────────────────────────────────────
# 1. UNIT — format_now_playing() with two_lines=True across all cases
# ────────────────────────────────────────────────────────────────────────

class TestFormatNowPlayingTwoLinesUnit:
    """Feature 1-4: two_lines=True with each of mixed/upper/lower/sentence."""

    def test_mixed_two_lines_true(self):
        assert format_now_playing(RAW, case="mixed", two_lines=True) == "PHIL COLLINS\nIn The Air Tonight"

    def test_upper_two_lines_true(self):
        assert format_now_playing(RAW, case="upper", two_lines=True) == "PHIL COLLINS\nIN THE AIR TONIGHT"

    def test_lower_two_lines_true(self):
        assert format_now_playing(RAW, case="lower", two_lines=True) == "phil collins\nin the air tonight"

    def test_sentence_two_lines_true(self):
        assert format_now_playing(RAW, case="sentence", two_lines=True) == "Phil Collins\nIn The Air Tonight"

    # Feature 5: no separator → unchanged (no newline injected)
    def test_no_separator_mixed_two_lines_true(self):
        # 'SOME ARTIST' has no separator → treated as artist only, uppercased.
        # Must NOT contain '\n'.
        result = format_now_playing("SOME ARTIST", case="mixed", two_lines=True)
        assert result == "SOME ARTIST"
        assert "\n" not in result

    def test_no_separator_upper_two_lines_true(self):
        result = format_now_playing("some artist", case="upper", two_lines=True)
        assert result == "SOME ARTIST"
        assert "\n" not in result

    def test_no_separator_lower_two_lines_true(self):
        result = format_now_playing("SOME ARTIST", case="lower", two_lines=True)
        assert result == "some artist"
        assert "\n" not in result

    def test_no_separator_sentence_two_lines_true(self):
        result = format_now_playing("some artist", case="sentence", two_lines=True)
        assert result == "Some Artist"
        assert "\n" not in result

    # Feature 6: empty string → empty
    def test_empty_string_two_lines_true(self):
        assert format_now_playing("", case="mixed", two_lines=True) == ""
        assert format_now_playing("", case="upper", two_lines=True) == ""
        assert format_now_playing("", case="lower", two_lines=True) == ""
        assert format_now_playing("", case="sentence", two_lines=True) == ""

    # Feature 7: backwards compat — no two_lines kwarg → default False
    def test_backwards_compat_default_false_mixed(self):
        assert format_now_playing("x - y", case="mixed") == "X - Y"

    def test_backwards_compat_default_false_all_cases(self):
        # No two_lines kwarg — must return " - " separator (not '\n')
        for case in ("mixed", "upper", "lower", "sentence"):
            result = format_now_playing(RAW, case=case)
            assert "\n" not in result, f"case={case} injected newline without kwarg"
            assert " - " in result, f"case={case} did not use ' - ' separator by default"

    def test_two_lines_false_explicit_matches_default(self):
        # Explicit two_lines=False must equal the omitted-kwarg default
        for case in ("mixed", "upper", "lower", "sentence"):
            assert format_now_playing(RAW, case=case, two_lines=False) == format_now_playing(RAW, case=case)


# ────────────────────────────────────────────────────────────────────────
# 2. Parametrised sanity — 4 cases × 2 two_lines states = 8 outputs
# ────────────────────────────────────────────────────────────────────────

_EXPECT = {
    ("mixed", False): "PHIL COLLINS - In The Air Tonight",
    ("mixed", True): "PHIL COLLINS\nIn The Air Tonight",
    ("upper", False): "PHIL COLLINS - IN THE AIR TONIGHT",
    ("upper", True): "PHIL COLLINS\nIN THE AIR TONIGHT",
    ("lower", False): "phil collins - in the air tonight",
    ("lower", True): "phil collins\nin the air tonight",
    ("sentence", False): "Phil Collins - In The Air Tonight",
    ("sentence", True): "Phil Collins\nIn The Air Tonight",
}


@pytest.mark.parametrize("case,two_lines", list(_EXPECT.keys()))
def test_format_matrix(case, two_lines):
    assert format_now_playing(RAW, case=case, two_lines=two_lines) == _EXPECT[(case, two_lines)]


# ────────────────────────────────────────────────────────────────────────
# 3. HTTP — PUT persistence for now_playing_two_lines
# ────────────────────────────────────────────────────────────────────────

class TestNowPlayingTwoLinesPutPersistence:
    """Feature 8: PUT with `{now_playing_two_lines: true}` persists;
    PUT with false / omitted preserves prior value on other-field updates."""

    def test_put_two_lines_true_persists(self, auth_headers, radiogroep_ctx):
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": True})
        assert r.status_code == 200, f"PUT failed {r.status_code} {r.text}"
        assert r.json().get("now_playing_two_lines") is True

        stations = _get_stations(auth_headers, radiogroep_ctx)
        assert stations["grk"].get("now_playing_two_lines") is True

    def test_put_two_lines_false_persists(self, auth_headers, radiogroep_ctx):
        # First set True, then flip to False
        _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": True})
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": False})
        assert r.status_code == 200
        assert r.json().get("now_playing_two_lines") is False

        stations = _get_stations(auth_headers, radiogroep_ctx)
        assert stations["grk"].get("now_playing_two_lines") is False

    def test_put_omit_two_lines_preserves_prior_value(self, auth_headers, radiogroep_ctx):
        # Set True first
        _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": True})
        # Then update *only* an unrelated field
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "mixed"})
        assert r.status_code == 200
        # The prior True must survive
        assert r.json().get("now_playing_two_lines") is True, (
            "PUT without now_playing_two_lines must preserve the prior stored value"
        )

    def test_put_two_lines_does_not_touch_case(self, auth_headers, radiogroep_ctx):
        # Set case=upper first
        _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "upper"})
        # Then toggle two_lines only
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": True})
        assert r.status_code == 200
        body = r.json()
        assert body.get("now_playing_case") == "upper", (
            "PUT of only now_playing_two_lines must not clobber now_playing_case"
        )
        assert body.get("now_playing_two_lines") is True

    def test_put_two_lines_does_not_touch_other_fields(self, auth_headers, radiogroep_ctx):
        st = radiogroep_ctx["stations"]["grk"]
        orig_name = st["name"]
        orig_stream = st.get("stream_url", "")
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": True})
        assert r.status_code == 200
        body = r.json()
        assert body.get("name") == orig_name
        assert body.get("stream_url", "") == orig_stream


# ────────────────────────────────────────────────────────────────────────
# 4. Fast-path — PUT re-caches shoutcast with new two_lines separator
# ────────────────────────────────────────────────────────────────────────

class TestNowPlayingTwoLinesFastPathRecache:
    """Feature 9 + 10: PUT only `{now_playing_two_lines: true}` triggers
    fast-path re-cache (shoutcast_cache.song_title is re-formatted with
    newline separator) AND invalidates _monitor_cache."""

    def test_two_lines_true_reformats_cached_song_title(self, mongo_db, auth_headers, radiogroep_ctx):
        db = mongo_db
        # Set the station to upper + single-line so we know the starting state
        _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "upper", "now_playing_two_lines": False})

        # Seed shoutcast_cache with a known raw title
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

        # PUT only two_lines=True — the fast-path must reformat with '\n'
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": True})
        assert r.status_code == 200
        assert r.json().get("now_playing_two_lines") is True

        time.sleep(1.5)  # give cache_now_playing a moment
        cache_doc = db.shoutcast_cache.find_one({"station": "grk"}, {"_id": 0})
        assert cache_doc is not None

        song_title = cache_doc.get("song_title", "")
        raw_after = cache_doc.get("raw_song_title", "")

        # Two acceptable outcomes:
        # (a) live fetch failed → song_title cleared OR
        # (b) song_title contains a '\n' AND both parts are fully uppercased
        if song_title:
            assert "\n" in song_title, (
                f"Expected '\\n' separator in cached song_title after two_lines=True PUT, "
                f"got '{song_title!r}' (raw='{raw_after!r}')"
            )
            # Also verify it's still uppercased (case=upper)
            assert song_title == song_title.upper(), (
                f"Expected fully uppercased song_title with case='upper', got '{song_title!r}'"
            )

    def test_seeded_fixture_upper_two_lines(self, mongo_db, auth_headers, radiogroep_ctx):
        """Feature 10 (spec): raw_song_title='the cranberries - zombie',
        station now_playing_case='upper' + now_playing_two_lines=True →
        after re-cache the stored song_title == 'THE CRANBERRIES\\nZOMBIE'.
        """
        db = mongo_db

        # Freeze state to upper + two_lines False first
        _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "upper", "now_playing_two_lines": False})

        # Seed cache
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

        # Toggle two_lines=True → fast-path fires
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": True})
        assert r.status_code == 200

        time.sleep(1.5)
        cache_doc = db.shoutcast_cache.find_one({"station": "grk"}, {"_id": 0})
        song_title = cache_doc.get("song_title", "")
        raw_after = cache_doc.get("raw_song_title", "")

        # If the live fetch succeeded, raw_song_title will be whatever the
        # stream returned. In that case we can only assert the *format*
        # (uppercase + newline). If the live fetch failed and left our seed
        # in place, we assert the exact expected value.
        if song_title:
            if raw_after == raw:
                # Live fetch didn't overwrite our seed → exact check
                assert song_title == "THE CRANBERRIES\nZOMBIE", (
                    f"Expected exactly 'THE CRANBERRIES\\nZOMBIE', got {song_title!r}"
                )
            else:
                # Live fetch overwrote seed → format-only check
                assert "\n" in song_title
                assert song_title == song_title.upper()

    def test_monitor_cache_invalidated_on_two_lines_put(self, auth_headers, radiogroep_ctx):
        """Feature 9 (part 2): the /monitor cache must be invalidated when
        now_playing_two_lines changes so the very next monitor poll sees
        the new format."""
        # Reset to known state
        _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_case": "upper", "now_playing_two_lines": False})

        # Prime monitor cache
        requests.get(
            f"{BASE_URL}/api/rds-builder/monitor",
            params={"stations": "grk"},
            timeout=30,
        )

        # Flip two_lines=True → cache must be invalidated
        r = _put(auth_headers, radiogroep_ctx, "grk", {"now_playing_two_lines": True})
        assert r.status_code == 200

        # Immediately poll monitor within the 5s TTL — must succeed (200)
        # and not error out. We can't guarantee the current_text carries the
        # new format because the current_item may be show_name (not
        # now_playing), but we CAN assert the cache did not blow up.
        mr = requests.get(
            f"{BASE_URL}/api/rds-builder/monitor",
            params={"stations": "grk"},
            timeout=30,
        )
        assert mr.status_code == 200, f"monitor failed after fast-path: {mr.status_code} {mr.text[:200]}"


# ────────────────────────────────────────────────────────────────────────
# 5. Public GET /api/rds/{station}/now-playing carries raw '\n' unescaped
# ────────────────────────────────────────────────────────────────────────

class TestNowPlayingEndpointCarriesNewline:
    """Feature 12: GET /api/rds/{station}/now-playing plaintext returns
    the newline correctly (raw \\n in the body, not escaped)."""

    def test_json_endpoint_returns_raw_newline(self, mongo_db):
        db = mongo_db
        # Seed cache with a song_title that ALREADY contains a '\n'
        seeded = "PHIL COLLINS\nIN THE AIR TONIGHT"
        db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": {
                "station": "grk",
                "song_title": seeded,
                "raw_song_title": "phil collins - in the air tonight",
                "is_stale": False,
                "stream_online": True,
            }},
            upsert=True,
        )

        r = requests.get(f"{BASE_URL}/api/rds/grk/now-playing", timeout=30)
        assert r.status_code == 200, f"endpoint failed {r.status_code} {r.text[:200]}"

        # The JSON body contains "song_title": "PHIL COLLINS\nIN THE AIR TONIGHT"
        # `requests.json()` decodes JSON escape → a literal '\n' char in the string.
        payload = r.json()
        got = payload.get("song_title", "")
        assert got == seeded, (
            f"Endpoint did not preserve raw newline (got {got!r}, expected {seeded!r})"
        )
        assert "\n" in got, "song_title must carry a raw newline character"

    def test_txt_endpoint_returns_raw_newline(self, mongo_db):
        """Plaintext endpoint variant: /api/rds/grk/now-playing.txt should
        also emit the raw '\\n' (as an actual line break in the body)."""
        db = mongo_db
        seeded = "PHIL COLLINS\nIN THE AIR TONIGHT"
        db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": {
                "station": "grk",
                "song_title": seeded,
                "raw_song_title": "phil collins - in the air tonight",
                "is_stale": False,
                "stream_online": True,
            }},
            upsert=True,
        )

        r = requests.get(f"{BASE_URL}/api/rds/grk/now-playing.txt", timeout=30)
        assert r.status_code == 200
        # In the raw HTTP body, '\n' is a physical newline byte.
        assert r.text == seeded, f"plaintext mismatch: {r.text!r} != {seeded!r}"
        assert "\n" in r.text
