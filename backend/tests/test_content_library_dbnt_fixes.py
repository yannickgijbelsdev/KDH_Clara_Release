"""Backend tests for Content Library fixes on Custom Main Sites (dbnt/koodh).

Covers iteration_151 review request:
1. POST /api/content/categories with {"name": "..."} (JSON body)
2. DELETE /api/content/categories/{id} (and content category_id cleared)
3. POST /api/content/bulk-delete (soft-delete + status flips to draft)
4. DELETE /api/content/{id} fast path (still returns wordpress_deletions array)
5. GET /api/news/{site}/{cat} regression
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "admkoodh@koodh.com"
PASSWORD = "KYLovie13monx"
DBNT_SITE_ID = "05bb673c-11eb-4932-9046-22697f89ab3e"
DBNT_SLUG = "dbnt"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "X-Main-Site-ID": DBNT_SITE_ID,
        "Content-Type": "application/json",
    }


# ============== CATEGORIES ==============

class TestCategories:
    def test_create_category_json_body(self, headers):
        name = f"TEST_Cat_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/content/categories", headers=headers, json={"name": name})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == name
        assert "slug" in data and data["slug"]
        assert "id" in data and data["id"].startswith("cat_")
        # save for cleanup/duplicate test
        pytest.cat_id = data["id"]
        pytest.cat_name = name
        pytest.cat_slug = data["slug"]

    def test_create_duplicate_returns_existing(self, headers):
        # Same name -> same record returned (no duplicate)
        r = requests.post(
            f"{BASE_URL}/api/content/categories", headers=headers, json={"name": pytest.cat_name}
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == pytest.cat_id
        assert data["slug"] == pytest.cat_slug

    def test_list_categories_contains_new(self, headers):
        r = requests.get(f"{BASE_URL}/api/content/categories", headers=headers)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert pytest.cat_id in ids

    def test_create_category_empty_name_400(self, headers):
        r = requests.post(f"{BASE_URL}/api/content/categories", headers=headers, json={"name": "   "})
        assert r.status_code == 400


# ============== CONTENT ITEMS + BULK DELETE ==============

class TestBulkDeleteAndUnassign:
    @pytest.fixture(scope="class")
    def created_items(self, headers):
        ids = []
        for i in range(3):
            payload = {
                "title": f"TEST_Article_{uuid.uuid4().hex[:6]}",
                "type": "text",
                "body": "<p>body</p>",
                "status": "draft",
                "category_id": pytest.cat_id,
            }
            r = requests.post(f"{BASE_URL}/api/content", headers=headers, json=payload)
            assert r.status_code == 201, r.text
            ids.append(r.json()["id"])
        return ids

    def test_bulk_delete_endpoint(self, headers, created_items):
        # Bulk delete first 2
        r = requests.post(
            f"{BASE_URL}/api/content/bulk-delete",
            headers=headers,
            json={"content_ids": created_items[:2]},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["deleted"] == 2
        assert data["skipped"] == 0
        assert isinstance(data["results"], list) and len(data["results"]) == 2

        # GET default doesn't include them
        r = requests.get(f"{BASE_URL}/api/content", headers=headers)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        for cid in created_items[:2]:
            assert cid not in ids

        # include_deleted=true reveals them
        r = requests.get(f"{BASE_URL}/api/content?include_deleted=true", headers=headers)
        assert r.status_code == 200
        ids_all = [c["id"] for c in r.json()]
        for cid in created_items[:2]:
            assert cid in ids_all

        # Status should be 'draft' (so News API can't show them)
        deleted_items = [c for c in r.json() if c["id"] in created_items[:2]]
        for it in deleted_items:
            assert it.get("status") == "draft"

    def test_bulk_delete_empty_400(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/content/bulk-delete", headers=headers, json={"content_ids": []}
        )
        assert r.status_code == 400

    def test_single_delete_fast(self, headers, created_items):
        last = created_items[2]
        start = time.time()
        r = requests.delete(f"{BASE_URL}/api/content/{last}", headers=headers, timeout=15)
        elapsed = time.time() - start
        assert r.status_code == 200, r.text
        data = r.json()
        assert "wordpress_deletions" in data
        assert isinstance(data["wordpress_deletions"], list)
        # Should be fast even if WP records exist – soft-delete is local-first.
        assert elapsed < 12, f"DELETE too slow: {elapsed:.2f}s"

        # Verify gone from list
        r = requests.get(f"{BASE_URL}/api/content", headers=headers)
        assert last not in [c["id"] for c in r.json()]


# ============== DELETE CATEGORY CLEARS ASSIGNMENT ==============

class TestDeleteCategoryUnassigns:
    def test_delete_category_keeps_content_unassigned(self, headers):
        # New category + content assigned to it
        cat_name = f"TEST_CatDel_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/content/categories", headers=headers, json={"name": cat_name})
        assert r.status_code == 200
        cat = r.json()
        cat_id = cat["id"]

        r = requests.post(
            f"{BASE_URL}/api/content",
            headers=headers,
            json={
                "title": f"TEST_KeepMe_{uuid.uuid4().hex[:6]}",
                "type": "text",
                "body": "x",
                "status": "draft",
                "category_id": cat_id,
            },
        )
        assert r.status_code == 201
        item_id = r.json()["id"]

        # Delete category
        r = requests.delete(f"{BASE_URL}/api/content/categories/{cat_id}", headers=headers)
        assert r.status_code == 200, r.text

        # Item still exists, category_id is unset
        r = requests.get(f"{BASE_URL}/api/content/{item_id}", headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("category_id") in (None, "", None)
        # Cleanup
        requests.delete(f"{BASE_URL}/api/content/{item_id}", headers=headers)


# ============== NEWS API REGRESSION ==============

class TestNewsApiRegression:
    def test_public_news_endpoint(self, headers):
        # Use the test category created earlier
        r = requests.get(f"{BASE_URL}/api/news/{DBNT_SLUG}/{pytest.cat_slug}")
        # 200 even if 0 items
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["site"]["slug"] == DBNT_SLUG
        assert data["category"]["slug"] == pytest.cat_slug
        assert "items" in data and isinstance(data["items"], list)

    def test_public_news_unknown_category_404(self):
        r = requests.get(f"{BASE_URL}/api/news/{DBNT_SLUG}/this-cat-doesnt-exist-zzz")
        assert r.status_code == 404


# ============== CLEANUP ==============

@pytest.fixture(scope="module", autouse=True)
def cleanup(headers):
    yield
    # Best-effort: delete category created in TestCategories
    try:
        requests.delete(f"{BASE_URL}/api/content/categories/{pytest.cat_id}", headers=headers)
    except Exception:
        pass
