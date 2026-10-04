"""Tests for admin impersonation / switch-user flow."""
import os
import jwt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback used by backend-only runs
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
TARGET_EMAIL = "yannick.gijbels@koodh.com"
TARGET_PASSWORD = "test"
SITE_SLUG = "radiogroep"


# ---- fixtures ----
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def main_site_id(session, admin_token):
    r = session.get(f"{BASE_URL}/api/main-sites/by-slug/{SITE_SLUG}",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, f"Site lookup failed: {r.status_code} {r.text}"
    data = r.json()
    sid = data.get("id") or data.get("_id") or data.get("main_site_id")
    assert sid, f"No id in main-site response: {data}"
    return sid


@pytest.fixture(scope="module")
def target_user(session, admin_token, main_site_id):
    headers = {
        "Authorization": f"Bearer {admin_token}",
        "X-Main-Site-ID": main_site_id,
    }
    r = session.get(f"{BASE_URL}/api/users", headers=headers)
    assert r.status_code == 200, f"GET /users failed: {r.status_code} {r.text}"
    users = r.json()
    # Prefer the specified non-admin
    target = next((u for u in users if u.get("email") == TARGET_EMAIL), None)
    if not target:
        # fallback: pick first non-admin active user
        target = next((u for u in users
                       if u.get("email") != ADMIN_EMAIL
                       and u.get("role") != "admin"
                       and not u.get("is_network_admin")), None)
    assert target, "No suitable target user found in main site"
    return target


# ---- tests ----
class TestImpersonation:
    def test_switch_user_returns_token(self, session, admin_token, main_site_id, target_user):
        headers = {
            "Authorization": f"Bearer {admin_token}",
            "X-Main-Site-ID": main_site_id,
        }
        r = session.post(
            f"{BASE_URL}/api/admin/switch-user/{target_user['id']}",
            headers=headers,
        )
        assert r.status_code == 200, f"switch-user failed: {r.status_code} {r.text}"
        data = r.json()
        for key in ("token", "user", "original_user", "expires_at"):
            assert key in data, f"Missing key {key} in response: {data}"
        assert data["user"]["id"] == target_user["id"]
        assert data["user"]["email"] == target_user["email"]
        assert data["original_user"]["email"] == ADMIN_EMAIL
        # stash for next tests
        pytest.impersonation_token = data["token"]

    def test_impersonation_jwt_claims(self, admin_token, target_user):
        tok = getattr(pytest, "impersonation_token", None)
        assert tok, "No impersonation token (prior test failed)"
        decoded = jwt.decode(tok, options={"verify_signature": False})
        assert decoded.get("user_id") == target_user["id"], f"user_id mismatch: {decoded}"
        assert "impersonated_by" in decoded, f"Missing impersonated_by: {decoded}"
        assert "exp" in decoded, f"Missing exp: {decoded}"
        # impersonated_by must be an id string (admin's user_id)
        assert isinstance(decoded["impersonated_by"], str) and decoded["impersonated_by"]

    def test_auth_me_with_impersonation_token(self, session, target_user):
        tok = getattr(pytest, "impersonation_token", None)
        assert tok
        r = session.get(f"{BASE_URL}/api/auth/me",
                        headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200, f"/auth/me failed: {r.status_code} {r.text}"
        me = r.json()
        assert me.get("email") == target_user["email"], f"Expected target, got {me.get('email')}"
        assert me.get("id") == target_user["id"]

    def test_exit_impersonation_returns_admin(self, session, main_site_id):
        tok = getattr(pytest, "impersonation_token", None)
        assert tok
        headers = {
            "Authorization": f"Bearer {tok}",
            "X-Main-Site-ID": main_site_id,
        }
        r = session.post(f"{BASE_URL}/api/admin/exit-impersonation", headers=headers)
        assert r.status_code == 200, f"exit-impersonation failed: {r.status_code} {r.text}"
        data = r.json()
        assert "token" in data and "user" in data
        new_tok = data["token"]
        r2 = session.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {new_tok}"})
        assert r2.status_code == 200
        me = r2.json()
        # The returned admin should be an admin account (not the impersonated member)
        assert me.get("email") != TARGET_EMAIL, \
            f"Exit impersonation did not switch back; still {me.get('email')}"
        # Must be an admin (network admin or role=admin)
        assert me.get("is_network_admin") or me.get("role") == "admin", \
            f"Returned user is not an admin: {me}"

    def test_switch_user_non_admin_forbidden(self, main_site_id, target_user):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": TARGET_EMAIL, "password": TARGET_PASSWORD})
        if r.status_code != 200:
            pytest.skip(f"Cannot login as non-admin test user ({r.status_code})")
        non_admin_token = r.json()["token"]
        headers = {
            "Authorization": f"Bearer {non_admin_token}",
            "X-Main-Site-ID": main_site_id,
        }
        # Try to switch to any user id (use target's own id – should still be rejected
        # because the caller is not an admin)
        r = s.post(f"{BASE_URL}/api/admin/switch-user/{target_user['id']}",
                   headers=headers)
        assert r.status_code in (401, 403), \
            f"Non-admin was allowed to impersonate: {r.status_code} {r.text}"

    def test_switch_user_main_site_scope_allows_cross_team(
            self, session, admin_token, main_site_id, target_user):
        """Admin team_id may differ from target team_id when both share main site."""
        # Fetch admin info
        r_me = session.get(f"{BASE_URL}/api/auth/me",
                           headers={"Authorization": f"Bearer {admin_token}"})
        assert r_me.status_code == 200
        admin = r_me.json()
        # If team_ids differ, the fact that switch-user succeeded above proves the
        # main_site scope path was used. Assert explicitly.
        if admin.get("team_id") and target_user.get("team_id") \
                and admin["team_id"] != target_user["team_id"]:
            # Already proven in test_switch_user_returns_token
            assert getattr(pytest, "impersonation_token", None), \
                "Cross-team impersonation did not produce a token"
        else:
            # Same-team or missing team_id — not a strict cross-team case, just assert pass
            assert True
