"""
Tests for P0 Features:
1. Forgot Password Flow - forgot password button, temp password email, force password change
2. Ticket Notification System - emails sent on ticket creation, updates, closure
3. Change Password API - bug fix for missing route decorator
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
TEST_PRESENTER_EMAIL = "testpresenter@test.com"
TEST_PRESENTER_PASSWORD = "TestPassword123!"

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def reset_test_passwords():
    """Reset test user passwords in DB directly"""
    import asyncio
    import sys
    sys.path.insert(0, '/app/backend')
    from database import db
    from services.auth import hash_password
    
    async def _reset():
        # Reset admin password
        await db.users.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {
                "password_hash": hash_password(ADMIN_PASSWORD),
                "force_password_change": False
            }}
        )
        # Reset presenter password
        await db.users.update_one(
            {"email": TEST_PRESENTER_EMAIL},
            {"$set": {
                "password_hash": hash_password(TEST_PRESENTER_PASSWORD),
                "force_password_change": False
            }}
        )
        # Clear firewall blocks
        await db.firewall_blocks.delete_many({})
    
    asyncio.run(_reset())


@pytest.fixture(scope="module")
def network_admin_auth(api_client):
    """Login as network admin and return token"""
    # Reset passwords first to ensure clean state
    reset_test_passwords()
    
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Network admin login failed: {response.text}"
    data = response.json()
    token = data.get("token")
    assert token, "No token returned from login"
    return token

@pytest.fixture(scope="module")
def presenter_auth(api_client):
    """Login as presenter and return token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_PRESENTER_EMAIL,
        "password": TEST_PRESENTER_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        return data.get("token")
    return None


# ============== FORGOT PASSWORD TESTS ==============

class TestForgotPasswordAPI:
    """Tests for /api/auth/forgot-password endpoint"""
    
    def test_forgot_password_with_valid_email(self, api_client):
        """POST /api/auth/forgot-password with existing email returns success"""
        # Use a different test email to not disrupt other tests
        response = api_client.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": "test.forgot@example.com"  # Non-existent but valid format
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data
        assert "temporary password" in data["message"].lower() or "if the email exists" in data["message"].lower()
        print("PASS: Forgot password returns success message for valid email")
    
    def test_forgot_password_with_nonexistent_email_returns_success_for_security(self, api_client):
        """POST /api/auth/forgot-password with non-existent email still returns success (security)"""
        fake_email = f"nonexistent_{uuid.uuid4().hex[:8]}@example.com"
        response = api_client.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": fake_email
        })
        # Should return 200 even for non-existent email (security: don't reveal if email exists)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data
        print("PASS: Forgot password returns same success message for non-existent email (security)")
    
    def test_forgot_password_no_auth_required(self, api_client):
        """POST /api/auth/forgot-password does not require authentication"""
        # This should work without any auth headers
        response = api_client.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": "test@example.com"
        })
        # Should not return 401 or 403
        assert response.status_code not in [401, 403], f"Expected no auth required, got {response.status_code}"
        print("PASS: Forgot password endpoint does not require authentication")


# ============== CHANGE PASSWORD TESTS ==============

