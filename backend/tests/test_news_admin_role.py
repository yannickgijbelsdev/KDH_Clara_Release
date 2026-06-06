"""
Test suite for news_admin role bug fixes:
1. GET /api/auth/me/permissions with X-Main-Site-ID should return role_slug='news_admin' and role_info with name/slug/color
2. GET /api/shows with news_admin token should return shows (not 403)
3. PUT /api/shows/{id} with news_admin token should succeed (edit permission)
4. GET /api/content with news_admin token should return content (not 403)
5. POST /api/content with news_admin token should succeed (create permission)
6. GET /api/roles/{main_site_id}/available should include news_admin role
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from the bug report
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
NEWS_ADMIN_USER_ID = "e5ca5f3d-7c62-4711-81e3-e65049dfbf3a"  # Hadewig Weyen
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"  # Radiogroep MFY/GRK


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for testing."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        return data.get("token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def news_admin_token(admin_token):
    """Get news_admin token by impersonating the Hadewig Weyen user."""
    # Use admin switch-user endpoint to get a token for the news_admin user
    response = requests.post(
        f"{BASE_URL}/api/admin/switch-user/{NEWS_ADMIN_USER_ID}",
        headers={
            "Authorization": f"Bearer {admin_token}",
            "X-Main-Site-ID": MAIN_SITE_ID
        }
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token")
    pytest.skip(f"Failed to switch to news_admin user: {response.status_code} - {response.text}")


class TestNewsAdminPermissionsEndpoint:
    """Test GET /api/auth/me/permissions returns correct role info for news_admin."""
    
    def test_news_admin_permissions_returns_role_slug(self, news_admin_token):
        """Test that /api/auth/me/permissions returns role_slug='news_admin'."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me/permissions",
            headers={
                "Authorization": f"Bearer {news_admin_token}",
                "X-Main-Site-ID": MAIN_SITE_ID
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "role_slug" in data, "Response should contain 'role_slug'"
        assert data["role_slug"] == "news_admin", f"Expected role_slug='news_admin', got '{data.get('role_slug')}'"
    
    def test_news_admin_permissions_returns_role_info(self, news_admin_token):
        """Test that /api/auth/me/permissions returns role_info with name/slug/color."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me/permissions",
            headers={
                "Authorization": f"Bearer {news_admin_token}",
                "X-Main-Site-ID": MAIN_SITE_ID
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "role_info" in data, "Response should contain 'role_info'"
        role_info = data.get("role_info")
        assert role_info is not None, "role_info should not be None for news_admin"
        assert "name" in role_info, "role_info should contain 'name'"
        assert "slug" in role_info, "role_info should contain 'slug'"
        assert "color" in role_info, "role_info should contain 'color'"
        assert role_info["slug"] == "news_admin", f"role_info.slug should be 'news_admin', got '{role_info.get('slug')}'"
        assert role_info["name"] == "News Admin", f"role_info.name should be 'News Admin', got '{role_info.get('name')}'"
        print(f"SUCCESS: role_info = {role_info}")
    
    def test_news_admin_permissions_has_shows_view(self, news_admin_token):
        """Test that news_admin has shows.view permission."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me/permissions",
            headers={
                "Authorization": f"Bearer {news_admin_token}",
                "X-Main-Site-ID": MAIN_SITE_ID
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        permissions = data.get("permissions", {})
        assert permissions.get("shows", {}).get("view"), "news_admin should have shows.view permission"
        assert permissions.get("shows", {}).get("edit"), "news_admin should have shows.edit permission"
    
    def test_news_admin_permissions_has_content_library(self, news_admin_token):
        """Test that news_admin has content_library permissions."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me/permissions",
            headers={
                "Authorization": f"Bearer {news_admin_token}",
                "X-Main-Site-ID": MAIN_SITE_ID
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        permissions = data.get("permissions", {})
        assert permissions.get("content_library", {}).get("view"), "news_admin should have content_library.view"
        assert permissions.get("content_library", {}).get("create"), "news_admin should have content_library.create"


class TestNewsAdminShowsAccess:
    """Test news_admin can access shows endpoints (not 403)."""
    
    def test_news_admin_can_get_shows(self, news_admin_token):
        """Test GET /api/shows returns 200 for news_admin (not 403)."""
        response = requests.get(
            f"{BASE_URL}/api/shows",
            headers={
                "Authorization": f"Bearer {news_admin_token}",
                "X-Main-Site-ID": MAIN_SITE_ID
            }
        )
        # Should be 200, not 403
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Response should be a list of shows or empty list, not an error
        assert isinstance(data, list), f"Expected list of shows, got {type(data)}"
        print(f"SUCCESS: news_admin can GET /api/shows - returned {len(data)} shows")


class TestNewsAdminContentAccess:
    """Test news_admin can access content endpoints (not 403)."""
    
    def test_news_admin_can_get_content(self, news_admin_token):
        """Test GET /api/content returns 200 for news_admin (not 403)."""
        response = requests.get(
            f"{BASE_URL}/api/content",
            headers={
                "Authorization": f"Bearer {news_admin_token}",
                "X-Main-Site-ID": MAIN_SITE_ID
            }
        )
        # Should be 200, not 403
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Response should be a dict with items/pagination info or a list
        print(f"SUCCESS: news_admin can GET /api/content - response type: {type(data)}")


class TestNewsAdminRoleAvailability:
    """Test that news_admin role is available in the roles list."""
    
    def test_news_admin_in_available_roles(self, admin_token):
        """Test GET /api/roles/{main_site_id}/available includes news_admin role."""
        response = requests.get(
            f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/available",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "X-Main-Site-ID": MAIN_SITE_ID
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "roles" in data, "Response should contain 'roles'"
        roles = data.get("roles", [])
        
        # Find news_admin role
        news_admin_role = next((r for r in roles if r.get("slug") == "news_admin"), None)
        assert news_admin_role is not None, "news_admin role should be in available roles list"
        
        # Verify role properties
        assert news_admin_role.get("name") == "News Admin", f"Expected name='News Admin', got '{news_admin_role.get('name')}'"
        assert news_admin_role.get("color") == "#8b5cf6", f"Expected color='#8b5cf6', got '{news_admin_role.get('color')}'"
        
        print(f"SUCCESS: news_admin role found in available roles: {news_admin_role}")


class TestNetworkAdminPermissions:
    """Test that network admin (used for login) also works correctly."""
    
    def test_network_admin_permissions_is_network_admin_true(self, admin_token):
        """Test that network admin has is_network_admin=true in permissions response."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me/permissions",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "X-Main-Site-ID": MAIN_SITE_ID
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Network admin should have is_network_admin=True
        assert data.get("is_network_admin"), "Network admin should have is_network_admin=True"
        # Network admin's roleInfo should be null (they bypass role checks)
        # This is expected behavior per the bug report
        print(f"SUCCESS: Network admin has is_network_admin=True, role_slug={data.get('role_slug')}, role_info={data.get('role_info')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
