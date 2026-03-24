"""
Test Canva Director linked_main_site_ids feature.
Tests the new linked_main_site_ids field in config and the check-linked endpoint.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://step-wizard-plus.preview.emergentagent.com').rstrip('/')
CANVA_SERVER_SITE_ID = "9d51a9a0-90ea-41c5-8324-d240fedbd99c"  # clara-xml-server (has Canva Director)
RADIOGROEP_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"  # Radiogroep MFY/GRK (target site to link)

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
    """Get headers with auth and main site context (Canva server site)."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "X-Main-Site-ID": CANVA_SERVER_SITE_ID
    }


@pytest.fixture(scope="module")
def auth_headers_only(auth_token):
    """Get headers with auth only (no main site for check-linked)."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestCanvaLinkedSites:
    """Test linked_main_site_ids in Canva config."""

    def test_config_includes_linked_main_site_ids_field(self, headers):
        """GET /api/canva/config includes linked_main_site_ids field."""
        response = requests.get(f"{BASE_URL}/api/canva/config", headers=headers)
        print(f"GET /api/canva/config response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "linked_main_site_ids" in data, "Response should have 'linked_main_site_ids' field"
        assert isinstance(data.get("linked_main_site_ids"), list), "linked_main_site_ids should be a list"
        print(f"linked_main_site_ids: {data.get('linked_main_site_ids')}")

    def test_put_config_with_linked_main_site_ids(self, headers):
        """PUT /api/canva/config saves linked_main_site_ids array."""
        test_config = {
            "client_id": "OC-TEST-LINKED-CLIENT-ID",
            "client_secret": "test-linked-secret",
            "redirect_uri": "",
            "linked_main_site_ids": [RADIOGROEP_SITE_ID]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/canva/config",
            headers=headers,
            json=test_config
        )
        print(f"PUT /api/canva/config with linked_main_site_ids: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ok", f"Expected status 'ok', got {data}"

    def test_get_config_returns_linked_main_site_ids(self, headers):
        """GET /api/canva/config returns saved linked_main_site_ids."""
        response = requests.get(f"{BASE_URL}/api/canva/config", headers=headers)
        print(f"GET /api/canva/config after save: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("configured") == True, f"Expected configured=True, got {data.get('configured')}"
        linked_ids = data.get("linked_main_site_ids", [])
        assert RADIOGROEP_SITE_ID in linked_ids, f"Expected {RADIOGROEP_SITE_ID} in linked_main_site_ids, got {linked_ids}"
        print(f"Config has linked_main_site_ids: {linked_ids}")


class TestCanvaCheckLinked:
    """Test GET /api/canva/check-linked/{main_site_id} endpoint."""

    def test_check_linked_returns_false_for_unlinked_site(self, auth_headers_only, headers):
        """GET /api/canva/check-linked/{id} returns available=false for unlinked site."""
        # First clear linked sites
        clear_config = {
            "client_id": "OC-TEST-CLEAR-CLIENT",
            "client_secret": "test-clear-secret",
            "redirect_uri": "",
            "linked_main_site_ids": []
        }
        requests.put(f"{BASE_URL}/api/canva/config", headers=headers, json=clear_config)
        
        # Check if radiogroep site is linked (should be false)
        response = requests.get(
            f"{BASE_URL}/api/canva/check-linked/{RADIOGROEP_SITE_ID}",
            headers=auth_headers_only
        )
        print(f"GET /api/canva/check-linked/{RADIOGROEP_SITE_ID} (unlinked): {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "available" in data, "Response should have 'available' field"
        assert data.get("available") == False, f"Expected available=False, got {data.get('available')}"
        print(f"Check linked (unlinked): available={data.get('available')}")

    def test_check_linked_returns_true_for_linked_site(self, auth_headers_only, headers):
        """GET /api/canva/check-linked/{id} returns available=true with server info for linked site."""
        # First set up linked sites
        linked_config = {
            "client_id": "OC-TEST-LINKED-CLIENT",
            "client_secret": "test-linked-secret",
            "redirect_uri": "",
            "linked_main_site_ids": [RADIOGROEP_SITE_ID]
        }
        put_response = requests.put(f"{BASE_URL}/api/canva/config", headers=headers, json=linked_config)
        print(f"PUT config with linked site: {put_response.status_code}")
        assert put_response.status_code == 200, f"Failed to save config: {put_response.text}"
        
        # Check if radiogroep site is linked (should be true)
        response = requests.get(
            f"{BASE_URL}/api/canva/check-linked/{RADIOGROEP_SITE_ID}",
            headers=auth_headers_only
        )
        print(f"GET /api/canva/check-linked/{RADIOGROEP_SITE_ID} (linked): {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("available") == True, f"Expected available=True, got {data.get('available')}"
        assert "canva_server_slug" in data, "Response should have 'canva_server_slug'"
        assert "canva_server_name" in data, "Response should have 'canva_server_name'"
        
        print(f"Check linked (linked): available={data.get('available')}, "
              f"server_slug={data.get('canva_server_slug')}, server_name={data.get('canva_server_name')}")

    def test_check_linked_returns_false_for_nonexistent_site(self, auth_headers_only):
        """GET /api/canva/check-linked/{id} returns available=false for nonexistent site ID."""
        fake_site_id = "00000000-0000-0000-0000-000000000000"
        
        response = requests.get(
            f"{BASE_URL}/api/canva/check-linked/{fake_site_id}",
            headers=auth_headers_only
        )
        print(f"GET /api/canva/check-linked/{fake_site_id} (nonexistent): {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("available") == False, f"Expected available=False for nonexistent site, got {data.get('available')}"


class TestCanvaCheckLinkedRequiresClientId:
    """Test that check-linked requires a configured client_id."""

    def test_check_linked_requires_configured_canva(self, auth_headers_only, headers):
        """GET /api/canva/check-linked returns false if Canva client_id is empty."""
        # Clear the client_id (empty)
        clear_config = {
            "client_id": "",
            "client_secret": "test-secret",
            "redirect_uri": "",
            "linked_main_site_ids": [RADIOGROEP_SITE_ID]
        }
        requests.put(f"{BASE_URL}/api/canva/config", headers=headers, json=clear_config)
        
        # Check - should return false even though site is in linked list
        response = requests.get(
            f"{BASE_URL}/api/canva/check-linked/{RADIOGROEP_SITE_ID}",
            headers=auth_headers_only
        )
        print(f"GET /api/canva/check-linked (empty client_id): {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should be false because client_id is empty (not configured)
        assert data.get("available") == False, f"Expected available=False with empty client_id, got {data.get('available')}"


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
            json={"client_id": "", "client_secret": "placeholder", "linked_main_site_ids": []}
        )
        print("Cleaned up test config")
    except:
        pass
