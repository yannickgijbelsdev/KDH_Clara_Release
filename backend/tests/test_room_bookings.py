"""End-to-end pytest coverage for Room Bookings + blocks_room show flow.

Covers the review items:
  1. Room CRUD by admin, and 403 for non-admin
  2. GET /api/bookings/rooms tenant-scoped
  3. POST /api/bookings by editor with contact/attendees/blocks_room, room_name enrichment
  4. Overlap conflict → 409 (blocking); blocks_room=false → no conflict
  5. Recurrence expansion (weekly, ~4 weeks) sibling docs + parent_booking_id
  6. Recurrence conflict pre-check → 409 with no orphan siblings
  7. PUT permission matrix (creator OK, other non-admin 403, admin OK)
  8. PUT with update_series propagates title/description but not timestamps
  9. DELETE with delete_series wipes siblings; without flag only single
 10. POST /api/shows with blocks_room=true against booking → 409; false → 200
 11. PUT /api/shows with room-conflict → 409 (existing behaviour smoke)
 12. DELETE /api/bookings/rooms refuses (409) with attached booking/show

State is shared across tests via a `state` session fixture (dict) so we
avoid setting attributes on the pytest module.
"""
import os
import uuid
import time
import bcrypt
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Backend has documented cold-start latency; preview URL occasionally 502s
# through Cloudflare. Timeouts + a small retry helper mitigate flakes.
TIMEOUT = 120

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "63154708-3320-444c-932d-aa3642b5090c"  # Radiogroep MFY/GRK

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _req(method, url, *, retries=3, backoff=2.0, **kwargs):
    """requests wrapper that retries on 502/503/504 or timeouts."""
    kwargs.setdefault("timeout", TIMEOUT)
    last = None
    for attempt in range(retries):
        try:
            r = requests.request(method, url, **kwargs)
            if r.status_code in (502, 503, 504):
                last = r
                time.sleep(backoff * (attempt + 1))
                continue
            return r
        except (requests.Timeout, requests.ConnectionError) as e:
            last = e
            time.sleep(backoff * (attempt + 1))
    if isinstance(last, Exception):
        raise last
    return last


# ─── Fixtures ────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def state():
    """Shared bag of IDs across ordered tests."""
    return {}


