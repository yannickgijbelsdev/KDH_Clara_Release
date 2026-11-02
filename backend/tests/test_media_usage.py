"""Iteration 187: Media Library usage index (article_media_refs), used_in on GET /api/media, delete blocked with 409."""
import os
import time

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
MAIN_SITE = "63154708-3320-444c-932d-aa3642b5090c"
env = dotenv_values("/app/backend/.env")
DB = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
S = {"contents": [], "assets": []}
PNG = "/tmp/at/s.png"


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"email": "admkoodh@koodh.com", "password": "KYLovie13monx"}, timeout=30)
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return {"Authorization": f"Bearer {r.json()['token']}", "X-Main-Site-ID": MAIN_SITE}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    cids = S["contents"]
    DB.media_assets.delete_many({"$or": [{"content_id": {"$in": cids}}, {"id": {"$in": S["assets"]}}]})
    DB.media_folders.delete_many({"article_content_id": {"$in": cids}})
    DB.content_items.delete_many({"id": {"$in": cids}})
    DB.article_media_refs.delete_many({"content_id": {"$in": cids}})


def _upload(admin, name):
    with open(PNG, "rb") as fh:
        r = requests.post(f"{API}/media", headers=admin, files={"file": (name, fh, "image/png")}, timeout=60)
    assert r.status_code == 201, r.text[:300]
    a = r.json()
    S["assets"].append(a["id"])
    return a


def _used_in(admin, aid):
    r = requests.get(f"{API}/media", headers=admin, timeout=60)
    assert r.status_code == 200
    a = next((x for x in r.json() if x["id"] == aid), None)
    assert a is not None
    return a["used_in"]


def _wait_used(admin, aid, pred, timeout=8):
    end = time.time() + timeout
    u = None
    while time.time() < end:
        u = _used_in(admin, aid)
        if pred(u):
            return u
        time.sleep(0.7)
    return u


def _create(admin, title, body):
    r = requests.post(f"{API}/content", headers=admin, json={"title": title, "body": body}, timeout=30)
    assert r.status_code == 201, r.text[:300]
    S["contents"].append(r.json()["id"])
    return r.json()["id"]


# Backfill / index
class TestIndex:
    def test_backfill_flag(self):
        assert DB.system_flags.find_one({"id": "article_media_refs_v1"})
        assert DB.article_media_refs.count_documents({}) > 0
        doc = DB.article_media_refs.find_one({}, {"_id": 0})
        for k in ("content_id", "title", "deleted", "keys", "asset_ids"):
            assert k in doc

    def test_list_has_used_in(self, admin):
        r = requests.get(f"{API}/media", headers=admin, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert all("used_in" in a and isinstance(a["used_in"], list) for a in data)
        used = [a for a in data if a["used_in"]]
        print(f"{len(used)} of {len(data)} used")
        for u in used[0]["used_in"] if used else []:
            assert set(u) >= {"content_id", "title", "in_trash"}


# Usage via s3_url
class TestS3UrlUsage:
    def test_insert_then_remove(self, admin):
        a = _upload(admin, "TEST_usage_s3.png")
        S["a1"] = a
        assert _used_in(admin, a["id"]) == []
        cid = _create(admin, "TEST_usage article S3", f'<p>x</p><img src="{a["s3_url"]}">')
        S["c1"] = cid
        u = _wait_used(admin, a["id"], lambda u: len(u) == 1)
        assert u and u[0]["content_id"] == cid and u[0]["title"] == "TEST_usage article S3" and u[0]["in_trash"] is False
        # 409 while used
        r = requests.delete(f"{API}/media/{a['id']}", headers=admin, timeout=30)
        assert r.status_code == 409, r.text
        d = r.json()["detail"]
        assert "message" in d and d["used_in"][0]["content_id"] == cid
        # remove from body
        r = requests.put(f"{API}/content/{cid}", headers=admin, json={"body": "<p>gone</p>"}, timeout=30)
        assert r.status_code == 200
        assert _wait_used(admin, a["id"], lambda u: u == []) == []

    def test_unused_delete_204(self, admin):
        a = S["a1"]
        r = requests.delete(f"{API}/media/{a['id']}", headers=admin, timeout=30)
        assert r.status_code == 204, r.text
        assert DB.media_assets.find_one({"id": a["id"]}) is None


# Usage via /api/media/serve/<id>, trash and permanent delete
class TestServeUrlTrash:
    def test_serve_url_usage(self, admin):
        a = _upload(admin, "TEST_usage_serve.png")
        S["a2"] = a
        cid = _create(admin, "TEST_usage article serve", f'<img src="{BASE_URL}/api/media/serve/{a["id"]}">')
        S["c2"] = cid
        u = _wait_used(admin, a["id"], lambda u: len(u) == 1)
        assert u and u[0]["content_id"] == cid

    def test_trash_still_blocks(self, admin):
        a, cid = S["a2"], S["c2"]
        r = requests.delete(f"{API}/content/{cid}", headers=admin, timeout=30)
        assert r.status_code in (200, 204), r.text
        u = _wait_used(admin, a["id"], lambda u: u and u[0]["in_trash"])
        assert u and u[0]["in_trash"] is True
        r = requests.delete(f"{API}/media/{a['id']}", headers=admin, timeout=30)
        assert r.status_code == 409
        assert r.json()["detail"]["used_in"][0]["in_trash"] is True
        assert "(in trash)" in r.json()["detail"]["message"]

    def test_restore_clears_trash_flag(self, admin):
        a, cid = S["a2"], S["c2"]
        r = requests.post(f"{API}/content/{cid}/restore", headers=admin, timeout=30)
        assert r.status_code == 200, r.text
        u = _wait_used(admin, a["id"], lambda u: u and not u[0]["in_trash"])
        assert u and u[0]["in_trash"] is False
        r = requests.delete(f"{API}/content/{cid}", headers=admin, timeout=30)
        assert r.status_code in (200, 204)
        _wait_used(admin, a["id"], lambda u: u and u[0]["in_trash"])

    def test_permanent_delete_unblocks(self, admin):
        a, cid = S["a2"], S["c2"]
        r = requests.delete(f"{API}/content/{cid}/permanent", headers=admin, timeout=30)
        assert r.status_code == 200, r.text
        assert _wait_used(admin, a["id"], lambda u: u == []) == []
        assert DB.article_media_refs.find_one({"content_id": cid}) is None
        r = requests.delete(f"{API}/media/{a['id']}", headers=admin, timeout=30)
        assert r.status_code == 204, r.text


# Bulk delete -> in_trash flag (edge)
class TestBulkDelete:
    def test_bulk_delete_marks_in_trash(self, admin):
        a = _upload(admin, "TEST_usage_bulk.png")
        cid = _create(admin, "TEST_usage article bulk", f'<img src="{a["s3_url"]}">')
        assert _wait_used(admin, a["id"], lambda u: len(u) == 1)
        r = requests.post(f"{API}/content/bulk-delete", headers=admin, json={"content_ids": [cid]}, timeout=30)
        assert r.status_code == 200, r.text
        u = _wait_used(admin, a["id"], lambda u: u and u[0]["in_trash"], timeout=5)
        assert u and u[0]["in_trash"] is True, f"bulk-delete did not update in_trash: {u}"
