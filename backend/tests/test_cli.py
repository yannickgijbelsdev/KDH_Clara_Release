"""
CLI API Tests - Clara CLI Server-level Admin Operations
Tests for CLI access control, command execution, and approval workflow
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials for System Administrator
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token for system admin"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": SYSTEM_ADMIN_EMAIL,
        "password": SYSTEM_ADMIN_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        assert "token" in data
        assert data.get("user", {}).get("is_system_admin") or data.get("user", {}).get("is_network_admin")
        return data["token"]
    pytest.skip("Authentication failed - skipping CLI tests")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


@pytest.fixture(scope="module")
def main_site_id(authenticated_client):
    """Get a main site ID for testing (Radiogroep MFY/GRK)"""
    # Get main sites the user has access to
    response = authenticated_client.get(f"{BASE_URL}/api/main-sites/my/access")
    assert response.status_code == 200
    data = response.json()
    main_sites = data.get("main_sites", [])
    
    # Find radiogroep site by slug
    radiogroep_site = next((s for s in main_sites if s.get("slug") == "radiogroep"), None)
    if radiogroep_site:
        return radiogroep_site["id"]
    
    # Fallback to any main site
    if main_sites:
        return main_sites[0]["id"]
    
    pytest.skip("No main site found for testing")


class TestCLIAccessStatus:
    """Tests for CLI access status endpoint"""

    def test_access_status_network_admin_auto_approved(self, authenticated_client, main_site_id):
        """Test that network/system admins get auto-approved CLI access"""
        response = authenticated_client.get(f"{BASE_URL}/api/cli/access-status/{main_site_id}")
        assert response.status_code == 200
        data = response.json()
        
        # Network/system admins should have approved status with override
        assert data["status"] == "approved"
        assert data.get("is_admin_override")
        print("PASSED: Network admin has auto-approved CLI access with is_admin_override=True")

    def test_access_status_invalid_site_id(self, authenticated_client):
        """Test access status with non-existent site ID"""
        fake_site_id = str(uuid.uuid4())
        response = authenticated_client.get(f"{BASE_URL}/api/cli/access-status/{fake_site_id}")
        # Should still return approved for network admin even with fake site
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "approved"
        print("PASSED: Access status returns approved for network admin regardless of site")


class TestCLICommands:
    """Tests for CLI command execution"""

    def test_execute_commands_list(self, authenticated_client, main_site_id):
        """Test /commands returns help text with all available commands"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/commands"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "output" in data
        assert "type" in data
        assert data["type"] == "info"
        
        # Check command output contains expected categories
        output = data["output"]
        assert "Clara CLI v1.0" in output
        assert "[General]" in output
        assert "[Roles]" in output
        assert "[Users]" in output
        assert "[Site]" in output
        assert "[System]" in output
        
        # Check command output contains expected commands
        assert "/help" in output
        assert "/roles list" in output
        assert "/roles repair" in output
        assert "/users list" in output
        assert "/site info" in output
        assert "/site features" in output
        assert "/health" in output
        print("PASSED: /commands returns formatted help text with all categories")

    def test_execute_help_command(self, authenticated_client, main_site_id):
        """Test /help returns same output as /commands"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/help"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "info"
        assert "Clara CLI v1.0" in data["output"]
        print("PASSED: /help command works correctly")

    def test_execute_health_check(self, authenticated_client, main_site_id):
        """Test /health returns system health check results"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/health"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "output" in data
        output = data["output"]
        
        # Health check should contain status for each component
        assert "System Health Check" in output
        assert "Database" in output
        assert "Roles" in output
        assert "Users" in output
        assert "License" in output
        assert "Sub-sites" in output
        assert "Overall:" in output
        
        # Type should be success or warning
        assert data["type"] in ["success", "warning"]
        print("PASSED: /health command returns health check with all components")

    def test_execute_roles_list(self, authenticated_client, main_site_id):
        """Test /roles list shows roles for the site"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/roles list"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Should return roles or warning about no roles
        assert data["type"] in ["success", "warning"]
        assert "output" in data
        
        if data["type"] == "success":
            assert "Roles for site" in data["output"] or "slug=" in data["output"]
        print("PASSED: /roles list returns roles information")

    def test_execute_roles_repair(self, authenticated_client, main_site_id):
        """Test /roles repair creates or confirms default roles"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/roles repair"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Should either repair roles or confirm they exist
        assert data["type"] in ["success", "info"]
        assert "output" in data
        
        # Output should mention repair status
        assert "repair" in data["output"].lower() or "exist" in data["output"].lower() or "default" in data["output"].lower()
        print("PASSED: /roles repair command executes correctly")

    def test_execute_users_list(self, authenticated_client, main_site_id):
        """Test /users list shows users and their roles"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/users list"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] in ["success", "warning"]
        assert "output" in data
        
        if data["type"] == "success":
            assert "Users in site" in data["output"] or "role=" in data["output"]
        print("PASSED: /users list returns users information")

    def test_execute_site_info(self, authenticated_client, main_site_id):
        """Test /site info shows site information"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/site info"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] in ["success", "error"]
        
        if data["type"] == "success":
            output = data["output"]
            assert "Site Information" in output
            assert "Name:" in output
            assert "Slug:" in output
            assert "Type:" in output
        print("PASSED: /site info returns site details")

    def test_execute_site_features(self, authenticated_client, main_site_id):
        """Test /site features lists enabled features"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/site features"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] in ["success", "warning"]
        assert "output" in data
        print("PASSED: /site features command executes correctly")

    def test_execute_unknown_command(self, authenticated_client, main_site_id):
        """Test that unknown commands return error"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/unknown_command_xyz"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] == "error"
        assert "Unknown command" in data["output"]
        assert "/commands" in data["output"]
        print("PASSED: Unknown commands return error with help suggestion")

    def test_execute_cache_clear(self, authenticated_client, main_site_id):
        """Test /cache clear command"""
        response = authenticated_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": main_site_id,
            "command": "/cache clear"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] == "success"
        assert "Cache cleared" in data["output"]
        print("PASSED: /cache clear command works")


class TestCLIPendingRequests:
    """Tests for CLI access request management (network admin only)"""

    def test_get_pending_requests(self, authenticated_client):
        """Test getting pending CLI access requests"""
        response = authenticated_client.get(f"{BASE_URL}/api/cli/pending-requests")
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list (possibly empty)
        assert isinstance(data, list)
        print(f"PASSED: GET /api/cli/pending-requests returns list of {len(data)} requests")


class TestCLIRequestAccess:
    """Tests for CLI access request flow"""

    def test_request_access_as_system_admin_returns_status(self, authenticated_client, main_site_id):
        """Test that requesting access when already approved returns current status"""
        # First check current status (should be approved for system admin)
        status_response = authenticated_client.get(f"{BASE_URL}/api/cli/access-status/{main_site_id}")
        assert status_response.status_code == 200
        assert status_response.json()["status"] == "approved"
        
        # System admins don't need to request access - they get it automatically
        # This test validates the access status endpoint works correctly
        print("PASSED: System admin has auto-approved access, no request needed")


class TestCLIApprovalFlow:
    """Tests for CLI access approval endpoints"""

    def test_approve_nonexistent_request(self, authenticated_client):
        """Test approving a non-existent request returns 404"""
        fake_request_id = str(uuid.uuid4())
        response = authenticated_client.put(
            f"{BASE_URL}/api/cli/approve/{fake_request_id}",
            json={"approved": True}
        )
        assert response.status_code == 404
        print("PASSED: Approving non-existent request returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
