"""Tests for content approval permissions respecting per-user custom overrides.

Scenario (bug fix validation):
    Non-admin team member of 'radiogroep' is granted
    `content_approval.edit=true` via custom_permissions override. The user must
    then be able to call the approval endpoints that were previously role-only.

Covered:
    - PUT /api/roles/custom-permissions/{site}/{user} saves overrides
    - GET /api/auth/me/permissions returns merged content_approval.edit=true
    - GET /api/content/admin/pending-approval returns 200 (was 403)
    - PUT /api/content/{id}/approval (approved/rejected) returns 200 (was 403)
    - Clearing override → PUT returns 403 again
    - Admin can always approve

NOTE: In this environment the test user yannick.gijbels is actually a global
`role=admin` and is `admin` in every main_site. To exercise the bug fix the
test temporarily downgrades yannick's roles (global + site) to `editor` and
restores them on teardown. Password in the DB is `KYLovie13monx` (not `test`
as in memory/test_credentials.md — flagged in the test report).
"""
from __future__ import annotations

import os
import time
import pytest
import pyotp
import requests
from pymongo import MongoClient

# Localhost direct — public ingress is unreliable (reverse-proxy timeouts).
BASE_URL = os.environ.get("BACKEND_TEST_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASS = "KYLovie13monx"
MEMBER_EMAIL = "yannick.gijbels@koodh.com"
MEMBER_PASS = "KYLovie13monx"  # real DB password (see note above)
MAIN_SITE_SLUG = "radiogroep"
MAIN_SITE_ID = "63154708-3320-444c-932d-aa3642b5090c"
MEMBER_USER_ID = "6102f41f-3306-4449-bae6-28f64f97d916"

TIMEOUT = 60  # backend can be slow

_MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
_DB_NAME = os.environ.get("DB_NAME", "radio_show_planner")
_mongo = MongoClient(_MONGO_URL)
_sync_db = _mongo[_DB_NAME]


def _login(email: str, password: str, totp_secret: str | None = None) -> str:
    body = {"email": email, "password": password}
    if totp_secret:
        body["totp_code"] = pyotp.TOTP(totp_secret).now()
    r = requests.post(f"{API}/auth/login", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    data = r.json()
    if data.get("requires_2fa"):
        # Retry with totp
        assert totp_secret, "2FA required but no secret provided"
        body["totp_code"] = pyotp.TOTP(totp_secret).now()
        r = requests.post(f"{API}/auth/login", json=body, timeout=TIMEOUT)
        assert r.status_code == 200, f"login retry: {r.status_code} {r.text}"
        data = r.json()
    tok = data.get("token")
    assert tok, f"no token in response: {data}"
    return tok


@pytest.fixture(scope="session", autouse=True)
def _preflight_and_downgrade():
    """1) clear brute-force locks, 2) temporarily downgrade yannick's roles so
    the test exercises the custom_permissions code path rather than the
    role-admin short-circuit. Restore on teardown."""
    _sync_db.brute_force_locks.delete_many({
        "identifier": {"$in": [f"email:{ADMIN_EMAIL}", f"email:{MEMBER_EMAIL}"]}
    })
    user = _sync_db.users.find_one({"id": MEMBER_USER_ID}, {"_id": 0, "role": 1, "is_network_admin": 1, "is_system_admin": 1})
    site_user = _sync_db.main_site_users.find_one(
        {"user_id": MEMBER_USER_ID, "main_site_id": MAIN_SITE_ID},
        {"_id": 0, "role": 1},
    )
    snap = {
        "user_role": user.get("role") if user else None,
        "is_network_admin": user.get("is_network_admin") if user else None,
        "is_system_admin": user.get("is_system_admin") if user else None,
        "site_role": site_user.get("role") if site_user else None,
    }
    _sync_db.users.update_one(
        {"id": MEMBER_USER_ID},
        {"$set": {"role": "editor", "is_network_admin": False, "is_system_admin": False}},
    )
    _sync_db.main_site_users.update_one(
        {"user_id": MEMBER_USER_ID, "main_site_id": MAIN_SITE_ID},
        {"$set": {"role": "editor", "custom_permissions": {}}},
    )
    yield snap
    _sync_db.users.update_one(
        {"id": MEMBER_USER_ID},
        {"$set": {
            "role": snap["user_role"] or "admin",
            "is_network_admin": bool(snap["is_network_admin"]),
            "is_system_admin": bool(snap["is_system_admin"]),
        }},
    )
    if snap["site_role"]:
        _sync_db.main_site_users.update_one(
            {"user_id": MEMBER_USER_ID, "main_site_id": MAIN_SITE_ID},
            {"$set": {"role": snap["site_role"], "custom_permissions": {}}},
        )


@pytest.fixture(scope="session")
def member_totp_secret():
    u = _sync_db.users.find_one(
        {"id": MEMBER_USER_ID}, {"_id": 0, "totp_secret": 1, "totp_enabled": 1}
    )
    if u and u.get("totp_enabled") and u.get("totp_secret"):
        return u["totp_secret"]
    return None


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="session")
def member_token(member_totp_secret):
    return _login(MEMBER_EMAIL, MEMBER_PASS, totp_secret=member_totp_secret)


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "X-Main-Site-ID": MAIN_SITE_ID}


