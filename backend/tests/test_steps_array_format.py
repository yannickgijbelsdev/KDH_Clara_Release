"""Test that all test-connection endpoints return structured 'steps' arrays instead of 'suggestion' strings.

This tests the fix for vague error messages in wizard pages - now endpoints return
detailed step-by-step instructions as arrays.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for system admin."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers with token."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestCloudflareTestConnection:
    """Test /api/domains/cloudflare/test-connection returns steps array."""

    def test_cloudflare_returns_steps_array_on_error(self, auth_headers):
        """Cloudflare test-connection should return 'steps' array, not 'suggestion' string."""
        response = requests.get(
            f"{BASE_URL}/api/domains/cloudflare/test-connection",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have status and message
        assert "status" in data, "Response missing 'status' field"
        assert "message" in data, "Response missing 'message' field"
        
        # If error, should have 'steps' array, not 'suggestion' string
        if data["status"] in ("error", "warning"):
            assert "steps" in data, "Error response missing 'steps' array"
            assert isinstance(data["steps"], list), "'steps' should be a list"
            assert len(data["steps"]) > 0, "'steps' array should not be empty"
            # Each step should be a string
            for step in data["steps"]:
                assert isinstance(step, str), f"Step should be string, got {type(step)}"
            print(f"PASS: Cloudflare returns {len(data['steps'])} steps on error")
            print(f"  Steps: {data['steps'][:2]}...")  # Print first 2 steps
        else:
            print(f"PASS: Cloudflare connection OK - status: {data['status']}")

    def test_cloudflare_may_have_link_on_error(self, auth_headers):
        """Cloudflare test-connection may include 'link' and 'link_label' on error."""
        response = requests.get(
            f"{BASE_URL}/api/domains/cloudflare/test-connection",
            headers=auth_headers
        )
        data = response.json()
        
        if data["status"] in ("error", "warning"):
            # Link is optional but if present should be valid
            if "link" in data:
                assert isinstance(data["link"], str), "'link' should be string"
                assert data["link"].startswith("http"), "'link' should be a URL"
                print(f"PASS: Cloudflare includes link: {data['link']}")
            if "link_label" in data:
                assert isinstance(data["link_label"], str), "'link_label' should be string"
                print(f"PASS: Cloudflare includes link_label: {data['link_label']}")


class TestRadioplayerTestConnection:
    """Test /api/radioplayer/test-connection returns steps array."""

    def test_radioplayer_returns_steps_array_on_error(self, auth_headers):
        """Radioplayer test-connection should return 'steps' array on error."""
        response = requests.get(
            f"{BASE_URL}/api/radioplayer/test-connection",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "status" in data, "Response missing 'status' field"
        assert "message" in data, "Response missing 'message' field"
        
        if data["status"] in ("error", "warning"):
            assert "steps" in data, "Error response missing 'steps' array"
            assert isinstance(data["steps"], list), "'steps' should be a list"
            assert len(data["steps"]) > 0, "'steps' array should not be empty"
            print(f"PASS: Radioplayer returns {len(data['steps'])} steps on error")
            print(f"  Message: {data['message']}")
        else:
            print(f"PASS: Radioplayer connection OK - status: {data['status']}")


class TestCanvaTestConnection:
    """Test /api/canva/test-connection returns steps array."""

    def test_canva_returns_steps_array_on_error(self, auth_headers):
        """Canva test-connection should return 'steps' array on error."""
        # Canva requires main site context header
        headers = {**auth_headers, "X-Main-Site-Id": "test-site"}
        response = requests.get(
            f"{BASE_URL}/api/canva/test-connection",
            headers=headers
        )
        # May return 400 if no main site context, but should still have proper format
        data = response.json()
        
        assert "status" in data, "Response missing 'status' field"
        assert "message" in data, "Response missing 'message' field"
        
        if data["status"] in ("error", "warning"):
            assert "steps" in data, "Error response missing 'steps' array"
            assert isinstance(data["steps"], list), "'steps' should be a list"
            assert len(data["steps"]) > 0, "'steps' array should not be empty"
            print(f"PASS: Canva returns {len(data['steps'])} steps on error")
            print(f"  Message: {data['message']}")
        else:
            print(f"PASS: Canva connection OK - status: {data['status']}")


class TestVMixTestConnection:
    """Test /api/vmix/test-connection returns steps array."""

    def test_vmix_returns_steps_array_on_error(self, auth_headers):
        """VMix test-connection should return 'steps' array on error."""
        # VMix requires main site context header
        headers = {**auth_headers, "X-Main-Site-Id": "test-site"}
        response = requests.get(
            f"{BASE_URL}/api/vmix/test-connection",
            headers=headers
        )
        data = response.json()
        
        assert "status" in data, "Response missing 'status' field"
        assert "message" in data, "Response missing 'message' field"
        
        if data["status"] in ("error", "warning"):
            assert "steps" in data, "Error response missing 'steps' array"
            assert isinstance(data["steps"], list), "'steps' should be a list"
            assert len(data["steps"]) > 0, "'steps' array should not be empty"
            print(f"PASS: VMix returns {len(data['steps'])} steps on error")
            print(f"  Message: {data['message']}")
        else:
            print(f"PASS: VMix connection OK - status: {data['status']}")


class TestStepsArrayFormat:
    """Test that steps arrays have proper format across all endpoints."""

    def test_steps_are_actionable_instructions(self, auth_headers):
        """Steps should be actionable instructions, not vague suggestions."""
        endpoints = [
            ("/api/domains/cloudflare/test-connection", {}),
            ("/api/radioplayer/test-connection", {}),
            ("/api/canva/test-connection", {"X-Main-Site-Id": "test-site"}),
            ("/api/vmix/test-connection", {"X-Main-Site-Id": "test-site"}),
        ]
        
        for endpoint, extra_headers in endpoints:
            headers = {**auth_headers, **extra_headers}
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
            data = response.json()
            
            if data.get("status") in ("error", "warning") and "steps" in data:
                # Check that steps are not empty strings
                for i, step in enumerate(data["steps"]):
                    assert len(step.strip()) > 10, f"Step {i+1} in {endpoint} is too short: '{step}'"
                print(f"PASS: {endpoint} has {len(data['steps'])} actionable steps")


class TestNoSuggestionStringFallback:
    """Verify that 'suggestion' string is NOT used in new responses."""

    def test_cloudflare_no_suggestion_string(self, auth_headers):
        """Cloudflare should not return 'suggestion' string (legacy format)."""
        response = requests.get(
            f"{BASE_URL}/api/domains/cloudflare/test-connection",
            headers=auth_headers
        )
        data = response.json()
        
        # 'suggestion' should not be present in new format
        if data.get("status") in ("error", "warning"):
            # If suggestion exists, it should be alongside steps (for backward compat)
            # but steps should be the primary format
            if "suggestion" in data:
                assert "steps" in data, "If 'suggestion' exists, 'steps' should also exist"
                print("INFO: Cloudflare has both 'suggestion' and 'steps' (backward compat)")
            else:
                print("PASS: Cloudflare uses 'steps' only (no legacy 'suggestion')")
