# Media editor API tests: source-url/stream (signed, Range), render validation + jobs, image save (new/overwrite)
import io
import os
import subprocess
import tempfile
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
SITE = "63154708-3320-444c-932d-aa3642b5090c"
TA = "9f6f547d-87a6-4d5d-8336-612590cb47ec"   # EDITORTEST_ta.mp3 (10s)
TB = "dcc2f44f-0376-4bb2-9772-b23f95375313"   # EDITORTEST_tb.mp3 (8s)
TV = "70776953-2c84-4679-b319-681a089b889f"   # EDITORTEST_tv.mp4 (10s)
IMG_PNG = "c453d58b-470a-4445-81b0-56833b731248"

CREATED = []


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{API}/auth/login", json={"email": "admkoodh@koodh.com", "password": "KYLovie13monx"})
    if r.status_code != 200:
        pytest.skip("login failed")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    sess = requests.Session()
    sess.headers.update({"Authorization": f"Bearer {tok}", "X-Main-Site-ID": SITE})
    yield sess
    for aid in CREATED:
        sess.delete(f"{API}/media/{aid}")


def _probe(url):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height",
                          "-of", "json", url], capture_output=True, text=True, timeout=60).stdout
    import json
    return json.loads(out or "{}")


def _poll(s, job_id, timeout=180):
    t0 = time.time()
    seen = []
    while time.time() - t0 < timeout:
        r = s.get(f"{API}/media-editor/jobs/{job_id}")
        assert r.status_code == 200
        d = r.json()
        seen.append(d.get("progress"))
        if d["status"] in ("done", "error"):
            return d, seen
        time.sleep(2)
    raise AssertionError("render timeout")


# --- source url + streaming
class TestSource:
    def test_source_url_and_stream(self, s):
        r = s.get(f"{API}/media-editor/source-url/{TA}")
        assert r.status_code == 200
        url = r.json()["url"]
        assert url.startswith(f"/api/media-editor/source/{TA}?exp=")
        full = requests.get(BASE_URL + url)
        assert full.status_code == 200 and len(full.content) == 80475
        part = requests.get(BASE_URL + url, headers={"Range": "bytes=0-99"})
        assert part.status_code == 206 and len(part.content) == 100
        assert part.headers.get("Content-Range", "").startswith("bytes 0-99/")

    def test_bad_sig_and_expired(self, s):
        url = s.get(f"{API}/media-editor/source-url/{TA}").json()["url"]
        bad = url.rsplit("sig=", 1)[0] + "sig=deadbeef"
        assert requests.get(BASE_URL + bad).status_code == 403
        assert requests.get(f"{API}/media-editor/source/{TA}?exp=1000&sig=abc").status_code == 403

    def test_source_url_requires_auth_and_scope(self, s):
        assert requests.get(f"{API}/media-editor/source-url/{TA}").status_code in (401, 403)
        r = s.get(f"{API}/media-editor/source-url/{TA}", headers={"X-Main-Site-ID": "other-site-xyz"})
        assert r.status_code == 404


# --- render validation
class TestRenderValidation:
    def _post(self, s, **kw):
        body = {"kind": "audio", "title": "TEST_x", "clips": [{"asset_id": TA, "in": 0, "out": 2}]}
        body.update(kw)
        return s.post(f"{API}/media-editor/render", json=body)

    def test_zero_clips(self, s):
        assert self._post(s, clips=[]).status_code == 400

    def test_too_many_clips(self, s):
        assert self._post(s, clips=[{"asset_id": TA, "in": 0, "out": 1}] * 41).status_code == 400

    def test_out_le_in(self, s):
        assert self._post(s, clips=[{"asset_id": TA, "in": 3, "out": 2}]).status_code == 400

    def test_foreign_asset(self, s):
        r = s.post(f"{API}/media-editor/render", headers={"X-Main-Site-ID": "other-site-xyz"},
                   json={"kind": "audio", "title": "TEST_x", "clips": [{"asset_id": TA, "in": 0, "out": 2}]})
        assert r.status_code == 400

    def test_video_without_video_track0(self, s):
        assert self._post(s, kind="video", clips=[{"asset_id": TA, "track": 0, "in": 0, "out": 2}]).status_code == 400
        assert self._post(s, kind="video", clips=[{"asset_id": TV, "track": 1, "in": 0, "out": 2}]).status_code == 400

    def test_image_asset_rejected(self, s):
        assert self._post(s, clips=[{"asset_id": IMG_PNG, "in": 0, "out": 2}]).status_code == 400

    def test_job_not_found(self, s):
        assert s.get(f"{API}/media-editor/jobs/nonexistent").status_code == 404


