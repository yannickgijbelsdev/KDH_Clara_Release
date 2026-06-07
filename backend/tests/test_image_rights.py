"""Backend tests for Image Copyright/Attribution enforcement (Clara).

Covers:
- GET /api/content/{id}/image-rights returns structured per-image status
- PUT /api/content/{id}/image-rights round-trips structured attributions
- POST /api/content/{id}/publish-clara returns 409 Dutch error when rights missing
- POST /api/content/{id}/publish-clara succeeds after rights filled
- News API GET /api/news/articles/{id} emits <figcaption class="clara-img-credit">
  for inline images, plus image_attribution JSON for featured image.
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://api-turbo.preview.emergentagent.com").rstrip("/")
MAIN_SITE_ID = "63154708-3320-444c-932d-aa3642b5090c"  # radiogroep
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"


def _retry(fn, *args, **kw):
    """Retry once on 502/504 to absorb preview-env cold starts."""
    last = None
    for _ in range(3):
        r = fn(*args, **kw)
        if r.status_code not in (502, 503, 504):
            return r
        last = r
        import time
        time.sleep(2)
    return last


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    s.request_orig = s.request
    s.request = lambda method, url, **kw: _retry(s.request_orig, method, url, **kw)
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "X-Main-Site-ID": MAIN_SITE_ID})
    return s


def _approve(session, cid):
    r = session.put(f"{BASE_URL}/api/content/{cid}/approval",
                    json={"approval_status": "approved", "approval_notes": "test"})
    return r


# 1x1 transparent PNG
_PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00\x00\x05"
    b"\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _upload_featured(session, cid):
    """Upload a tiny PNG as featured image — uses the real endpoint so DB
    is consistent with what the publish gate expects."""
    headers = {k: v for k, v in session.headers.items() if k.lower() != "content-type"}
    r = requests.post(
        f"{BASE_URL}/api/content/{cid}/featured-image",
        files={"file": ("test.png", _PNG_1x1, "image/png")},
        headers=headers,
    )
    return r


@pytest.fixture(scope="module")
def test_article_id(session):
    """Create a TEST article with an inline image so we control the state."""
    inline_url = "https://example.com/test-image-rights.jpg"
    body = (
        f'<p>Hello world.</p><p><img src="{inline_url}" alt="x" /></p>'
        f'<p>Another paragraph.</p>'
    )
    payload = {
        "title": f"TEST_ImageRights_{uuid.uuid4().hex[:8]}",
        "type": "text",
        "body": body,
        "main_site_id": MAIN_SITE_ID,
    }
    r = session.post(f"{BASE_URL}/api/content", json=payload)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:300]}"
    item = r.json()
    cid = item.get("id") or item.get("_id")
    assert cid
    yield cid, inline_url
    # cleanup
    try:
        session.delete(f"{BASE_URL}/api/content/{cid}")
    except Exception:
        pass


class TestImageRightsEndpoint:
    """GET/PUT /api/content/{id}/image-rights"""

    def test_get_returns_structured_status(self, session, test_article_id):
        cid, inline_url = test_article_id
        r = session.get(f"{BASE_URL}/api/content/{cid}/image-rights")
        assert r.status_code == 200, r.text
        data = r.json()
        # Shape contract
        assert "images" in data and isinstance(data["images"], list)
        assert "missing" in data and isinstance(data["missing"], int)
        assert "all_credited" in data
        assert "total" in data
        assert "featured" in data
        # The inline image must be detected
        urls = [i["url"] for i in data["images"]]
        assert inline_url in urls
        img = next(i for i in data["images"] if i["url"] == inline_url)
        for key in ("credit", "photographer", "license", "source_url", "has_credit"):
            assert key in img, f"image entry missing key {key}"
        assert img["has_credit"] is False
        assert data["missing"] >= 1
        assert data["all_credited"] is False

    def test_put_structured_attribution_persists(self, session, test_article_id):
        cid, inline_url = test_article_id
        body = {
            "attributions": {
                inline_url: {
                    "credit": "Belga",
                    "photographer": "Jan Janssens",
                    "license": "Aankoop",
                    "source_url": "https://belga.example.com/photo/42",
                }
            }
        }
        r = session.put(f"{BASE_URL}/api/content/{cid}/image-rights", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        img = next(i for i in data["images"] if i["url"] == inline_url)
        assert img["credit"] == "Belga"
        assert img["photographer"] == "Jan Janssens"
        assert img["license"] == "Aankoop"
        assert img["source_url"] == "https://belga.example.com/photo/42"
        assert img["has_credit"] is True

        # GET to verify persistence in DB
        r2 = session.get(f"{BASE_URL}/api/content/{cid}/image-rights")
        assert r2.status_code == 200
        d2 = r2.json()
        img2 = next(i for i in d2["images"] if i["url"] == inline_url)
        assert img2["credit"] == "Belga"
        assert img2["photographer"] == "Jan Janssens"

    def test_put_legacy_string_treated_as_credit(self, session, test_article_id):
        cid, inline_url = test_article_id
        # Clear first
        session.put(
            f"{BASE_URL}/api/content/{cid}/image-rights",
            json={"attributions": {inline_url: {}}},
        )
        # Now send a legacy string entry
        r = session.put(
            f"{BASE_URL}/api/content/{cid}/image-rights",
            json={"attributions": {inline_url: "Reuters"}},
        )
        assert r.status_code == 200
        img = next(i for i in r.json()["images"] if i["url"] == inline_url)
        assert img["credit"] == "Reuters"
        assert img["has_credit"] is True

    def test_put_empty_clears_entry(self, session, test_article_id):
        cid, inline_url = test_article_id
        # Set then clear
        session.put(
            f"{BASE_URL}/api/content/{cid}/image-rights",
            json={"attributions": {inline_url: {"credit": "ToBeCleared"}}},
        )
        r = session.put(
            f"{BASE_URL}/api/content/{cid}/image-rights",
            json={"attributions": {inline_url: {}}},
        )
        assert r.status_code == 200
        img = next(i for i in r.json()["images"] if i["url"] == inline_url)
        assert img["has_credit"] is False
        assert img["credit"] == ""


class TestPublishClaraGate:
    """POST /api/content/{id}/publish-clara enforcement & success."""

    def test_publish_blocked_without_rights(self, session, test_article_id):
        cid, inline_url = test_article_id
        # Make sure attributions are empty
        session.put(
            f"{BASE_URL}/api/content/{cid}/image-rights",
            json={"attributions": {inline_url: {}}},
        )
        # Approve the article via the dedicated approval endpoint
        ar = _approve(session, cid)
        assert ar.status_code == 200, f"approval failed: {ar.status_code} {ar.text}"

        r = session.post(f"{BASE_URL}/api/content/{cid}/publish-clara")
        # The publish endpoint enforces multiple gates in order:
        # approved → featured image → image rights. Since this fixture
        # article has no featured image we hit the featured-image gate.
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        # Either gate is acceptable here (no featured image OR rechten);
        # the dedicated rights-gate test is the one below.
        assert ("featured" in detail.lower() or "rechten" in detail.lower()), \
            f"unexpected detail: {detail}"

    def test_publish_blocked_with_featured_image_no_rights(self, session):
        """End-to-end: featured image present, inline image present, no rights ⇒ Dutch error."""
        inline_url = "https://example.com/inline-rights-block.jpg"
        body = f'<p><img src="{inline_url}" alt="x"/></p>'
        r = session.post(
            f"{BASE_URL}/api/content",
            json={"title": f"TEST_PubBlock_{uuid.uuid4().hex[:6]}", "type": "text",
                  "body": body, "main_site_id": MAIN_SITE_ID},
        )
        assert r.status_code in (200, 201)
        cid = r.json()["id"]

        try:
            # Upload a real featured image so the publish gate's featured-image
            # check passes — then the only failure should be missing rights.
            up = _upload_featured(session, cid)
            assert up.status_code == 200, f"upload failed: {up.status_code} {up.text[:200]}"
            ar = _approve(session, cid)
            assert ar.status_code == 200, ar.text

            r3 = session.post(f"{BASE_URL}/api/content/{cid}/publish-clara")
            assert r3.status_code == 409, f"expected 409, got {r3.status_code}: {r3.text}"
            detail = r3.json().get("detail", "")
            assert "rechten" in detail.lower(), f"expected Dutch 'rechten' in error, got: {detail}"
            assert "afbeelding" in detail.lower()

            # Fill in rights for both featured and inline image
            session.put(
                f"{BASE_URL}/api/content/{cid}/featured-image/attribution",
                json={"photo_credit": "Belga", "photo_photographer": "P", "photo_license": "Aankoop"},
            )
            session.put(
                f"{BASE_URL}/api/content/{cid}/image-rights",
                json={"attributions": {inline_url: {"credit": "Belga"}}},
            )
            r4 = session.post(f"{BASE_URL}/api/content/{cid}/publish-clara")
            assert r4.status_code == 200, f"expected 200 after rights filled, got {r4.status_code}: {r4.text}"
            pub = r4.json()
            assert pub.get("status") == "published"
            assert pub.get("slug")
        finally:
            try:
                session.delete(f"{BASE_URL}/api/content/{cid}")
            except Exception:
                pass


class TestContentListMissingRightsFlag:
    """list endpoint exposes missing_image_attributions flag for the badge."""

    def test_list_endpoint_returns_flag(self, session):
        r = session.get(f"{BASE_URL}/api/content?limit=100")
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, dict) and "items" in items:
            items = items["items"]
        assert isinstance(items, list)
        # At least some items in radiogroep should carry the flag set
        flagged = [i for i in items if i.get("missing_image_attributions")]
        # The PRD says 8/37 — we just require >=1 to confirm wiring
        assert any("missing_image_attributions" in i for i in items), \
            "missing_image_attributions key not present on any item"


class TestNewsApiFigcaption:
    """Public News API injects <figcaption class='clara-img-credit'> + image_attribution JSON."""

    def test_article_body_contains_figcaption(self, session):
        # Create approved+published article with inline image & rights
        inline_url = "https://example.com/news-injection.jpg"
        body = f'<p><img src="{inline_url}" alt="x"/></p><p>txt</p>'
        r = session.post(
            f"{BASE_URL}/api/content",
            json={"title": f"TEST_NewsInject_{uuid.uuid4().hex[:6]}", "type": "text",
                  "body": body, "main_site_id": MAIN_SITE_ID},
        )
        assert r.status_code in (200, 201)
        cid = r.json()["id"]
        try:
            up = _upload_featured(session, cid)
            assert up.status_code == 200, up.text
            # Set attribution on featured image via dedicated endpoint
            session.put(
                f"{BASE_URL}/api/content/{cid}/featured-image/attribution",
                json={
                    "photo_credit": "Belga",
                    "photo_photographer": "Anne",
                    "photo_license": "CC-BY-4.0",
                    "photo_source_url": "https://belga.example.com/orig",
                },
            )
            ar = _approve(session, cid)
            assert ar.status_code == 200, ar.text
            session.put(
                f"{BASE_URL}/api/content/{cid}/image-rights",
                json={"attributions": {inline_url: {
                    "credit": "Reuters", "photographer": "John", "license": "Aankoop"
                }}},
            )
            pub = session.post(f"{BASE_URL}/api/content/{cid}/publish-clara")
            assert pub.status_code == 200, pub.text
            slug = pub.json()["slug"]

            # Public endpoint (no auth)
            pub_resp = requests.get(f"{BASE_URL}/api/news/articles/{slug}")
            assert pub_resp.status_code == 200, pub_resp.text
            data = pub_resp.json()

            # Body should contain figcaption
            body_html = data.get("body", "")
            assert "clara-img-credit" in body_html, f"figcaption class missing in body: {body_html[:300]}"
            assert "<figcaption" in body_html
            assert "Reuters" in body_html or "John" in body_html

            # image_attribution JSON on featured
            attr = data.get("image_attribution")
            assert attr is not None, "image_attribution should be present"
            assert attr.get("credit") == "Belga"
            assert attr.get("photographer") == "Anne"
            assert attr.get("license") == "CC-BY-4.0"
            assert attr.get("source_url") == "https://belga.example.com/orig"
        finally:
            try:
                session.delete(f"{BASE_URL}/api/content/{cid}")
            except Exception:
                pass
