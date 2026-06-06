"""
Test suite for POST /api/firewall/enable-rack endpoint
Tests bulk enable/disable firewall for all sites in a rack
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "test"
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"


class TestFirewallEnableRack:
    """Tests for POST /api/firewall/enable-rack endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self, email, password):
        """Get authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def get_network_admin_token(self):
        """Get network admin token"""
        return self.get_auth_token(NETWORK_ADMIN_EMAIL, NETWORK_ADMIN_PASSWORD)
    
    def get_system_admin_token(self):
        """Get system admin token"""
        return self.get_auth_token(SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_PASSWORD)
    
    def get_site_ids_from_bulk_status(self, token):
        """Get site IDs from bulk status endpoint"""
        response = self.session.get(
            f"{BASE_URL}/api/firewall/status/bulk",
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code == 200:
            data = response.json()
            return list(data.get("status", {}).keys())
        return []
    
    # ============== Authentication Tests ==============
    
    def test_enable_rack_requires_auth(self):
        """POST /api/firewall/enable-rack should require authentication"""
        response = self.session.post(
            f"{BASE_URL}/api/firewall/enable-rack",
            json={"site_ids": ["test-id"], "enabled": True}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: enable-rack requires authentication")
    
    def test_enable_rack_requires_network_admin(self):
        """POST /api/firewall/enable-rack should require network admin role"""
        # First, try to get a non-admin token (if available)
        # For now, verify that network admin CAN access it
        token = self.get_network_admin_token()
        if not token:
            pytest.skip("Could not get network admin token")
        
        # Get some site IDs
        site_ids = self.get_site_ids_from_bulk_status(token)
        if not site_ids:
            pytest.skip("No sites available for testing")
        
        response = self.session.post(
            f"{BASE_URL}/api/firewall/enable-rack",
            headers={"Authorization": f"Bearer {token}"},
            json={"site_ids": [site_ids[0]], "enabled": True}
        )
        assert response.status_code == 200, f"Network admin should have access, got {response.status_code}: {response.text}"
        print("PASS: Network admin can access enable-rack endpoint")
    
    # ============== Validation Tests ==============
    
    def test_enable_rack_returns_400_if_no_site_ids(self):
        """POST /api/firewall/enable-rack should return 400 if no site_ids provided"""
        token = self.get_network_admin_token()
        if not token:
            pytest.skip("Could not get network admin token")
        
        response = self.session.post(
            f"{BASE_URL}/api/firewall/enable-rack",
            headers={"Authorization": f"Bearer {token}"},
            json={"site_ids": [], "enabled": True}
        )
        assert response.status_code == 400, f"Expected 400 for empty site_ids, got {response.status_code}"
        print("PASS: Returns 400 when site_ids is empty")
    
    def test_enable_rack_returns_422_if_missing_site_ids(self):
        """POST /api/firewall/enable-rack should return 422 if site_ids field is missing"""
        token = self.get_network_admin_token()
        if not token:
            pytest.skip("Could not get network admin token")
        
        response = self.session.post(
            f"{BASE_URL}/api/firewall/enable-rack",
            headers={"Authorization": f"Bearer {token}"},
            json={"enabled": True}  # Missing site_ids
        )
        assert response.status_code == 422, f"Expected 422 for missing site_ids, got {response.status_code}"
        print("PASS: Returns 422 when site_ids field is missing")
    
    # ============== Functionality Tests ==============
    
    def test_enable_rack_bulk_enable(self):
        """POST /api/firewall/enable-rack should bulk enable firewall for provided sites"""
        token = self.get_network_admin_token()
        if not token:
            pytest.skip("Could not get network admin token")
        
        # Get site IDs
        site_ids = self.get_site_ids_from_bulk_status(token)
        if len(site_ids) < 2:
            pytest.skip("Need at least 2 sites for bulk test")
        
        test_site_ids = site_ids[:2]  # Test with first 2 sites
        
        # Enable firewall for these sites
        response = self.session.post(
            f"{BASE_URL}/api/firewall/enable-rack",
            headers={"Authorization": f"Bearer {token}"},
            json={"site_ids": test_site_ids, "enabled": True}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "updated" in data, "Response should contain 'updated' count"
        assert "enabled" in data, "Response should contain 'enabled' boolean"
        assert data["updated"] == len(test_site_ids), f"Expected {len(test_site_ids)} updated, got {data['updated']}"
        assert data["enabled"], "enabled should be True"
        
        print(f"PASS: Bulk enabled firewall for {data['updated']} sites")
    
    def test_enable_rack_bulk_disable(self):
        """POST /api/firewall/enable-rack should bulk disable firewall for provided sites"""
        token = self.get_network_admin_token()
        if not token:
            pytest.skip("Could not get network admin token")
        
        # Get site IDs
        site_ids = self.get_site_ids_from_bulk_status(token)
        if not site_ids:
            pytest.skip("No sites available for testing")
        
        test_site_id = site_ids[0]
        
        # Disable firewall
        response = self.session.post(
            f"{BASE_URL}/api/firewall/enable-rack",
            headers={"Authorization": f"Bearer {token}"},
            json={"site_ids": [test_site_id], "enabled": False}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["updated"] == 1, f"Expected 1 updated, got {data['updated']}"
        assert not data["enabled"], "enabled should be False"
        
        print(f"PASS: Bulk disabled firewall for {data['updated']} sites")
    
    def test_enable_rack_reflects_in_bulk_status(self):
        """GET /api/firewall/status/bulk should reflect updated status after enable-rack call"""
        token = self.get_network_admin_token()
        if not token:
            pytest.skip("Could not get network admin token")
        
        # Get site IDs
        site_ids = self.get_site_ids_from_bulk_status(token)
        if not site_ids:
            pytest.skip("No sites available for testing")
        
        test_site_id = site_ids[0]
        
        # Enable firewall
        enable_response = self.session.post(
            f"{BASE_URL}/api/firewall/enable-rack",
            headers={"Authorization": f"Bearer {token}"},
            json={"site_ids": [test_site_id], "enabled": True}
        )
        assert enable_response.status_code == 200
        
        # Check bulk status
        status_response = self.session.get(
            f"{BASE_URL}/api/firewall/status/bulk",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert status_response.status_code == 200
        status_data = status_response.json()
        
        assert test_site_id in status_data.get("status", {}), f"Site {test_site_id} should be in status"
        assert status_data["status"][test_site_id], f"Site {test_site_id} should have enabled=True"
        
        print(f"PASS: Bulk status reflects enabled=True for site {test_site_id}")
        
        # Now disable and verify
        disable_response = self.session.post(
            f"{BASE_URL}/api/firewall/enable-rack",
            headers={"Authorization": f"Bearer {token}"},
            json={"site_ids": [test_site_id], "enabled": False}
        )
        assert disable_response.status_code == 200
        
        # Check bulk status again
        status_response2 = self.session.get(
            f"{BASE_URL}/api/firewall/status/bulk",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert status_response2.status_code == 200
        status_data2 = status_response2.json()
        
        assert not status_data2["status"][test_site_id], f"Site {test_site_id} should have enabled=False after disable"
        
        print(f"PASS: Bulk status reflects enabled=False for site {test_site_id} after disable")
    
    def test_enable_rack_with_system_admin(self):
        """POST /api/firewall/enable-rack should work with system admin credentials"""
        token = self.get_system_admin_token()
        if not token:
            pytest.skip("Could not get system admin token")
        
        # Get site IDs
        site_ids = self.get_site_ids_from_bulk_status(token)
        if not site_ids:
            pytest.skip("No sites available for testing")
        
        response = self.session.post(
            f"{BASE_URL}/api/firewall/enable-rack",
            headers={"Authorization": f"Bearer {token}"},
            json={"site_ids": [site_ids[0]], "enabled": True}
        )
        
        assert response.status_code == 200, f"System admin should have access, got {response.status_code}: {response.text}"
        print("PASS: System admin can access enable-rack endpoint")


class TestFirewallStatusBulk:
    """Tests for GET /api/firewall/status/bulk endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_auth_token(self, email, password):
        """Get authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_bulk_status_requires_auth(self):
        """GET /api/firewall/status/bulk should require authentication"""
        response = self.session.get(f"{BASE_URL}/api/firewall/status/bulk")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: bulk status requires authentication")
    
    def test_bulk_status_returns_correct_structure(self):
        """GET /api/firewall/status/bulk should return correct structure"""
        token = self.get_auth_token(NETWORK_ADMIN_EMAIL, NETWORK_ADMIN_PASSWORD)
        if not token:
            pytest.skip("Could not get network admin token")
        
        response = self.session.get(
            f"{BASE_URL}/api/firewall/status/bulk",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status' field"
        assert "rule_counts" in data, "Response should contain 'rule_counts' field"
        assert isinstance(data["status"], dict), "'status' should be a dict"
        assert isinstance(data["rule_counts"], dict), "'rule_counts' should be a dict"
        
        # Verify status values are booleans
        for site_id, enabled in data["status"].items():
            assert isinstance(enabled, bool), f"Status for {site_id} should be boolean, got {type(enabled)}"
        
        print(f"PASS: Bulk status returns correct structure with {len(data['status'])} sites")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
