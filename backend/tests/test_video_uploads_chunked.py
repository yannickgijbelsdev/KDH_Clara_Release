"""Chunked large-video upload + FFmpeg compression (/api/video-uploads) and S3-only upload regressions."""
import io
import json
import os
import subprocess
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
BIG = "/tmp/vt/big.mp4"
SMALL = "/tmp/vt/small.mp4"
CHUNK = 8 * 1024 * 1024


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def admin():
    return _login("admkoodh@koodh.com", "KYLovie13monx")


@pytest.fixture(scope="module")
def netadmin():
    return _login("yannick.gijbels@koodh.com", "test")


def _ensure_videos():
    os.makedirs("/tmp/vt", exist_ok=True)
    if not os.path.exists(BIG):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=2560x1440:rate=30",
                        "-f", "lavfi", "-i", "sine", "-t", "8", "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "30M",
                        "-c:a", "aac", "-shortest", BIG], check=True)
    if not os.path.exists(SMALL):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25",
                        "-f", "lavfi", "-i", "sine", "-t", "3", "-c:v", "libx264", "-preset", "ultrafast",
                        "-c:a", "aac", "-shortest", SMALL], check=True)


def _init(h, size, target="video_endpoint", filename="TEST_vid.mp4", ctype="video/mp4", content_id=None):
    return requests.post(f"{API}/video-uploads/init", headers=h, timeout=60, json={
        "filename": filename, "size": size, "content_type": ctype, "target": target, "content_id": content_id})


def _upload_all(h, path, target="video_endpoint", content_id=None):
    size = os.path.getsize(path)
    r = _init(h, size, target=target, content_id=content_id)
    assert r.status_code == 200, r.text
    init = r.json()
    with open(path, "rb") as f:
        for i in range(init["total_chunks"]):
            data = f.read(init["chunk_size"])
            pr = requests.put(f"{API}/video-uploads/{init['upload_id']}/chunks/{i}", data=data, timeout=300,
                              headers={**h, "Content-Type": "application/octet-stream"})
            assert pr.status_code == 200, pr.text
            assert pr.json()["received"] == len(data)
    return init, size


def _poll(h, uid, timeout=240):
    seen = []
    end = time.time() + timeout
    while time.time() < end:
        g = requests.get(f"{API}/video-uploads/{uid}", headers=h, timeout=30)
        assert g.status_code == 200
        d = g.json()
        seen.append((d["status"], d.get("progress")))
        if d["status"] in ("done", "error"):
            return d, seen
        time.sleep(2)
    pytest.fail(f"timeout waiting for compression: {seen[-3:]}")


# --- init validation ---
class TestInitValidation:
    def test_init_ok(self, admin):
        r = _init(admin, 31 * 1024 * 1024)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["chunk_size"] == CHUNK and d["total_chunks"] == 4 and isinstance(d["upload_id"], str)
        requests.delete(f"{API}/video-uploads/{d['upload_id']}", headers=admin, timeout=30)

    def test_too_large(self, admin):
        r = _init(admin, 2 * 1024 ** 3 + 1)
        assert r.status_code == 413

    def test_exactly_2gb_allowed(self, admin):
        r = _init(admin, 2 * 1024 ** 3)
        assert r.status_code == 200, r.text
        requests.delete(f"{API}/video-uploads/{r.json()['upload_id']}", headers=admin, timeout=30)

    def test_invalid_target(self, admin):
        assert _init(admin, 1000, target="bogus").status_code == 400

    def test_non_video(self, admin):
        assert _init(admin, 1000, filename="TEST_x.pdf", ctype="application/pdf").status_code == 400

    def test_liveblog_requires_content_id(self, admin):
        r = _init(admin, 1000, target="liveblog")
        assert r.status_code == 400 and "content_id" in r.text

    def test_liveblog_bad_content_404(self, admin):
        assert _init(admin, 1000, target="liveblog", content_id="nonexistent-xyz").status_code == 404

    def test_zero_size(self, admin):
        assert _init(admin, 0).status_code in (400, 413, 422)

    def test_unauth(self):
        r = requests.post(f"{API}/video-uploads/init", json={"filename": "a.mp4", "size": 10, "target": "article"}, timeout=30)
        assert r.status_code in (401, 403)


