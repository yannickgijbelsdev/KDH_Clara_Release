"""Tests for per-user custom permission overrides (Team Settings feature).

Covers:
- GET /api/roles/schema (any authenticated user)
- GET /api/roles/custom-permissions/{main_site_id}/{user_id}
- PUT /api/roles/custom-permissions/{main_site_id}/{user_id} + filtering
- GET /api/auth/me/permissions merges overrides on top of role
- Admin role always keeps _full_access regardless of overrides
- Non-admin cannot call PUT (403)
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

from services.auth import hash_password

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://api-turbo.preview.emergentagent.com"
).rstrip("/")
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_SLUG = "radiogroep"
TEST_USER_PASSWORD = "TestPass123!"
TIMEOUT = 60


def _request(method: str, url: str, retries: int = 3, **kwargs):
    """requests wrapper with retry on ReadTimeout — the public-URL ingress is
    occasionally flaky (seen 'No response returned' middleware errors in the
    backend log) so we retry transient failures."""
    kwargs.setdefault("timeout", TIMEOUT)
    last = None
    for _ in range(retries):
        try:
            return requests.request(method, url, **kwargs)
        except (requests.exceptions.ReadTimeout,
                requests.exceptions.ConnectionError) as exc:
            last = exc
    raise last  # type: ignore[misc]


# ---------- sync DB handle (pymongo) ----------

_mongo = MongoClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]


# ---------- helpers / fixtures ----------

def _login(email: str, password: str) -> str:
    r = _request("POST", 
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    assert tok, f"No token in response: {body}"
    return tok


@pytest.fixture(scope="module")
def admin_token() -> str:
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def main_site_id(admin_token: str) -> str:
    r = _request("GET", 
        f"{BASE_URL}/api/main-sites",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200
    site = next((s for s in r.json() if s.get("slug") == MAIN_SITE_SLUG), None)
    assert site, f"main site '{MAIN_SITE_SLUG}' not found"
    return site["id"]


@pytest.fixture(scope="module")
def admin_user_id(admin_token: str) -> str:
    r = _request("GET", 
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def test_member(main_site_id):
    """Create a disposable non-admin team member for radiogroep.

    The review request suggested yannick.gijbels@koodh.com, but that account
    is a site admin AND has 2FA enabled, so we provision a fresh viewer and
    clean it up after.
    """
    user_id = str(uuid.uuid4())
    email = f"TEST_custperm_{user_id[:8]}@example.com"
    now = datetime.now(timezone.utc).isoformat()
    _db.users.insert_one({
        "id": user_id,
        "email": email,
        "name": "TEST Custom Perm User",
        "password_hash": hash_password(TEST_USER_PASSWORD),
        "role": "viewer",
        "is_network_admin": False,
        "totp_enabled": False,
        "created_at": now,
    })
    _db.main_site_users.insert_one({
        "user_id": user_id,
        "main_site_id": main_site_id,
        "role": "viewer",
        "created_at": now,
    })
    yield {"id": user_id, "email": email, "password": TEST_USER_PASSWORD}
    _db.users.delete_one({"id": user_id})
    _db.main_site_users.delete_one(
        {"user_id": user_id, "main_site_id": main_site_id}
    )


@pytest.fixture(scope="module")
def member_token(test_member) -> str:
    """Log in the test member once per module (new-device email sending can
    make login slow, so we cache the token)."""
    # Retry login once in case the first attempt is slow
    last_err = None
    for _ in range(3):
        try:
            return _login(test_member["email"], test_member["password"])
        except Exception as exc:  # noqa: BLE001
            last_err = exc
    raise AssertionError(f"test member login failed: {last_err}")


@pytest.fixture()
def clear_overrides(test_member, main_site_id):
    """Ensure the test member has no overrides before/after each test."""
    _db.main_site_users.update_one(
        {"user_id": test_member["id"], "main_site_id": main_site_id},
        {"$set": {"custom_permissions": {}}},
    )
    yield
    _db.main_site_users.update_one(
        {"user_id": test_member["id"], "main_site_id": main_site_id},
        {"$set": {"custom_permissions": {}}},
    )


# ---------- tests ----------

# Schema endpoint — available to any authenticated user (admin)
def test_schema_available_to_authenticated_user(admin_token):
    r = _request("GET", 
        f"{BASE_URL}/api/roles/schema",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert "categories" in data and "actions" in data
    assert isinstance(data["categories"], list) and len(data["categories"]) > 0
    assert isinstance(data["actions"], list) and len(data["actions"]) > 0
    assert any(
        isinstance(c.get("permissions"), list) and len(c["permissions"]) > 0
        for c in data["categories"]
    )


# Schema endpoint — available to non-admin team member too
def test_schema_available_to_non_admin(member_token):
    r = _request("GET", 
        f"{BASE_URL}/api/roles/schema",
        headers={"Authorization": f"Bearer {member_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, (
        f"non-admin schema access failed: {r.status_code} {r.text}"
    )
    data = r.json()
    assert data["categories"] and data["actions"]


# GET custom-permissions — admin, initially empty
def test_get_custom_permissions_initial_empty(
    admin_token, main_site_id, test_member, clear_overrides
):
    r = _request("GET", 
        f"{BASE_URL}/api/roles/custom-permissions/{main_site_id}/{test_member['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    body = r.json()
    assert body["user_id"] == test_member["id"]
    assert body["main_site_id"] == main_site_id
    assert body.get("custom_permissions") == {}


# PUT custom-permissions — filters unknown features/actions
def test_put_custom_permissions_filters_unknown(
    admin_token, main_site_id, test_member, clear_overrides
):
    payload = {
        "custom_permissions": {
            "shows": {"edit": True, "delete": False, "bogus": True},
            "not_a_feature": {"view": True},
        }
    }
    r = _request("PUT", 
        f"{BASE_URL}/api/roles/custom-permissions/{main_site_id}/{test_member['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload,
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    r2 = _request("GET", 
        f"{BASE_URL}/api/roles/custom-permissions/{main_site_id}/{test_member['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=TIMEOUT,
    )
    assert r2.status_code == 200
    saved = r2.json()["custom_permissions"]
    assert saved == {"shows": {"edit": True, "delete": False}}, f"got {saved}"


# PUT by non-admin → 403
def test_put_custom_permissions_forbidden_for_non_admin(
    main_site_id, test_member, member_token, clear_overrides
):
    r = _request("PUT", 
        f"{BASE_URL}/api/roles/custom-permissions/{main_site_id}/{test_member['id']}",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"custom_permissions": {"shows": {"edit": True}}},
        timeout=TIMEOUT,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# /api/auth/me/permissions merges overrides on top of role
def test_me_permissions_merges_overrides(
    admin_token, main_site_id, test_member, member_token, clear_overrides
):
    tok = member_token

    # Baseline: viewer role does NOT grant shows.delete
    r0 = _request("GET", 
        f"{BASE_URL}/api/auth/me/permissions",
        headers={"Authorization": f"Bearer {tok}", "X-Main-Site-ID": main_site_id},
        timeout=TIMEOUT,
    )
    assert r0.status_code == 200, f"{r0.status_code} {r0.text}"
    perms0 = r0.json().get("permissions", {})
    assert not perms0.get("_full_access"), "non-admin should not have _full_access"
    assert not perms0.get("shows", {}).get("delete", False), (
        f"baseline viewer unexpectedly has shows.delete: {perms0.get('shows')}"
    )

    # Admin grants shows.delete override
    put_r = _request("PUT", 
        f"{BASE_URL}/api/roles/custom-permissions/{main_site_id}/{test_member['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"custom_permissions": {"shows": {"delete": True}}},
        timeout=TIMEOUT,
    )
    assert put_r.status_code == 200, f"{put_r.status_code} {put_r.text}"

    # User's permissions should now reflect the override
    r1 = _request("GET", 
        f"{BASE_URL}/api/auth/me/permissions",
        headers={"Authorization": f"Bearer {tok}", "X-Main-Site-ID": main_site_id},
        timeout=TIMEOUT,
    )
    assert r1.status_code == 200
    perms1 = r1.json().get("permissions", {})
    assert perms1.get("shows", {}).get("delete") is True, (
        f"override not merged: {perms1.get('shows')}"
    )


# Admin role always gets _full_access regardless of override
def test_admin_full_access_regardless_of_override(
    admin_token, main_site_id, admin_user_id
):
    # Set a restrictive override on admin via DB (bypasses the UI, which may
    # not even allow it)
    _db.main_site_users.update_one(
        {"user_id": admin_user_id, "main_site_id": main_site_id},
        {"$set": {"custom_permissions": {"shows": {"view": False, "edit": False, "delete": False}}}},
    )
    try:
        r = _request("GET", 
            f"{BASE_URL}/api/auth/me/permissions",
            headers={"Authorization": f"Bearer {admin_token}", "X-Main-Site-ID": main_site_id},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        perms = r.json().get("permissions", {})
        assert perms.get("_full_access") is True, f"admin lost full access: {perms}"
    finally:
        _db.main_site_users.update_one(
            {"user_id": admin_user_id, "main_site_id": main_site_id},
            {"$set": {"custom_permissions": {}}},
        )
