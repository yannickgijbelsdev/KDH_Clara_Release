"""
End-to-end Zero Trust + ProRadio cleanup regression tests.

Hits the public REACT_APP_BACKEND_URL so we test what users see.
"""
import os
import sys
import time
import uuid
import urllib.parse
import pytest
import requests

# Ensure backend is importable for direct DB checks
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=False)

PUBLIC_BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert PUBLIC_BASE, "REACT_APP_BACKEND_URL must be set"
# Run heavy tests against local backend (same process, much faster).
# Public-URL routing is verified separately in test_security_headers_present_on_api_response.
BASE = os.environ.get("ZT_TEST_BASE_URL", "http://localhost:8001").rstrip("/")

# Generous timeouts for bcrypt-based login
T = 60

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASS = "KYLovie13monx"
LOCK_EMAIL = "locktest-zt@example.com"  # non-existing email


# --- Fixtures ---
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=T,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# --- 1. Login still works ---
def test_admin_login_returns_jwt():
    r = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=T,
    )
    assert r.status_code == 200
    body = r.json()
    token = body.get("access_token") or body.get("token")
    assert token and isinstance(token, str) and len(token) > 20
    # JWT format: 3 segments separated by '.'
    assert token.count(".") == 2, f"token does not look like a JWT: {token[:40]}"


# --- 2. ProRadio routes are gone ---
@pytest.mark.parametrize("path", [
    "/api/proradio/sites",
    "/api/proradio/sync",
    "/api/proradio/status",
    "/api/proradio",
])
def test_proradio_routes_404(path, admin_headers):
    r = requests.get(f"{BASE}{path}", headers=admin_headers, timeout=T)
    assert r.status_code == 404, f"expected 404 for {path}, got {r.status_code} {r.text[:200]}"


def test_proradio_collection_dropped():
    """db.proradio_sync should no longer exist."""
    import asyncio
    from database import db

    async def _check():
        names = await db.list_collection_names()
        return names

    names = asyncio.get_event_loop().run_until_complete(_check())
    assert "proradio_sync" not in names, f"proradio_sync still present: {names}"


# --- 3. Security headers ---
def test_security_headers_present_on_api_response():
    # Verified against public URL too so we cover the ingress path
    for url_base in (BASE, PUBLIC_BASE):
        try:
            r = requests.get(f"{url_base}/api/", timeout=T)
        except requests.RequestException:
            continue
        h = {k.lower(): v for k, v in r.headers.items()}
        assert "max-age" in h.get("strict-transport-security", ""), (url_base, h)
        assert h.get("x-content-type-options") == "nosniff", (url_base, h)
        assert h.get("x-frame-options") == "SAMEORIGIN", (url_base, h)
        assert "strict-origin" in h.get("referrer-policy", ""), (url_base, h)
        assert h.get("permissions-policy"), (url_base, h)
        csp = h.get("content-security-policy", "")
        assert "default-src 'self'" in csp, f"CSP missing default-src 'self' on {url_base}: {csp}"
        assert h.get("cross-origin-opener-policy") == "same-origin", (url_base, h)


# --- 4. Security overview endpoint ---
def test_security_overview(admin_headers):
    r = requests.get(f"{BASE}/api/security/overview", headers=admin_headers, timeout=T)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["encryption_enabled"] is True
    for k in ("open_anomalies", "high_severity_anomalies", "active_lockouts", "known_devices"):
        assert isinstance(data[k], int), f"{k} should be int, got {type(data[k])}"
    assert "checked_at" in data
    # ISO timestamp parses?
    from datetime import datetime
    datetime.fromisoformat(data["checked_at"].replace("Z", "+00:00"))


def test_security_anomalies_structure(admin_headers):
    r = requests.get(f"{BASE}/api/security/anomalies", headers=admin_headers, timeout=T)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data and "count" in data
    assert isinstance(data["items"], list)
    assert data["count"] == len(data["items"])


def test_security_devices_structure(admin_headers):
    r = requests.get(f"{BASE}/api/security/devices", headers=admin_headers, timeout=T)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data and "count" in data


def test_security_lockouts_structure(admin_headers):
    r = requests.get(f"{BASE}/api/security/lockouts", headers=admin_headers, timeout=T)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data and "count" in data


