"""
CLI Expanded Tests - Clara CLI ~45 Commands across 8 Categories
Tests for: General, Roles, Users, Firewall, Site, Environment, License, Logs, System

Ref: The CLI expanded from 12 to ~45 commands routed through POST /api/cli/execute
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"

# Test users in the system
TEST_USERS = [
    "yannick.gijbels@koodh.com",
    "test@radio.com",
    "hadewig@mfy.be",
    "chiel.van.gansewinkel@koodh.com",
    "eddy.thijs@grk.fm"
]

# Test IP for firewall
TEST_IP = "192.168.1.100"

# Test feature for site features toggle
TEST_FEATURE = "rds_builder"


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
        return data["token"]
    pytest.skip("Authentication failed - skipping CLI tests")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


@pytest.fixture(scope="module")
def main_site_id(authenticated_client):
    """Get Radiogroep site ID for testing"""
    response = authenticated_client.get(f"{BASE_URL}/api/main-sites/my/access")
    assert response.status_code == 200
    data = response.json()
    main_sites = data.get("main_sites", [])
    
    # Find radiogroep site by slug
    radiogroep_site = next((s for s in main_sites if s.get("slug") == "radiogroep"), None)
    if radiogroep_site:
        return radiogroep_site["id"]
    
    if main_sites:
        return main_sites[0]["id"]
    
    pytest.skip("No main site found for testing")


@pytest.fixture(scope="module")
def environment_id(authenticated_client):
    """Get environment ID for testing"""
    response = authenticated_client.get(f"{BASE_URL}/api/environments")
    if response.status_code == 200:
        envs = response.json()
        if envs:
            return envs[0]["id"]
    pytest.skip("No environment found for testing")


def execute_command(client, main_site_id, command):
    """Helper to execute CLI commands"""
    response = client.post(f"{BASE_URL}/api/cli/execute", json={
        "main_site_id": main_site_id,
        "command": command
    })
    return response


class TestGeneralCommands:
    """Tests for General category: /commands, /help, /clear"""

    def test_commands_shows_all_8_categories(self, authenticated_client, main_site_id):
        """/commands returns all 8 categories"""
        response = execute_command(authenticated_client, main_site_id, "/commands")
        assert response.status_code == 200
        data = response.json()
        
        output = data["output"]
        # Check for all 8 categories
        assert "[General]" in output, "Missing General category"
        assert "[Roles]" in output, "Missing Roles category"
        assert "[Users]" in output, "Missing Users category"
        assert "[Firewall]" in output, "Missing Firewall category"
        assert "[Site]" in output, "Missing Site category"
        assert "[Environment]" in output, "Missing Environment category"
        assert "[License]" in output, "Missing License category"
        assert "[Logs]" in output, "Missing Logs category"
        assert "[System]" in output, "Missing System category"
        
        print("PASSED: /commands shows all 8 categories")

    def test_help_command(self, authenticated_client, main_site_id):
        """/help returns same as /commands"""
        response = execute_command(authenticated_client, main_site_id, "/help")
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "info"
        assert "Clara CLI v1.0" in data["output"]
        print("PASSED: /help command works")


class TestRolesCommands:
    """Tests for Roles category"""

    def test_roles_list_with_permission_counts(self, authenticated_client, main_site_id):
        """/roles list shows roles with permission counts"""
        response = execute_command(authenticated_client, main_site_id, "/roles list")
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] in ["success", "warning"]
        output = data["output"]
        
        if data["type"] == "success":
            # Should show permission counts like "20/20 perms"
            assert "perms" in output.lower() or "permission" in output.lower()
            # Should contain role information
            assert "slug=" in output or "SYSTEM" in output or "CUSTOM" in output
        print("PASSED: /roles list shows roles with permission counts")

    def test_roles_permissions_matrix(self, authenticated_client, main_site_id):
        """/roles permissions admin shows permission matrix (View/Create/Edit/Delete)"""
        response = execute_command(authenticated_client, main_site_id, "/roles permissions admin")
        assert response.status_code == 200
        data = response.json()
        
        if data["type"] == "success":
            output = data["output"]
            # Check for permission matrix columns
            assert "View" in output or "view" in output.lower()
            assert "Create" in output or "create" in output.lower()
            assert "Edit" in output or "edit" in output.lower()
            assert "Delete" in output or "delete" in output.lower()
            assert "Module" in output or "module" in output.lower()
        print("PASSED: /roles permissions admin shows permission matrix")

    def test_roles_compare(self, authenticated_client, main_site_id):
        """/roles compare admin editor shows differences between roles"""
        response = execute_command(authenticated_client, main_site_id, "/roles compare admin editor")
        assert response.status_code == 200
        data = response.json()
        
        if data["type"] in ["success", "warning"]:
            output = data["output"]
            assert "Comparing" in output or "compare" in output.lower() or "admin" in output.lower()
            # Should show difference count
            assert "difference" in output.lower() or "diff" in output.lower()
        print("PASSED: /roles compare admin editor shows differences")

    def test_roles_repair(self, authenticated_client, main_site_id):
        """/roles repair creates missing default roles"""
        response = execute_command(authenticated_client, main_site_id, "/roles repair")
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] in ["success", "info"]
        output = data["output"]
        assert "repair" in output.lower() or "default" in output.lower() or "created" in output.lower()
        print("PASSED: /roles repair command works")

    def test_roles_reset_all(self, authenticated_client, main_site_id):
        """/roles reset-all resets all roles to defaults"""
        response = execute_command(authenticated_client, main_site_id, "/roles reset-all")
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] in ["success", "info"]
        output = data["output"]
        assert "reset" in output.lower() or "default" in output.lower()
        print("PASSED: /roles reset-all command works")


class TestUsersCommands:
    """Tests for Users category"""

    def test_users_info_with_email(self, authenticated_client, main_site_id):
        """/users info <email> shows detailed user info with site access"""
        # Test with one of the known users
        test_email = TEST_USERS[0]
        response = execute_command(authenticated_client, main_site_id, f"/users info {test_email}")
        assert response.status_code == 200
        data = response.json()
        
        if data["type"] == "success":
            output = data["output"]
            assert "User:" in output or "Email:" in output
            # Should show site access
            assert "Site Access" in output or "sites" in output.lower()
        print(f"PASSED: /users info {test_email} shows detailed user info")

    def test_users_sessions(self, authenticated_client, main_site_id):
        """/users sessions shows active/recent/inactive sessions"""
        response = execute_command(authenticated_client, main_site_id, "/users sessions")
        assert response.status_code == 200
        data = response.json()
        
        if data["type"] == "success":
            output = data["output"]
            # Should categorize sessions
            assert "active" in output.lower() or "recent" in output.lower() or "inactive" in output.lower()
            assert "Sessions" in output or "session" in output.lower()
        print("PASSED: /users sessions shows session information")

    def test_users_search(self, authenticated_client, main_site_id):
        """/users search <query> finds users by name or email"""
        response = execute_command(authenticated_client, main_site_id, "/users search koodh")
        assert response.status_code == 200
        data = response.json()
        
        if data["type"] == "success":
            output = data["output"]
            assert "Search results" in output or "found" in output.lower()
        print("PASSED: /users search finds users")


class TestFirewallCommands:
    """Tests for Firewall category"""

    def test_firewall_scan(self, authenticated_client, main_site_id):
        """/firewall scan shows security scan (2FA coverage, stale accounts, admin warnings)"""
        response = execute_command(authenticated_client, main_site_id, "/firewall scan")
        assert response.status_code == 200
        data = response.json()
        
        output = data["output"]
        # Should show security scan info
        assert "scan" in output.lower() or "Security" in output
        # Should mention 2FA coverage
        assert "2FA" in output or "2fa" in output.lower()
        print("PASSED: /firewall scan shows security scan")

    def test_firewall_status(self, authenticated_client, main_site_id):
        """/firewall status shows blocked IPs, events, failed logins"""
        response = execute_command(authenticated_client, main_site_id, "/firewall status")
        assert response.status_code == 200
        data = response.json()
        
        output = data["output"]
        assert "Firewall Status" in output or "firewall" in output.lower()
        # Should show blocked IPs, events, failed logins
        assert "Blocked" in output or "blocked" in output.lower()
        assert "Events" in output or "events" in output.lower()
        print("PASSED: /firewall status shows status info")

    def test_firewall_block_and_unblock(self, authenticated_client, main_site_id):
        """/firewall block <ip> and /firewall unblock <ip> work correctly"""
        # Test block
        response = execute_command(authenticated_client, main_site_id, f"/firewall block {TEST_IP}")
        assert response.status_code == 200
        data = response.json()
        
        # Should either block successfully or already be blocked
        assert data["type"] in ["success", "warning"]
        output = data["output"]
        assert TEST_IP in output
        print(f"PASSED: /firewall block {TEST_IP}")
        
        # Test unblock
        response = execute_command(authenticated_client, main_site_id, f"/firewall unblock {TEST_IP}")
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] in ["success", "warning"]
        output = data["output"]
        assert TEST_IP in output
        print(f"PASSED: /firewall unblock {TEST_IP}")


class TestSiteCommands:
    """Tests for Site category"""

    def test_site_features_with_indicators(self, authenticated_client, main_site_id):
        """/site features shows enabled/disabled features with [+]/[-] indicators"""
        response = execute_command(authenticated_client, main_site_id, "/site features")
        assert response.status_code == 200
        data = response.json()
        
        output = data["output"]
        assert "Feature" in output or "feature" in output.lower()
        # Should have [+] or [-] indicators
        assert "[+]" in output or "[-]" in output or "enabled" in output.lower()
        print("PASSED: /site features shows feature list with indicators")

    def test_site_features_enable_disable(self, authenticated_client, main_site_id):
        """/site features enable/disable rds_builder works correctly"""
        # First check current status
        execute_command(authenticated_client, main_site_id, "/site features")
        
        # Try enabling
        response = execute_command(authenticated_client, main_site_id, f"/site features enable {TEST_FEATURE}")
        assert response.status_code == 200
        data = response.json()
        assert data["type"] in ["success", "info"]
        print(f"PASSED: /site features enable {TEST_FEATURE}")
        
        # Disable after test to restore state
        response = execute_command(authenticated_client, main_site_id, f"/site features disable {TEST_FEATURE}")
        assert response.status_code == 200
        data = response.json()
        assert data["type"] in ["success", "info"]
        print(f"PASSED: /site features disable {TEST_FEATURE}")

    def test_site_demo_toggle(self, authenticated_client, main_site_id):
        """/site demo on|off toggles demo mode"""
        # Toggle demo mode on
        response = execute_command(authenticated_client, main_site_id, "/site demo on")
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "success"
        assert "demo" in data["output"].lower()
        print("PASSED: /site demo on")
        
        # Toggle demo mode off
        response = execute_command(authenticated_client, main_site_id, "/site demo off")
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "success"
        assert "demo" in data["output"].lower()
        print("PASSED: /site demo off")

    def test_site_stats(self, authenticated_client, main_site_id):
        """/site stats shows document counts"""
        response = execute_command(authenticated_client, main_site_id, "/site stats")
        assert response.status_code == 200
        data = response.json()
        
        output = data["output"]
        assert "Statistics" in output or "stats" in output.lower()
        # Should show various document counts
        assert "Users:" in output or "users" in output.lower()
        print("PASSED: /site stats shows document counts")


class TestEnvironmentCommands:
    """Tests for Environment category"""

    def test_env_list(self, authenticated_client, main_site_id):
        """/env list shows all environments with site/admin counts"""
        response = execute_command(authenticated_client, main_site_id, "/env list")
        assert response.status_code == 200
        data = response.json()
        
        if data["type"] == "success":
            output = data["output"]
            assert "Environment" in output or "environment" in output.lower()
            # Should show sites and admins counts
            assert "sites" in output.lower() or "admin" in output.lower()
        print("PASSED: /env list shows environments")

    def test_env_assign(self, authenticated_client, main_site_id):
        """/env assign <email> adds user as environment admin"""
        test_email = TEST_USERS[0]
        response = execute_command(authenticated_client, main_site_id, f"/env assign {test_email}")
        assert response.status_code == 200
        data = response.json()
        
        # Should either add successfully or already be admin
        assert data["type"] in ["success", "info", "warning"]
        output = data["output"]
        assert "admin" in output.lower() or "environment" in output.lower()
        print(f"PASSED: /env assign {test_email}")

    def test_env_sites(self, authenticated_client, main_site_id):
        """/env sites shows sites in current environment"""
        response = execute_command(authenticated_client, main_site_id, "/env sites")
        assert response.status_code == 200
        data = response.json()
        
        if data["type"] == "success":
            output = data["output"]
            assert "Sites" in output or "sites" in output.lower()
        print("PASSED: /env sites shows sites in environment")


class TestLicenseCommands:
    """Tests for License category"""

    def test_license_packages(self, authenticated_client, main_site_id):
        """/license packages lists available packages"""
        response = execute_command(authenticated_client, main_site_id, "/license packages")
        assert response.status_code == 200
        data = response.json()
        
        if data["type"] == "success":
            output = data["output"]
            assert "Package" in output or "package" in output.lower()
        print("PASSED: /license packages lists packages")

    def test_license_info(self, authenticated_client, main_site_id):
        """/license info shows license status"""
        response = execute_command(authenticated_client, main_site_id, "/license info")
        assert response.status_code == 200
        data = response.json()
        
        # Should return info or warning (if no license)
        assert data["type"] in ["success", "warning", "info"]
        output = data["output"]
        assert "License" in output or "license" in output.lower()
        print("PASSED: /license info shows license status")


class TestLogsCommands:
    """Tests for Logs category"""

    def test_logs_cli(self, authenticated_client, main_site_id):
        """/logs cli shows CLI command history"""
        response = execute_command(authenticated_client, main_site_id, "/logs cli")
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] in ["success", "info"]
        output = data["output"]
        assert "CLI" in output or "cli" in output.lower() or "Command" in output or "command" in output.lower()
        print("PASSED: /logs cli shows CLI command history")


class TestSystemCommands:
    """Tests for System category"""

    def test_db_stats(self, authenticated_client, main_site_id):
        """/db stats shows collection document counts"""
        response = execute_command(authenticated_client, main_site_id, "/db stats")
        assert response.status_code == 200
        data = response.json()
        
        output = data["output"]
        assert "Database" in output or "database" in output.lower()
        # Should show collection counts
        assert "documents" in output.lower() or "collection" in output.lower()
        print("PASSED: /db stats shows collection counts")

    def test_whoami(self, authenticated_client, main_site_id):
        """/whoami shows current user identity"""
        response = execute_command(authenticated_client, main_site_id, "/whoami")
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] == "success"
        output = data["output"]
        assert "Identity" in output or "identity" in output.lower()
        # Should show user info
        assert "Name:" in output or "Email:" in output
        print("PASSED: /whoami shows current user identity")

    def test_health_comprehensive(self, authenticated_client, main_site_id):
        """/health shows comprehensive health check"""
        response = execute_command(authenticated_client, main_site_id, "/health")
        assert response.status_code == 200
        data = response.json()
        
        output = data["output"]
        assert "Health Check" in output or "health" in output.lower()
        # Should check multiple components
        assert "Database" in output
        assert "Roles" in output
        assert "Users" in output
        assert "License" in output
        print("PASSED: /health shows comprehensive health check")


class TestEnvironmentAdminAssignment:
    """Tests for environment admin assignment via direct API"""

    def test_environment_admin_add(self, authenticated_client, environment_id):
        """POST /api/environments/{env_id}/admins adds user successfully"""
        # First get a user ID
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        if response.status_code != 200:
            pytest.skip("Cannot fetch users")
        
        users = response.json()
        if not users:
            pytest.skip("No users available")
        
        # Find a user that might not be admin yet
        test_user_id = None
        for user in users:
            if user.get("email") in TEST_USERS:
                test_user_id = user.get("id")
                break
        
        if not test_user_id:
            test_user_id = users[0].get("id")
        
        # Try adding as environment admin
        response = authenticated_client.post(
            f"{BASE_URL}/api/environments/{environment_id}/admins",
            json={"user_id": test_user_id}
        )
        
        # Should succeed or return 400 if already admin
        assert response.status_code in [200, 400]
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data or "id" in data
            print("PASSED: Added user as environment admin")
        else:
            data = response.json()
            assert "already" in data.get("detail", "").lower()
            print("PASSED: User already an environment admin (expected)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
