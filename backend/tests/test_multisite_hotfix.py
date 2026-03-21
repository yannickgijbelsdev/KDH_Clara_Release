"""
Multisite Hotfix Tests - Verify X-Main-Site-ID header works correctly for data isolation.

Tests the critical post-migration fixes:
1. RDS Settings load with main_site_id
2. Chat loads with main_site_id  
3. Content Library works with main_site_id
4. User switching works with main_site_id
5. Data isolation between main sites
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://network-card-styling.preview.emergentagent.com')

# Test credentials
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"

# Main site IDs (from database)
RADIOGROEP_SLUG = "radiogroep"
DBNTSTUDIO_SLUG = "dbntstudio"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for network admin."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": NETWORK_ADMIN_EMAIL, "password": NETWORK_ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def radiogroep_main_site_id(auth_token):
    """Get the main_site_id for Radiogroep MFY/GRK."""
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
    assert response.status_code == 200, f"Failed to get main sites: {response.text}"
    
    sites = response.json()
    for site in sites:
        if site.get("slug") == RADIOGROEP_SLUG:
            return site.get("id")
    
    pytest.skip(f"Radiogroep main site not found")


@pytest.fixture(scope="module")
def dbntstudio_main_site_id(auth_token):
    """Get the main_site_id for DBNT Studio."""
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
    assert response.status_code == 200, f"Failed to get main sites: {response.text}"
    
    sites = response.json()
    for site in sites:
        if site.get("slug") == DBNTSTUDIO_SLUG:
            return site.get("id")
    
    pytest.skip(f"DBNT Studio main site not found")


class TestAuthentication:
    """Test authentication with network admin credentials."""
    
    def test_login_network_admin(self):
        """Test login with network admin credentials."""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": NETWORK_ADMIN_EMAIL, "password": NETWORK_ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["is_network_admin"] == True
        print(f"✅ Network admin login successful: {data['user']['email']}")


class TestMainSitesList:
    """Test main sites list API."""
    
    def test_get_main_sites(self, auth_token):
        """Test getting list of main sites."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
        
        assert response.status_code == 200
        sites = response.json()
        assert isinstance(sites, list)
        assert len(sites) >= 2, "Expected at least 2 main sites"
        
        slugs = [site.get("slug") for site in sites]
        assert RADIOGROEP_SLUG in slugs, "Radiogroep not found in main sites"
        print(f"✅ Found {len(sites)} main sites: {slugs}")


class TestRDSSettings:
    """Test RDS settings with X-Main-Site-ID header."""
    
    def test_rds_settings_load(self, auth_token, radiogroep_main_site_id):
        """Test RDS settings load for Radiogroep."""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": radiogroep_main_site_id
        }
        response = requests.get(f"{BASE_URL}/api/rds/settings", headers=headers)
        
        # RDS settings should load without error
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"✅ RDS settings endpoint responded with status {response.status_code}")


class TestChatFunctionality:
    """Test chat with X-Main-Site-ID header."""
    
    def test_chat_threads_load(self, auth_token, radiogroep_main_site_id):
        """Test chat threads load for Radiogroep."""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": radiogroep_main_site_id
        }
        response = requests.get(f"{BASE_URL}/api/chat/threads", headers=headers)
        
        assert response.status_code == 200, f"Chat threads failed: {response.text}"
        threads = response.json()
        assert isinstance(threads, list)
        print(f"✅ Chat threads loaded: {len(threads)} threads found")
    
    def test_chat_team_members_load(self, auth_token, radiogroep_main_site_id):
        """Test chat team members load for Radiogroep."""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": radiogroep_main_site_id
        }
        response = requests.get(f"{BASE_URL}/api/chat/members", headers=headers)
        
        assert response.status_code == 200, f"Chat members failed: {response.text}"
        members = response.json()
        assert isinstance(members, list)
        assert len(members) > 0, "Expected at least 1 team member"
        print(f"✅ Chat members loaded: {len(members)} members found")