@pytest.fixture
def member_headers(member_token):
    return {"Authorization": f"Bearer {member_token}", "X-Main-Site-ID": MAIN_SITE_ID}


def _set_override(admin_token: str, overrides: dict):
    r = requests.put(
        f"{API}/roles/custom-permissions/{MAIN_SITE_ID}/{MEMBER_USER_ID}",
        json={"custom_permissions": overrides},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"set override: {r.status_code} {r.text}"
    return r.json()


def _get_override(admin_token: str):
    r = requests.get(
        f"{API}/roles/custom-permissions/{MAIN_SITE_ID}/{MEMBER_USER_ID}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"get override: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture
def pending_content(admin_headers):
    """Create and transition a content item to ready/pending as admin. Delete on teardown."""
    r = requests.post(
        f"{API}/content",
        json={"title": f"TEST_approval_perm_{int(time.time())}", "type": "text", "body": "x", "status": "draft"},
        headers=admin_headers,
        timeout=TIMEOUT,
    )
    assert r.status_code == 201, f"create: {r.status_code} {r.text}"
    cid = r.json()["id"]
    r = requests.put(
        f"{API}/content/{cid}",
        json={"status": "ready"},
        headers=admin_headers,
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"ready: {r.status_code} {r.text}"
    assert r.json().get("approval_status") == "pending"
    yield cid
    requests.delete(f"{API}/content/{cid}", headers=admin_headers, timeout=TIMEOUT)


# ---------------- Tests ----------------

def test_setup_tokens_work(admin_token, member_token):
    assert admin_token and member_token


def test_set_and_get_override_roundtrip(admin_token):
    _set_override(admin_token, {"content_approval": {"view": True, "edit": True}})
    data = _get_override(admin_token)
    assert data["custom_permissions"].get("content_approval", {}).get("edit") is True
    assert data["custom_permissions"].get("content_approval", {}).get("view") is True


def test_me_permissions_merges_override(admin_token, member_token):
    _set_override(admin_token, {"content_approval": {"view": True, "edit": True}})
    headers = {"Authorization": f"Bearer {member_token}", "X-Main-Site-ID": MAIN_SITE_ID}
    r = requests.get(f"{API}/auth/me/permissions", headers=headers, timeout=TIMEOUT)
    assert r.status_code == 200, f"me/permissions: {r.status_code} {r.text}"
    data = r.json()
    perms = data.get("permissions") or data
    ca = perms.get("content_approval") or {}
    assert ca.get("edit") is True, f"content_approval.edit not merged: {data}"


def test_pending_approval_200_with_override(admin_token, member_headers):
    _set_override(admin_token, {"content_approval": {"view": True, "edit": True}})
    r = requests.get(f"{API}/content/admin/pending-approval", headers=member_headers, timeout=TIMEOUT)
    assert r.status_code == 200, f"pending list: {r.status_code} {r.text}"
    assert isinstance(r.json(), list)


def test_approve_200_with_override(admin_token, admin_headers, member_headers, pending_content):
    _set_override(admin_token, {"content_approval": {"view": True, "edit": True}})
    r = requests.put(
        f"{API}/content/{pending_content}/approval",
        json={"approval_status": "approved", "approval_notes": "ok"},
        headers=member_headers,
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"approve: {r.status_code} {r.text}"
    g = requests.get(f"{API}/content/{pending_content}", headers=admin_headers, timeout=TIMEOUT)
    assert g.status_code == 200
    assert g.json().get("approval_status") == "approved"


def test_reject_200_with_override(admin_token, admin_headers, member_headers, pending_content):
    _set_override(admin_token, {"content_approval": {"view": True, "edit": True}})
    r = requests.put(
        f"{API}/content/{pending_content}/approval",
        json={"approval_status": "rejected", "approval_notes": "nope"},
        headers=member_headers,
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"reject: {r.status_code} {r.text}"
    g = requests.get(f"{API}/content/{pending_content}", headers=admin_headers, timeout=TIMEOUT)
    assert g.json().get("approval_status") == "rejected"


def test_approve_403_without_override(admin_token, member_headers, pending_content):
    _set_override(admin_token, {})  # clear
    r = requests.put(
        f"{API}/content/{pending_content}/approval",
        json={"approval_status": "approved", "approval_notes": "no"},
        headers=member_headers,
        timeout=TIMEOUT,
    )
    assert r.status_code == 403, f"expected 403 w/o override, got {r.status_code} {r.text}"


def test_pending_list_403_without_override(admin_token, member_headers):
    _set_override(admin_token, {})
    r = requests.get(f"{API}/content/admin/pending-approval", headers=member_headers, timeout=TIMEOUT)
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


def test_admin_can_always_approve(admin_headers, pending_content):
    r = requests.put(
        f"{API}/content/{pending_content}/approval",
        json={"approval_status": "approved", "approval_notes": "admin"},
        headers=admin_headers,
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"admin approve: {r.status_code} {r.text}"
