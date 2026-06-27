"""Backend tests for the auto-publish liveblog entry fix.

Covers:
- POST /api/content/{content_id}/liveblog/entries auto-publishes by default.
- Explicit publish: false → draft.
- Image rights gate forces draft regardless of publish flag.
- POST /api/content/{content_id}/liveblog/publish-drafts bulk endpoint.
- Public News API surfaces only published entries
  (GET /api/news/articles/{id} and /api/news/articles/{id}/liveblog).
- Regression: publish_entry single endpoint still returns 409 when image
  rights are missing.
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to internal URL only for sanity; pytest will skip if both fail.
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ───────────────────────── fixtures ─────────────────────────
@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("token")
    if not token:
        pytest.skip("Admin login did not return a token (2FA required?)")
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def liveblog_article(auth_headers, mongo_db):
    """Create a content article, flip is_liveblog=true and force-publish it
    so the public News endpoints will surface its liveblog entries."""
    title = f"TEST_Liveblog_{uuid.uuid4().hex[:8]}"
    r = requests.post(
        f"{BASE_URL}/api/content",
        json={"title": title, "type": "text", "body": "<p>Test body</p>", "status": "draft"},
        headers=auth_headers,
        timeout=20,
    )
    assert r.status_code in (200, 201), f"create article failed: {r.status_code} {r.text[:200]}"
    article = r.json()
    article_id = article["id"]

    # Flip is_liveblog
    r2 = requests.put(
        f"{BASE_URL}/api/content/{article_id}",
        json={"is_liveblog": True},
        headers=auth_headers,
        timeout=20,
    )
    assert r2.status_code == 200, f"set is_liveblog failed: {r2.status_code} {r2.text[:200]}"

    # Force the article into the publicly-visible state directly in Mongo so
    # the public News API can see it (bypasses publish-clara which requires a
    # featured image with rights). This is exactly the workaround the task
    # description allows.
    mongo_db.content_items.update_one(
        {"id": article_id},
        {"$set": {
            "status": "published",
            "approval_status": "approved",
            "deleted_at": None,
        }},
    )

    yield article

    # Teardown: hard-delete entries + the article
    mongo_db.liveblog_entries.delete_many({"content_id": article_id})
    mongo_db.content_items.delete_one({"id": article_id})


# ───────────────────────── 1. Auto-publish default ─────────────────────────
class TestCreateEntryAutoPublish:
    def test_default_publish_true(self, auth_headers, liveblog_article, mongo_db):
        cid = liveblog_article["id"]
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "AutoPub", "body": "<p>hello</p>"},
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201, r.text
        entry = r.json()
        assert entry["published"] is True, f"expected published=True, got {entry}"
        assert entry["published_at"], "published_at should be set"
        # Verify persistence in DB
        doc = mongo_db.liveblog_entries.find_one({"id": entry["id"]})
        assert doc and doc["published"] is True

    def test_explicit_draft_publish_false(self, auth_headers, liveblog_article):
        cid = liveblog_article["id"]
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "ExplicitDraft", "body": "<p>draft</p>", "publish": False},
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201, r.text
        entry = r.json()
        assert entry["published"] is False
        assert entry.get("published_at") in (None, "")

    def test_image_rights_missing_forces_draft(self, auth_headers, liveblog_article):
        cid = liveblog_article["id"]
        payload = {
            "title": "RightsMissing",
            "body": "<p>has image without credit</p>",
            "publish": True,  # explicit publish, should still be forced to draft
            "images": [
                {"url": "https://example.com/test.jpg", "credit": "", "photographer": "X"}
            ],
        }
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json=payload, headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201, r.text
        entry = r.json()
        assert entry["published"] is False, "image with empty credit must force draft"
        assert entry.get("published_at") in (None, "")

    def test_image_with_credit_auto_publishes(self, auth_headers, liveblog_article):
        cid = liveblog_article["id"]
        payload = {
            "title": "RightsOk",
            "images": [{"url": "https://example.com/ok.jpg", "credit": "Reuters"}],
        }
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json=payload, headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201, r.text
        entry = r.json()
        assert entry["published"] is True


# ───────────────────────── 2. publish-drafts bulk endpoint ─────────────────────────
class TestPublishAllDrafts:
    def test_bulk_publish(self, auth_headers, liveblog_article, mongo_db):
        cid = liveblog_article["id"]
        # Create 2 drafts (no rights issues) and 1 draft with missing rights.
        r1 = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "BulkDraft1", "publish": False},
            headers=auth_headers, timeout=20,
        )
        r2 = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "BulkDraft2", "publish": False},
            headers=auth_headers, timeout=20,
        )
        r3 = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={
                "title": "BulkDraftBlocked",
                "publish": False,
                "images": [{"url": "https://example.com/x.jpg", "credit": ""}],
            },
            headers=auth_headers, timeout=20,
        )
        assert r1.status_code == 201 and r2.status_code == 201 and r3.status_code == 201
        e1, e2, e3 = r1.json()["id"], r2.json()["id"], r3.json()["id"]

        # Bulk publish
        rb = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/publish-drafts",
            headers=auth_headers, timeout=20,
        )
        assert rb.status_code == 200, rb.text
        out = rb.json()
        assert "published" in out and "skipped_missing_rights" in out
        assert "published_ids" in out and "skipped_ids" in out
        assert e1 in out["published_ids"]
        assert e2 in out["published_ids"]
        assert e3 in out["skipped_ids"]
        assert out["published"] >= 2
        assert out["skipped_missing_rights"] >= 1

        # Verify persistence
        d1 = mongo_db.liveblog_entries.find_one({"id": e1})
        d2 = mongo_db.liveblog_entries.find_one({"id": e2})
        d3 = mongo_db.liveblog_entries.find_one({"id": e3})
        assert d1["published"] is True and d1.get("published_at")
        assert d2["published"] is True
        assert d3["published"] is False, "blocked entry must remain draft"


# ───────────────────────── 3. Public News API visibility ─────────────────────────
class TestPublicNewsLiveblog:
    def test_auto_published_entry_visible_on_public_detail(self, auth_headers, liveblog_article):
        cid = liveblog_article["id"]
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "PublicVisible", "body": "<p>should appear publicly</p>"},
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201, r.text
        entry_id = r.json()["id"]
        assert r.json()["published"] is True

        # GET public detail
        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        assert pr.status_code == 200, f"public detail failed: {pr.status_code} {pr.text[:200]}"
        body = pr.json()
        assert "liveblog_entries" in body
        ids = [e["id"] for e in body["liveblog_entries"]]
        assert entry_id in ids, f"published entry {entry_id} missing from public detail"
        # Editor identity should be stripped
        for e in body["liveblog_entries"]:
            assert "created_by" not in e
            assert "created_by_name" not in e

        # GET polling endpoint
        pr2 = requests.get(f"{BASE_URL}/api/news/articles/{cid}/liveblog", timeout=20)
        assert pr2.status_code == 200, pr2.text
        body2 = pr2.json()
        assert "entries" in body2
        ids2 = [e["id"] for e in body2["entries"]]
        assert entry_id in ids2

    def test_draft_not_visible_publicly_but_visible_to_admin(self, auth_headers, liveblog_article):
        cid = liveblog_article["id"]
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "DraftHidden", "publish": False},
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201
        draft_id = r.json()["id"]

        # Admin list should include it
        admin_list = requests.get(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            headers=auth_headers, timeout=20,
        )
        assert admin_list.status_code == 200
        admin_ids = [e["id"] for e in admin_list.json()]
        assert draft_id in admin_ids, "admin GET must include draft entries"

        # Public detail must NOT include it
        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        assert pr.status_code == 200
        pub_ids = [e["id"] for e in pr.json().get("liveblog_entries", [])]
        assert draft_id not in pub_ids, "public detail leaked a draft entry"

        # Public polling must NOT include it
        pr2 = requests.get(f"{BASE_URL}/api/news/articles/{cid}/liveblog", timeout=20)
        assert pr2.status_code == 200
        pub_ids2 = [e["id"] for e in pr2.json().get("entries", [])]
        assert draft_id not in pub_ids2


# ───────────────────────── 4. Regression: single publish 409 ─────────────────────────
class TestPublishEntryRightsGate:
    def test_publish_endpoint_blocks_missing_credit(self, auth_headers, liveblog_article):
        cid = liveblog_article["id"]
        # Create a draft entry with missing image rights
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={
                "title": "RegressionBlock",
                "publish": False,
                "images": [{"url": "https://example.com/y.jpg", "credit": ""}],
            },
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201
        eid = r.json()["id"]

        # Try to publish via the single-entry endpoint
        pr = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries/{eid}/publish",
            headers=auth_headers, timeout=20,
        )
        assert pr.status_code == 409, f"expected 409, got {pr.status_code} {pr.text[:200]}"
