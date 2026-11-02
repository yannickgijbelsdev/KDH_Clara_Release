# Regression: white-screen / event-loop-blocking fixes (iteration 184)
import os
import io
import time
import concurrent.futures as cf
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SHOW_ID = "675a5238-8ab7-478d-882d-dad3734cf628"
ADMIN = {"email": "admkoodh@koodh.com", "password": "KYLovie13monx"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# Health
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200


# Composite images still correct
def test_composite_png_size():
    r = requests.get(f"{BASE_URL}/api/rds/show/{SHOW_ID}/presenter-composite.png", timeout=60)
    assert r.status_code == 200, r.text[:200]
    assert r.headers["content-type"].startswith("image/png")
    img = Image.open(io.BytesIO(r.content))
    print("composite size", img.size)
    assert img.size[1] == 1024 and img.size[0] % 768 == 0


def test_presenter_slot_png_size():
    r = requests.get(f"{BASE_URL}/api/rds/show/{SHOW_ID}/presenter-image/1.png", timeout=60)
    assert r.status_code == 200, r.text[:200]
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (1024, 1024)


# Event loop responsiveness under parallel composite load
def test_health_fast_during_parallel_composites():
    url = f"{BASE_URL}/api/rds/show/{SHOW_ID}/presenter-composite.png?t={time.time()}"
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        futs = [ex.submit(requests.get, url + f"&n={i}", timeout=90) for i in range(10)]
        time.sleep(0.3)
        health_times = []
        for _ in range(5):
            t0 = time.time()
            h = requests.get(f"{BASE_URL}/api/health", timeout=20)
            health_times.append(time.time() - t0)
            assert h.status_code == 200
            time.sleep(0.2)
        codes = [f.result().status_code for f in futs]
    print("health times", health_times, "composite codes", codes)
    assert all(c == 200 for c in codes)
    assert max(health_times) < 1.5


# Avatar compression (threaded) + S3 upload
def test_avatar_upload_compresses(auth):
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=auth, timeout=20).json()
    uid = me["id"]
    import numpy as np  # noqa
    arr = (np.random.rand(3000, 4000, 3) * 255).astype("uint8")
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=95)
    raw = buf.getvalue()
    print("raw bytes", len(raw))
    t0 = time.time()
    r = requests.post(f"{BASE_URL}/api/users/{uid}/avatar", headers=auth,
                      files={"file": ("TEST_big.jpg", raw, "image/jpeg")}, timeout=120)
    print("avatar upload", r.status_code, time.time() - t0, r.text[:300])
    assert r.status_code == 200
    av = r.json()["avatar"]
    url = av.get("s3_url") or av.get("url") or av.get("file_key") or ""
    assert url
    size = av.get("size") or av.get("file_size")
    if size:
        assert size < len(raw)


# Editor files S3 upload + raw read back
def test_editor_file_upload_and_read(auth):
    img = Image.new("RGB", (64, 64), (200, 10, 10))
    b = io.BytesIO()
    img.save(b, format="PNG")
    r = requests.post(f"{BASE_URL}/api/uploads/editor-files", headers=auth,
                      files={"file": ("TEST_editor.png", b.getvalue(), "image/png")}, timeout=60)
    print("editor upload", r.status_code, r.text[:300])
    assert r.status_code == 200
    url = r.json()["url"]
    assert "editor/" in url
    key = "editor/" + url.split("editor/")[-1].split("?")[0]
    g = requests.get(f"{BASE_URL}/api/uploads/editor-files/raw/{key}", timeout=30)
    assert g.status_code == 200
    assert Image.open(io.BytesIO(g.content)).size == (64, 64)


# auth/me 401 for bad token
def test_auth_me_401_bad_token():
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer bad"}, timeout=20)
    assert r.status_code == 401
