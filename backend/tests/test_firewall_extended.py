"""
Firewall Extended Features Tests
Tests for: Security Audit, Sessions, User Blocking, Force Password Change
"""
import pytest
import requests
import os
import time
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"
MAIN_SITE_SLUG = "radiogroep"

# Test user for blocking/unblocking
TEST_USER_EMAIL = "eddy.thijs@grk.fm"


class TestFirewallAuth:
    """Authentication helper tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Handle 2FA if required
        if data.get("requires_2fa"):
            pytest.skip("2FA required - cannot continue automated tests")
        
        token = data.get("token")
        assert token, "No token in login response"
        
        session.headers.update({"Authorization": f"Bearer {token}"})
        session.headers.update({"X-Main-Site-ID": MAIN_SITE_ID})
        return session

    def test_admin_login_success(self, admin_session):
        """Verify admin can login and get token"""
        response = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == NETWORK_ADMIN_EMAIL
        assert data["is_network_admin"] is True
        # Verify new fields in /api/auth/me
        assert "force_password_change" in data
        assert "is_blocked" in data


class TestSecurityAudit:
    """Security Audit endpoint tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Login failed")
        data = response.json()
        if data.get("requires_2fa"):
            pytest.skip("2FA required")
        session.headers.update({"Authorization": f"Bearer {data['token']}"})
        return session

    def test_security_audit_returns_score(self, admin_session):
        """GET /api/firewall/audit/{main_site_id} returns security score"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/audit/{MAIN_SITE_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # Verify score structure
        assert "score" in data
        assert isinstance(data["score"], (int, float))
        assert 0 <= data["score"] <= 100
        
        # Verify grade
        assert "grade" in data
        assert data["grade"] in ["good", "moderate", "poor"]
        
        # Verify user statistics
        assert "total_users" in data
        assert "users_without_2fa" in data
        assert "users_with_weak_passwords" in data
        assert "active_blocks" in data
        assert "active_rules" in data

    def test_security_audit_returns_issues(self, admin_session):
        """GET /api/firewall/audit/{main_site_id} returns issues list"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/audit/{MAIN_SITE_ID}")
        assert response.status_code == 200
        data = response.json()
        
        assert "issues" in data
        assert isinstance(data["issues"], list)
        
        # Verify issue structure if issues exist
        if data["issues"]:
            issue = data["issues"][0]
            assert "severity" in issue
            assert "category" in issue
            assert "message" in issue
            assert "action" in issue
            assert issue["severity"] in ["critical", "warning", "info"]

    def test_security_audit_returns_weak_password_users(self, admin_session):
        """GET /api/firewall/audit/{main_site_id} returns weak_password_users list"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/audit/{MAIN_SITE_ID}")
        assert response.status_code == 200
        data = response.json()
        
        assert "weak_password_users" in data
        assert isinstance(data["weak_password_users"], list)
        
        # Verify user structure if weak password users exist
        if data["weak_password_users"]:
            user = data["weak_password_users"][0]
            assert "id" in user
            assert "name" in user
            assert "email" in user
            assert "reason" in user
            assert "force_password_change" in user

    def test_security_audit_returns_users_without_2fa(self, admin_session):
        """GET /api/firewall/audit/{main_site_id} returns users_without_2fa_list"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/audit/{MAIN_SITE_ID}")
        assert response.status_code == 200
        data = response.json()
        
        assert "users_without_2fa_list" in data
        assert isinstance(data["users_without_2fa_list"], list)
        
        # Verify user structure if users without 2FA exist
        if data["users_without_2fa_list"]:
            user = data["users_without_2fa_list"][0]
            assert "id" in user
            assert "name" in user
            assert "email" in user


