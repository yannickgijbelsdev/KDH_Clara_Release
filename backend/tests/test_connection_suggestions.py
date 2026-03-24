"""
Test connection endpoints return {status, message, suggestion} format with English suggestions.
Tests for: Radioplayer, Canva, VMix, and Cloudflare test-connection endpoints.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for system admin."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SYSTEM_ADMIN_EMAIL, "password": SYSTEM_ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestRadioplayerTestConnection:
    """Test Radioplayer test-connection endpoint returns proper suggestion format."""

    def test_radioplayer_test_connection_returns_suggestion_format(self, auth_headers):
        """Verify /api/radioplayer/test-connection returns {status, message, suggestion}."""
        response = requests.get(
            f"{BASE_URL}/api/radioplayer/test-connection",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Must have status and message
        assert "status" in data, "Response must include 'status' field"
        assert "message" in data, "Response must include 'message' field"
        assert data["status"] in ["ok", "error", "warning"], f"Status must be ok/error/warning, got {data['status']}"
        
        # If status is error or warning, must have suggestion
        if data["status"] in ["error", "warning"]:
            assert "suggestion" in data, "Error/warning responses must include 'suggestion' field"
            assert isinstance(data["suggestion"], str), "Suggestion must be a string"
            assert len(data["suggestion"]) > 10, "Suggestion should be a meaningful English tip"
        
        print(f"Radioplayer test-connection: status={data['status']}, message={data['message']}")
        if "suggestion" in data:
            print(f"  Suggestion: {data['suggestion']}")


class TestCanvaTestConnection:
    """Test Canva test-connection endpoint returns proper suggestion format."""

    def test_canva_test_connection_returns_suggestion_format(self, auth_headers):
        """Verify /api/canva/test-connection returns {status, message, suggestion}."""
        # Need X-Main-Site-ID header for Canva
        headers = {**auth_headers, "X-Main-Site-ID": "radiogroep"}
        
        response = requests.get(
            f"{BASE_URL}/api/canva/test-connection",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Must have status and message
        assert "status" in data, "Response must include 'status' field"
        assert "message" in data, "Response must include 'message' field"
        assert data["status"] in ["ok", "error", "warning"], f"Status must be ok/error/warning, got {data['status']}"
        
        # If status is error or warning, must have suggestion
        if data["status"] in ["error", "warning"]:
            assert "suggestion" in data, "Error/warning responses must include 'suggestion' field"
            assert isinstance(data["suggestion"], str), "Suggestion must be a string"
            assert len(data["suggestion"]) > 10, "Suggestion should be a meaningful English tip"
        
        print(f"Canva test-connection: status={data['status']}, message={data['message']}")
        if "suggestion" in data:
            print(f"  Suggestion: {data['suggestion']}")


class TestVmixTestConnection:
    """Test VMix test-connection endpoint returns proper suggestion format."""

    def test_vmix_test_connection_returns_suggestion_format(self, auth_headers):
        """Verify /api/vmix/test-connection returns {status, message, suggestion}."""
        # Need X-Main-Site-ID header for VMix - use clara-xml-server which has XML servers
        headers = {**auth_headers, "X-Main-Site-ID": "clara-xml-server"}
        
        response = requests.get(
            f"{BASE_URL}/api/vmix/test-connection",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Must have status and message
        assert "status" in data, "Response must include 'status' field"
        assert "message" in data, "Response must include 'message' field"
        assert data["status"] in ["ok", "error", "warning"], f"Status must be ok/error/warning, got {data['status']}"
        
        # If status is error or warning, must have suggestion
        if data["status"] in ["error", "warning"]:
            assert "suggestion" in data, "Error/warning responses must include 'suggestion' field"
            assert isinstance(data["suggestion"], str), "Suggestion must be a string"
            assert len(data["suggestion"]) > 10, "Suggestion should be a meaningful English tip"
        
        print(f"VMix test-connection: status={data['status']}, message={data['message']}")
        if "suggestion" in data:
            print(f"  Suggestion: {data['suggestion']}")


class TestCloudflareTestConnection:
    """Test Cloudflare test-connection endpoint returns proper suggestion format."""

    def test_cloudflare_test_connection_returns_suggestion_format(self, auth_headers):
        """Verify /api/domains/cloudflare/test-connection returns {status, message, suggestion}."""
        response = requests.get(
            f"{BASE_URL}/api/domains/cloudflare/test-connection",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Must have status and message
        assert "status" in data, "Response must include 'status' field"
        assert "message" in data, "Response must include 'message' field"
        assert data["status"] in ["ok", "error", "warning"], f"Status must be ok/error/warning, got {data['status']}"
        
        # If status is error or warning, must have suggestion
        if data["status"] in ["error", "warning"]:
            assert "suggestion" in data, "Error/warning responses must include 'suggestion' field"
            assert isinstance(data["suggestion"], str), "Suggestion must be a string"
            assert len(data["suggestion"]) > 10, "Suggestion should be a meaningful English tip"
        
        print(f"Cloudflare test-connection: status={data['status']}, message={data['message']}")
        if "suggestion" in data:
            print(f"  Suggestion: {data['suggestion']}")


class TestSuggestionContentQuality:
    """Verify suggestions contain helpful English content."""

    def test_radioplayer_suggestions_are_english(self, auth_headers):
        """Verify Radioplayer suggestions are in English."""
        response = requests.get(
            f"{BASE_URL}/api/radioplayer/test-connection",
            headers=auth_headers
        )
        data = response.json()
        
        if "suggestion" in data:
            suggestion = data["suggestion"]
            # Check for common English words/patterns
            english_indicators = ["your", "the", "check", "enter", "verify", "contact", "try", "make sure", "click", "step"]
            has_english = any(word.lower() in suggestion.lower() for word in english_indicators)
            assert has_english, f"Suggestion doesn't appear to be in English: {suggestion}"
            print(f"Radioplayer suggestion is English: {suggestion[:100]}...")

    def test_canva_suggestions_are_english(self, auth_headers):
        """Verify Canva suggestions are in English."""
        headers = {**auth_headers, "X-Main-Site-ID": "radiogroep"}
        response = requests.get(
            f"{BASE_URL}/api/canva/test-connection",
            headers=headers
        )
        data = response.json()
        
        if "suggestion" in data:
            suggestion = data["suggestion"]
            english_indicators = ["your", "the", "check", "enter", "verify", "click", "connect", "step", "account"]
            has_english = any(word.lower() in suggestion.lower() for word in english_indicators)
            assert has_english, f"Suggestion doesn't appear to be in English: {suggestion}"
            print(f"Canva suggestion is English: {suggestion[:100]}...")

    def test_vmix_suggestions_are_english(self, auth_headers):
        """Verify VMix suggestions are in English."""
        headers = {**auth_headers, "X-Main-Site-ID": "clara-xml-server"}
        response = requests.get(
            f"{BASE_URL}/api/vmix/test-connection",
            headers=headers
        )
        data = response.json()
        
        if "suggestion" in data:
            suggestion = data["suggestion"]
            english_indicators = ["your", "the", "check", "create", "enable", "server", "step", "overlay"]
            has_english = any(word.lower() in suggestion.lower() for word in english_indicators)
            assert has_english, f"Suggestion doesn't appear to be in English: {suggestion}"
            print(f"VMix suggestion is English: {suggestion[:100]}...")

    def test_cloudflare_suggestions_are_english(self, auth_headers):
        """Verify Cloudflare suggestions are in English."""
        response = requests.get(
            f"{BASE_URL}/api/domains/cloudflare/test-connection",
            headers=auth_headers
        )
        data = response.json()
        
        if "suggestion" in data:
            suggestion = data["suggestion"]
            english_indicators = ["your", "the", "check", "enter", "verify", "token", "zone", "api"]
            has_english = any(word.lower() in suggestion.lower() for word in english_indicators)
            assert has_english, f"Suggestion doesn't appear to be in English: {suggestion}"
            print(f"Cloudflare suggestion is English: {suggestion[:100]}...")