class TestContentLibrary:
    """Test content library with X-Main-Site-ID header."""
    
    def test_content_list_radiogroep(self, auth_token, radiogroep_main_site_id):
        """Test content list loads for Radiogroep."""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": radiogroep_main_site_id
        }
        response = requests.get(f"{BASE_URL}/api/content", headers=headers)
        
        assert response.status_code == 200, f"Content list failed: {response.text}"
        content = response.json()
        assert isinstance(content, list)
        print(f"✅ Radiogroep content loaded: {len(content)} items")
        
        # Radiogroep should have content (based on UI test showing 132 items)
        assert len(content) > 100, f"Expected 100+ content items, got {len(content)}"
    
    def test_content_list_dbntstudio(self, auth_token, dbntstudio_main_site_id):
        """Test content list loads for DBNT Studio (should be empty or different)."""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": dbntstudio_main_site_id
        }
        response = requests.get(f"{BASE_URL}/api/content", headers=headers)
        
        assert response.status_code == 200, f"Content list failed: {response.text}"
        content = response.json()
        assert isinstance(content, list)
        print(f"✅ DBNT Studio content loaded: {len(content)} items")
        
        # DBNT Studio should have less content (data isolation)
        assert len(content) < 10, f"Expected less than 10 items for isolated DBNT Studio, got {len(content)}"


class TestSiteSettings:
    """Test site settings (team) with X-Main-Site-ID header."""
    
    def test_users_list_radiogroep(self, auth_token, radiogroep_main_site_id):
        """Test users list loads for Radiogroep."""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": radiogroep_main_site_id
        }
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        
        assert response.status_code == 200, f"Users list failed: {response.text}"
        users = response.json()
        assert isinstance(users, list)
        print(f"✅ Radiogroep users loaded: {len(users)} users")
        
        # Radiogroep should have 8 users (based on UI test)
        assert len(users) >= 8, f"Expected 8+ users, got {len(users)}"


class TestUserSwitching:
    """Test user switching with main_site_id context."""
    
    def test_switch_to_user(self, auth_token, radiogroep_main_site_id):
        """Test switching to another user within main site context."""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": radiogroep_main_site_id
        }
        
        # First get users in this main site
        users_response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        assert users_response.status_code == 200
        users = users_response.json()
        
        # Find a non-admin user to switch to
        target_user = None
        for user in users:
            if user.get("role") != "admin" and not user.get("is_network_admin"):
                target_user = user
                break
        
        if not target_user:
            pytest.skip("No non-admin user found to switch to")
        
        # Switch to user
        switch_response = requests.post(
            f"{BASE_URL}/api/admin/switch-user/{target_user['id']}",
            headers=headers
        )
        
        assert switch_response.status_code == 200, f"User switch failed: {switch_response.text}"
        data = switch_response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["id"] == target_user["id"]
        print(f"✅ Successfully switched to user: {data['user']['name']}")


class TestDataIsolation:
    """Test data isolation between main sites."""
    
    def test_shows_isolation(self, auth_token, radiogroep_main_site_id, dbntstudio_main_site_id):
        """Test shows are isolated between main sites."""
        # Get shows for Radiogroep
        headers_radiogroep = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": radiogroep_main_site_id
        }
        response_radiogroep = requests.get(f"{BASE_URL}/api/shows", headers=headers_radiogroep)
        assert response_radiogroep.status_code == 200
        radiogroep_shows = response_radiogroep.json()
        
        # Get shows for DBNT Studio
        headers_dbnt = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": dbntstudio_main_site_id
        }
        response_dbnt = requests.get(f"{BASE_URL}/api/shows", headers=headers_dbnt)
        assert response_dbnt.status_code == 200
        dbnt_shows = response_dbnt.json()
        
        print(f"✅ Radiogroep shows: {len(radiogroep_shows)}, DBNT Studio shows: {len(dbnt_shows)}")
        
        # Radiogroep should have more shows
        assert len(radiogroep_shows) > len(dbnt_shows), "Data isolation may not be working"
    
    def test_content_isolation(self, auth_token, radiogroep_main_site_id, dbntstudio_main_site_id):
        """Test content is isolated between main sites."""
        # Get content for Radiogroep
        headers_radiogroep = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": radiogroep_main_site_id
        }
        response_radiogroep = requests.get(f"{BASE_URL}/api/content", headers=headers_radiogroep)
        assert response_radiogroep.status_code == 200
        radiogroep_content = response_radiogroep.json()
        
        # Get content for DBNT Studio
        headers_dbnt = {
            "Authorization": f"Bearer {auth_token}",
            "X-Main-Site-ID": dbntstudio_main_site_id
        }
        response_dbnt = requests.get(f"{BASE_URL}/api/content", headers=headers_dbnt)
        assert response_dbnt.status_code == 200
        dbnt_content = response_dbnt.json()
        
        print(f"✅ Radiogroep content: {len(radiogroep_content)}, DBNT Studio content: {len(dbnt_content)}")
        
        # Verify isolation - Radiogroep has significantly more content
        assert len(radiogroep_content) > 100, f"Radiogroep should have 100+ content items"
        assert len(dbnt_content) < 10, f"DBNT Studio should have <10 content items"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