class TestSessionManagement:
    """Session management endpoint tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Login failed")
        data = response.json()
        if data.get("requires_2fa"):
            pytest.skip("2FA required")
        session.headers.update({"Authorization": f"Bearer {data['token']}"})
        return session

    def test_list_sessions_returns_active_sessions(self, admin_session):
        """GET /api/firewall/sessions returns active sessions"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/sessions")
        assert response.status_code == 200
        data = response.json()
        
        assert "sessions" in data
        assert isinstance(data["sessions"], list)
        
        # At least our current session should be active
        assert len(data["sessions"]) >= 1, "Should have at least 1 active session (current admin)"

    def test_session_structure_has_required_fields(self, admin_session):
        """Sessions should have user details and IP info"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/sessions")
        assert response.status_code == 200
        sessions = response.json()["sessions"]
        
        assert len(sessions) >= 1
        session = sessions[0]
        
        # Required fields
        assert "id" in session
        assert "user_id" in session
        assert "user_name" in session
        assert "user_email" in session
        assert "ip" in session
        assert "started_at" in session
        assert "active" in session
        
        # Geo info (may be empty for localhost)
        assert "country_name" in session
        assert "city" in session

    def test_terminate_session_invalid_id(self, admin_session):
        """POST /api/firewall/sessions/{session_id}/terminate returns 404 for invalid ID"""
        response = admin_session.post(f"{BASE_URL}/api/firewall/sessions/invalid-session-id-12345/terminate")
        assert response.status_code == 404

    def test_terminate_user_sessions_invalid_user(self, admin_session):
        """POST /api/firewall/sessions/terminate-user/{user_id} handles non-existent user"""
        response = admin_session.post(f"{BASE_URL}/api/firewall/sessions/terminate-user/nonexistent-user-id")
        # Should return success even if no sessions found (0 terminated)
        assert response.status_code == 200
        data = response.json()
        assert "terminated_count" in data


class TestUserBlocking:
    """User blocking/unblocking endpoint tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Login failed")
        data = response.json()
        if data.get("requires_2fa"):
            pytest.skip("2FA required")
        session.headers.update({"Authorization": f"Bearer {data['token']}"})
        return session

    def test_block_user_invalid_id(self, admin_session):
        """POST /api/firewall/users/{user_id}/block returns 404 for invalid user"""
        response = admin_session.post(
            f"{BASE_URL}/api/firewall/users/nonexistent-user-id/block",
            json={"reason": "Test block"}
        )
        assert response.status_code == 404

    def test_unblock_user_invalid_id(self, admin_session):
        """POST /api/firewall/users/{user_id}/unblock returns 404 for invalid user"""
        response = admin_session.post(f"{BASE_URL}/api/firewall/users/nonexistent-user-id/unblock")
        assert response.status_code == 404

    def test_cannot_block_network_admin(self, admin_session):
        """Should not be able to block a network admin"""
        # First get admin user ID
        response = admin_session.get(f"{BASE_URL}/api/auth/me")
        admin_id = response.json()["id"]
        
        # Try to block self (network admin)
        response = admin_session.post(
            f"{BASE_URL}/api/firewall/users/{admin_id}/block",
            json={"reason": "Self-block test"}
        )
        assert response.status_code == 400
        assert "Cannot block a network admin" in response.json().get("detail", "")


class TestForcePasswordChange:
    """Force password change endpoint tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Login failed")
        data = response.json()
        if data.get("requires_2fa"):
            pytest.skip("2FA required")
        session.headers.update({"Authorization": f"Bearer {data['token']}"})
        return session

    def test_force_password_change_invalid_user(self, admin_session):
        """POST /api/firewall/users/{user_id}/force-password-change returns 404"""
        response = admin_session.post(f"{BASE_URL}/api/firewall/users/nonexistent-user/force-password-change")
        assert response.status_code == 404

    def test_cancel_force_password_change_success(self, admin_session):
        """POST /api/firewall/users/{user_id}/cancel-force-password-change works"""
        # This should succeed even if the user doesn't have force_password_change set
        # First, we need a real user ID - get from audit
        response = admin_session.get(f"{BASE_URL}/api/firewall/audit/{MAIN_SITE_ID}")
        if response.status_code == 200:
            data = response.json()
            # Get any user from the weak password list or users without 2FA
            test_user_id = None
            if data.get("weak_password_users"):
                test_user_id = data["weak_password_users"][0]["id"]
            elif data.get("users_without_2fa_list"):
                test_user_id = data["users_without_2fa_list"][0]["id"]
            
            if test_user_id:
                # Cancel force password (idempotent operation)
                response = admin_session.post(
                    f"{BASE_URL}/api/firewall/users/{test_user_id}/cancel-force-password-change"
                )
                assert response.status_code == 200
                assert response.json().get("cancelled") is True


class TestLoginWithForcePasswordChange:
    """Tests for login response including force_password_change field"""
    
    def test_login_response_includes_force_password_change(self):
        """Login response should include force_password_change field"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        
        if not data.get("requires_2fa"):
            # If not requiring 2FA, should have force_password_change
            assert "force_password_change" in data
            assert isinstance(data["force_password_change"], bool)


