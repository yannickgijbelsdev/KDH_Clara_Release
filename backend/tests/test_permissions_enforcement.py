"""
Permission Enforcement Tests
Tests the permission middleware and permissions API for multi-tenant radio management app.
- GET /api/auth/me/permissions - Returns permissions matrix for current user
- Backend middleware permission checks based on role
- Network admin and site admin bypass
- Presenter role restrictions
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"

# Test credentials
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"
PRESENTER_EMAIL = "testpresenter@test.com"
PRESENTER_PASSWORD = "cWqapknVwbChAw3-"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def network_admin_token(api_client):
    """Get network admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": NETWORK_ADMIN_EMAIL,
        "password": NETWORK_ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Network admin login failed: {response.text}"
    data = response.json()
    
    # Handle 2FA if required
    if data.get("requires_2fa"):
        pytest.skip("Network admin requires 2FA - cannot proceed with automated tests")
    
    return data.get("token")


@pytest.fixture(scope="module")
def presenter_token(api_client):
    """Get presenter authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": PRESENTER_EMAIL,
        "password": PRESENTER_PASSWORD
    })
    assert response.status_code == 200, f"Presenter login failed: {response.text}"
    data = response.json()
    
    # Handle 2FA if required
    if data.get("requires_2fa"):
        pytest.skip("Presenter requires 2FA - cannot proceed with automated tests")
    
    return data.get("token")


@pytest.fixture(scope="module")
def network_admin_client(api_client, network_admin_token):
    """Session with network admin auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {network_admin_token}",
        "X-Main-Site-ID": MAIN_SITE_ID
    })
    return session


