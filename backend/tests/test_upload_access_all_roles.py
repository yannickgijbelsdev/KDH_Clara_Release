"""Iteration 185: every logged-in user (any role) can upload audio/video/images; server-side audio->MP3 192k; Global Protect audio limits."""
import json
import os
import subprocess
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
D = "/tmp/at"
LIVEBLOG_ID = "9f3cdbc2-0c78-4442-a20f-08221c871eca"
ROLES = ["redactie", "presentator", "viewer", "presenter"]
CREATED_ASSETS = []


def _tokens():
    if not os.path.exists("/tmp/role_tokens.json"):
        subprocess.run(["python", "/tmp/mint.py"], check=True)
    return json.load(open("/tmp/role_tokens.json"))


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"email": "admkoodh@koodh.com", "password": "KYLovie13monx"}, timeout=30)
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def roles():
    return {k: {"Authorization": f"Bearer {v}"} for k, v in _tokens().items()}


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin):
    yield
    # Admin DELETE is team-scoped (404 for other teams) and non-editor roles get 403 -> clean in DB.
    if CREATED_ASSETS:
        from pymongo import MongoClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        MongoClient(env["MONGO_URL"])[env["DB_NAME"]].media_assets.delete_many({"id": {"$in": CREATED_ASSETS}})


def _f(name):
    return f"{D}/{name}"


# ---- Editor file uploads (any role) ----
class TestEditorFiles:
    @pytest.mark.parametrize("role", ROLES)
    @pytest.mark.parametrize("fname,ctype", [("small.mp3", "audio/mpeg"), ("small.mp4", "video/mp4"), ("s.png", "image/png")])
    def test_role_can_upload(self, roles, role, fname, ctype):
        with open(_f(fname), "rb") as fh:
            r = requests.post(f"{API}/uploads/editor-files", headers=roles[role],
                              files={"file": (f"TEST_{fname}", fh, ctype)}, timeout=120)
        assert r.status_code == 200, f"{role} {fname}: {r.status_code} {r.text[:200]}"
        assert r.json()["url"].startswith("http")

    @pytest.mark.parametrize("ext,ctype", [("wav", "audio/wav"), ("m4a", "audio/mp4"), ("aac", "audio/aac"),
                                           ("flac", "audio/flac"), ("ogg", "audio/ogg"), ("opus", "audio/opus"),
                                           ("aiff", "audio/aiff"), ("wma", "audio/x-ms-wma")])
    def test_audio_formats_accepted(self, roles, ext, ctype):
        with open(_f("small.mp3"), "rb") as fh:
            r = requests.post(f"{API}/uploads/editor-files", headers=roles["viewer"],
                              files={"file": (f"TEST_a.{ext}", fh, ctype)}, timeout=120)
        assert r.status_code == 200, f"{ext}: {r.status_code} {r.text[:200]}"

    def test_unauthenticated_401(self):
        with open(_f("small.mp3"), "rb") as fh:
            r = requests.post(f"{API}/uploads/editor-files", files={"file": ("a.mp3", fh, "audio/mpeg")}, timeout=60)
        assert r.status_code in (401, 403) and "Not authenticated" in r.text

    def test_global_protect_aac_12mb_not_blocked(self, roles):
        assert os.path.getsize(_f("big.aac")) > 10 * 1024 * 1024
        with open(_f("big.aac"), "rb") as fh:
            r = requests.post(f"{API}/uploads/editor-files", headers=roles["redactie"],
                              files={"file": ("TEST_big.aac", fh, "audio/aac")}, timeout=300)
        assert r.status_code == 200, r.text[:300]

    def test_global_protect_aiff_octet_stream_not_blocked(self, roles):
        with open(_f("big.aiff"), "rb") as fh:
            r = requests.post(f"{API}/uploads/editor-files", headers=roles["redactie"],
                              files={"file": ("TEST_big.aiff", fh, "application/octet-stream")}, timeout=300)
        assert r.status_code == 200, r.text[:300]


# ---- Media library direct upload (any role) ----
class TestMediaDirect:
    @pytest.mark.parametrize("role", ROLES)
    def test_role_can_post_media(self, roles, role):
        with open(_f("small.mp3"), "rb") as fh:
            r = requests.post(f"{API}/media", headers=roles[role],
                              files={"file": ("TEST_small.mp3", fh, "audio/mpeg")}, data={"title": f"TEST_{role}"}, timeout=120)
        assert r.status_code in (200, 201), f"{role}: {r.status_code} {r.text[:200]}"
        d = r.json()
        aid = d.get("id") or (d.get("asset") or {}).get("id")
        assert aid
        CREATED_ASSETS.append(aid)
        assert d.get("kind", (d.get("asset") or {}).get("kind")) == "audio"

    def test_unauth_media_401(self):
        with open(_f("small.mp3"), "rb") as fh:
            r = requests.post(f"{API}/media", files={"file": ("a.mp3", fh, "audio/mpeg")}, timeout=60)
        assert r.status_code in (401, 403) and "Not authenticated" in r.text


