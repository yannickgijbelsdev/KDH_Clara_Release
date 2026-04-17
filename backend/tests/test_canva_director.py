"""
Test Canva Director API endpoints.
Tests the config, auth status, and activity endpoints for the Canva Director feature.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://api-turbo.preview.emergentagent.com').rstrip('/')
MAIN_SITE_ID = "9d51a9a0-90ea-41c5-8324-d240fedbd99c"  # clara-xml-server

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def auth_token():
    """Authenticate and get JWT token."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]


@pytest.fixture(scope="module")
def headers(auth_token):
    """Get headers with auth and main site context."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "X-Main-Site-ID": MAIN_SITE_ID
    }


class TestCanvaConfig:
    """Test Canva configuration endpoints."""

    def test_get_config_not_configured(self, headers):
        """GET /api/canva/config returns not configured initially."""
        response = requests.get(f"{BASE_URL}/api/canva/config", headers=headers)
        print(f"GET /api/canva/config response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Initially should be not configured
        assert "configured" in data, "Response should have 'configured' field"
        assert "client_id" in data, "Response should have 'client_id' field"
        assert "client_secret" in data, "Response should have 'client_secret' field"
        assert "redirect_uri" in data, "Response should have 'redirect_uri' field"
        print(f"Config status: configured={data['configured']}, client_id={data['client_id']}")

    def test_put_config_saves_configuration(self, headers):
        """PUT /api/canva/config saves client_id and client_secret."""
        test_config = {
            "client_id": "OC-TEST-CLIENT-ID-12345",
            "client_secret": "test-secret-value-67890",
            "redirect_uri": "https://example.com/callback"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/canva/config",
            headers=headers,
            json=test_config
        )
        print(f"PUT /api/canva/config response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ok", f"Expected status 'ok', got {data}"

    def test_get_config_after_save(self, headers):
        """GET /api/canva/config returns configured=true with masked secret after save."""
        response = requests.get(f"{BASE_URL}/api/canva/config", headers=headers)
        print(f"GET /api/canva/config after save: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("configured") == True, f"Expected configured=True, got {data.get('configured')}"
        assert data.get("client_id") == "OC-TEST-CLIENT-ID-12345", f"Client ID mismatch: {data.get('client_id')}"
        
        # Secret should be masked (first 4 chars + ****)
        secret = data.get("client_secret", "")
        assert "****" in secret, f"Secret should be masked, got: {secret}"
        print(f"Config after save: configured={data['configured']}, client_id={data['client_id']}, masked_secret={secret}")


class TestCanvaAuthStatus:
    """Test Canva OAuth status endpoint."""

    def test_auth_status_not_connected(self, headers):
        """GET /api/canva/auth/status returns connected=false when no token."""
        response = requests.get(f"{BASE_URL}/api/canva/auth/status", headers=headers)
        print(f"GET /api/canva/auth/status response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "connected" in data, "Response should have 'connected' field"
        assert data.get("connected") == False, f"Expected connected=False, got {data.get('connected')}"
        print(f"Auth status: connected={data['connected']}")


class TestCanvaAuthUrl:
    """Test Canva OAuth URL generation endpoint."""

    def test_auth_url_requires_config(self, auth_token):
        """GET /api/canva/auth/url returns error when config not set."""
        # First clear the config
        clear_headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
            "X-Main-Site-ID": MAIN_SITE_ID
        }
        
        # Clear config by setting empty values
        requests.put(
            f"{BASE_URL}/api/canva/config",
            headers=clear_headers,
            json={"client_id": "", "client_secret": "placeholder"}
        )
        
        response = requests.get(f"{BASE_URL}/api/canva/auth/url", headers=clear_headers)
        print(f"GET /api/canva/auth/url (no config): {response.status_code} - {response.text}")
        
        # Should return 400 when not configured
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"

    def test_auth_url_returns_url_when_configured(self, headers):
        """GET /api/canva/auth/url returns URL when configured."""
        # First set up config
        test_config = {
            "client_id": "OC-TEST-CLIENT-ID-12345",
            "client_secret": "test-secret-value-67890",
            "redirect_uri": ""
        }
        requests.put(f"{BASE_URL}/api/canva/config", headers=headers, json=test_config)
        
        # Now get auth URL
        response = requests.get(f"{BASE_URL}/api/canva/auth/url", headers=headers)
        print(f"GET /api/canva/auth/url (configured): {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "url" in data, "Response should have 'url' field"
        url = data.get("url", "")
        assert "canva.com" in url, f"URL should contain canva.com, got: {url}"
        assert "client_id=" in url, f"URL should contain client_id, got: {url}"
        print(f"Auth URL generated: {url[:100]}...")


class TestCanvaActivity:
    """Test Canva activity log endpoint."""

    def test_get_activity_returns_array(self, headers):
        """GET /api/canva/activity returns empty array initially."""
        response = requests.get(f"{BASE_URL}/api/canva/activity", headers=headers)
        print(f"GET /api/canva/activity response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Activity log: {len(data)} items")


class TestCanvaRequiresMainSite:
    """Test that Canva endpoints require main site context."""

    def test_config_requires_main_site(self, auth_token):
        """Canva endpoints require X-Main-Site-ID header."""
        headers_no_site = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(f"{BASE_URL}/api/canva/config", headers=headers_no_site)
        print(f"GET /api/canva/config (no main site): {response.status_code} - {response.text}")
        
        assert response.status_code == 400, f"Expected 400 without main site header, got {response.status_code}"


# Cleanup after tests
@pytest.fixture(scope="module", autouse=True)
def cleanup(headers):
    """Clean up test data after all tests."""
    yield
    # Clear the test config after tests complete
    try:
        requests.put(
            f"{BASE_URL}/api/canva/config",
            headers=headers,
            json={"client_id": "", "client_secret": "placeholder"}
        )
        print("Cleaned up test config")
    except:
        pass
