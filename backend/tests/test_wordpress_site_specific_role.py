"""
Test WordPress endpoints with site-specific roles.
Bug fix verification: WordPress endpoints now use get_effective_role() instead of require_admin.

User: Deborah Baeten (or test user eddy.thijs@grk.fm)
- Global role: presenter  
- Site role on DBNT: admin
- Should be able to access WordPress settings when X-Main-Site-ID header is set
"""
import pytest
import requests
import os
import uuid

BASE_URL = "https://multi-tenant-hub-27.preview.emergentagent.com"
DBNT_MAIN_SITE_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"

# Test users
NETWORK_ADMIN = {
    "email": "admkoodh@koodh.com",
    "password": "KYLovie13monx"
}

SITE_ADMIN_ON_DBNT = {
    "email": "eddy.thijs@grk.fm",
    "password": "8aP7QiJAKuouw-SM",
    "global_role": "presenter",  
    "site_role_on_dbnt": "admin"  
}


@pytest.fixture
def api_client():
    """Create a requests session."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def network_admin_token(api_client):
    """Get auth token for network admin."""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": NETWORK_ADMIN["email"],
        "password": NETWORK_ADMIN["password"]
    })
    assert response.status_code == 200, f"Network admin login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture
def site_admin_token(api_client):
    """Get auth token for site admin (global role=presenter, site role=admin)."""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": SITE_ADMIN_ON_DBNT["email"],
        "password": SITE_ADMIN_ON_DBNT["password"]
    })
    assert response.status_code == 200, f"Site admin login failed: {response.text}"
    return response.json().get("token")


class TestNetworkAdminWordPressAccess:
    """Test that network admin can access WordPress endpoints."""
    
    def test_network_admin_can_get_wordpress_sites(self, api_client, network_admin_token):
        """Network admin should be able to GET WordPress sites."""
        api_client.headers.update({"Authorization": f"Bearer {network_admin_token}"})
        
        response = api_client.get(f"{BASE_URL}/api/wordpress/sites")
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"SUCCESS: Network admin GET /api/wordpress/sites returned {len(response.json())} sites")
    
    def test_network_admin_can_get_wordpress_sites_with_header(self, api_client, network_admin_token):
        """Network admin should be able to GET WordPress sites with X-Main-Site-ID header."""
        api_client.headers.update({
            "Authorization": f"Bearer {network_admin_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        })
        
        response = api_client.get(f"{BASE_URL}/api/wordpress/sites")
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"SUCCESS: Network admin GET /api/wordpress/sites with DBNT header returned {len(response.json())} sites")


class TestSiteAdminWordPressAccess:
    """Test WordPress access for user with site-specific admin role (global=presenter, site=admin)."""
    
    def test_site_admin_get_sites_without_header_returns_ok(self, api_client, site_admin_token):
        """Without header, user can still GET sites (read operation)."""
        api_client.headers.update({"Authorization": f"Bearer {site_admin_token}"})
        
        response = api_client.get(f"{BASE_URL}/api/wordpress/sites")
        # Read operation doesn't require admin, should succeed
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"SUCCESS: Site admin GET /api/wordpress/sites without header returned {len(response.json())} sites")
    
    def test_site_admin_get_sites_with_header_returns_ok(self, api_client, site_admin_token):
        """With X-Main-Site-ID header, site admin can GET sites filtered by main site."""
        api_client.headers.update({
            "Authorization": f"Bearer {site_admin_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        })
        
        response = api_client.get(f"{BASE_URL}/api/wordpress/sites")
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"SUCCESS: Site admin GET /api/wordpress/sites with DBNT header returned {len(response.json())} DBNT-specific sites")
    
    def test_site_admin_post_site_without_header_returns_403(self, api_client, site_admin_token):
        """Without header, user with global role 'presenter' cannot POST (create) WordPress sites."""
        api_client.headers.update({"Authorization": f"Bearer {site_admin_token}"})
        
        test_site_data = {
            "name": "TEST Site Creation Without Header",
            "wp_base_url": "https://test-wp-site.example.com",
            "username": "testuser",
            "app_password": "test-app-password-12345",
            "default_post_type": "post",
            "default_publish_status": "draft",
            "is_active": False  # Keep inactive for safety
        }
        
        response = api_client.post(f"{BASE_URL}/api/wordpress/sites", json=test_site_data)
        assert response.status_code == 403, f"Expected 403 but got {response.status_code}: {response.text}"
        print(f"SUCCESS: Site admin POST /api/wordpress/sites WITHOUT header correctly returns 403 (presenter cannot create)")
    
    def test_site_admin_post_site_with_header_returns_201(self, api_client, site_admin_token):
        """With X-Main-Site-ID header, site admin (site role=admin) CAN create WordPress sites."""
        api_client.headers.update({
            "Authorization": f"Bearer {site_admin_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        })
        
        unique_id = str(uuid.uuid4())[:8]
        test_site_data = {
            "name": f"TEST_WP_Site_{unique_id}",
            "wp_base_url": f"https://test-wp-{unique_id}.example.com",
            "username": "testuser",
            "app_password": "test-app-password-12345",
            "default_post_type": "post",
            "default_publish_status": "draft",
            "is_active": False  # Keep inactive for safety
        }
        
        response = api_client.post(f"{BASE_URL}/api/wordpress/sites", json=test_site_data)
        assert response.status_code == 201, f"Expected 201 but got {response.status_code}: {response.text}"
        
        created_site = response.json()
        print(f"SUCCESS: Site admin POST /api/wordpress/sites WITH header returns 201 - Created site: {created_site.get('id')}")
        
        # Cleanup: Delete the test site
        delete_response = api_client.delete(f"{BASE_URL}/api/wordpress/sites/{created_site['id']}")
        assert delete_response.status_code == 204, f"Cleanup failed: {delete_response.text}"
        print(f"SUCCESS: Cleaned up test site {created_site['id']}")


class TestCategoriesWithSiteSpecificRole:
    """Test category endpoints with site-specific roles."""
    
    def test_get_categories_with_main_site_header(self, api_client, site_admin_token):
        """GET categories filtered by main site."""
        api_client.headers.update({
            "Authorization": f"Bearer {site_admin_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        })
        
        response = api_client.get(f"{BASE_URL}/api/content/categories")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        categories = response.json()
        print(f"SUCCESS: GET /api/content/categories with DBNT header returned {len(categories)} categories")
    
    def test_create_category_without_header_returns_403(self, api_client, site_admin_token):
        """Without header, presenter cannot create categories."""
        api_client.headers.update({"Authorization": f"Bearer {site_admin_token}"})
        
        response = api_client.post(f"{BASE_URL}/api/content/categories?name=TEST_Category_NoHeader")
        # Presenter without site admin role should get 403
        assert response.status_code == 403, f"Expected 403 but got {response.status_code}: {response.text}"
        print(f"SUCCESS: POST /api/content/categories WITHOUT header correctly returns 403 for presenter")
    
    def test_create_category_with_header_returns_200(self, api_client, site_admin_token):
        """With X-Main-Site-ID header, site admin can create categories."""
        api_client.headers.update({
            "Authorization": f"Bearer {site_admin_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        })
        
        unique_id = str(uuid.uuid4())[:8]
        response = api_client.post(f"{BASE_URL}/api/content/categories?name=TEST_Category_{unique_id}")
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"
        
        category = response.json()
        print(f"SUCCESS: POST /api/content/categories WITH header returns 200 - Created category: {category.get('name')}")


class TestWordPressEndpointSecurity:
    """Test security of WordPress endpoints - correct 403 for unauthorized access."""
    
    def test_sync_categories_without_header_returns_403(self, api_client, site_admin_token, network_admin_token):
        """sync-categories endpoint requires admin role."""
        api_client.headers.update({
            "Authorization": f"Bearer {network_admin_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        })
        
        # First get a WordPress site ID
        sites_response = api_client.get(f"{BASE_URL}/api/wordpress/sites")
        assert sites_response.status_code == 200
        sites = sites_response.json()
        
        if len(sites) == 0:
            pytest.skip("No WordPress sites found to test sync-categories")
        
        site_id = sites[0]['id']
        
        # Test as presenter without header (should fail)
        api_client.headers.update({"Authorization": f"Bearer {site_admin_token}"})
        api_client.headers.pop("X-Main-Site-ID", None)
        
        response = api_client.post(f"{BASE_URL}/api/wordpress/sites/{site_id}/sync-categories")
        assert response.status_code == 403, f"Expected 403 but got {response.status_code}: {response.text}"
        print(f"SUCCESS: sync-categories WITHOUT header correctly returns 403 for presenter")
    
    def test_sync_categories_with_header_site_admin(self, api_client, site_admin_token):
        """Site admin with header can access sync-categories."""
        api_client.headers.update({
            "Authorization": f"Bearer {site_admin_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        })
        
        # Get WordPress sites for DBNT
        sites_response = api_client.get(f"{BASE_URL}/api/wordpress/sites")
        sites = sites_response.json()
        
        if len(sites) == 0:
            pytest.skip("No WordPress sites found for DBNT to test sync-categories")
        
        site_id = sites[0]['id']
        
        # Test as site admin with header - should work or fail with connection error (not 403)
        response = api_client.post(f"{BASE_URL}/api/wordpress/sites/{site_id}/sync-categories")
        # Should not return 403 - might return 408 (timeout), 500 (wp error), or 200 (success)
        assert response.status_code != 403, f"Unexpected 403 - site admin with header should have access: {response.text}"
        print(f"SUCCESS: sync-categories WITH header for site admin returns {response.status_code} (not 403)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
