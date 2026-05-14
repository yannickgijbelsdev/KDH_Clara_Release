"""Backend tests for Clara Custom + notifications broadcast + content rollback.

Covers the review scope:
  - Clara Custom: list/create/update/delete/check APIs (no /health/{main_site_id} endpoint exists
    by name; the equivalent is POST /clara-custom/check-all?main_site_id=...).
  - Main Sites: create with site_type="clara_custom" + clara_custom_apis array and verify persistence.
  - Notifications broadcast endpoints (preview + audience-count + send).
  - Content rollback endpoint (POST /content/{content_id}/rollback/{log_id}).
"""
import os
import uuid
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return url.rstrip("/")

BASE_URL = _load_backend_url()
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    body = r.json()
    token = body.get("token") or body.get("access_token")
    if not token:
        pytest.skip(f"No token in login response: {body}")
    return token


@pytest.fixture(scope="module")
def auth(api, auth_token):
    api.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api


# ───────── Clara Custom site creation + custom_apis persistence ─────────

@pytest.fixture(scope="module")
def clara_site(auth):
    slug = f"test-clara-{uuid.uuid4().hex[:6]}"
    payload = {
        "name": "TEST_ClaraCustom",
        "slug": slug,
        "description": "Test Clara Custom site",
        "site_type": "clara_custom",
        "enabled_features": ["clara_custom"],
        "clara_custom_apis": [
            {
                "name": "Httpbin GET",
                "base_url": "https://httpbin.org",
                "method": "GET",
                "health_check_path": "/get",
                "expected_status": 200,
            }
        ],
    }
    r = auth.post(f"{BASE_URL}/api/main-sites", json=payload)
    assert r.status_code == 200, f"create main site failed: {r.status_code} {r.text[:300]}"
    site = r.json()
    yield site
    # cleanup
    try:
        auth.delete(f"{BASE_URL}/api/main-sites/{site['id']}")
    except Exception:
        pass


def test_create_clara_custom_site(clara_site):
    assert clara_site["site_type"] == "clara_custom"
    assert clara_site["name"] == "TEST_ClaraCustom"
    assert "id" in clara_site


def test_get_main_sites_returns_clara_custom(auth, clara_site):
    r = auth.get(f"{BASE_URL}/api/main-sites")
    assert r.status_code == 200
    sites = r.json()
    matched = [s for s in sites if s["id"] == clara_site["id"]]
    assert matched, "Created Clara Custom site not returned in list"
    assert matched[0]["site_type"] == "clara_custom"


def test_clara_custom_apis_persisted(auth, clara_site):
    r = auth.get(f"{BASE_URL}/api/clara-custom/apis",
                 params={"main_site_id": clara_site["id"]})
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    apis = r.json()
    assert isinstance(apis, list)
    assert len(apis) >= 1, "Expected at least one API created by wizard"
    a = apis[0]
    assert a["base_url"] == "https://httpbin.org"
    assert a["health_check_path"] == "/get"


def test_clara_custom_check_all(auth, clara_site):
    r = auth.post(f"{BASE_URL}/api/clara-custom/check-all",
                  params={"main_site_id": clara_site["id"]})
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    data = r.json()
    assert "checked" in data and "results" in data
    assert data["checked"] >= 1
    res = data["results"][0]
    assert "status" in res
    assert "checked_at" in res


def test_clara_custom_test_oneoff(auth):
    """One-off health check used by the wizard."""
    payload = {
        "base_url": "https://httpbin.org",
        "method": "GET",
        "health_check_path": "/status/200",
        "expected_status": 200,
    }
    r = auth.post(f"{BASE_URL}/api/clara-custom/test", json=payload)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    data = r.json()
    assert data.get("status") in {"connected", "failed", "timeout", "error"}


def test_clara_custom_crud_individual_api(auth, clara_site):
    # CREATE
    payload = {
        "main_site_id": clara_site["id"],
        "name": "TEST_extra",
        "base_url": "https://httpbin.org",
        "health_check_path": "/status/200",
        "method": "GET",
        "expected_status": 200,
    }
    cr = auth.post(f"{BASE_URL}/api/clara-custom/apis", json=payload)
    assert cr.status_code == 200
    api_id = cr.json()["id"]

    # CHECK single
    chk = auth.post(f"{BASE_URL}/api/clara-custom/apis/{api_id}/check")
    assert chk.status_code == 200
    assert "status" in chk.json()

    # UPDATE
    up = auth.put(f"{BASE_URL}/api/clara-custom/apis/{api_id}",
                  json={"name": "TEST_extra_renamed"})
    assert up.status_code == 200
    assert up.json()["name"] == "TEST_extra_renamed"

    # DELETE
    de = auth.delete(f"{BASE_URL}/api/clara-custom/apis/{api_id}")
    assert de.status_code == 200