# --- render audio & video
class TestRender:
    def test_audio_mix_new(self, s):
        clips = [{"asset_id": TA, "track": 0, "start": 0, "in": 1, "out": 5, "volume": 0.8, "fade_in": 0.5, "fade_out": 1},
                 {"asset_id": TB, "track": 1, "start": 3, "in": 0, "out": 4, "volume": 1.2}]
        r = s.post(f"{API}/media-editor/render", json={"kind": "audio", "title": "TEST_audio_mix", "clips": clips})
        assert r.status_code == 200
        job, _ = _poll(s, r.json()["id"])
        assert job["status"] == "done", job
        CREATED.append(job["asset_id"])
        assets = s.get(f"{API}/media", params={"kind": "audio"}).json()
        a = next(x for x in assets if x["id"] == job["asset_id"])
        assert a["title"] == "TEST_audio_mix" and abs(a["duration_seconds"] - 7.0) < 0.15
        p = _probe(job["url"])
        assert abs(float(p["format"]["duration"]) - 7.0) < 0.3
        assert p["streams"][0]["codec_name"] == "mp3"

    def test_video_new(self, s):
        clips = [{"asset_id": TV, "track": 0, "start": 0, "in": 0, "out": 3},
                 {"asset_id": TV, "track": 0, "start": 4, "in": 5, "out": 8},
                 {"asset_id": TA, "track": 1, "start": 1, "in": 0, "out": 4}]
        r = s.post(f"{API}/media-editor/render", json={"kind": "video", "title": "TEST_video_edit", "clips": clips})
        assert r.status_code == 200
        job, _ = _poll(s, r.json()["id"], 300)
        assert job["status"] == "done", job
        CREATED.append(job["asset_id"])
        p = _probe(job["url"])
        codecs = {st["codec_name"] for st in p["streams"]}
        v = next(st for st in p["streams"] if st["codec_name"] == "h264")
        assert {"h264", "aac"} <= codecs and v["width"] == 1920 and v["height"] == 1080
        assert abs(float(p["format"]["duration"]) - 7.0) < 0.4

    def test_overwrite_audio(self, s):
        # make a scratch copy, then overwrite it
        r = s.post(f"{API}/media-editor/render", json={"kind": "audio", "title": "TEST_scratch",
                                                       "clips": [{"asset_id": TB, "in": 0, "out": 6}]})
        job, _ = _poll(s, r.json()["id"])
        assert job["status"] == "done"
        sid = job["asset_id"]
        CREATED.append(sid)
        before = next(x for x in s.get(f"{API}/media", params={"kind": "audio"}).json() if x["id"] == sid)
        r = s.post(f"{API}/media-editor/render", json={"kind": "audio", "title": "TEST_scratch", "mode": "overwrite",
                                                       "original_asset_id": sid, "clips": [{"asset_id": sid, "in": 0, "out": 2}]})
        assert r.status_code == 200
        job2, _ = _poll(s, r.json()["id"])
        assert job2["status"] == "done" and job2["asset_id"] == sid
        after = next(x for x in s.get(f"{API}/media", params={"kind": "audio"}).json() if x["id"] == sid)
        assert after["file_storage_key"] == before["file_storage_key"]
        assert abs(after["duration_seconds"] - 2.0) < 0.15 and after["size"] < before["size"]

    def test_overwrite_wrong_kind(self, s):
        r = s.post(f"{API}/media-editor/render", json={"kind": "audio", "title": "x", "mode": "overwrite",
                                                       "original_asset_id": TV, "clips": [{"asset_id": TA, "in": 0, "out": 1}]})
        assert r.status_code == 400


# --- image save
def _png_bytes(fmt="PNG"):
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGB", (64, 32), (200, 10, 10)).save(b, fmt)
    return b.getvalue()


class TestImage:
    def test_image_new_and_overwrite(self, s):
        r = s.post(f"{API}/media-editor/image", files={"file": ("e.png", _png_bytes(), "image/png")},
                   data={"title": "TEST_img_edit", "mode": "new", "original_asset_id": IMG_PNG})
        assert r.status_code == 200 and r.json()["mode"] == "new"
        nid = r.json()["id"]
        CREATED.append(nid)
        imgs = s.get(f"{API}/media", params={"kind": "image"}).json()
        a = next(x for x in imgs if x["id"] == nid)
        assert a["title"] == "TEST_img_edit" and a["file_storage_key"].endswith(".png")
        # overwrite the new one (png) with png -> same id/key
        r2 = s.post(f"{API}/media-editor/image", files={"file": ("e.png", _png_bytes(), "image/png")},
                    data={"title": "x", "mode": "overwrite", "original_asset_id": nid})
        assert r2.status_code == 200 and r2.json()["id"] == nid
        a2 = next(x for x in s.get(f"{API}/media", params={"kind": "image"}).json() if x["id"] == nid)
        assert a2["file_storage_key"] == a["file_storage_key"]
        # overwrite png with jpeg -> 400
        r3 = s.post(f"{API}/media-editor/image", files={"file": ("e.jpg", _png_bytes("JPEG"), "image/jpeg")},
                    data={"title": "x", "mode": "overwrite", "original_asset_id": nid})
        assert r3.status_code == 400

    def test_image_new_rejects_non_image_content_type(self, s):
        # Code review: new-mode accepts any content_type and stores it as mime (e.g. text/html)
        r = s.post(f"{API}/media-editor/image", files={"file": ("e.html", b"<h1>hello</h1>", "text/html")},
                   data={"title": "TEST_html", "mode": "new", "original_asset_id": IMG_PNG})
        if r.status_code == 200:
            CREATED.append(r.json()["id"])
        assert r.status_code == 400, f"non-image accepted: {r.status_code} {r.text[:200]}"
