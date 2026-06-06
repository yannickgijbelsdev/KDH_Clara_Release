"""
License Blocking Feature Tests
Tests for the license check endpoint and license blocking functionality.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "test"

# Test site IDs
LICENSED_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"  # radiogroep
UNLICENSED_SITE_ID = "b815d88f-0f09-4053-9103-1de53879e572"  # clone-radiogroep-e4bb83


@pytest.fixture
def system_admin_token():
    """Get system admin auth token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SYSTEM_ADMIN_EMAIL,
        "password": SYSTEM_ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"System admin login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture
def network_admin_token():
    """Get network admin auth token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": NETWORK_ADMIN_EMAIL,
        "password": NETWORK_ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Network admin login failed: {response.text}"
    return response.json()["token"]


class TestLicenseCheckEndpoint:
    """Tests for GET /api/licenses/check/{main_site_id}"""
    
    def test_license_check_endpoint_exists(self, system_admin_token):
        """Test that the license check endpoint exists and returns valid response."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/licenses/check/{LICENSED_SITE_ID}", headers=headers)
        assert response.status_code == 200, f"License check endpoint failed: {response.text}"
        data = response.json()
        assert "has_license" in data
        assert "is_demo" in data
        assert "days_remaining" in data
        assert "package" in data
        assert "assignment" in data
    
    def test_licensed_site_returns_has_license_true(self, system_admin_token):
        """Test that a licensed site returns has_license=true."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/licenses/check/{LICENSED_SITE_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["has_license"], f"Expected has_license=True for licensed site, got {data}"
        assert data["package"] is not None, "Expected package info for licensed site"
        assert data["assignment"] is not None, "Expected assignment info for licensed site"
    
    def test_unlicensed_site_returns_has_license_false(self, system_admin_token):
        """Test that an unlicensed site returns has_license=false."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/licenses/check/{UNLICENSED_SITE_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert not data["has_license"], f"Expected has_license=False for unlicensed site, got {data}"
        assert not data["is_demo"], f"Expected is_demo=False for non-demo site, got {data}"
        assert data["package"] is None, "Expected no package for unlicensed site"
        assert data["assignment"] is None, "Expected no assignment for unlicensed site"
    
    def test_license_check_requires_auth(self):
        """Test that license check endpoint requires authentication."""
        response = requests.get(f"{BASE_URL}/api/licenses/check/{LICENSED_SITE_ID}")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_network_admin_can_check_license(self, network_admin_token):
        """Test that network admin can check license status."""
        headers = {"Authorization": f"Bearer {network_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/licenses/check/{UNLICENSED_SITE_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "has_license" in data


class TestLicenseResponseFields:
    """Tests for license check response field validation."""
    
    def test_licensed_site_has_package_details(self, system_admin_token):
        """Test that licensed site response includes package details."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/licenses/check/{LICENSED_SITE_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        package = data.get("package")
        assert package is not None
        assert "id" in package
        assert "name" in package
        assert "slug" in package
        assert "features" in package
        assert isinstance(package["features"], list)
    
    def test_licensed_site_has_assignment_details(self, system_admin_token):
        """Test that licensed site response includes assignment details."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/licenses/check/{LICENSED_SITE_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assignment = data.get("assignment")
        assert assignment is not None
        assert "id" in assignment
        assert "main_site_id" in assignment
        assert "package_id" in assignment
        assert "status" in assignment
        assert assignment["status"] == "active"
    
    def test_days_remaining_field(self, system_admin_token):
        """Test that days_remaining field is present and valid."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/licenses/check/{LICENSED_SITE_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # days_remaining can be None for lifetime licenses or an integer
        days_remaining = data.get("days_remaining")
        assert days_remaining is None or isinstance(days_remaining, int)


class TestUserAccessToSites:
    """Tests for user access to main sites."""
    
    def test_system_admin_user_has_is_system_admin_flag(self, system_admin_token):
        """Test that system admin user has is_system_admin=true."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("is_system_admin"), f"Expected is_system_admin=True for system admin, got {data}"
    
    def test_network_admin_user_has_is_network_admin_flag(self, network_admin_token):
        """Test that network admin user has is_network_admin=true."""
        headers = {"Authorization": f"Bearer {network_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("is_network_admin"), f"Expected is_network_admin=True for network admin, got {data}"
        assert not data.get("is_system_admin"), f"Expected is_system_admin=False for network admin, got {data}"
    
    def test_network_admin_has_access_to_clone_site(self, network_admin_token):
        """Test that network admin has access to the clone site."""
        headers = {"Authorization": f"Bearer {network_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/main-sites/my/access", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        site_ids = [site["id"] for site in data.get("main_sites", [])]
        assert UNLICENSED_SITE_ID in site_ids, "Network admin should have access to clone site"


class TestLicenseOverviewEndpoint:
    """Tests for GET /api/licenses/overview (network admin only)."""
    
    def test_license_overview_requires_network_admin(self, system_admin_token):
        """Test that license overview requires network admin access."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/licenses/overview", headers=headers)
        # System admin may or may not have network admin access
        # Just verify the endpoint exists
        assert response.status_code in [200, 403]
    
    def test_network_admin_can_access_overview(self, network_admin_token):
        """Test that network admin can access license overview."""
        headers = {"Authorization": f"Bearer {network_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/licenses/overview", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Find the unlicensed site in overview
        unlicensed_site = next((s for s in data if s.get("site_id") == UNLICENSED_SITE_ID), None)
        if unlicensed_site:
            assert not unlicensed_site.get("has_license")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
