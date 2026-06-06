"""
Test Permission Alias Fix: Calendar and Shows permissions are interchangeable.
Bug: Users with 'Redactie Verantwoordelijke' role had Calendar permissions (View, Create, Edit, Delete) 
     but could not edit or delete shows from the calendar.
Fix: Added FEATURE_ALIASES so 'shows' and 'calendar' permissions are interchangeable.
     Legacy auth dependencies now check request.state.permission_approved flag.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"  # radiogroep

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"

# Redactie Verantwoordelijke - has Calendar permissions (view, create, edit, delete)
PRESENTER_EMAIL = "testpresenter@test.com"
PRESENTER_PASSWORD = "TestPassword123!"

# Test Viewer - has ONLY view permissions
VIEWER_EMAIL = "testviewer@test.com"
VIEWER_PASSWORD = "ViewerPass123!"

FAKE_SHOW_ID = "fake-show-id-for-testing"


def get_auth_token(email: str, password: str) -> str:
    """Login and return JWT token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": email,
        "password": password
    })
    if response.status_code == 200:
        return response.json().get("token")
    return None


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token."""
    token = get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert token is not None, "Admin login failed"
    return token


@pytest.fixture(scope="module")
def presenter_token():
    """Get presenter (redactie_verantwoordelijke) token."""
    token = get_auth_token(PRESENTER_EMAIL, PRESENTER_PASSWORD)
    assert token is not None, f"Presenter login failed for {PRESENTER_EMAIL}"
    return token


@pytest.fixture(scope="module")
def viewer_token():
    """Get viewer (view-only) token."""
    token = get_auth_token(VIEWER_EMAIL, VIEWER_PASSWORD)
    assert token is not None, f"Viewer login failed for {VIEWER_EMAIL}"
    return token


def get_headers(token: str) -> dict:
    """Build headers with auth and main site context."""
    return {
        "Authorization": f"Bearer {token}",
        "X-Main-Site-ID": MAIN_SITE_ID,
        "Content-Type": "application/json"
    }


class TestRedactieVerantwoordelijkeShowsAccess:
    """Test that 'redactie_verantwoordelijke' role with Calendar permissions can access shows endpoints."""
    
    def test_presenter_can_get_shows(self, presenter_token):
        """Redactie Verantwoordelijke with Calendar permissions can GET /api/shows (HTTP 200)."""
        response = requests.get(
            f"{BASE_URL}/api/shows",
            headers=get_headers(presenter_token)
        )
        # Should be 200 (access allowed via calendar permission alias)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"PASS: Presenter GET /api/shows returned {response.status_code}")
    
    def test_presenter_can_post_shows(self, presenter_token):
        """Redactie Verantwoordelijke with Calendar create permission can POST /api/shows."""
        response = requests.post(
            f"{BASE_URL}/api/shows",
            headers=get_headers(presenter_token),
            json={
                "title": "Test Show from Presenter",
                "start_time": "2025-01-15T10:00:00Z",
                "end_time": "2025-01-15T11:00:00Z"
            }
        )
        # Should NOT be 403 - permission should pass due to calendar alias
        # May get 422/400 for missing fields, but NOT 403
        assert response.status_code != 403, f"Got 403 Forbidden when should have permission: {response.text}"
        print(f"PASS: Presenter POST /api/shows returned {response.status_code} (not 403)")
    
    def test_presenter_can_put_show_not_blocked_by_require_admin(self, presenter_token):
        """PUT /api/shows/{id} should return 404 (show not found) not 403 (permission denied)."""
        response = requests.put(
            f"{BASE_URL}/api/shows/{FAKE_SHOW_ID}",
            headers=get_headers(presenter_token),
            json={"title": "Updated Title"}
        )
        # Key assertion: should be 404 (permission passed, show not found)
        # NOT 403 (which would mean require_admin blocked it)
        assert response.status_code == 404, f"Expected 404 (show not found), got {response.status_code}: {response.text}"
        print(f"PASS: Presenter PUT /api/shows/{FAKE_SHOW_ID} returned 404 (permission passed, show not found)")
    
    def test_presenter_can_delete_show_not_blocked_by_require_admin(self, presenter_token):
        """DELETE /api/shows/{id} should return 404 (show not found) not 403 (permission denied)."""
        response = requests.delete(
            f"{BASE_URL}/api/shows/{FAKE_SHOW_ID}",
            headers=get_headers(presenter_token)
        )
        # Key assertion: should be 404 (permission passed, show not found)
        # NOT 403 (which would mean require_admin blocked it)
        assert response.status_code == 404, f"Expected 404 (show not found), got {response.status_code}: {response.text}"
        print(f"PASS: Presenter DELETE /api/shows/{FAKE_SHOW_ID} returned 404 (permission passed, show not found)")


class TestViewerOnlyIsBlocked:
    """Test that 'test_viewer_only' role with view-only permissions is BLOCKED from edit/delete."""
    
    def test_viewer_can_get_shows(self, viewer_token):
        """Viewer with view permission can GET /api/shows."""
        response = requests.get(
            f"{BASE_URL}/api/shows",
            headers=get_headers(viewer_token)
        )
        # Should be 200 (view is allowed)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"PASS: Viewer GET /api/shows returned {response.status_code}")
    
    def test_viewer_blocked_from_put_show(self, viewer_token):
        """Viewer without edit permission is BLOCKED from PUT /api/shows/{id} (HTTP 403)."""
        response = requests.put(
            f"{BASE_URL}/api/shows/{FAKE_SHOW_ID}",
            headers=get_headers(viewer_token),
            json={"title": "Should Not Work"}
        )
        # Should be 403 (permission denied by middleware)
        assert response.status_code == 403, f"Expected 403 Forbidden, got {response.status_code}: {response.text}"
        print(f"PASS: Viewer PUT /api/shows/{FAKE_SHOW_ID} returned 403 (correctly blocked)")
    
    def test_viewer_blocked_from_delete_show(self, viewer_token):
        """Viewer without delete permission is BLOCKED from DELETE /api/shows/{id} (HTTP 403)."""
        response = requests.delete(
            f"{BASE_URL}/api/shows/{FAKE_SHOW_ID}",
            headers=get_headers(viewer_token)
        )
        # Should be 403 (permission denied by middleware)
        assert response.status_code == 403, f"Expected 403 Forbidden, got {response.status_code}: {response.text}"
        print(f"PASS: Viewer DELETE /api/shows/{FAKE_SHOW_ID} returned 403 (correctly blocked)")
    
    def test_viewer_blocked_from_post_show(self, viewer_token):
        """Viewer without create permission is BLOCKED from POST /api/shows (HTTP 403)."""
        response = requests.post(
            f"{BASE_URL}/api/shows",
            headers=get_headers(viewer_token),
            json={
                "title": "Viewer Test Show",
                "start_time": "2025-01-15T10:00:00Z",
                "end_time": "2025-01-15T11:00:00Z"
            }
        )
        # Should be 403 (permission denied by middleware)
        assert response.status_code == 403, f"Expected 403 Forbidden, got {response.status_code}: {response.text}"
        print("PASS: Viewer POST /api/shows returned 403 (correctly blocked)")


class TestAdminFullAccess:
    """Test that admin user still has full access to all show endpoints."""
    
    def test_admin_can_get_shows(self, admin_token):
        """Admin can GET /api/shows."""
        response = requests.get(
            f"{BASE_URL}/api/shows",
            headers=get_headers(admin_token)
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"PASS: Admin GET /api/shows returned {response.status_code}")
    
    def test_admin_can_put_show(self, admin_token):
        """Admin can PUT /api/shows/{id} - should get 404 (not found) not 403."""
        response = requests.put(
            f"{BASE_URL}/api/shows/{FAKE_SHOW_ID}",
            headers=get_headers(admin_token),
            json={"title": "Admin Updated"}
        )
        # Admin should pass permission check, get 404 for non-existent show
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"PASS: Admin PUT /api/shows/{FAKE_SHOW_ID} returned 404 (permission passed)")
    
    def test_admin_can_delete_show(self, admin_token):
        """Admin can DELETE /api/shows/{id} - should get 404 (not found) not 403."""
        response = requests.delete(
            f"{BASE_URL}/api/shows/{FAKE_SHOW_ID}",
            headers=get_headers(admin_token)
        )
        # Admin should pass permission check, get 404 for non-existent show
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"PASS: Admin DELETE /api/shows/{FAKE_SHOW_ID} returned 404 (permission passed)")


class TestMergedAliasPermissions:
    """Test that /api/auth/me/permissions returns merged alias permissions."""
    
    def test_presenter_permissions_include_shows_alias(self, presenter_token):
        """Presenter's permissions should show both calendar AND shows with edit/delete
        because calendar has edit/delete and shows is an alias."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me/permissions",
            headers=get_headers(presenter_token)
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        permissions = data.get("permissions", {})
        
        # Should have _full_access OR the merged permissions
        if permissions.get("_full_access"):
            print("PASS: Presenter has _full_access (network admin or admin role)")
            return
        
        # Check calendar permissions exist and have edit/delete
        calendar_perms = permissions.get("calendar", {})
        shows_perms = permissions.get("shows", {})
        
        print(f"Calendar permissions: {calendar_perms}")
        print(f"Shows permissions: {shows_perms}")
        
        # If calendar has edit, shows should also have edit (merged)
        if calendar_perms.get("edit"):
            assert shows_perms.get("edit"), "Calendar has edit but shows alias didn't get merged edit permission"
            print("PASS: Shows has edit permission (merged from calendar alias)")
        
        if calendar_perms.get("delete"):
            assert shows_perms.get("delete"), "Calendar has delete but shows alias didn't get merged delete permission"
            print("PASS: Shows has delete permission (merged from calendar alias)")
    
    def test_viewer_permissions_view_only(self, viewer_token):
        """Viewer's permissions should show only view, not edit/delete."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me/permissions",
            headers=get_headers(viewer_token)
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        permissions = data.get("permissions", {})
        
        if permissions.get("_full_access"):
            pytest.fail("Viewer should NOT have _full_access")
        
        # Check that viewer does NOT have edit/delete for shows/calendar
        shows_perms = permissions.get("shows", {})
        calendar_perms = permissions.get("calendar", {})
        
        print(f"Viewer shows permissions: {shows_perms}")
        print(f"Viewer calendar permissions: {calendar_perms}")
        
        # Viewer should have view but NOT edit/delete
        assert not shows_perms.get("edit", False), "Viewer should not have shows.edit"
        assert not shows_perms.get("delete", False), "Viewer should not have shows.delete"
        assert not calendar_perms.get("edit", False), "Viewer should not have calendar.edit"
        assert not calendar_perms.get("delete", False), "Viewer should not have calendar.delete"
        
        print("PASS: Viewer correctly has no edit/delete permissions")


class TestPermissionMiddlewareIntegration:
    """Test the permission middleware sets request.state.permission_approved correctly."""
    
    def test_presenter_permission_approved_bypasses_require_admin(self, presenter_token):
        """When middleware approves, require_admin should not block."""
        # This is implicitly tested by test_presenter_can_put_show_not_blocked_by_require_admin
        # But let's verify the middleware is working by checking multiple endpoints
        
        # Check PUT endpoint
        put_response = requests.put(
            f"{BASE_URL}/api/shows/test-id-1",
            headers=get_headers(presenter_token),
            json={"title": "Test"}
        )
        
        # Check DELETE endpoint
        delete_response = requests.delete(
            f"{BASE_URL}/api/shows/test-id-2",
            headers=get_headers(presenter_token)
        )
        
        # Both should be 404 (show not found), NOT 403 (permission denied)
        # If we get 403, it means require_admin blocked despite middleware approval
        assert put_response.status_code != 403, f"PUT got 403 - middleware not bypassing require_admin: {put_response.text}"
        assert delete_response.status_code != 403, f"DELETE got 403 - middleware not bypassing require_admin: {delete_response.text}"
        
        print(f"PASS: PUT returned {put_response.status_code}, DELETE returned {delete_response.status_code}")
        print("Both bypassed require_admin check successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