@pytest.fixture(scope="session")
def admin_headers():
    r = _req(
        "POST",
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f"Admin login failed: {r.text[:400]}"
    return {
        "Authorization": f"Bearer {r.json()['token']}",
        "Content-Type": "application/json",
        "X-Main-Site-ID": MAIN_SITE_ID,
    }


def _seed_editor(name_prefix: str):
    email = f"TEST_{name_prefix}_{uuid.uuid4().hex[:8]}@koodh.local"
    password = "EditorTest_1234"
    user_id = str(uuid.uuid4())
    _db.users.insert_one({
        "id": user_id,
        "email": email,
        "name": f"TEST {name_prefix}",
        "role": "editor",
        "password_hash": _hash(password),
        "team_id": None,
        "main_site_id": MAIN_SITE_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_network_admin": False,
        "is_system_admin": False,
        "totp_enabled": False,
        "two_factor_enabled": False,
    })
    r = _req("POST", f"{BASE_URL}/api/auth/login",
             json={"email": email, "password": password})
    assert r.status_code == 200, f"Editor login failed: {r.text[:400]}"
    return {
        "id": user_id,
        "email": email,
        "headers": {
            "Authorization": f"Bearer {r.json()['token']}",
            "Content-Type": "application/json",
            "X-Main-Site-ID": MAIN_SITE_ID,
        },
    }


@pytest.fixture(scope="session")
def editor_user():
    user = _seed_editor("editor1")
    yield user
    _db.users.delete_one({"id": user["id"]})


@pytest.fixture(scope="session")
def editor2_user():
    user = _seed_editor("editor2")
    yield user
    _db.users.delete_one({"id": user["id"]})


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Purge any TEST_* rows before + after the suite."""
    def _wipe():
        _db.studios.delete_many({"name": {"$regex": "^TEST_"}})
        _db.room_bookings.delete_many({"title": {"$regex": "^TEST_"}})
        _db.shows.delete_many({"title": {"$regex": "^TEST_"}})
    _wipe()
    yield
    _wipe()


# ─── 1. Room CRUD + permissions ─────────────────────────────────────────

class TestRoomCRUD:
    def test_admin_creates_room(self, admin_headers, state):
        r = _req("POST", f"{BASE_URL}/api/bookings/rooms",
                 headers=admin_headers,
                 json={
                     "name": f"TEST_room_{uuid.uuid4().hex[:6]}",
                     "description": "Studio A",
                     "capacity": 10,
                     "color": "#3b82f6",
                 })
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["capacity"] == 10
        assert data["color"] == "#3b82f6"
        assert data["main_site_id"] == MAIN_SITE_ID
        state["room_id"] = data["id"]

    def test_non_admin_cannot_create_room(self, editor_user):
        r = _req("POST", f"{BASE_URL}/api/bookings/rooms",
                 headers=editor_user["headers"],
                 json={"name": f"TEST_room_forbidden_{uuid.uuid4().hex[:4]}"})
        assert r.status_code == 403, r.text

    def test_list_rooms_returns_seeded_room(self, editor_user, state):
        r = _req("GET", f"{BASE_URL}/api/bookings/rooms",
                 headers=editor_user["headers"])
        assert r.status_code == 200
        rooms = r.json()
        assert any(rm["id"] == state["room_id"] for rm in rooms)


# ─── 2. Booking create + enrichment + overlap conflict ───────────────────

class TestBookingCreateAndConflict:
    def test_editor_creates_booking(self, editor_user, state):
        start = (datetime.now(timezone.utc) + timedelta(hours=48))\
            .replace(second=0, microsecond=0)
        end = start + timedelta(hours=1)
        r = _req("POST", f"{BASE_URL}/api/bookings",
                 headers=editor_user["headers"],
                 json={
                     "room_id": state["room_id"],
                     "title": "TEST_booking_alpha",
                     "description": "primary booking",
                     "start_at": start.isoformat(),
                     "end_at": end.isoformat(),
                     "blocks_room": True,
                     "contact_person": "Jane Doe",
                     "contact_email": "jane@test.local",
                     "attendees": 5,
                 })
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["contact_person"] == "Jane Doe"
        assert data["contact_email"] == "jane@test.local"
        assert data["attendees"] == 5
        assert data["blocks_room"] is True
        assert data["room_name"]
        assert data["parent_booking_id"] is None
        state["alpha_id"] = data["id"]
        state["alpha_start"] = data["start_at"]
        state["alpha_end"] = data["end_at"]

    def test_overlap_blocking_booking_conflicts(self, editor_user, state):
        s_dt = datetime.fromisoformat(state["alpha_start"]) + timedelta(minutes=30)
        e_dt = s_dt + timedelta(hours=1)
        r = _req("POST", f"{BASE_URL}/api/bookings",
                 headers=editor_user["headers"],
                 json={
                     "room_id": state["room_id"],
                     "title": "TEST_booking_conflict",
                     "start_at": s_dt.isoformat(),
                     "end_at": e_dt.isoformat(),
                     "blocks_room": True,
                 })
        assert r.status_code == 409, r.text
        detail = r.json()["detail"]
        assert detail["conflict"]["type"] == "booking"
        assert detail["conflict"]["id"] == state["alpha_id"]

    def test_non_blocking_booking_bypasses_conflict(self, editor_user, state):
        s_dt = datetime.fromisoformat(state["alpha_start"]) + timedelta(minutes=15)
        e_dt = s_dt + timedelta(minutes=30)
        r = _req("POST", f"{BASE_URL}/api/bookings",
                 headers=editor_user["headers"],
                 json={
                     "room_id": state["room_id"],
                     "title": "TEST_booking_nonblocking",
                     "start_at": s_dt.isoformat(),
                     "end_at": e_dt.isoformat(),
                     "blocks_room": False,
                 })
        assert r.status_code == 201, r.text
        assert r.json()["blocks_room"] is False


# ─── 3. Recurrence expansion + pre-check ─────────────────────────────────

class TestRecurrence:
    def test_weekly_recurrence_creates_siblings(self, editor_user, state):
        start = (datetime.now(timezone.utc) + timedelta(days=10, hours=1))\
            .replace(second=0, microsecond=0)
        end = start + timedelta(hours=1)
        recur_end = (start + timedelta(days=28)).date().isoformat()
        r = _req("POST", f"{BASE_URL}/api/bookings",
                 headers=editor_user["headers"],
                 json={
                     "room_id": state["room_id"],
                     "title": "TEST_recurring_weekly",
                     "start_at": start.isoformat(),
                     "end_at": end.isoformat(),
                     "blocks_room": True,
                     "recurrence_type": "weekly",
                     "recurrence_end_date": recur_end,
                 })
        assert r.status_code == 201, r.text
        parent = r.json()
        assert parent["recurrence_type"] == "weekly"
        state["parent_id"] = parent["id"]

        r2 = _req("GET", f"{BASE_URL}/api/bookings",
                  headers=editor_user["headers"])
        assert r2.status_code == 200
        docs = r2.json()
        siblings = [d for d in docs if d.get("parent_booking_id") == parent["id"]]
        assert len(siblings) >= 3, f"expected >=3 siblings, got {len(siblings)}"
        state["sibling_ids"] = [s["id"] for s in siblings]

    def test_recurrence_conflict_precheck_is_atomic(self, editor_user, admin_headers, state):
        # Seed a blocking single booking that will collide with occurrence #3
        start = (datetime.now(timezone.utc) + timedelta(days=60, hours=2))\
            .replace(second=0, microsecond=0)
        end = start + timedelta(hours=1)
        r = _req("POST", f"{BASE_URL}/api/bookings",
                 headers=admin_headers,
                 json={
                     "room_id": state["room_id"],
                     "title": "TEST_blocker_future",
                     "start_at": (start + timedelta(days=14)).isoformat(),
                     "end_at": (end + timedelta(days=14)).isoformat(),
                     "blocks_room": True,
                 })
        assert r.status_code == 201, r.text

        recur_end = (start + timedelta(days=28)).date().isoformat()
        r2 = _req("POST", f"{BASE_URL}/api/bookings",
                  headers=editor_user["headers"],
                  json={
                      "room_id": state["room_id"],
                      "title": "TEST_recurring_should_fail",
                      "start_at": start.isoformat(),
                      "end_at": end.isoformat(),
                      "blocks_room": True,
                      "recurrence_type": "weekly",
                      "recurrence_end_date": recur_end,
                  })
        assert r2.status_code == 409, r2.text

        r3 = _req("GET", f"{BASE_URL}/api/bookings",
                  headers=editor_user["headers"])
        assert r3.status_code == 200
        titles = [d["title"] for d in r3.json()]
        assert "TEST_recurring_should_fail" not in titles


# ─── 4. Permissions on PUT + series update ───────────────────────────────

class TestBookingUpdate:
    def test_creator_can_update(self, editor_user, state):
        r = _req("PUT", f"{BASE_URL}/api/bookings/{state['alpha_id']}",
                 headers=editor_user["headers"],
                 json={"title": "TEST_booking_alpha_edited"})
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "TEST_booking_alpha_edited"

    def test_other_non_admin_cannot_update(self, editor2_user, state):
        r = _req("PUT", f"{BASE_URL}/api/bookings/{state['alpha_id']}",
                 headers=editor2_user["headers"],
                 json={"title": "TEST_should_fail"})
        assert r.status_code == 403, r.text

    def test_admin_can_update(self, admin_headers, state):
        r = _req("PUT", f"{BASE_URL}/api/bookings/{state['alpha_id']}",
                 headers=admin_headers,
                 json={"description": "TEST_admin_touched"})
        assert r.status_code == 200, r.text
        assert r.json()["description"] == "TEST_admin_touched"

    def test_series_update_propagates_metadata_not_times(self, editor_user, state):
        docs_before = _req("GET", f"{BASE_URL}/api/bookings",
                           headers=editor_user["headers"]).json()
        before = {d["id"]: (d["start_at"], d["end_at"])
                  for d in docs_before
                  if d["id"] == state["parent_id"]
                  or d.get("parent_booking_id") == state["parent_id"]}
        assert before, "series docs not found for pre-check"

        r = _req("PUT", f"{BASE_URL}/api/bookings/{state['parent_id']}",
                 headers=editor_user["headers"],
                 json={
                     "title": "TEST_recurring_renamed",
                     "description": "series-wide",
                     "update_series": True,
                 })
        assert r.status_code == 200, r.text

        after_docs = _req("GET", f"{BASE_URL}/api/bookings",
                          headers=editor_user["headers"]).json()
        series_docs = [d for d in after_docs
                       if d["id"] == state["parent_id"]
                       or d.get("parent_booking_id") == state["parent_id"]]
        assert series_docs
        for d in series_docs:
            assert d["title"] == "TEST_recurring_renamed"
            assert d["description"] == "series-wide"
            assert (d["start_at"], d["end_at"]) == before[d["id"]]


# ─── 5. Delete with/without series ───────────────────────────────────────

class TestBookingDelete:
    def test_delete_single_of_series(self, editor_user, state):
        target = state["sibling_ids"][0]
        r = _req("DELETE", f"{BASE_URL}/api/bookings/{target}",
                 headers=editor_user["headers"])
        assert r.status_code == 204, r.text

        remaining = _req("GET", f"{BASE_URL}/api/bookings",
                         headers=editor_user["headers"]).json()
        ids = {d["id"] for d in remaining}
        assert target not in ids
        assert state["parent_id"] in ids

    def test_delete_series_wipes_all(self, editor_user, state):
        r = _req("DELETE",
                 f"{BASE_URL}/api/bookings/{state['parent_id']}?delete_series=true",
                 headers=editor_user["headers"])
        assert r.status_code == 204, r.text

        remaining = _req("GET", f"{BASE_URL}/api/bookings",
                         headers=editor_user["headers"]).json()
        ids = {d["id"] for d in remaining}
        assert state["parent_id"] not in ids
        for sid in state["sibling_ids"]:
            assert sid not in ids


# ─── 6. Shows endpoints honour blocks_room + booking conflicts ──────────

class TestShowsBlocksRoom:
    def test_show_create_conflicts_with_booking(self, admin_headers, state):
        b_start = datetime.fromisoformat(state["alpha_start"])
        payload = {
            "title": "TEST_show_blocks",
            "date": b_start.date().isoformat(),
            "start_time": b_start.strftime("%H:%M"),
            "end_time": (b_start + timedelta(hours=1)).strftime("%H:%M"),
            "studio_id": state["room_id"],
            "blocks_room": True,
        }
        r = _req("POST", f"{BASE_URL}/api/shows",
                 headers=admin_headers, json=payload)
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["conflict"]["type"] == "booking"

    def test_show_create_non_blocking_succeeds(self, admin_headers, state):
        b_start = datetime.fromisoformat(state["alpha_start"])
        payload = {
            "title": "TEST_show_no_block",
            "date": b_start.date().isoformat(),
            "start_time": b_start.strftime("%H:%M"),
            "end_time": (b_start + timedelta(hours=1)).strftime("%H:%M"),
            "studio_id": state["room_id"],
            "blocks_room": False,
        }
        r = _req("POST", f"{BASE_URL}/api/shows",
                 headers=admin_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        state["non_blocking_show_id"] = r.json()["id"]

    def test_show_update_with_conflict_still_409(self, admin_headers, state):
        r = _req("PUT",
                 f"{BASE_URL}/api/shows/{state['non_blocking_show_id']}",
                 headers=admin_headers,
                 json={"blocks_room": True})
        assert r.status_code == 409, r.text


# ─── 7. Room deletion refuses when linked ────────────────────────────────

class TestRoomDeletion:
    def test_delete_room_with_booking_refuses(self, admin_headers, state):
        r = _req("DELETE", f"{BASE_URL}/api/bookings/rooms/{state['room_id']}",
                 headers=admin_headers)
        assert r.status_code == 409, r.text

    def test_delete_room_after_cleanup(self, admin_headers, editor_user, state):
        # Wipe every booking on this room (test-prefixed) via API
        docs = _req("GET", f"{BASE_URL}/api/bookings",
                    headers=editor_user["headers"]).json()
        for d in docs:
            if d.get("room_id") == state["room_id"] and d["title"].startswith("TEST_"):
                _req("DELETE",
                     f"{BASE_URL}/api/bookings/{d['id']}?delete_series=true",
                     headers=admin_headers)
        # Shows on this studio (test-prefixed) → direct mongo delete
        _db.shows.delete_many({"studio_id": state["room_id"],
                                "title": {"$regex": "^TEST_"}})

        r = _req("DELETE", f"{BASE_URL}/api/bookings/rooms/{state['room_id']}",
                 headers=admin_headers)
        assert r.status_code == 204, r.text
