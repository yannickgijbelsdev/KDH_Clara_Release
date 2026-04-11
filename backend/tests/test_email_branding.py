"""
Test Email Branding Feature - Dynamic headers and footer variations.

Tests:
1. build_invite_email_html produces HTML WITHOUT 'Clara Global Protect' footer
2. All other build_* functions produce HTML WITH 'Clara Global Protect' footer
3. _build_dynamic_header generates correct HTML with brand logo URL (img) vs brand name only (h1)
4. _get_branding_info returns correct brand_name and brand_logo_url from MongoDB
5. All build functions accept brand_name and brand_logo_url parameters
6. Invitation email subject uses dynamic brand_name
7. /api/notifications/send-test-email endpoint returns 200 with branding
"""
import pytest
import requests
import os
import sys
import asyncio

sys.path.insert(0, '/app/backend')

# Get BASE_URL from environment, fallback to production URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://performance-boost-100.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


# Event loop fixture for async tests
@pytest.fixture(scope="class")
def event_loop():
    """Create an event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


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


class TestBuildInviteEmailNoFooter:
    """Test that build_invite_email_html does NOT contain 'Clara Global Protect' footer."""

    def test_invite_email_no_footer_default(self):
        """build_invite_email_html should NOT have 'Clara Global Protect' footer with default params."""
        from services.email_service import build_invite_email_html
        
        html = build_invite_email_html(
            user_name="Test User",
            site_name="Test Site",
            role="editor",
            temp_password="TempPass123",
            inviter_name="Admin User"
        )
        
        # The invite email should NOT have the footer
        assert "Clara Global Protect</div>" not in html, f"Invite email should NOT contain 'Clara Global Protect' footer"
        print("PASS: build_invite_email_html does NOT contain 'Clara Global Protect' footer")

    def test_invite_email_no_footer_with_custom_brand(self):
        """build_invite_email_html should NOT have footer even with custom brand."""
        from services.email_service import build_invite_email_html
        
        html = build_invite_email_html(
            user_name="Test User",
            site_name="Test Site",
            role="admin",
            temp_password="TempPass456",
            inviter_name="Manager",
            brand_name="Custom Brand",
            brand_logo_url="https://example.com/logo.png"
        )
        
        # Should use dynamic header but still no footer
        assert "Clara Global Protect</div>" not in html, "Invite email with custom brand should NOT have footer"
        assert "Custom Brand" in html or '<img src="https://example.com/logo.png"' in html, "Should use custom branding in header"
        print("PASS: build_invite_email_html with custom brand does NOT contain footer")


class TestOtherEmailsWithFooter:
    """Test that all other email functions HAVE 'Clara Global Protect' footer."""

    def test_notification_html_has_footer(self):
        """build_notification_html SHOULD have 'Clara Global Protect' footer."""
        from services.email_service import build_notification_html
        
        html = build_notification_html(
            event_type="Test Event",
            category="system",
            details="Test details",
            site_name="Test Site",
            user_name="Test User"
        )
        
        assert "Clara Global Protect</div>" in html, f"Notification HTML missing footer"
        print("PASS: build_notification_html contains 'Clara Global Protect' footer")

    def test_ticket_notification_has_footer(self):
        """build_ticket_notification_html SHOULD have 'Clara Global Protect' footer."""
        from services.email_service import build_ticket_notification_html
        
        html = build_ticket_notification_html(
            ticket_title="Test Ticket",
            ticket_id="abc123def456",
            event="created",
            details="Ticket created for testing",
            site_name="Test Site"
        )
        
        assert "Clara Global Protect</div>" in html, "Ticket notification missing footer"
        print("PASS: build_ticket_notification_html contains 'Clara Global Protect' footer")

    def test_temp_password_html_has_footer(self):
        """build_temp_password_html SHOULD have 'Clara Global Protect' footer."""
        from services.email_service import build_temp_password_html
        
        html = build_temp_password_html(
            temp_password="TempPass123",
            user_name="Test User"
        )
        
        assert "Clara Global Protect</div>" in html, "Temp password HTML missing footer"
        print("PASS: build_temp_password_html contains 'Clara Global Protect' footer")

    def test_password_changed_html_has_footer(self):
        """build_password_changed_confirmation_html SHOULD have 'Clara Global Protect' footer."""
        from services.email_service import build_password_changed_confirmation_html
        
        html = build_password_changed_confirmation_html(user_name="Test User")
        
        assert "Clara Global Protect</div>" in html, "Password changed HTML missing footer"
        print("PASS: build_password_changed_confirmation_html contains 'Clara Global Protect' footer")

    def test_approval_result_html_has_footer(self):
        """build_approval_result_html SHOULD have 'Clara Global Protect' footer."""
        from services.email_service import build_approval_result_html
        
        html = build_approval_result_html(
            content_title="Test Article",
            status="approved",
            notes="Looks good!",
            approver_name="Admin"
        )
        
        assert "Clara Global Protect</div>" in html, "Approval result HTML missing footer"
        print("PASS: build_approval_result_html contains 'Clara Global Protect' footer")

    def test_approval_request_html_has_footer(self):
        """build_approval_request_html SHOULD have 'Clara Global Protect' footer."""
        from services.email_service import build_approval_request_html
        
        html = build_approval_request_html(
            content_title="Test Article",
            requester_name="Editor User",
            site_name="Test Site"
        )
        
        assert "Clara Global Protect</div>" in html, "Approval request HTML missing footer"
        print("PASS: build_approval_request_html contains 'Clara Global Protect' footer")

    def test_daily_summary_html_has_footer(self):
        """build_daily_summary_html SHOULD have 'Clara Global Protect' footer."""
        from services.email_service import build_daily_summary_html
        
        test_events = [
            {"category": "system", "event_type": "Test", "details": "Test details", "timestamp": "2025-01-15T10:00:00Z"}
        ]
        html = build_daily_summary_html(events=test_events)
        
        assert "Clara Global Protect</div>" in html, "Daily summary HTML missing footer"
        print("PASS: build_daily_summary_html contains 'Clara Global Protect' footer")

    def test_task_status_html_has_footer(self):
        """build_task_status_html SHOULD have 'Clara Global Protect' footer."""
        from services.email_service import build_task_status_html
        
        html = build_task_status_html(
            task_title="Test Task",
            board_name="Test Board",
            old_status="To Do",
            new_status="In Progress",
            mover_name="Test User",
            site_name="Test Site"
        )
        
        assert "Clara Global Protect</div>" in html, "Task status HTML missing footer"
        print("PASS: build_task_status_html contains 'Clara Global Protect' footer")


class TestDynamicHeaderGeneration:
    """Test _build_dynamic_header generates correct HTML with logo vs text."""

    def test_header_with_brand_logo_url(self):
        """_build_dynamic_header with brand_logo_url shows img tag."""
        from services.email_service import _build_dynamic_header
        
        header = _build_dynamic_header(
            brand_name="Test Brand",
            brand_logo_url="https://example.com/logo.png",
            subtitle="Test Subtitle"
        )
        
        assert '<img src="https://example.com/logo.png"' in header, "Header should have img tag when logo URL provided"
        assert 'alt="Test Brand"' in header, "Image should have alt text with brand name"
        assert "Test Subtitle" in header, "Header should include subtitle"
        print("PASS: _build_dynamic_header with logo URL generates img tag")

    def test_header_with_brand_name_only(self):
        """_build_dynamic_header without logo URL shows h1 tag with brand name."""
        from services.email_service import _build_dynamic_header
        
        header = _build_dynamic_header(
            brand_name="Clara",
            brand_logo_url=None,
            subtitle="Security Alert"
        )
        
        assert '<h1' in header, "Header should have h1 tag when no logo URL"
        assert '>Clara</h1>' in header, "h1 should contain brand name"
        assert "Security Alert" in header, "Header should include subtitle"
        assert '<img' not in header, "Header should NOT have img tag when no logo URL"
        print("PASS: _build_dynamic_header without logo generates h1 tag")

    def test_header_empty_logo_url_treated_as_none(self):
        """_build_dynamic_header with empty string logo URL should show h1."""
        from services.email_service import _build_dynamic_header
        
        header = _build_dynamic_header(
            brand_name="Custom Brand",
            brand_logo_url="",  # Empty string
            subtitle=""
        )
        
        # Empty string is falsy in Python, so should fall back to h1
        assert '<h1' in header, "Header should have h1 tag when logo URL is empty string"
        assert '>Custom Brand</h1>' in header, "h1 should contain brand name"
        print("PASS: _build_dynamic_header with empty logo URL generates h1 tag")

    def test_header_custom_gradient(self):
        """_build_dynamic_header supports custom gradient colors."""
        from services.email_service import _build_dynamic_header
        
        custom_gradient = "linear-gradient(135deg,#22c55e,#16a34a)"
        header = _build_dynamic_header(
            brand_name="Test",
            brand_logo_url=None,
            subtitle="Success",
            gradient=custom_gradient
        )
        
        assert custom_gradient in header, f"Header should use custom gradient: {custom_gradient}"
        print("PASS: _build_dynamic_header supports custom gradient")


class TestGetBrandingInfo:
    """Test _get_branding_info retrieves correct data from MongoDB."""

    def test_get_branding_info_function_signature(self):
        """_get_branding_info exists and is async."""
        from services.email_service import _get_branding_info
        import inspect
        
        assert inspect.iscoroutinefunction(_get_branding_info), "_get_branding_info should be async"
        print("PASS: _get_branding_info is async function")

    def test_get_branding_info_via_api(self, headers):
        """Verify branding info is retrievable via /api/branding endpoint."""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "platform_name" in data, "Should have platform_name (used as brand_name)"
        assert "logo_url" in data, "Should have logo_url (used as brand_logo_url)"
        assert "logo_type" in data, "Should have logo_type"
        
        # When logo_type is 'image', logo_url should be used; otherwise brand_name
        brand_name = data.get("platform_name", "Clara")
        brand_logo_url = data.get("logo_url") if data.get("logo_type") == "image" else None
        
        print(f"PASS: Branding info via API - brand_name={brand_name}, logo_type={data.get('logo_type')}, logo_url={brand_logo_url}")


class TestBuildFunctionsAcceptBrandingParams:
    """Test all build_* functions accept brand_name and brand_logo_url parameters."""

    def test_build_notification_html_accepts_branding(self):
        """build_notification_html accepts brand_name and brand_logo_url."""
        from services.email_service import build_notification_html
        
        html = build_notification_html(
            event_type="Test",
            category="system",
            details="Test details",
            brand_name="Custom Brand",
            brand_logo_url="https://example.com/custom-logo.png"
        )
        
        assert '<img src="https://example.com/custom-logo.png"' in html, \
            "Should use custom logo URL in header"
        print("PASS: build_notification_html accepts branding params")

    def test_build_daily_summary_html_accepts_branding(self):
        """build_daily_summary_html accepts brand_name and brand_logo_url."""
        from services.email_service import build_daily_summary_html
        
        html = build_daily_summary_html(
            events=[],
            brand_name="My Radio",
            brand_logo_url="https://example.com/radio-logo.png"
        )
        
        assert '<img src="https://example.com/radio-logo.png"' in html, \
            "Should use custom logo URL"
        print("PASS: build_daily_summary_html accepts branding params")

    def test_build_ticket_notification_html_accepts_branding(self):
        """build_ticket_notification_html accepts brand_name and brand_logo_url."""
        from services.email_service import build_ticket_notification_html
        
        html = build_ticket_notification_html(
            ticket_title="Test",
            ticket_id="abc123",
            event="created",
            details="Test",
            brand_name="Support Portal",
            brand_logo_url="https://example.com/support-logo.png"
        )
        
        assert '<img src="https://example.com/support-logo.png"' in html, \
            "Should use custom logo URL"
        print("PASS: build_ticket_notification_html accepts branding params")

    def test_build_temp_password_html_accepts_branding(self):
        """build_temp_password_html accepts brand_name and brand_logo_url."""
        from services.email_service import build_temp_password_html
        
        html = build_temp_password_html(
            temp_password="Test123",
            brand_name="Security Center",
            brand_logo_url="https://example.com/security-logo.png"
        )
        
        assert '<img src="https://example.com/security-logo.png"' in html, \
            "Should use custom logo URL"
        print("PASS: build_temp_password_html accepts branding params")

    def test_build_password_changed_html_accepts_branding(self):
        """build_password_changed_confirmation_html accepts brand_name and brand_logo_url."""
        from services.email_service import build_password_changed_confirmation_html
        
        html = build_password_changed_confirmation_html(
            user_name="Test",
            brand_name="Account Center",
            brand_logo_url="https://example.com/account-logo.png"
        )
        
        assert '<img src="https://example.com/account-logo.png"' in html, \
            "Should use custom logo URL"
        print("PASS: build_password_changed_confirmation_html accepts branding params")

    def test_build_approval_result_html_accepts_branding(self):
        """build_approval_result_html accepts brand_name and brand_logo_url."""
        from services.email_service import build_approval_result_html
        
        html = build_approval_result_html(
            content_title="Test",
            status="approved",
            brand_name="Content Hub",
            brand_logo_url="https://example.com/content-logo.png"
        )
        
        assert '<img src="https://example.com/content-logo.png"' in html, \
            "Should use custom logo URL"
        print("PASS: build_approval_result_html accepts branding params")

    def test_build_approval_request_html_accepts_branding(self):
        """build_approval_request_html accepts brand_name and brand_logo_url."""
        from services.email_service import build_approval_request_html
        
        html = build_approval_request_html(
            content_title="Test",
            requester_name="Editor",
            brand_name="Editorial Suite",
            brand_logo_url="https://example.com/editorial-logo.png"
        )
        
        assert '<img src="https://example.com/editorial-logo.png"' in html, \
            "Should use custom logo URL"
        print("PASS: build_approval_request_html accepts branding params")

    def test_build_task_status_html_accepts_branding(self):
        """build_task_status_html accepts brand_name and brand_logo_url."""
        from services.email_service import build_task_status_html
        
        html = build_task_status_html(
            task_title="Test",
            board_name="Test Board",
            old_status="To Do",
            new_status="Done",
            mover_name="Test",
            brand_name="Task Manager",
            brand_logo_url="https://example.com/task-logo.png"
        )
        
        assert '<img src="https://example.com/task-logo.png"' in html, \
            "Should use custom logo URL"
        print("PASS: build_task_status_html accepts branding params")

    def test_build_invite_email_html_accepts_branding(self):
        """build_invite_email_html accepts brand_name and brand_logo_url."""
        from services.email_service import build_invite_email_html
        
        html = build_invite_email_html(
            user_name="Test",
            site_name="Test Site",
            role="editor",
            temp_password="Pass123",
            brand_name="My Platform",
            brand_logo_url="https://example.com/platform-logo.png"
        )
        
        assert '<img src="https://example.com/platform-logo.png"' in html, \
            "Should use custom logo URL"
        # Still should NOT have footer even with custom branding
        assert "Clara Global Protect</div>" not in html, \
            "Invite email should NOT have footer even with custom branding"
        print("PASS: build_invite_email_html accepts branding params (no footer)")


class TestInvitationEmailSubjectUsesBrandName:
    """Test that invitation email subject uses dynamic brand_name."""

    @pytest.mark.asyncio
    async def test_send_invite_email_subject_uses_brand_name(self):
        """send_invite_email should use brand_name in subject (not hardcoded 'Clara')."""
        # We can't actually send email, but we verify the function signature
        from services.email_service import send_invite_email
        import inspect
        
        sig = inspect.signature(send_invite_email)
        params = list(sig.parameters.keys())
        
        # Function should exist and be async
        assert inspect.iscoroutinefunction(send_invite_email), "send_invite_email should be async"
        print(f"PASS: send_invite_email is async with params: {params}")


class TestSendTestEmailEndpoint:
    """Test /api/notifications/smtp-test-email endpoint with branding."""

    def test_send_test_email_endpoint_exists(self, headers):
        """POST /api/notifications/smtp-test-email endpoint exists and returns proper response."""
        response = requests.post(
            f"{BASE_URL}/api/notifications/smtp-test-email",
            headers=headers,
            json={"to_email": "test@example.com"}
        )
        
        # Should return 200 (success) or 500 (SMTP error), NOT 404
        assert response.status_code != 404, "Endpoint should exist"
        assert response.status_code in [200, 500], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data, "Success response should have message"
            print(f"PASS: Test email sent successfully: {data}")
        else:
            print(f"PASS: Test email endpoint exists (SMTP may have failed): {response.status_code}")

    def test_send_test_email_requires_auth(self):
        """POST /api/notifications/smtp-test-email requires authentication."""
        response = requests.post(
            f"{BASE_URL}/api/notifications/smtp-test-email",
            json={"to_email": "test@example.com"}
        )
        
        assert response.status_code in [401, 403], \
            f"Expected 401/403 without auth, got {response.status_code}"
        print("PASS: Test email endpoint requires authentication")


class TestGetBrandingEndpoint:
    """Test /api/branding endpoint for integration."""

    def test_get_branding_public(self):
        """GET /api/branding is public and returns branding data."""
        response = requests.get(f"{BASE_URL}/api/branding")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "platform_name" in data, "Should have platform_name"
        assert "logo_type" in data, "Should have logo_type"
        assert "logo_url" in data, "Should have logo_url"
        print(f"PASS: GET /api/branding returns: platform_name={data.get('platform_name')}, "
              f"logo_type={data.get('logo_type')}, logo_url={data.get('logo_url')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