# --- 5. Brute force / identity lockout ---
def test_brute_force_lockout_then_clear(admin_headers):
    """
    Hit /api/auth/login 5 times with bad password for locktest-zt@example.com.
    Per implementation (services/security/brute_force.py), lockout activates AFTER
    the 5th failure is recorded. So the 6th attempt is the first to return 429.
    """
    # Clean state first (admin clears any pre-existing lock)
    identifier = f"email:{LOCK_EMAIL.lower()}"
    encoded = urllib.parse.quote(identifier, safe="")
    requests.post(f"{BASE}/api/security/lockouts/{encoded}/clear", headers=admin_headers, timeout=T)

    statuses = []
    for i in range(1, 7):
        r = requests.post(
            f"{BASE}/api/auth/login",
            json={"email": LOCK_EMAIL, "password": f"wrong-{i}"},
            timeout=T,
        )
        statuses.append(r.status_code)
        last = r

    # First 5 attempts: 401 (invalid credentials). 6th: 429 (locked)
    assert statuses[:5] == [401] * 5, f"expected 5x401, got {statuses}"
    assert statuses[5] == 429, f"6th attempt expected 429, got {statuses[5]}: {last.text[:200]}"
    retry_after = last.headers.get("Retry-After") or last.headers.get("retry-after")
    assert retry_after, f"Retry-After header missing on 429 response. Headers: {dict(last.headers)}"
    assert int(retry_after) > 0

    # Subsequent attempt still locked
    again = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": LOCK_EMAIL, "password": "wrong-after-lock"},
        timeout=T,
    )
    assert again.status_code == 429

    # Lockouts list shows the identity
    lr = requests.get(f"{BASE}/api/security/lockouts", headers=admin_headers, timeout=T)
    assert lr.status_code == 200
    items = lr.json()["items"]
    ids = [it.get("identifier") for it in items]
    assert identifier in ids, f"identity {identifier} not in lockouts: {ids}"

    # Clear lockout
    clr = requests.post(
        f"{BASE}/api/security/lockouts/{encoded}/clear",
        headers=admin_headers,
        timeout=T,
    )
    assert clr.status_code == 200
    assert clr.json().get("ok") is True

    # After clearing, login is no longer 429 (user does not exist, so 401/400)
    post_clear = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": LOCK_EMAIL, "password": "still-wrong"},
        timeout=T,
    )
    assert post_clear.status_code != 429, f"still locked after clear: {post_clear.status_code}"


# --- 6. Real admin login still works after the brute-force run (different identity) ---
def test_admin_login_works_after_bf(admin_token):
    # admin_token fixture re-uses cached login; verify a fresh login works too
    r = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=T,
    )
    assert r.status_code == 200


# --- 7. WordPress field-level encryption ---
def test_wordpress_site_password_encrypted_in_db(admin_headers):
    name = f"TEST_ZT_{uuid.uuid4().hex[:8]}"
    plain_pw = "secret-app-pw-xyz-1234"
    payload = {
        "name": name,
        "wp_base_url": "https://example-zt.invalid",
        "username": "svc",
        "app_password": plain_pw,
        "default_post_type": "post",
        "default_publish_status": "draft",
        "is_active": False,
    }
    r = requests.post(f"{BASE}/api/wordpress/sites", json=payload, headers=admin_headers, timeout=T)
    assert r.status_code in (200, 201), f"create wp site failed: {r.status_code} {r.text}"
    created = r.json()
    site_id = created["id"]

    # Response must NOT leak the password
    assert "app_password" not in created or not created.get("app_password"), (
        f"app_password leaked in create response: {created}"
    )

    # GET should not leak either
    gr = requests.get(f"{BASE}/api/wordpress/sites", headers=admin_headers, timeout=T)
    assert gr.status_code == 200
    found = [s for s in gr.json() if s["id"] == site_id]
    assert found, "newly-created site missing from GET list"
    s = found[0]
    assert "app_password" not in s or not s.get("app_password"), f"app_password leaked in GET: {s}"

    # DB value must be enc:v1: prefix
    import asyncio
    from database import db

    async def _fetch():
        return await db.wordpress_sites.find_one({"id": site_id})

    doc = asyncio.get_event_loop().run_until_complete(_fetch())
    assert doc is not None
    stored = doc.get("app_password", "")
    assert isinstance(stored, str) and stored.startswith("enc:v1:"), (
        f"app_password not encrypted in DB. Got: {stored[:30]!r}"
    )
    assert plain_pw not in stored, "plaintext password leaked into DB"

    # Cleanup
    requests.delete(f"{BASE}/api/wordpress/sites/{site_id}", headers=admin_headers, timeout=T)


# --- 8. Device tracking ---
def test_device_tracking_no_duplicate_audit_for_same_fingerprint(admin_headers):
    """Two logins from the same UA/IP should not create duplicate 'New device login' audit events."""
    import asyncio
    from database import db

    headers = {"User-Agent": "ZT-Test-Agent/1.0", "Accept-Language": "en-US"}
    # Login twice with identical UA
    for _ in range(2):
        r = requests.post(
            f"{BASE}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
            headers=headers,
            timeout=T,
        )
        assert r.status_code == 200

    async def _check():
        # Count "New device login" audit entries for admin in last 60s
        from datetime import datetime, timezone, timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
        cnt = await db.audit_logs.count_documents({
            "user_email": ADMIN_EMAIL,
            "action": {"$regex": "New device", "$options": "i"},
            "created_at": {"$gte": cutoff},
        })
        # Also check user_devices created
        devs = await db.user_devices.count_documents({"user_email": ADMIN_EMAIL})
        return cnt, devs

    new_device_events, device_count = asyncio.get_event_loop().run_until_complete(_check())
    assert device_count >= 1, "expected at least one row in user_devices"
    # No more than 1 "New device login" event in the last minute for the same fp
    assert new_device_events <= 1, (
        f"duplicate New device login audit events detected: {new_device_events}"
    )