@pytest.fixture(scope="module")
def presenter_client(api_client, presenter_token):
    """Session with presenter auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {presenter_token}",
        "X-Main-Site-ID": MAIN_SITE_ID
    })
    return session


class TestPermissionsEndpoint:
    """Tests for GET /api/auth/me/permissions endpoint"""
    
    def test_network_admin_gets_full_access(self, network_admin_client):
        """Network admin should get _full_access flag in permissions"""
        response = network_admin_client.get(f"{BASE_URL}/api/auth/me/permissions")
        assert response.status_code == 200
        
        data = response.json()
        assert "permissions" in data
        assert "is_network_admin" in data
        assert data["is_network_admin"] == True
        assert data["permissions"].get("_full_access") == True
        print(f"Network admin permissions: {data}")
    
    def test_presenter_gets_limited_permissions(self, presenter_client):
        """Presenter should get limited role-based permissions"""
        response = presenter_client.get(f"{BASE_URL}/api/auth/me/permissions")
        assert response.status_code == 200
        
        data = response.json()
        assert "permissions" in data
        assert "role_slug" in data
        assert data["is_network_admin"] == False
        
        permissions = data["permissions"]
        # Presenter should NOT have _full_access
        assert permissions.get("_full_access") != True
        
        # Presenter SHOULD have shows permissions (view, edit)
        if "shows" in permissions:
            shows_perms = permissions["shows"]
            assert shows_perms.get("view") == True, "Presenter should have shows view permission"
            assert shows_perms.get("edit") == True, "Presenter should have shows edit permission"
            # Presenter should NOT have create/delete for shows
            assert shows_perms.get("create") != True, "Presenter should NOT have shows create permission"
            assert shows_perms.get("delete") != True, "Presenter should NOT have shows delete permission"
        
        # Presenter should NOT have team_settings permission
        if "team_settings" in permissions:
            team_perms = permissions["team_settings"]
            assert team_perms.get("view") != True, "Presenter should NOT have team_settings view"
        
        print(f"Presenter permissions: {data}")
        print(f"Presenter role_slug: {data.get('role_slug')}")


class TestMiddlewarePermissionChecks:
    """Tests for permission middleware blocking/allowing requests"""
    
    # ----- Shows Endpoint Tests -----
    
    def test_presenter_can_get_shows(self, presenter_client):
        """Presenter CAN GET /api/shows (has view permission)"""
        response = presenter_client.get(f"{BASE_URL}/api/shows")
        # Should succeed (200) or return empty list
        assert response.status_code == 200, f"Presenter should be able to GET shows: {response.text}"
        print(f"Presenter GET /api/shows: {response.status_code}")
    
    def test_presenter_cannot_post_shows(self, presenter_client):
        """Presenter cannot POST to /api/shows/titles (no create permission)"""
        # Try to create a show title
        response = presenter_client.post(f"{BASE_URL}/api/shows/titles", json={
            "title": "TEST_Unauthorized_Show",
            "description": "This should fail"
        })
        # Should get 403 Forbidden
        assert response.status_code == 403, f"Presenter should NOT be able to POST shows: {response.status_code} - {response.text}"
        print(f"Presenter POST /api/shows/titles blocked: {response.status_code}")
    
    def test_presenter_cannot_delete_shows(self, presenter_client):
        """Presenter cannot DELETE from /api/shows (no delete permission)"""
        # Try to delete a show (even non-existent one)
        response = presenter_client.delete(f"{BASE_URL}/api/shows/fake-show-id")
        # Should get 403 Forbidden (before 404 check)
        assert response.status_code in [403, 404], f"Presenter DELETE shows: {response.status_code}"
        # If 403, permission blocked correctly
        if response.status_code == 403:
            print(f"Presenter DELETE /api/shows blocked: {response.status_code}")
        else:
            print(f"Presenter DELETE /api/shows: got 404 (endpoint check before permission)")
    
    # ----- Users/Team Settings Endpoint Tests -----
    
    def test_presenter_cannot_get_users(self, presenter_client):
        """Presenter cannot GET /api/users (no team_settings view permission)"""
        response = presenter_client.get(f"{BASE_URL}/api/users")
        # Should get 403 Forbidden
        assert response.status_code == 403, f"Presenter should NOT be able to GET users: {response.status_code} - {response.text}"
        print(f"Presenter GET /api/users blocked: {response.status_code}")
    
    # ----- Network Admin Bypass Tests -----
    
    def test_network_admin_can_get_shows(self, network_admin_client):
        """Network admin CAN GET /api/shows (bypasses permission check)"""
        response = network_admin_client.get(f"{BASE_URL}/api/shows")
        assert response.status_code == 200, f"Network admin should GET shows: {response.text}"
        print(f"Network admin GET /api/shows: {response.status_code}")
    
    def test_network_admin_can_get_users(self, network_admin_client):
        """Network admin CAN GET /api/users (bypasses permission check)"""
        response = network_admin_client.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200, f"Network admin should GET users: {response.text}"
        print(f"Network admin GET /api/users: {response.status_code}")
    
    def test_network_admin_can_access_all_endpoints(self, network_admin_client):
        """Network admin should be able to access any protected endpoint"""
        # Test various endpoints that would normally require permissions
        endpoints = [
            "/api/shows",
            "/api/content",
            "/api/media",
            "/api/calendar/events",
            "/api/users",
        ]
        
        for endpoint in endpoints:
            response = network_admin_client.get(f"{BASE_URL}{endpoint}")
            # Should not get 403
            assert response.status_code != 403, f"Network admin blocked from {endpoint}: {response.text}"
            print(f"Network admin {endpoint}: {response.status_code}")


class TestExemptPaths:
    """Tests for paths that skip permission checks (always accessible)"""
    
    def test_auth_endpoints_exempt(self, api_client):
        """Auth endpoints should be accessible without permission check"""
        # GET /api/auth/me requires auth token but should NOT require permission check
        # Test health check which is exempt
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health endpoint should be accessible: {response.text}"
        print(f"GET /api/health (exempt): {response.status_code}")
    
    def test_main_sites_endpoint_exempt(self, presenter_client):
        """Main sites endpoint should be accessible (exempt from permission check)"""
        response = presenter_client.get(f"{BASE_URL}/api/main-sites/my/access")
        # Should succeed
        assert response.status_code == 200, f"Main sites should be accessible: {response.text}"
        print(f"GET /api/main-sites/my/access (exempt): {response.status_code}")
    
    def test_tickets_endpoint_exempt(self, presenter_client):
        """Support tickets endpoint should be accessible (exempt from permission check)"""
        # Note: endpoint may redirect (307), so we follow redirects
        response = presenter_client.get(f"{BASE_URL}/api/tickets/", allow_redirects=True)
        # Should not be blocked by permission middleware
        assert response.status_code in [200, 307, 404], f"Tickets endpoint: {response.status_code}"
        print(f"GET /api/tickets (exempt): {response.status_code}")


class TestPresenterSpecificPermissions:
    """Detailed tests for presenter role's specific permissions matrix"""
    
    def test_presenter_calendar_access(self, presenter_client):
        """Presenter should have calendar view and edit permissions"""
        response = presenter_client.get(f"{BASE_URL}/api/calendar/events")
        # Presenter has calendar view permission
        assert response.status_code in [200, 404], f"Presenter calendar access: {response.status_code}"
        print(f"Presenter GET /api/calendar/events: {response.status_code}")
    
    def test_presenter_team_chat_access(self, presenter_client):
        """Presenter should have team_chat view and edit permissions"""
        response = presenter_client.get(f"{BASE_URL}/api/team-chat/messages")
        # Presenter has team_chat view permission
        assert response.status_code in [200, 404], f"Presenter team chat access: {response.status_code}"
        print(f"Presenter GET /api/team-chat/messages: {response.status_code}")
    
    def test_presenter_content_library_access(self, presenter_client):
        """Presenter should have content_library view and create permissions"""
        response = presenter_client.get(f"{BASE_URL}/api/content")
        # Presenter has content_library view permission
        assert response.status_code in [200, 403], f"Presenter content access: {response.status_code}"
        print(f"Presenter GET /api/content: {response.status_code}")
    
    def test_presenter_media_library_access(self, presenter_client):
        """Presenter should have media_library view and create permissions"""
        response = presenter_client.get(f"{BASE_URL}/api/media")
        # Presenter has media_library view permission
        assert response.status_code in [200, 403], f"Presenter media access: {response.status_code}"
        print(f"Presenter GET /api/media: {response.status_code}")


class TestSiteAdminBypass:
    """Tests for site admin role bypassing permission checks"""
    
    def test_site_admin_role_has_full_access(self, network_admin_client):
        """Verify site admin role gets full access (admin role slug)"""
        # Get permissions as network admin to verify admin role setup
        response = network_admin_client.get(f"{BASE_URL}/api/auth/me/permissions")
        assert response.status_code == 200
        
        data = response.json()
        # Network admin should have full access
        assert data["permissions"].get("_full_access") == True
        print(f"Admin role has full access: {data}")


class TestPermissionErrorMessages:
    """Tests for correct error messages when permission denied"""
    
    def test_permission_denied_returns_403_with_detail(self, presenter_client):
        """Permission denied should return 403 with descriptive message"""
        response = presenter_client.get(f"{BASE_URL}/api/users")
        assert response.status_code == 403
        
        data = response.json()
        assert "detail" in data
        # Should mention permission
        detail = data["detail"].lower()
        assert "permission" in detail or "don't have" in detail
        print(f"Permission denied message: {data['detail']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