# --- chunk / complete / cancel ---
class TestChunks:
    def test_foreign_user_404(self, admin):
        from pymongo import MongoClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        coll = MongoClient(env["MONGO_URL"])[env["DB_NAME"]].video_uploads
        uid = _init(admin, 1000).json()["upload_id"]
        coll.update_one({"id": uid}, {"$set": {"user_id": "TEST_other_user"}})
        h = {**admin, "Content-Type": "application/octet-stream"}
        assert requests.put(f"{API}/video-uploads/{uid}/chunks/0", data=b"x" * 10, headers=h, timeout=30).status_code == 404
        assert requests.get(f"{API}/video-uploads/{uid}", headers=admin, timeout=30).status_code == 404
        assert requests.delete(f"{API}/video-uploads/{uid}", headers=admin, timeout=30).status_code == 404
        coll.delete_one({"id": uid})

    def test_invalid_index_missing_cancel(self, admin):
        r = _init(admin, 1000)
        uid = r.json()["upload_id"]
        h = {**admin, "Content-Type": "application/octet-stream"}
        assert requests.put(f"{API}/video-uploads/{uid}/chunks/5", data=b"x" * 10, headers=h, timeout=30).status_code == 400
        assert requests.put(f"{API}/video-uploads/{uid}/chunks/-1", data=b"x" * 10, headers=h, timeout=30).status_code == 400
        # missing chunks on complete
        c = requests.post(f"{API}/video-uploads/{uid}/complete", headers=admin, timeout=30)
        assert c.status_code == 400 and "Missing" in c.text
        # cancel
        d = requests.delete(f"{API}/video-uploads/{uid}", headers=admin, timeout=30)
        assert d.status_code == 200 and d.json()["status"] == "cancelled"
        g = requests.get(f"{API}/video-uploads/{uid}", headers=admin, timeout=30).json()
        assert g["status"] == "cancelled"
        # chunks after cancel -> 409
        assert requests.put(f"{API}/video-uploads/{uid}/chunks/0", data=b"x" * 10, headers=h, timeout=30).status_code == 409

    def test_empty_chunk(self, admin):
        uid = _init(admin, 1000).json()["upload_id"]
        r = requests.put(f"{API}/video-uploads/{uid}/chunks/0", data=b"", headers={**admin, "Content-Type": "application/octet-stream"}, timeout=30)
        assert r.status_code == 400
        requests.delete(f"{API}/video-uploads/{uid}", headers=admin, timeout=30)

    def test_get_unknown_404(self, admin):
        assert requests.get(f"{API}/video-uploads/does-not-exist", headers=admin, timeout=30).status_code == 404