# ---- Legacy video endpoints + liveblog uploads (any role) ----
class TestOtherUploads:
    @pytest.mark.parametrize("role", ["redactie", "viewer"])
    def test_video_endpoint_upload(self, roles, role):
        with open(_f("small.mp4"), "rb") as fh:
            r = requests.post(f"{API}/videos/upload", headers=roles[role],
                              files={"file": ("TEST_v.mp4", fh, "video/mp4")}, timeout=180)
        assert r.status_code in (200, 201), f"{role}: {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize("role", ["redactie", "viewer"])
    def test_liveblog_upload_image(self, roles, role):
        with open(_f("s.png"), "rb") as fh:
            r = requests.post(f"{API}/content/{LIVEBLOG_ID}/liveblog/upload-image", headers=roles[role],
                              files={"file": ("TEST_s.png", fh, "image/png")}, timeout=120)
        assert r.status_code in (200, 201), f"{role}: {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize("role", ["redactie", "viewer"])
    def test_liveblog_upload_video(self, roles, role):
        with open(_f("small.mp4"), "rb") as fh:
            r = requests.post(f"{API}/content/{LIVEBLOG_ID}/liveblog/upload-video", headers=roles[role],
                              files={"file": ("TEST_v.mp4", fh, "video/mp4")}, timeout=180)
        assert r.status_code in (200, 201), f"{role}: {r.status_code} {r.text[:200]}"


# ---- Chunked flow ----
def _init(h, size, target, filename, ctype, content_id=None):
    return requests.post(f"{API}/video-uploads/init", headers=h, timeout=60, json={
        "filename": filename, "size": size, "content_type": ctype, "target": target,
        "content_id": content_id, "title": "TEST_chunked"})


def _chunked(h, path, target, filename, ctype):
    size = os.path.getsize(path)
    r = _init(h, size, target, filename, ctype)
    assert r.status_code == 200, r.text
    init = r.json()
    with open(path, "rb") as fh:
        for i in range(init["total_chunks"]):
            pr = requests.put(f"{API}/video-uploads/{init['upload_id']}/chunks/{i}", data=fh.read(init["chunk_size"]),
                              headers={**h, "Content-Type": "application/octet-stream"}, timeout=300)
            assert pr.status_code == 200, pr.text
    c = requests.post(f"{API}/video-uploads/{init['upload_id']}/complete", headers=h, timeout=60)
    assert c.status_code == 200, c.text
    for _ in range(90):
        j = requests.get(f"{API}/video-uploads/{init['upload_id']}", headers=h, timeout=30).json()
        if j["status"] in ("done", "error"):
            return init, j
        time.sleep(2)
    pytest.fail("compression timeout")


class TestChunked:
    def test_unauth_init_401(self):
        r = requests.post(f"{API}/video-uploads/init", json={"filename": "a.wav", "size": 10, "target": "media"}, timeout=30)
        assert r.status_code in (401, 403) and "Not authenticated" in r.text

    @pytest.mark.parametrize("target", ["video_endpoint", "liveblog"])
    def test_audio_rejected_for_video_targets(self, roles, target):
        r = _init(roles["viewer"], 1000, target, "TEST_a.wav", "audio/wav", content_id=LIVEBLOG_ID)
        assert r.status_code == 400, r.text

    def test_wav_to_mp3_media_asset(self, roles):
        h = roles["presentator"]
        init, j = _chunked(h, _f("big.wav"), "media", "TEST_big.wav", "audio/wav")
        assert init["kind"] == "audio"
        assert j["status"] == "done", j
        assert j["kind"] == "audio" and j["mime_type"] == "audio/mpeg"
        assert j["url"].endswith(".mp3") and j["asset_id"]
        CREATED_ASSETS.append(j["asset_id"])
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,bit_rate", "-of", "csv=p=0",
                              j["url"]], capture_output=True, text=True).stdout.strip()
        assert out.startswith("mp3") and "192000" in out, out
        a = requests.get(f"{API}/media/{j['asset_id']}", headers=h, timeout=30)
        assert a.status_code == 200, a.text
        asset = a.json().get("asset", a.json())
        assert asset["kind"] == "audio" and asset["mime_type"] == "audio/mpeg"
        assert asset.get("duration_seconds") and abs(asset["duration_seconds"] - 70) < 2

    def test_wav_article_target_mp3(self, roles):
        init, j = _chunked(roles["viewer"], _f("big.wav"), "article", "TEST_big.wav", "audio/wav")
        assert j["status"] == "done" and j["url"].endswith(".mp3") and "/editor/videos/" in j["url"]
        assert not j.get("asset_id")

    def test_video_media_target(self, roles):
        h = roles["redactie"]
        init, j = _chunked(h, _f("small.mp4"), "media", "TEST_v.mp4", "video/mp4")
        assert j["status"] == "done" and j["kind"] == "video" and j["mime_type"] == "video/mp4", j
        assert j["asset_id"]
        CREATED_ASSETS.append(j["asset_id"])
