"""Iteration 186: article S3 files mirrored into the Media Library (Artikels/<title>), backfill, delete->ignore, uploader delete, folder_id."""
import json
import os
import subprocess
import time
import uuid

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
MAIN_SITE = "63154708-3320-444c-932d-aa3642b5090c"  # radiogroep
D = "/tmp/at"
env = dotenv_values("/app/backend/.env")
DB = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
STATE = {"contents": [], "assets": [], "keys": []}


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"email": "admkoodh@koodh.com", "password": "KYLovie13monx"}, timeout=30)
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return {"Authorization": f"Bearer {r.json()['token']}", "X-Main-Site-ID": MAIN_SITE}


@pytest.fixture(scope="module")
def roles():
    subprocess.run(["python", "/tmp/mint.py"], check=True)
    return {k: {"Authorization": f"Bearer {v}", "X-Main-Site-ID": MAIN_SITE} for k, v in json.load(open("/tmp/role_tokens.json")).items()}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    cids = STATE["contents"]
    DB.media_assets.delete_many({"$or": [{"content_id": {"$in": cids}}, {"id": {"$in": STATE["assets"]}}]})
    DB.media_folders.delete_many({"article_content_id": {"$in": cids}})
    DB.media_folders.delete_many({"id": {"$in": STATE.get("folders", [])}})
    DB.media_sync_ignore.delete_many({"file_storage_key": {"$in": STATE["keys"]}})
    DB.liveblog_entries.delete_many({"content_id": {"$in": cids}})
    DB.content_items.delete_many({"id": {"$in": cids}})


def _upload_editor(h, path, name, ctype):
    with open(path, "rb") as fh:
        r = requests.post(f"{API}/uploads/editor-files", headers=h, files={"file": (name, fh, ctype)}, timeout=180)
    assert r.status_code == 200, r.text[:300]
    return r.json()["url"]


def _key(url):
    return url.split("/koodh-clara/", 1)[-1]


def _wait_assets(content_id, n, timeout=8):
    end = time.time() + timeout
    docs = []
    while time.time() < end:
        docs = list(DB.media_assets.find({"content_id": content_id, "source": "article"}, {"_id": 0}))
        if len(docs) >= n:
            return docs
        time.sleep(0.5)
    return docs


def _create(admin, title, body=""):
    r = requests.post(f"{API}/content", headers=admin, json={"title": title, "body": body}, timeout=30)
    assert r.status_code == 201, r.text[:300]
    cid = r.json()["id"]
    STATE["contents"].append(cid)
    return cid


# ---- Backfill ----
class TestBackfill:
    def test_backfill_flag_and_structure(self):
        assert DB.system_flags.find_one({"id": "article_media_backfill_v1"})
        root = DB.media_folders.find_one({"name": "Artikels", "parent_id": None, "main_site_id": MAIN_SITE})
        assert root
        subs = list(DB.media_folders.find({"parent_id": root["id"]}))
        assert len(subs) >= 22 and all(s.get("article_content_id") for s in subs)
        assert DB.media_assets.count_documents({"source": "article"}) >= 31
        dups = list(DB.media_assets.aggregate([{"$match": {"source": "article"}}, {"$group": {"_id": {"k": "$file_storage_key", "s": "$main_site_id"}, "n": {"$sum": 1}}}, {"$match": {"n": {"$gt": 1}}}]))
        assert dups == []

    def test_sync_articles_idempotent(self, admin):
        r1 = requests.post(f"{API}/media/sync-articles", headers=admin, timeout=120)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/media/sync-articles", headers=admin, timeout=120)
        assert r2.status_code == 200 and r2.json()["added"] == 0, r2.text

    def test_sync_articles_unauthenticated(self):
        # NOTE: 'viewer' token is site-role presenter on radiogroep -> allowed by RBAC
        r = requests.post(f"{API}/media/sync-articles", timeout=60)
        assert r.status_code in (401, 403), r.text

    def test_api_lists_subfolder_assets(self, admin):
        a = DB.media_assets.find_one({"source": "article", "main_site_id": MAIN_SITE})
        r = requests.get(f"{API}/media", headers=admin, params={"folder_id": a["folder_id"]}, timeout=30)
        assert r.status_code == 200
        got = [x for x in r.json() if x["id"] == a["id"]]
        assert got and got[0].get("source") == "article" and got[0].get("content_id") == a["content_id"]