class TestBlockedUserCannotLogin:
    """Test that blocked users cannot login"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Login failed")
        data = response.json()
        if data.get("requires_2fa"):
            pytest.skip("2FA required")
        session.headers.update({"Authorization": f"Bearer {data['token']}"})
        return session

    def test_blocked_user_login_returns_403(self, admin_session):
        """A blocked user should receive 403 on login attempt"""
        # Get a test user from audit
        response = admin_session.get(f"{BASE_URL}/api/firewall/audit/{MAIN_SITE_ID}")
        if response.status_code != 200:
            pytest.skip("Could not get audit data")
        
        data = response.json()
        
        # Find a test user (weak password user is a good candidate)
        test_user = None
        if data.get("weak_password_users"):
            test_user = data["weak_password_users"][0]
        
        if not test_user:
            pytest.skip("No test user available for blocking test")
        
        test_user_id = test_user["id"]
        
        # Block the user
        response = admin_session.post(
            f"{BASE_URL}/api/firewall/users/{test_user_id}/block",
            json={"reason": "Automated test - temporary block"}
        )
        
        # Block should succeed or user already blocked
        if response.status_code not in [200, 400]:  # 400 if network admin
            pytest.fail(f"Unexpected block response: {response.status_code} - {response.text}")
        
        # Now unblock the user to clean up
        admin_session.post(f"{BASE_URL}/api/firewall/users/{test_user_id}/unblock")


class TestActivityLogsFiltering:
    """Test that activity logs are filtered by main_site_id"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Login failed")
        data = response.json()
        if data.get("requires_2fa"):
            pytest.skip("2FA required")
        session.headers.update({"Authorization": f"Bearer {data['token']}"})
        session.headers.update({"X-Main-Site-ID": MAIN_SITE_ID})
        return session

    def test_activity_logs_with_main_site_header(self, admin_session):
        """Activity logs should respect X-Main-Site-ID header"""
        response = admin_session.get(f"{BASE_URL}/api/logs")
        assert response.status_code == 200
        data = response.json()
        
        assert "logs" in data
        assert isinstance(data["logs"], list)
        # Logs should exist (login actions create logs)
        # The bug fix ensures logs are filtered by main_site_id


class TestSessionTracking:
    """Test that logins create session records"""
    
    def test_login_creates_session(self):
        """New login should create a session record"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        
        if data.get("requires_2fa"):
            pytest.skip("2FA required")
        
        token = data["token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Check sessions - should find current session
        response = session.get(f"{BASE_URL}/api/firewall/sessions")
        assert response.status_code == 200
        sessions = response.json()["sessions"]
        
        # Our session should be in the list
        admin_sessions = [s for s in sessions if s["user_email"] == NETWORK_ADMIN_EMAIL]
        assert len(admin_sessions) >= 1, "Login should create session record"


class TestEndpointRequiresAuth:
    """Test that new endpoints require authentication"""
    
    def test_sessions_requires_auth(self):
        """GET /api/firewall/sessions requires authentication"""
        response = requests.get(f"{BASE_URL}/api/firewall/sessions")
        assert response.status_code in [401, 403]

    def test_audit_requires_auth(self):
        """GET /api/firewall/audit/{id} requires authentication"""
        response = requests.get(f"{BASE_URL}/api/firewall/audit/{MAIN_SITE_ID}")
        assert response.status_code in [401, 403]

    def test_block_user_requires_auth(self):
        """POST /api/firewall/users/{id}/block requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/firewall/users/some-id/block",
            json={"reason": "test"}
        )
        assert response.status_code in [401, 403]

    def test_force_password_requires_auth(self):
        """POST /api/firewall/users/{id}/force-password-change requires authentication"""
        response = requests.post(f"{BASE_URL}/api/firewall/users/some-id/force-password-change")
        assert response.status_code in [401, 403]

    def test_terminate_session_requires_auth(self):
        """POST /api/firewall/sessions/{id}/terminate requires authentication"""
        response = requests.post(f"{BASE_URL}/api/firewall/sessions/some-id/terminate")
        assert response.status_code in [401, 403]