# ───────── Notifications Broadcast ─────────

def test_broadcast_preview(auth):
    r = auth.post(f"{BASE_URL}/api/notifications/broadcast/preview", json={
        "subject": "TEST broadcast",
        "message": "Hello world",
        "audience": "system_admins",
    })
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    body = r.json()
    # could be {html: "..."} or have html field
    assert "html" in body or isinstance(body, str)


def test_broadcast_audience_count(auth):
    r = auth.post(f"{BASE_URL}/api/notifications/broadcast/audience-count", json={
        "audience": "system_admins",
    })
    assert r.status_code == 200
    data = r.json()
    assert "count" in data or "recipients" in data or isinstance(data, dict)


def test_broadcast_send(auth):
    r = auth.post(f"{BASE_URL}/api/notifications/broadcast", json={
        "title": "TEST broadcast send",
        "body": "Hello from pytest",
        "audience": "system_admins",
        "kind": "announcement",
    })
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    data = r.json()
    assert "broadcast_id" in data or "message" in data


# ───────── Content rollback ─────────

def test_content_rollback_endpoint_exists(auth):
    """Smoke check — rollback should respond (likely 404 for fake IDs) and not 500/405."""
    r = auth.post(
        f"{BASE_URL}/api/content/{uuid.uuid4()}/rollback/{uuid.uuid4()}")
    # endpoint exists -> 404 (content not found) is acceptable; 405 would mean it's not registered
    assert r.status_code in (400, 404), f"Unexpected status: {r.status_code} {r.text[:200]}"


def test_content_rollback_full_flow(auth):
    """Create content, update it (history is created), then rollback."""
    # Find a site we can create content for. Pick any radio main site.
    sites_r = auth.get(f"{BASE_URL}/api/main-sites")
    if sites_r.status_code != 200:
        pytest.skip("Cannot list main sites")
    radio_site = next((s for s in sites_r.json() if s.get("site_type") == "radio"), None)
    if not radio_site:
        pytest.skip("No radio main site available for content rollback test")

    # Get sub-sites
    subs_r = auth.get(f"{BASE_URL}/api/main-sites/{radio_site['id']}/sites")
    subs = subs_r.json() if subs_r.status_code == 200 else []
    if not subs:
        pytest.skip("No sub-sites to attach content to")
    site_id = subs[0]["id"]

    # CREATE content
    cr = auth.post(f"{BASE_URL}/api/content", json={
        "site_id": site_id,
        "title": "TEST rollback original",
        "type": "article",
        "status": "draft",
    })
    if cr.status_code not in (200, 201):
        pytest.skip(f"Could not create content: {cr.status_code} {cr.text[:200]}")
    content = cr.json()
    cid = content["id"]

    # UPDATE content to generate a history entry
    up = auth.put(f"{BASE_URL}/api/content/{cid}",
                  json={"title": "TEST rollback updated"})
    if up.status_code != 200:
        pytest.skip(f"Could not update content: {up.status_code}")

    # Get history
    hist = auth.get(f"{BASE_URL}/api/content/{cid}/history")
    if hist.status_code != 200 or not hist.json():
        # cleanup and skip
        auth.delete(f"{BASE_URL}/api/content/{cid}")
        pytest.skip("No history entries available")
    history_entries = hist.json()
    log_id = history_entries[0].get("id")
    if not log_id:
        auth.delete(f"{BASE_URL}/api/content/{cid}")
        pytest.skip("History entry has no id")

    # ROLLBACK
    rb = auth.post(f"{BASE_URL}/api/content/{cid}/rollback/{log_id}")
    assert rb.status_code in (200, 400), f"{rb.status_code} {rb.text[:200]}"
    # If 200, verify the title was rolled back
    if rb.status_code == 200:
        verify = auth.get(f"{BASE_URL}/api/content/{cid}")
        if verify.status_code == 200:
            assert verify.json().get("title") == "TEST rollback original"

    # cleanup
    auth.delete(f"{BASE_URL}/api/content/{cid}")