# --- full happy path with ffprobe verification ---
class TestCompression:
    def test_big_1440p_compressed_to_1080p(self, admin):
        _ensure_videos()
        init, size = _upload_all(admin, BIG, target="video_endpoint")
        assert init["total_chunks"] == -(-size // CHUNK)
        c = requests.post(f"{API}/video-uploads/{init['upload_id']}/complete", headers=admin, timeout=120)
        assert c.status_code == 200, c.text
        assert c.json()["status"] in ("processing", "queued")
        d, seen = _poll(admin, init["upload_id"])
        print("status trail:", seen)
        assert d["status"] == "done", d
        assert d["url"].startswith("http") and d["key"].endswith(".mp4") and d["key"].startswith("videos/")
        assert d["original_size"] == size and d["size"] < size
        pr = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", d["url"]],
                            capture_output=True, text=True, timeout=120)
        streams = json.loads(pr.stdout)["streams"]
        v = [s for s in streams if s["codec_type"] == "video"][0]
        a = [s for s in streams if s["codec_type"] == "audio"]
        print("output:", v["codec_name"], v["width"], v["height"], d["size"])
        assert v["codec_name"] == "h264" and v["width"] == 1920 and v["height"] == 1080
        assert a and a[0]["codec_name"] == "aac"
        # complete again is idempotent
        c2 = requests.post(f"{API}/video-uploads/{init['upload_id']}/complete", headers=admin, timeout=30)
        assert c2.status_code == 200 and c2.json()["status"] == "done"
        # delete on done job does not cancel
        dd = requests.delete(f"{API}/video-uploads/{init['upload_id']}", headers=admin, timeout=30)
        assert dd.json()["status"] == "done"

    def test_small_article_target_not_upscaled(self, admin):
        _ensure_videos()
        init, size = _upload_all(admin, SMALL, target="article")
        assert requests.post(f"{API}/video-uploads/{init['upload_id']}/complete", headers=admin, timeout=60).status_code == 200
        d, _ = _poll(admin, init["upload_id"])
        assert d["status"] == "done", d
        assert d["key"].startswith("editor/videos/")
        pr = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", d["url"]], capture_output=True, text=True, timeout=60)
        v = [s for s in json.loads(pr.stdout)["streams"] if s["codec_type"] == "video"][0]
        assert v["width"] == 640 and v["height"] == 360

    def test_invalid_video_bytes_reports_error(self, admin):
        r = _init(admin, 2048, filename="TEST_garbage.mp4")
        uid = r.json()["upload_id"]
        p = requests.put(f"{API}/video-uploads/{uid}/chunks/0", data=os.urandom(2048),
                         headers={**admin, "Content-Type": "application/octet-stream"}, timeout=30)
        if p.status_code == 403:
            assert "Global Protect" in p.text  # non-video bytes rejected at chunk 0
            requests.delete(f"{API}/video-uploads/{uid}", headers=admin, timeout=30)
            return
        assert p.status_code == 200, p.text
        assert requests.post(f"{API}/video-uploads/{uid}/complete", headers=admin, timeout=30).status_code == 200
        d, _ = _poll(admin, uid, timeout=90)
        assert d["status"] == "error" and d.get("error")


# --- regressions: S3-only uploads ---
class TestS3Regressions:
    def test_editor_files_image(self, admin):
        png = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                            "1f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082")
        r = requests.post(f"{API}/uploads/editor-files", headers=admin, timeout=60,
                          files={"file": ("TEST_px.png", io.BytesIO(png), "image/png")})
        assert r.status_code == 200, r.text
        assert r.json()["url"].startswith("http")

    def test_vmix_config(self, admin):
        r = requests.get(f"{API}/vmix/config", headers=admin, timeout=30)
        assert r.status_code == 200, r.text
        assert "_id" not in r.json()

    def test_audio_trigger_in_sound_s3(self, admin):
        r = requests.post(f"{API}/audio-triggers", headers=admin, timeout=30,
                          json={"name": "TEST_trigger", "station": "mfy"})
        if r.status_code == 404:
            pytest.skip("audio_trigger_router is not mounted in server.py (feature removed earlier)")
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        try:
            with open("/tmp/vt/tone.mp3", "wb") as _:
                pass
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=d=1", "/tmp/vt/tone.mp3"], check=True)
            with open("/tmp/vt/tone.mp3", "rb") as f:
                u = requests.post(f"{API}/audio-triggers/{tid}/in-sound", headers=admin, timeout=60,
                                  files={"file": ("TEST_tone.mp3", f, "audio/mpeg")})
            assert u.status_code == 200, u.text
            assert u.json()["path"].startswith("audio_triggers/")
            g = requests.get(f"{API}/audio-triggers/{tid}", headers=admin, timeout=30).json()
            assert g["in_sound_path"].startswith("audio_triggers/")
            dl = requests.delete(f"{API}/audio-triggers/{tid}/in-sound", headers=admin, timeout=30)
            assert dl.status_code == 200
            g = requests.get(f"{API}/audio-triggers/{tid}", headers=admin, timeout=30).json()
            assert g["in_sound_path"] is None
        finally:
            requests.delete(f"{API}/audio-triggers/{tid}", headers=admin, timeout=30)
