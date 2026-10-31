# QR code feature: editor-files upload + raw same-origin fetch endpoint
import io
import os
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN = {"email": "admkoodh@koodh.com", "password": "KYLovie13monx"}


def _png_bytes():
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\x00' + b'\xff\x00\x00' * 4 for _ in range(4))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 4, 4, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    d = r.json()
    return d.get("token") or d.get("access_token")


@pytest.fixture(scope="module")
def uploaded_key(token):
    png = _png_bytes()
    r = requests.post(f"{BASE_URL}/api/uploads/editor-files",
                      headers={"Authorization": f"Bearer {token}"},
                      files={"file": ("TEST_qr.png", io.BytesIO(png), "image/png")}, timeout=60)
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    assert "editor/" in url
    return url[url.index("editor/"):], png


class TestEditorRaw:
    def test_upload_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/uploads/editor-files",
                          files={"file": ("x.png", io.BytesIO(_png_bytes()), "image/png")}, timeout=30)
        assert r.status_code in (401, 403)

    def test_raw_returns_bytes(self, uploaded_key):
        key, png = uploaded_key
        r = requests.get(f"{BASE_URL}/api/uploads/editor-files/raw/{key}", timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("image/png")
        assert r.content == png

    def test_raw_non_editor_prefix_400(self):
        r = requests.get(f"{BASE_URL}/api/uploads/editor-files/raw/avatars/foo.png", timeout=30)
        assert r.status_code == 400

    def test_raw_traversal_400(self):
        r = requests.get(f"{BASE_URL}/api/uploads/editor-files/raw/editor/..%2Fsecret.png", timeout=30)
        assert r.status_code in (400, 404)

    def test_raw_non_image_400(self):
        r = requests.get(f"{BASE_URL}/api/uploads/editor-files/raw/editor/file.pdf", timeout=30)
        assert r.status_code == 400

    def test_raw_no_ext_400(self):
        r = requests.get(f"{BASE_URL}/api/uploads/editor-files/raw/editor/noext", timeout=30)
        assert r.status_code == 400

    def test_raw_missing_404(self):
        r = requests.get(f"{BASE_URL}/api/uploads/editor-files/raw/editor/TEST_does-not-exist-123.png", timeout=30)
        assert r.status_code == 404