# ---- Auto-sync on article create/update ----
class TestAutoSync:
    def test_create_article_mirrors_body_image(self, admin):
        url = _upload_editor(admin, f"{D}/s.png", "TEST_body_img.png", "image/png")
        title = f"TEST_Article {uuid.uuid4().hex[:6]}"
        cid = _create(admin, title, f'<p>x</p><img src="{url}">')
        docs = _wait_assets(cid, 1)
        assert len(docs) == 1
        d = docs[0]
        assert d["title"] == "TEST_body_img.png" and d["kind"] == "image" and d["size"] > 0
        folder = DB.media_folders.find_one({"id": d["folder_id"]})
        assert folder["name"] == title and folder["article_content_id"] == cid
        root = DB.media_folders.find_one({"id": folder["parent_id"]})
        assert root["name"] == "Artikels"
        STATE["cid"], STATE["url_img"], STATE["title"] = cid, url, title
        STATE["keys"].append(_key(url))

    def test_update_adds_octet_aiff_audio(self, admin):
        cid = STATE["cid"]
        url = _upload_editor(admin, f"{D}/big.aiff", "TEST_big.aiff", "application/octet-stream")
        STATE["keys"].append(_key(url))
        body = f'<img src="{STATE["url_img"]}"><audio src="{url}"></audio>'
        r = requests.put(f"{API}/content/{cid}", headers=admin, json={"body": body}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        docs = _wait_assets(cid, 2)
        assert len(docs) == 2, docs
        aud = [d for d in docs if d["file_storage_key"] == _key(url)][0]
        assert len({d["folder_id"] for d in docs}) == 1
        assert aud["kind"] == "audio", f"octet-stream AIFF mirrored as kind={aud['kind']} mime={aud['mime_type']}"

    def test_library_media_file_not_duplicated(self, admin):
        cid = STATE["cid"]
        with open(f"{D}/s.png", "rb") as fh:
            r = requests.post(f"{API}/media", headers=admin, files={"file": ("TEST_lib.png", fh, "image/png")}, timeout=60)
        assert r.status_code == 201
        lib = r.json()
        STATE["assets"].append(lib["id"])
        before = DB.media_assets.count_documents({"content_id": cid})
        art = DB.content_items.find_one({"id": cid})
        r = requests.put(f"{API}/content/{cid}", headers=admin, json={"body": art["body"] + f'<img src="{lib["s3_url"]}">'}, timeout=30)
        assert r.status_code == 200
        time.sleep(3)
        assert DB.media_assets.count_documents({"content_id": cid}) == before
        assert DB.media_assets.count_documents({"file_storage_key": lib["file_storage_key"]}) == 1

    def test_rename_title_renames_subfolder(self, admin):
        cid = STATE["cid"]
        new_title = STATE["title"] + " renamed"
        r = requests.put(f"{API}/content/{cid}", headers=admin, json={"title": new_title}, timeout=30)
        assert r.status_code == 200
        time.sleep(3)
        folders = list(DB.media_folders.find({"article_content_id": cid}))
        assert len(folders) == 1
        assert folders[0]["name"] == new_title, f"subfolder still '{folders[0]['name']}' after title-only rename"

    def test_featured_image_mirrored(self, admin):
        cid = STATE["cid"]
        with open(f"{D}/s.png", "rb") as fh:
            r = requests.post(f"{API}/content/{cid}/featured-image", headers=admin, files={"file": ("TEST_feat.png", fh, "image/png")}, timeout=60)
        assert r.status_code in (200, 201), r.text[:300]
        time.sleep(3)
        docs = list(DB.media_assets.find({"content_id": cid, "source_detail": "featured_image"}))
        assert len(docs) == 1, docs
        STATE["keys"].append(docs[0]["file_storage_key"])

    def test_liveblog_entry_image_mirrored(self, admin):
        cid = STATE["cid"]
        url = _upload_editor(admin, f"{D}/s.png", "TEST_lb.png", "image/png")
        STATE["keys"].append(_key(url))
        r = requests.post(f"{API}/content/{cid}/liveblog/entries", headers=admin,
                          json={"title": "TEST entry", "body": "<p>x</p>", "images": [{"url": url, "key": _key(url), "credit": "TEST"}], "publish": False}, timeout=30)
        assert r.status_code == 201, r.text[:300]
        time.sleep(3)
        docs = list(DB.media_assets.find({"content_id": cid, "file_storage_key": _key(url)}))
        assert len(docs) == 1 and docs[0]["source_detail"] == "liveblog" and docs[0]["title"] == "TEST_lb.png"


# ---- Delete mirrored asset ----
class TestDeleteMirrored:
    def test_delete_keeps_s3_and_not_readded(self, admin):
        cid = STATE["cid"]
        a = DB.media_assets.find_one({"content_id": cid, "file_storage_key": _key(STATE["url_img"])})
        r = requests.delete(f"{API}/media/{a['id']}", headers=admin, timeout=30)
        # Iteration 187: deleting a file still used by an article is blocked (409)
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["used_in"][0]["content_id"] == cid
        assert DB.media_assets.find_one({"id": a["id"]}) is not None
        return
        assert DB.media_assets.find_one({"id": a["id"]}) is None
        assert requests.get(STATE["url_img"], timeout=30).status_code == 200
        assert DB.media_sync_ignore.find_one({"file_storage_key": a["file_storage_key"]})
        art = DB.content_items.find_one({"id": cid})
        requests.put(f"{API}/content/{cid}", headers=admin, json={"body": art["body"] + "<p>more</p>"}, timeout=30)
        time.sleep(3)
        requests.post(f"{API}/media/sync-articles", headers=admin, timeout=120)
        assert DB.media_assets.count_documents({"file_storage_key": a["file_storage_key"]}) == 0


# ---- Uploader delete / folder_id ----
class TestUploaderDelete:
    def test_viewer_upload_into_folder_and_delete_own(self, admin, roles):
        fid = str(uuid.uuid4())
        STATE.setdefault("folders", []).append(fid)
        DB.media_folders.insert_one({"id": fid, "name": "TEST_folder", "parent_id": None, "main_site_id": MAIN_SITE})
        with open(f"{D}/s.png", "rb") as fh:
            r = requests.post(f"{API}/media", headers=roles["viewer"], params={"folder_id": fid}, files={"file": ("TEST_v.png", fh, "image/png")}, timeout=60)
        assert r.status_code == 201, r.text
        asset = r.json()
        STATE["assets"].append(asset["id"])
        assert asset["folder_id"] == fid
        r = requests.get(f"{API}/media", headers=admin, params={"folder_id": fid}, timeout=30)
        assert any(x["id"] == asset["id"] for x in r.json())
        r = requests.delete(f"{API}/media/{asset['id']}", headers=roles["viewer"], timeout=30)
        assert r.status_code == 204, r.text

    @pytest.mark.parametrize("role", ["presentator"])  # redactie role has media_library.delete=True -> 204 by RBAC
    def test_role_cannot_delete_others(self, admin, roles, role):
        with open(f"{D}/s.png", "rb") as fh:
            r = requests.post(f"{API}/media", headers=roles["viewer"], files={"file": ("TEST_o.png", fh, "image/png")}, timeout=60)
        aid = r.json()["id"]
        STATE["assets"].append(aid)
        r = requests.delete(f"{API}/media/{aid}", headers=roles[role], timeout=30)
        assert r.status_code in (403, 404), r.text
        assert DB.media_assets.find_one({"id": aid})
        print(role, r.status_code)

    def test_aiff_13mb_octet_stream_editor_files(self, roles):
        assert os.path.getsize(f"{D}/big.aiff") > 12 * 1024 * 1024
        url = _upload_editor(roles["viewer"], f"{D}/big.aiff", "TEST_v.aiff", "application/octet-stream")
        STATE["keys"].append(_key(url))
        with open(f"{D}/big.aac", "rb") as fh:
            r = requests.post(f"{API}/uploads/editor-files", headers=roles["viewer"], files={"file": ("TEST_v.aac", fh, "application/octet-stream")}, timeout=180)
        assert r.status_code == 200, r.text[:300]
