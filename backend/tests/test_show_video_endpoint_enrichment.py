"""Backend tests for ShowResponse video_endpoint_name enrichment.

Regression coverage for iteration_167: `_enrich_show_video_endpoint` must
denormalise `video_endpoint_name` onto every ShowResponse return site so
the frontend pill label survives a page refresh even before the
`endpoints` list is lazily fetched.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend env if backend .env doesn't have it
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"

# Radiogroep main site (from db.main_sites)
MAIN_SITE_ID = "63154708-3320-444c-932d-aa3642b5090c"


@pytest.fixture(scope="module")
def auth_headers():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=45,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text[:300]}"
    data = resp.json()
    token = data.get("token")
    if not token:
        pytest.skip(f"Login did not return token (2fa? requires_2fa={data.get('requires_2fa')})")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Main-Site-ID": MAIN_SITE_ID,
    }


@pytest.fixture(scope="module")
def db_client():
    """Direct DB client (pymongo sync — safer in pytest than motor)."""
    from pymongo import MongoClient
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def seeded_endpoint(db_client):
    """Seed one video_endpoint doc directly into the DB.

    Using ISO strings for timestamps (learned from iter-165 that datetime
    objects break VideoEndpointResponse pydantic validation).
    """
    import asyncio
    ep_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": ep_id,
        "name": "TEST_Vimeo_GRK_iter167",
        "embed_html": "<iframe src='https://vimeo.com/event/2848605/embed' width='100%' height='450'></iframe>",
        "main_site_id": MAIN_SITE_ID,
        "created_at": now,
        "updated_at": now,
        "created_by": "test",
    }
    db_client.video_endpoints.insert_one(doc)

    yield {"id": ep_id, "name": "TEST_Vimeo_GRK_iter167"}

    # Cleanup
    db_client.video_endpoints.delete_one({"id": ep_id})


@pytest.fixture
def created_show_ids(auth_headers, db_client):
    """Track show ids for cleanup after each test."""
    ids: list = []
    yield ids
    # Teardown
    for sid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/shows/{sid}", headers=auth_headers, timeout=45)
        except Exception:
            pass
    # Belt & suspenders — remove any leftover TEST_ shows via DB
    if ids:
        db_client.shows.delete_many({"id": {"$in": ids}})


def _create_show(auth_headers, has_video=False, video_endpoint_id=None) -> dict:
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
    payload = {
        "title": f"TEST_show_{uuid.uuid4().hex[:8]}",
        "description": "iter-167 regression",
        "date": tomorrow,
        "start_time": "10:00",
        "end_time": "11:00",
        "status": "draft",
        "has_video": has_video,
        "video_endpoint_id": video_endpoint_id,
        "recurrence_type": "none",
    }
    r = requests.post(f"{BASE_URL}/api/shows", headers=auth_headers, json=payload, timeout=30)
    assert r.status_code == 201, f"Create show failed: {r.status_code} {r.text[:400]}"
    return r.json()


# ============== TESTS ==============

class TestVideoEndpointNameEnrichment:

    def test_create_show_without_video_returns_null_endpoint_name(
        self, auth_headers, created_show_ids
    ):
        show = _create_show(auth_headers, has_video=False)
        created_show_ids.append(show["id"])
        assert "video_endpoint_name" in show, "field must be present on ShowResponse"
        assert show["video_endpoint_name"] is None
        assert show.get("video_endpoint_id") is None

    def test_update_show_sets_video_endpoint_name(
        self, auth_headers, seeded_endpoint, created_show_ids
    ):
        show = _create_show(auth_headers, has_video=False)
        created_show_ids.append(show["id"])
        assert show["video_endpoint_name"] is None

        # PUT with has_video=True and endpoint id
        r = requests.put(
            f"{BASE_URL}/api/shows/{show['id']}",
            headers=auth_headers,
            json={
                "has_video": True,
                "video_endpoint_id": seeded_endpoint["id"],
            },
            timeout=45,
        )
        assert r.status_code == 200, f"update failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert body["has_video"] is True
        assert body["video_endpoint_id"] == seeded_endpoint["id"]
        assert body["video_endpoint_name"] == seeded_endpoint["name"], (
            f"video_endpoint_name mismatch: got {body.get('video_endpoint_name')!r}, "
            f"expected {seeded_endpoint['name']!r}"
        )

    def test_get_show_returns_enriched_video_endpoint_name(
        self, auth_headers, seeded_endpoint, created_show_ids
    ):
        show = _create_show(
            auth_headers, has_video=True, video_endpoint_id=seeded_endpoint["id"]
        )
        created_show_ids.append(show["id"])
        # Create response should already have enrichment
        assert show["video_endpoint_name"] == seeded_endpoint["name"], (
            "create_show did not enrich video_endpoint_name"
        )

        # And a follow-up GET must have it too (the critical refresh path)
        r = requests.get(f"{BASE_URL}/api/shows/{show['id']}", headers=auth_headers, timeout=45)
        assert r.status_code == 200
        body = r.json()
        assert body["video_endpoint_id"] == seeded_endpoint["id"]
        assert body["video_endpoint_name"] == seeded_endpoint["name"]

    def test_list_shows_bulk_enriches_video_endpoint_name(
        self, auth_headers, seeded_endpoint, created_show_ids
    ):
        # Seed 2 shows, one w/ endpoint, one w/o
        s1 = _create_show(
            auth_headers, has_video=True, video_endpoint_id=seeded_endpoint["id"]
        )
        s2 = _create_show(auth_headers, has_video=False)
        created_show_ids.extend([s1["id"], s2["id"]])

        r = requests.get(f"{BASE_URL}/api/shows", headers=auth_headers, timeout=45)
        assert r.status_code == 200
        rows = r.json()
        by_id = {row["id"]: row for row in rows}

        assert s1["id"] in by_id, "created show missing from list"
        assert by_id[s1["id"]]["video_endpoint_name"] == seeded_endpoint["name"], (
            f"list did not bulk-enrich: {by_id[s1['id']]}"
        )

        assert s2["id"] in by_id
        assert by_id[s2["id"]]["video_endpoint_name"] is None

    def test_get_show_without_has_video_returns_null_name(
        self, auth_headers, created_show_ids
    ):
        show = _create_show(auth_headers, has_video=False)
        created_show_ids.append(show["id"])
        r = requests.get(f"{BASE_URL}/api/shows/{show['id']}", headers=auth_headers, timeout=45)
        assert r.status_code == 200
        body = r.json()
        assert body["video_endpoint_name"] is None
        assert body.get("has_video") in (False, None)

    def test_deleted_endpoint_yields_null_name_no_crash(
        self, auth_headers, db_client, created_show_ids
    ):
        """Show references a video_endpoint_id whose row no longer exists.

        Must return video_endpoint_name=None (not raise, not 500).
        """
        # Create ephemeral endpoint, create show, delete endpoint.
        ep_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": ep_id,
            "name": "TEST_ephemeral_iter167",
            "embed_html": "<iframe src='x'></iframe>",
            "main_site_id": MAIN_SITE_ID,
            "created_at": now,
            "updated_at": now,
            "created_by": "test",
        }
        db_client.video_endpoints.insert_one(doc)

        show = _create_show(auth_headers, has_video=True, video_endpoint_id=ep_id)
        created_show_ids.append(show["id"])
        assert show["video_endpoint_name"] == "TEST_ephemeral_iter167"

        # Delete the endpoint doc
        db_client.video_endpoints.delete_one({"id": ep_id})

        # Now GET the show — must not crash, video_endpoint_name must be None
        r = requests.get(f"{BASE_URL}/api/shows/{show['id']}", headers=auth_headers, timeout=45)
        assert r.status_code == 200, f"got {r.status_code} — enrichment must survive missing endpoint"
        body = r.json()
        assert body["video_endpoint_id"] == ep_id
        assert body["video_endpoint_name"] is None, (
            f"expected null when referenced endpoint is deleted, got {body['video_endpoint_name']!r}"
        )

        # And the list endpoint too
        r2 = requests.get(f"{BASE_URL}/api/shows", headers=auth_headers, timeout=45)
        assert r2.status_code == 200
        rows = r2.json()
        row = next((x for x in rows if x["id"] == show["id"]), None)
        assert row is not None
        assert row["video_endpoint_name"] is None
