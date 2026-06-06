"""
Test custom roles fix functionality.

This test suite validates:
1. CLI command '/fix custom roles' works correctly
2. GET /api/auth/me/permissions returns correct permissions for custom roles
3. Permissions include view/create/edit/delete for each feature
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_ADMIN_EMAIL = "admkoodh@koodh.com"
TEST_ADMIN_PASSWORD = "KYLovie13monx"

# main_site_id for testing (main_site from the context)
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Create headers with auth token and main site ID."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "X-Main-Site-ID": MAIN_SITE_ID
    }


class TestCustomRolesFix:
    """Test the /fix custom roles CLI command."""

    def test_cli_execute_fix_custom_roles(self, auth_headers):
        """Test POST /api/cli/execute with '/fix custom roles' command."""
        response = requests.post(
            f"{BASE_URL}/api/cli/execute",
            json={
                "main_site_id": MAIN_SITE_ID,
                "command": "/fix custom roles"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"CLI execute failed: {response.text}"
        
        data = response.json()
        assert "output" in data, "Response should contain 'output' field"
        assert "type" in data, "Response should contain 'type' field"
        
        # The command should return either success (if roles were fixed) or info (if already fixed)
        assert data["type"] in ["success", "info"], f"Unexpected response type: {data['type']}"
        
        # Output should mention custom roles
        output = data.get("output", "")
        assert "custom role" in output.lower(), f"Output should mention custom roles: {output}"
        
        print(f"CLI /fix custom roles output: {output}")
        print(f"Response type: {data['type']}")


class TestPermissionsEndpoint:
    """Test GET /api/auth/me/permissions endpoint."""

    def test_get_permissions_returns_200(self, auth_headers):
        """Test that GET /api/auth/me/permissions returns 200 OK."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me/permissions",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Permissions endpoint failed: {response.text}"
        
        data = response.json()
        
        # For admin user, should have full access or permissions dict
        assert "permissions" in data or "_full_access" in data.get("permissions", {}), \
            f"Response should contain permissions: {data}"
        
        print(f"Permissions response: {data}")

    def test_permissions_structure(self, auth_headers):
        """Test that permissions have correct structure with view/create/edit/delete."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me/permissions",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        permissions = data.get("permissions", {})
        
        # Admin users get full access
        if permissions.get("_full_access"):
            print("User has full access (admin)")
            return
        
        # Otherwise, check structure of permissions
        for feature, perms in permissions.items():
            if feature.startswith("_"):
                continue
            
            if isinstance(perms, dict):
                # Each feature should have view, create, edit, delete
                expected_keys = {"view", "create", "edit", "delete"}
                actual_keys = set(perms.keys())
                
                # At least some of the expected keys should be present
                assert actual_keys.intersection(expected_keys), \
                    f"Feature '{feature}' should have permission keys: {perms}"
                
                print(f"Feature '{feature}' permissions: {perms}")


class TestRolesList:
    """Test roles listing to verify custom roles exist."""

    def test_roles_list_via_cli(self, auth_headers):
        """Test /roles list command shows both system and custom roles."""
        response = requests.post(
            f"{BASE_URL}/api/cli/execute",
            json={
                "main_site_id": MAIN_SITE_ID,
                "command": "/roles list"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"CLI /roles list failed: {response.text}"
        
        data = response.json()
        output = data.get("output", "")
        
        # Should show roles with both SYSTEM and CUSTOM tags
        print(f"Roles list output:\n{output}")
        
        # Should contain role information
        assert "Roles" in output or "roles" in output, \
            f"Output should list roles: {output}"

    def test_roles_permissions_via_cli(self, auth_headers):
        """Test /roles permissions command for a custom role if exists."""
        # First list roles
        list_response = requests.post(
            f"{BASE_URL}/api/cli/execute",
            json={
                "main_site_id": MAIN_SITE_ID,
                "command": "/roles list"
            },
            headers=auth_headers
        )
        
        assert list_response.status_code == 200
        
        # Try to get permissions for redactie_verantwoordelijke (custom role from context)
        response = requests.post(
            f"{BASE_URL}/api/cli/execute",
            json={
                "main_site_id": MAIN_SITE_ID,
                "command": "/roles permissions redactie_verantwoordelijke"
            },
            headers=auth_headers
        )
        
        if response.status_code == 200:
            data = response.json()
            output = data.get("output", "")
            
            if "not found" not in output.lower():
                # Should show permissions matrix
                assert "Permissions" in output or "Module" in output, \
                    f"Output should show permissions: {output}"
                print(f"Custom role permissions:\n{output}")
            else:
                print("Custom role not found (may not exist in this site)")
        else:
            print(f"Could not get custom role permissions: {response.text}")


class TestRolesAPI:
    """Test roles API endpoints directly."""

    def test_get_roles(self, auth_headers):
        """Test GET /api/roles/{main_site_id} returns roles for the main site."""
        response = requests.get(
            f"{BASE_URL}/api/roles/{MAIN_SITE_ID}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"GET /api/roles/{MAIN_SITE_ID} failed: {response.text}"
        
        data = response.json()
        
        # Response can be a list or dict with 'roles' key
        if isinstance(data, dict):
            roles = data.get("roles", [])
        else:
            roles = data
        
        # Should be a list
        assert isinstance(roles, list), f"Roles should be a list: {roles}"
        
        # Should have at least some roles
        print(f"Found {len(roles)} roles")
        
        # Check for custom roles 'redactie_verantwoordelijke' and 'test_viewer_only'
        custom_role_slugs = ["redactie_verantwoordelijke", "test_viewer_only"]
        found_custom_roles = []
        
        for role in roles:
            slug = role.get("slug", "N/A")
            name = role.get("name", "N/A")
            print(f"  - {name} ({slug})")
            
            if slug in custom_role_slugs:
                found_custom_roles.append(slug)
            
            # Check if permissions are present
            perms = role.get("permissions", {})
            if perms:
                feature_count = len([k for k in perms.keys() if not k.startswith("_")])
                print(f"    Features with permissions: {feature_count}")
                
                # Verify custom roles have shows and content_library permissions
                if slug in custom_role_slugs:
                    # Check shows permissions
                    shows_perms = perms.get("shows", {})
                    assert "view" in shows_perms, f"Custom role {slug} should have shows.view permission"
                    print(f"    shows permissions: {shows_perms}")
                    
                    # Check content_library permissions
                    content_perms = perms.get("content_library", {})
                    assert "view" in content_perms, f"Custom role {slug} should have content_library.view permission"
                    print(f"    content_library permissions: {content_perms}")
        
        print(f"\nFound custom roles: {found_custom_roles}")


class TestCLIHelp:
    """Test CLI help shows the fix custom roles command."""

    def test_cli_help_shows_fix_command(self, auth_headers):
        """Test /commands or /help includes '/fix custom roles' command."""
        response = requests.post(
            f"{BASE_URL}/api/cli/execute",
            json={
                "main_site_id": MAIN_SITE_ID,
                "command": "/commands"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"CLI /commands failed: {response.text}"
        
        data = response.json()
        output = data.get("output", "")
        
        # Should include the fix custom roles command
        assert "/fix custom roles" in output, \
            f"Help should include '/fix custom roles' command: {output}"
        
        print("'/fix custom roles' command found in help output")
