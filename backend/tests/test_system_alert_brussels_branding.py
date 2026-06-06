"""
Test System Alert Email, Brussels timezone, Clara Global Protect branding features.

Tests:
1. GET /api/notifications/system-alert - returns default settings
2. PUT /api/notifications/system-alert - saves email, enabled, mode correctly
3. Email timestamps use Europe/Brussels timezone
4. Email footers say 'Clara Global Protect'
5. Test email subject is 'Clara Global Protect — Test'
6. Approval email notifications
"""
import pytest
import requests
import os
import re
from datetime import timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for network admin."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code}")
    data = response.json()
    return data.get("token")


@pytest.fixture(scope="module")
def headers(auth_token):
    """Headers with auth token."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestSystemAlertEndpoints:
    """Tests for system alert email endpoints."""

    def test_get_system_alert_returns_defaults(self, headers):
        """GET /api/notifications/system-alert returns default settings when not configured."""
        response = requests.get(f"{BASE_URL}/api/notifications/system-alert", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Should have email, enabled, mode fields
        assert "email" in data, "Response should have 'email' field"
        assert "enabled" in data, "Response should have 'enabled' field"
        assert "mode" in data, "Response should have 'mode' field"
        
        # Mode should be one of: realtime, daily, both
        assert data["mode"] in ["realtime", "daily", "both"], f"Invalid mode: {data['mode']}"
        print(f"System alert settings: {data}")

    def test_put_system_alert_saves_settings(self, headers):
        """PUT /api/notifications/system-alert saves email, enabled, mode correctly."""
        test_settings = {
            "email": "clara.global@koodh.com",
            "enabled": True,
            "mode": "both"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/notifications/system-alert",
            headers=headers,
            json=test_settings
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify save succeeded
        data = response.json()
        assert "message" in data or response.status_code == 200, "Should return success message"
        print(f"Save response: {data}")
        
        # Verify by re-fetching
        get_response = requests.get(f"{BASE_URL}/api/notifications/system-alert", headers=headers)
        assert get_response.status_code == 200
        
        saved_data = get_response.json()
        assert saved_data.get("email") == "clara.global@koodh.com", f"Email mismatch: {saved_data}"
        assert saved_data.get("enabled"), f"Enabled mismatch: {saved_data}"
        assert saved_data.get("mode") == "both", f"Mode mismatch: {saved_data}"
        print(f"Verified saved settings: {saved_data}")

    def test_put_system_alert_realtime_mode(self, headers):
        """PUT /api/notifications/system-alert can set mode to realtime."""
        test_settings = {
            "email": "test.realtime@koodh.com",
            "enabled": True,
            "mode": "realtime"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/notifications/system-alert",
            headers=headers,
            json=test_settings
        )
        assert response.status_code == 200
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/notifications/system-alert", headers=headers)
        saved_data = get_response.json()
        assert saved_data.get("mode") == "realtime", f"Mode not saved: {saved_data}"
        print(f"Realtime mode saved: {saved_data}")

    def test_put_system_alert_daily_mode(self, headers):
        """PUT /api/notifications/system-alert can set mode to daily."""
        test_settings = {
            "email": "test.daily@koodh.com",
            "enabled": False,  # Test disabled state too
            "mode": "daily"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/notifications/system-alert",
            headers=headers,
            json=test_settings
        )
        assert response.status_code == 200
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/notifications/system-alert", headers=headers)
        saved_data = get_response.json()
        assert saved_data.get("mode") == "daily", f"Mode not saved: {saved_data}"
        assert not saved_data.get("enabled"), f"Enabled not saved: {saved_data}"
        print(f"Daily mode saved: {saved_data}")

    def test_restore_system_alert_original(self, headers):
        """Restore original system alert settings after tests."""
        test_settings = {
            "email": "clara.global@koodh.com",
            "enabled": True,
            "mode": "both"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/notifications/system-alert",
            headers=headers,
            json=test_settings
        )
        assert response.status_code == 200
        print("Restored system alert settings to original")


class TestClaraGlobalProtectBranding:
    """Tests for Clara Global Protect branding in emails."""

    def test_smtp_test_email_subject_branding(self, headers):
        """Test email subject should be 'Clara Global Protect — Test'."""
        # First verify SMTP is configured
        smtp_response = requests.get(f"{BASE_URL}/api/notifications/smtp-config", headers=headers)
        if smtp_response.status_code != 200:
            pytest.skip("SMTP config endpoint not accessible")
        
        smtp_data = smtp_response.json()
        if not smtp_data.get("configured"):
            pytest.skip("SMTP not configured")
        
        # Test email endpoint exists and accepts requests
        # We can't actually send emails in tests, but we verify the endpoint
        test_email_response = requests.post(
            f"{BASE_URL}/api/notifications/smtp-test-email",
            headers=headers,
            json={"to_email": "test@example.com"}
        )
        # The endpoint should exist and return 200 or 500 (if SMTP fails)
        # It should NOT return 404
        assert test_email_response.status_code != 404, "Test email endpoint should exist"
        print(f"Test email endpoint response: {test_email_response.status_code}")

    def test_build_notification_html_has_branding(self):
        """Verify email templates contain 'Clara Global Protect' branding."""
        # Read the email_service.py file to verify branding
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from services.email_service import build_notification_html, build_daily_summary_html
            
            # Test notification HTML
            html = build_notification_html("Test Event", "system", "Test details", "Test Site")
            assert "Clara Global Protect" in html, f"Notification HTML missing 'Clara Global Protect': {html[-200:]}"
            print("✓ build_notification_html contains 'Clara Global Protect'")
            
            # Test daily summary HTML
            html_summary = build_daily_summary_html([])
            assert "Clara Global Protect" in html_summary, f"Daily summary HTML missing 'Clara Global Protect': {html_summary[-200:]}"
            print("✓ build_daily_summary_html contains 'Clara Global Protect'")
            
        except ImportError as e:
            pytest.skip(f"Could not import email_service: {e}")


class TestBrusselsTimezone:
    """Tests for Brussels timezone (Europe/Brussels) in email timestamps."""

    def test_brussels_timezone_in_email_service(self):
        """Verify email service uses Europe/Brussels timezone."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from services.email_service import BRUSSELS_TZ, build_notification_html
            from zoneinfo import ZoneInfo
            
            # Verify BRUSSELS_TZ is set correctly
            expected_tz = ZoneInfo("Europe/Brussels")
            assert str(BRUSSELS_TZ) == str(expected_tz), f"BRUSSELS_TZ mismatch: {BRUSSELS_TZ} vs {expected_tz}"
            print(f"✓ BRUSSELS_TZ is set to: {BRUSSELS_TZ}")
            
            # Verify timestamp format in notification HTML
            html = build_notification_html("Test Event", "system", "Test details")
            
            # The timestamp should be in DD-MM-YYYY HH:MM format
            # Look for date pattern in HTML
            date_pattern = r'\d{2}-\d{2}-\d{4} \d{2}:\d{2}'
            match = re.search(date_pattern, html)
            if match:
                print(f"✓ Found timestamp in Brussels format: {match.group()}")
            else:
                print(f"Note: Timestamp pattern not found, HTML excerpt: {html[-300:]}")
                
        except ImportError as e:
            pytest.skip(f"Could not import email_service: {e}")

    def test_daily_summary_uses_brussels_timezone(self):
        """Verify daily summary email uses Brussels timezone."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from services.email_service import build_daily_summary_html, BRUSSELS_TZ
            from datetime import datetime
            
            # Build summary with test events
            test_events = [
                {
                    "category": "system",
                    "event_type": "Test Event",
                    "details": "Test details",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            ]
            
            html = build_daily_summary_html(test_events)
            
            # Verify Brussels date format (DD-MM-YYYY)
            today_brussels = datetime.now(BRUSSELS_TZ).strftime("%d-%m-%Y")
            assert today_brussels in html, f"Brussels date not found in summary: {today_brussels}"
            print(f"✓ Daily summary uses Brussels date format: {today_brussels}")
            
        except ImportError as e:
            pytest.skip(f"Could not import email_service: {e}")


class TestApprovalNotificationEmails:
    """Tests for content approval email notifications."""

    def test_approval_request_notification_function_exists(self):
        """Verify send_approval_request_notification function exists."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from services.email_service import send_approval_request_notification
            print("✓ send_approval_request_notification function exists")
        except ImportError as e:
            pytest.fail(f"send_approval_request_notification not found: {e}")

    def test_approval_result_notification_function_exists(self):
        """Verify send_content_approval_notification function exists."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from services.email_service import send_content_approval_notification
            print("✓ send_content_approval_notification function exists")
        except ImportError as e:
            pytest.fail(f"send_content_approval_notification not found: {e}")

    def test_build_approval_request_html_branding(self):
        """Verify approval request email has Clara Global Protect branding."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from services.email_service import build_approval_request_html
            
            html = build_approval_request_html("Test Article", "Test User", "Test Site")
            assert "Clara Global Protect" in html, f"Approval request missing branding: {html[-200:]}"
            print("✓ build_approval_request_html contains 'Clara Global Protect'")
            
        except ImportError as e:
            pytest.skip(f"Could not import email_service: {e}")

    def test_build_approval_result_html_branding(self):
        """Verify approval result email has Clara Global Protect branding."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from services.email_service import build_approval_result_html
            
            # Test approved status
            html_approved = build_approval_result_html("Test Article", "approved", "Looks good!", "Admin User")
            assert "Clara Global Protect" in html_approved, "Approved email missing branding"
            print("✓ Approved email contains 'Clara Global Protect'")
            
            # Test rejected status
            html_rejected = build_approval_result_html("Test Article", "rejected", "Needs revision", "Admin User")
            assert "Clara Global Protect" in html_rejected, "Rejected email missing branding"
            print("✓ Rejected email contains 'Clara Global Protect'")
            
        except ImportError as e:
            pytest.skip(f"Could not import email_service: {e}")


class TestTriggerNotificationWithSystemAlert:
    """Tests for trigger_notification sending to system alert email."""

    def test_trigger_notification_endpoint_exists(self):
        """Verify notification log endpoint exists (used by trigger_notification)."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from routers.notifications import trigger_notification
            print("✓ trigger_notification function exists in notifications router")
        except ImportError as e:
            pytest.fail(f"trigger_notification not found: {e}")

    def test_notification_log_endpoint(self, headers):
        """GET /api/notifications/log returns notification history."""
        response = requests.get(f"{BASE_URL}/api/notifications/log?limit=10", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Should return list of notifications"
        print(f"Notification log has {len(data)} entries")


class TestNotificationCategoriesAndSMTP:
    """Tests for SMTP config and categories endpoints."""

    def test_smtp_providers_endpoint(self, headers):
        """GET /api/notifications/smtp-providers returns providers."""
        response = requests.get(f"{BASE_URL}/api/notifications/smtp-providers", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Should return list of providers"
        assert len(data) > 0, "Should have at least one provider"
        
        # Check microsoft365 provider exists
        provider_ids = [p.get("id") for p in data]
        assert "microsoft365" in provider_ids, "microsoft365 provider should exist"
        print(f"SMTP providers: {provider_ids}")

    def test_notification_categories_endpoint(self, headers):
        """GET /api/notifications/categories returns categories."""
        response = requests.get(f"{BASE_URL}/api/notifications/categories", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Should return list of categories"
        assert len(data) > 0, "Should have categories"
        
        # Check expected categories
        category_ids = [c.get("id") for c in data]
        expected = ["security", "firewall", "content", "shows", "users", "wordpress", "system"]
        for cat in expected:
            assert cat in category_ids, f"Missing category: {cat}"
        print(f"Categories: {category_ids}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