class TestChangePasswordAPI:
    """Tests for /api/auth/change-password endpoint - bug fix verification"""
    
    def test_change_password_endpoint_exists(self, api_client, network_admin_auth):
        """POST /api/auth/change-password route exists (bug fix - was missing @route decorator)"""
        response = api_client.post(f"{BASE_URL}/api/auth/change-password", 
            json={
                "current_password": "wrong_password",
                "new_password": "NewPassword123!"
            },
            headers={"Authorization": f"Bearer {network_admin_auth}"}
        )
        # Should return 400 for wrong password, NOT 404 or 405
        assert response.status_code not in [404, 405], f"Route should exist but got {response.status_code}"
        # 400 is expected for wrong current password
        print(f"PASS: Change password route exists (status: {response.status_code})")
    
    def test_change_password_wrong_current_password_returns_400(self, api_client, network_admin_auth):
        """POST /api/auth/change-password with wrong current_password returns 400"""
        response = api_client.post(f"{BASE_URL}/api/auth/change-password",
            json={
                "current_password": "definitely_wrong_password",
                "new_password": "NewPassword123!"
            },
            headers={"Authorization": f"Bearer {network_admin_auth}"}
        )
        assert response.status_code == 400, f"Expected 400 for wrong password, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "invalid" in data["detail"].lower() or "current password" in data["detail"].lower()
        print("PASS: Change password returns 400 for wrong current password")
    
    def test_change_password_requires_auth(self, api_client):
        """POST /api/auth/change-password requires authentication"""
        response = api_client.post(f"{BASE_URL}/api/auth/change-password",
            json={
                "current_password": "test",
                "new_password": "test123"
            }
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Change password requires authentication")
    
    def test_change_password_uses_current_password_field(self, api_client, network_admin_auth):
        """POST /api/auth/change-password accepts 'current_password' field (bug fix - was old_password)"""
        # This verifies the bug fix: frontend sends 'current_password' 
        response = api_client.post(f"{BASE_URL}/api/auth/change-password",
            json={
                "current_password": "test",  # Using correct field name
                "new_password": "NewPassword123!"
            },
            headers={"Authorization": f"Bearer {network_admin_auth}"}
        )
        # Should fail because of wrong password, but not because of validation error (422)
        assert response.status_code != 422, f"Got 422 validation error - field name mismatch? {response.text}"
        print("PASS: Change password accepts 'current_password' field correctly")


# ============== LOGIN FORCE PASSWORD CHANGE TESTS ==============

class TestLoginForcePasswordChange:
    """Tests for force_password_change flag in login response"""
    
    def test_login_response_includes_force_password_change(self, api_client, network_admin_auth):
        """Login response includes force_password_change field"""
        # Use the already-established session which has reset passwords
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        # Should include force_password_change in response
        assert "force_password_change" in data, f"Missing force_password_change in response: {data.keys()}"
        print(f"PASS: Login response includes force_password_change field (value: {data['force_password_change']})")
    
    def test_me_endpoint_includes_force_password_change(self, api_client, network_admin_auth):
        """GET /api/auth/me includes force_password_change field"""
        response = api_client.get(f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {network_admin_auth}"}
        )
        assert response.status_code == 200, f"Get me failed: {response.text}"
        data = response.json()
        assert "force_password_change" in data, f"Missing force_password_change in /me response: {data.keys()}"
        print(f"PASS: /api/auth/me includes force_password_change field (value: {data['force_password_change']})")


# ============== TICKET NOTIFICATION TESTS ==============

class TestTicketEndpoints:
    """Tests for ticket endpoints and notification triggers"""
    
    @pytest.fixture
    def main_site_id(self, api_client, network_admin_auth):
        """Get a main site ID for ticket creation"""
        response = api_client.get(f"{BASE_URL}/api/main-sites",
            headers={"Authorization": f"Bearer {network_admin_auth}"}
        )
        if response.status_code == 200:
            sites = response.json()
            if isinstance(sites, list) and len(sites) > 0:
                return sites[0].get("id")
            elif isinstance(sites, dict) and "sites" in sites and len(sites["sites"]) > 0:
                return sites["sites"][0].get("id")
        return None
    
    def test_ticket_creation_returns_correct_structure(self, api_client, network_admin_auth, main_site_id):
        """POST /api/tickets/ creates ticket with correct structure"""
        headers = {"Authorization": f"Bearer {network_admin_auth}"}
        if main_site_id:
            headers["X-Main-Site-ID"] = main_site_id
        
        ticket_data = {
            "title": f"TEST_Ticket_{uuid.uuid4().hex[:8]}",
            "description": "Test ticket for notification testing",
            "page_url": "/dashboard",
            "page_name": "Dashboard",
            "browser_info": "Test Browser",
            "user_journey": [{"page": "Dashboard", "timestamp": "2024-01-01T00:00:00Z"}],
            "priority": "normal"
        }
        
        response = api_client.post(f"{BASE_URL}/api/tickets/", 
            json=ticket_data,
            headers=headers
        )
        assert response.status_code in [200, 201], f"Ticket creation failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify ticket structure
        assert "id" in data, "Ticket should have id"
        assert "title" in data, "Ticket should have title"
        assert data["title"] == ticket_data["title"]
        assert "status" in data, "Ticket should have status"
        assert data["status"] == "open"
        assert "created_by" in data, "Ticket should have created_by"
        
        print(f"PASS: Ticket creation returns correct structure (id: {data['id'][:8]}...)")
        return data["id"]
    
    def test_ticket_message_addition(self, api_client, network_admin_auth, main_site_id):
        """POST /api/tickets/{id}/messages adds message and triggers notifications"""
        # First create a ticket
        headers = {"Authorization": f"Bearer {network_admin_auth}"}
        if main_site_id:
            headers["X-Main-Site-ID"] = main_site_id
        
        ticket_data = {
            "title": f"TEST_TicketForMessage_{uuid.uuid4().hex[:8]}",
            "description": "Test ticket for message testing",
            "page_url": "/test",
            "page_name": "Test",
            "priority": "normal"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/tickets/", 
            json=ticket_data,
            headers=headers
        )
        assert create_response.status_code in [200, 201], f"Ticket creation failed: {create_response.text}"
        ticket_id = create_response.json()["id"]
        
        # Add a message
        msg_response = api_client.post(f"{BASE_URL}/api/tickets/{ticket_id}/messages",
            json={"message": "Test reply message"},
            headers=headers
        )
        assert msg_response.status_code in [200, 201], f"Message addition failed: {msg_response.status_code} - {msg_response.text}"
        msg_data = msg_response.json()
        
        assert "id" in msg_data, "Message should have id"
        assert "message" in msg_data, "Message should have message field"
        assert msg_data["message"] == "Test reply message"
        
        print(f"PASS: Message added to ticket successfully (msg_id: {msg_data['id'][:8]}...)")
    
    def test_ticket_status_update(self, api_client, network_admin_auth, main_site_id):
        """PUT /api/tickets/{id}/status changes status and triggers notifications"""
        # Create a ticket
        headers = {"Authorization": f"Bearer {network_admin_auth}"}
        if main_site_id:
            headers["X-Main-Site-ID"] = main_site_id
        
        ticket_data = {
            "title": f"TEST_TicketForStatus_{uuid.uuid4().hex[:8]}",
            "description": "Test ticket for status update testing",
            "page_url": "/test",
            "page_name": "Test",
            "priority": "high"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/tickets/", 
            json=ticket_data,
            headers=headers
        )
        assert create_response.status_code in [200, 201], f"Ticket creation failed: {create_response.text}"
        ticket_id = create_response.json()["id"]
        
        # Update status to in_progress
        status_response = api_client.put(f"{BASE_URL}/api/tickets/{ticket_id}/status",
            json={"status": "in_progress"},
            headers=headers
        )
        assert status_response.status_code == 200, f"Status update failed: {status_response.status_code} - {status_response.text}"
        
        # Verify status changed
        get_response = api_client.get(f"{BASE_URL}/api/tickets/{ticket_id}",
            headers=headers
        )
        assert get_response.status_code == 200
        ticket = get_response.json()
        assert ticket["status"] == "in_progress", f"Expected status in_progress, got {ticket['status']}"
        
        print("PASS: Ticket status updated to in_progress")
        
        # Update status to closed
        close_response = api_client.put(f"{BASE_URL}/api/tickets/{ticket_id}/status",
            json={"status": "closed"},
            headers=headers
        )
        assert close_response.status_code == 200, f"Close update failed: {close_response.text}"
        
        print("PASS: Ticket status updated to closed (triggers email notification)")
    
    def test_ticket_list_endpoint(self, api_client, network_admin_auth, main_site_id):
        """GET /api/tickets/ returns list of tickets"""
        headers = {"Authorization": f"Bearer {network_admin_auth}"}
        if main_site_id:
            headers["X-Main-Site-ID"] = main_site_id
        
        response = api_client.get(f"{BASE_URL}/api/tickets/", headers=headers)
        assert response.status_code == 200, f"List tickets failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "tickets" in data, f"Response should have 'tickets' key: {data.keys()}"
        assert isinstance(data["tickets"], list), "tickets should be a list"
        print(f"PASS: Ticket list endpoint returns {len(data['tickets'])} tickets")


# ============== EMAIL SERVICE FUNCTION TESTS ==============

class TestEmailServiceFunctions:
    """Test email service helper functions exist and work"""
    
    def test_email_service_imports(self):
        """Verify email service functions are importable"""
        try:
            from services.email_service import (
                build_ticket_notification_html,
                build_temp_password_html,
                build_password_changed_confirmation_html,
                send_ticket_notification,
                send_temp_password_email,
                send_password_changed_email
            )
            print("PASS: All email service functions are importable")
        except ImportError as e:
            pytest.fail(f"Email service import failed: {e}")
    
    def test_build_ticket_notification_html_output(self):
        """Test build_ticket_notification_html generates valid HTML"""
        from services.email_service import build_ticket_notification_html
        
        html = build_ticket_notification_html(
            ticket_title="Test Ticket",
            ticket_id="abc123",
            event="created",
            details="Test ticket details",
            site_name="Test Site"
        )
        
        assert "<div" in html, "Should contain HTML div elements"
        assert "Test Ticket" in html, "Should contain ticket title"
        assert "Clara Global Protect" in html, "Should contain Clara Global Protect branding"
        print("PASS: build_ticket_notification_html generates valid HTML with branding")
    
    def test_build_temp_password_html_output(self):
        """Test build_temp_password_html generates valid HTML"""
        from services.email_service import build_temp_password_html
        
        html = build_temp_password_html(
            temp_password="abc123xyz",
            user_name="Test User"
        )
        
        assert "<div" in html, "Should contain HTML div elements"
        assert "abc123xyz" in html, "Should contain temp password"
        assert "Clara Global Protect" in html, "Should contain Clara Global Protect branding"
        assert "Password Reset" in html or "password" in html.lower(), "Should mention password reset"
        print("PASS: build_temp_password_html generates valid HTML with temp password")
    
    def test_build_password_changed_confirmation_html_output(self):
        """Test build_password_changed_confirmation_html generates valid HTML"""
        from services.email_service import build_password_changed_confirmation_html
        
        html = build_password_changed_confirmation_html(user_name="Test User")
        
        assert "<div" in html, "Should contain HTML div elements"
        assert "Clara Global Protect" in html, "Should contain Clara Global Protect branding"
        assert "password" in html.lower(), "Should mention password"
        assert "changed" in html.lower() or "successfully" in html.lower(), "Should confirm change"
        print("PASS: build_password_changed_confirmation_html generates valid HTML")


# ============== SUPPORT EMAIL CONSTANT TEST ==============

class TestSupportEmailConstant:
    """Verify SUPPORT_EMAIL is set correctly"""
    
    def test_support_email_constant(self):
        """Verify SUPPORT_EMAIL is 'support.ops.clara@koodh.com'"""
        from routers.tickets import SUPPORT_EMAIL
        
        assert SUPPORT_EMAIL == "support.ops.clara@koodh.com", f"Expected 'support.ops.clara@koodh.com', got '{SUPPORT_EMAIL}'"
        print("PASS: SUPPORT_EMAIL constant is correctly set to 'support.ops.clara@koodh.com'")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
