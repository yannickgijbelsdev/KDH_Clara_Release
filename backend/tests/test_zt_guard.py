"""
ZeroTier Guard Feature Tests
Tests the ZT Guard functionality that ensures network admins are connected to a specific ZeroTier network before login.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "TestPass123"
TEST_SITE_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"


class TestZTGuardConfig:
    """Tests for ZT Guard configuration endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get system admin token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as system admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"System admin login failed: {response.text}"
        data = response.json()
        self.system_admin_token = data.get("token")
        assert self.system_admin_token, "No token returned for system admin"
        self.session.headers.update({"Authorization": f"Bearer {self.system_admin_token}"})
        yield
        # Cleanup: Ensure ZT Guard is disabled after tests
        self.session.put(f"{BASE_URL}/api/auth/zt-guard/config", json={"enabled": False})
    
    def test_get_zt_guard_config_as_system_admin(self):
        """Test GET /api/auth/zt-guard/config returns config for system admin"""
        response = self.session.get(f"{BASE_URL}/api/auth/zt-guard/config")
        assert response.status_code == 200, f"Failed to get ZT Guard config: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "enabled" in data, "Response missing 'enabled' field"
        assert "network_id" in data, "Response missing 'network_id' field"
        assert "api_token_masked" in data, "Response missing 'api_token_masked' field"
        # api_token should NOT be in response (security)
        assert "api_token" not in data, "api_token should not be exposed in response"
        print(f"ZT Guard config: enabled={data['enabled']}, network_id={data.get('network_id', '')}")
    
    def test_get_zt_guard_config_as_non_admin_fails(self):
        """Test GET /api/auth/zt-guard/config fails for non-system admin"""
        # Login as network admin (not system admin)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        # This might fail if guard is enabled, so we need to handle that
        if response.status_code == 403:
            print("Network admin login blocked by ZT Guard - expected if guard is enabled")
            pytest.skip("ZT Guard is enabled, cannot test non-admin access")
        
        assert response.status_code == 200, f"Network admin login failed: {response.text}"
        token = response.json().get("token")
        
        # Try to access ZT Guard config
        response = requests.get(
            f"{BASE_URL}/api/auth/zt-guard/config",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Should fail with 403 since network admin is not system admin
        assert response.status_code == 403, f"Expected 403 for non-system admin, got {response.status_code}"
        print("Non-system admin correctly denied access to ZT Guard config")
    
    def test_update_zt_guard_config(self):
        """Test PUT /api/auth/zt-guard/config updates configuration"""
        # First get current config
        response = self.session.get(f"{BASE_URL}/api/auth/zt-guard/config")
        original_config = response.json()
        
        # Update with test values (keep disabled for safety)
        update_data = {
            "network_id": "test-network-id-123",
            "api_token": "test-api-token-abc",
            "enabled": False
        }
        response = self.session.put(f"{BASE_URL}/api/auth/zt-guard/config", json=update_data)
        assert response.status_code == 200, f"Failed to update ZT Guard config: {response.text}"
        
        data = response.json()
        assert data.get("network_id") == "test-network-id-123", "network_id not updated"
        assert data.get("enabled") == False, "enabled should be False"
        assert "api_token_masked" in data, "Response should include masked token"
        print(f"ZT Guard config updated: network_id={data['network_id']}, enabled={data['enabled']}")
    
    def test_zt_guard_test_endpoint(self):
        """Test POST /api/auth/zt-guard/test returns IP verification result"""
        response = self.session.post(f"{BASE_URL}/api/auth/zt-guard/test")
        assert response.status_code == 200, f"ZT Guard test failed: {response.text}"
        
        data = response.json()
        assert "client_ip" in data, "Response missing 'client_ip'"
        assert "allowed" in data, "Response missing 'allowed'"
        assert "reason" in data, "Response missing 'reason'"
        print(f"ZT Guard test: IP={data['client_ip']}, allowed={data['allowed']}, reason={data['reason']}")


class TestZTGuardLoginFlow:
    """Tests for ZT Guard login blocking behavior"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get system admin token for config changes"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as system admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"System admin login failed: {response.text}"
        self.system_admin_token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.system_admin_token}"})
        
        # Store original config
        response = self.session.get(f"{BASE_URL}/api/auth/zt-guard/config")
        self.original_config = response.json() if response.status_code == 200 else {}
        yield
        # Cleanup: Restore original config (ensure disabled)
        self.session.put(f"{BASE_URL}/api/auth/zt-guard/config", json={"enabled": False})
    
    def test_network_admin_login_with_guard_disabled(self):
        """Test: Network admin can login when ZT Guard is disabled"""
        # Ensure guard is disabled
        response = self.session.put(f"{BASE_URL}/api/auth/zt-guard/config", json={"enabled": False})
        assert response.status_code == 200, "Failed to disable ZT Guard"
        
        # Try network admin login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Network admin login should succeed when guard disabled: {response.text}"
        
        data = response.json()
        assert data.get("token"), "Login should return token"
        print(f"Network admin login successful with guard disabled")
    
    def test_network_admin_login_blocked_with_guard_enabled(self):
        """Test: Network admin is BLOCKED when ZT Guard is enabled with fake network"""
        # Configure guard with fake network (will fail ZT API call)
        response = self.session.put(f"{BASE_URL}/api/auth/zt-guard/config", json={
            "network_id": "test-network-fake",
            "api_token": "fake-token-12345",
            "enabled": True
        })
        assert response.status_code == 200, f"Failed to enable ZT Guard: {response.text}"
        
        # Try network admin login - should be blocked
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        assert response.status_code == 403, f"Network admin should be blocked with 403, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Error response should have detail"
        print(f"Network admin correctly blocked: {data.get('detail')}")
        
        # Cleanup: Disable guard
        self.session.put(f"{BASE_URL}/api/auth/zt-guard/config", json={"enabled": False})
    
    def test_system_admin_login_bypasses_guard(self):
        """Test: System admin can login even when ZT Guard is enabled"""
        # Configure guard with fake network
        response = self.session.put(f"{BASE_URL}/api/auth/zt-guard/config", json={
            "network_id": "test-network-fake",
            "api_token": "fake-token-12345",
            "enabled": True
        })
        assert response.status_code == 200, "Failed to enable ZT Guard"
        
        # System admin login should still work (exempt from guard)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"System admin should bypass ZT Guard: {response.text}"
        
        data = response.json()
        assert data.get("token"), "System admin login should return token"
        print(f"System admin correctly bypassed ZT Guard")
        
        # Cleanup: Disable guard
        new_token = data.get("token")
        requests.put(
            f"{BASE_URL}/api/auth/zt-guard/config",
            headers={"Authorization": f"Bearer {new_token}", "Content-Type": "application/json"},
            json={"enabled": False}
        )


class TestZTGuardCLI:
    """Tests for ZT Guard CLI commands"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get system admin token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as system admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"System admin login failed: {response.text}"
        self.token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        yield
        # Cleanup: Disable guard
        self.session.put(f"{BASE_URL}/api/auth/zt-guard/config", json={"enabled": False})
    
    def test_cli_zt_guard_status(self):
        """Test CLI /zt-guard status command"""
        response = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": TEST_SITE_ID,
            "command": "/zt-guard status"
        })
        assert response.status_code == 200, f"CLI command failed: {response.text}"
        
        data = response.json()
        assert "output" in data, "CLI response should have output"
        assert "type" in data, "CLI response should have type"
        assert "ZeroTier" in data["output"], "Output should mention ZeroTier"
        print(f"CLI /zt-guard status output:\n{data['output']}")
    
    def test_cli_zt_guard_enable_without_config(self):
        """Test CLI /zt-guard enable fails without network configured"""
        # First clear the config
        self.session.put(f"{BASE_URL}/api/auth/zt-guard/config", json={
            "network_id": "",
            "api_token": "",
            "enabled": False
        })
        
        response = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": TEST_SITE_ID,
            "command": "/zt-guard enable"
        })
        assert response.status_code == 200, f"CLI command failed: {response.text}"
        
        data = response.json()
        assert data.get("type") == "error", "Should return error when no network configured"
        assert "configured" in data["output"].lower() or "network" in data["output"].lower(), \
            "Error should mention configuration needed"
        print(f"CLI /zt-guard enable (no config) output:\n{data['output']}")
    
    def test_cli_zt_guard_disable(self):
        """Test CLI /zt-guard disable command"""
        response = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": TEST_SITE_ID,
            "command": "/zt-guard disable"
        })
        assert response.status_code == 200, f"CLI command failed: {response.text}"
        
        data = response.json()
        assert "output" in data, "CLI response should have output"
        # Verify guard is actually disabled
        config_response = self.session.get(f"{BASE_URL}/api/auth/zt-guard/config")
        config = config_response.json()
        assert config.get("enabled") == False, "Guard should be disabled"
        print(f"CLI /zt-guard disable output:\n{data['output']}")
    
    def test_cli_zt_guard_set_invalid_token(self):
        """Test CLI /zt-guard set with invalid token returns error"""
        response = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": TEST_SITE_ID,
            "command": "/zt-guard set fake-network-id fake-api-token"
        })
        assert response.status_code == 200, f"CLI command failed: {response.text}"
        
        data = response.json()
        # Should return error because the token/network are invalid
        assert data.get("type") == "error", f"Should return error for invalid token, got: {data}"
        print(f"CLI /zt-guard set (invalid) output:\n{data['output']}")


class TestZTGuardCleanup:
    """Final cleanup to ensure ZT Guard is disabled"""
    
    def test_ensure_zt_guard_disabled(self):
        """Ensure ZT Guard is disabled after all tests"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as system admin
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"System admin login failed: {response.text}"
        token = response.json().get("token")
        
        # Disable ZT Guard
        response = session.put(
            f"{BASE_URL}/api/auth/zt-guard/config",
            headers={"Authorization": f"Bearer {token}"},
            json={"enabled": False}
        )
        assert response.status_code == 200, f"Failed to disable ZT Guard: {response.text}"
        
        # Verify it's disabled
        response = session.get(
            f"{BASE_URL}/api/auth/zt-guard/config",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        assert data.get("enabled") == False, "ZT Guard should be disabled"
        print("ZT Guard successfully disabled after tests")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
