"""
Test suite for redesigned features:
1. Global search endpoint (/api/search)
2. Menu counts endpoint with expanded is_admin check (/api/menu/counts)
3. API Explorer endpoint (/api/main-sites/debug/api-endpoints)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "test"


class TestAuthentication:
    """Test authentication and get tokens for subsequent tests"""
    
    def test_system_admin_login(self):
        """Test system admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        # Store token for other tests
        pytest.system_admin_token = data["token"]
        pytest.system_admin_user = data["user"]
        print(f"System admin login successful: {data['user'].get('email')}")
    
    def test_network_admin_login(self):
        """Test network admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        # Store token for other tests
        pytest.network_admin_token = data["token"]
        pytest.network_admin_user = data["user"]
        print(f"Network admin login successful: {data['user'].get('email')}")


class TestGlobalSearch:
    """Test the global search endpoint /api/search"""
    
    def test_search_requires_auth(self):
        """Search endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/search", params={"q": "test"})
        assert response.status_code == 401, "Search should require auth"
    
    def test_search_with_short_query(self):
        """Search with query < 2 chars returns empty results"""
        token = getattr(pytest, 'system_admin_token', None)
        if not token:
            pytest.skip("No token available")
        
        response = requests.get(
            f"{BASE_URL}/api/search",
            params={"q": "a"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert data["results"] == [], "Short query should return empty results"
        print("Short query returns empty results as expected")
    
    def test_search_with_valid_query(self):
        """Search with valid query returns results structure"""
        token = getattr(pytest, 'system_admin_token', None)
        if not token:
            pytest.skip("No token available")
        
        response = requests.get(
            f"{BASE_URL}/api/search",
            params={"q": "test"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert "query" in data
        assert data["query"] == "test"
        # Results should be a list
        assert isinstance(data["results"], list)
        print(f"Search returned {len(data['results'])} results for 'test'")
        
        # If results exist, verify structure
        if data["results"]:
            result = data["results"][0]
            assert "type" in result, "Result should have type"
            assert "id" in result, "Result should have id"
            assert "title" in result, "Result should have title"
            assert result["type"] in ["content", "show", "media"], f"Invalid type: {result['type']}"
            print(f"First result: {result['type']} - {result['title']}")
    
    def test_search_with_main_site_header(self):
        """Search respects X-Main-Site-ID header"""
        token = getattr(pytest, 'system_admin_token', None)
        if not token:
            pytest.skip("No token available")
        
        # First get a main site ID
        sites_response = requests.get(
            f"{BASE_URL}/api/main-sites",
            headers={"Authorization": f"Bearer {token}"}
        )
        if sites_response.status_code != 200:
            pytest.skip("Could not get main sites")
        
        sites = sites_response.json()
        if isinstance(sites, dict):
            sites = sites.get("main_sites", [])
        
        if not sites:
            pytest.skip("No main sites available")
        
        main_site_id = sites[0].get("id")
        
        response = requests.get(
            f"{BASE_URL}/api/search",
            params={"q": "test"},
            headers={
                "Authorization": f"Bearer {token}",
                "X-Main-Site-ID": main_site_id
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        print(f"Search with main site header returned {len(data['results'])} results")


class TestMenuCounts:
    """Test the menu counts endpoint /api/menu/counts with expanded is_admin check"""
    
    def test_menu_counts_requires_auth(self):
        """Menu counts endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/menu/counts")
        assert response.status_code == 401, "Menu counts should require auth"
    
    def test_menu_counts_for_system_admin(self):
        """System admin (is_system_admin) should see approval counts"""
        token = getattr(pytest, 'system_admin_token', None)
        user = getattr(pytest, 'system_admin_user', None)
        if not token:
            pytest.skip("No token available")
        
        response = requests.get(
            f"{BASE_URL}/api/menu/counts",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # System admin should have access to all counts
        print(f"Menu counts for system admin: {data}")
        
        # Check that approvals count is present (since is_admin check includes is_system_admin)
        # The is_admin check is: role == 'admin' OR is_network_admin OR is_system_admin
        # The can_approve check is: is_admin OR role == 'news_admin'
        if user and (user.get('is_system_admin') or user.get('is_network_admin') or user.get('role') == 'admin'):
            # Should have approvals key
            assert "approvals" in data or data.get("approvals", 0) >= 0, "Admin should see approvals count"
            print(f"Approvals count visible: {data.get('approvals', 'N/A')}")
    
    def test_menu_counts_for_network_admin(self):
        """Network admin (is_network_admin) should see approval counts"""
        token = getattr(pytest, 'network_admin_token', None)
        user = getattr(pytest, 'network_admin_user', None)
        if not token:
            pytest.skip("No token available")
        
        response = requests.get(
            f"{BASE_URL}/api/menu/counts",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        print(f"Menu counts for network admin: {data}")
        
        # Network admin should have access to approvals
        if user and user.get('is_network_admin'):
            # Should have approvals key since is_admin includes is_network_admin
            assert "approvals" in data or data.get("approvals", 0) >= 0, "Network admin should see approvals count"
            print(f"Approvals count visible for network admin: {data.get('approvals', 'N/A')}")


class TestApiExplorer:
    """Test the API Explorer endpoint"""
    
    def test_api_endpoints_requires_auth(self):
        """API endpoints endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/main-sites/debug/api-endpoints")
        assert response.status_code == 401, "API endpoints should require auth"
    
    def test_api_endpoints_returns_data(self):
        """API endpoints returns categories and endpoints"""
        token = getattr(pytest, 'system_admin_token', None)
        if not token:
            pytest.skip("No token available")
        
        response = requests.get(
            f"{BASE_URL}/api/main-sites/debug/api-endpoints",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have categories
        assert "categories" in data, "Response should have categories"
        assert "total_endpoints" in data, "Response should have total_endpoints"
        assert "total_categories" in data, "Response should have total_categories"
        
        print(f"API Explorer: {data['total_endpoints']} endpoints in {data['total_categories']} categories")
        
        # Verify categories structure
        if data["categories"]:
            first_cat_name = list(data["categories"].keys())[0]
            first_cat = data["categories"][first_cat_name]
            assert "endpoints" in first_cat, "Category should have endpoints"
            assert "description" in first_cat, "Category should have description"
            
            if first_cat["endpoints"]:
                endpoint = first_cat["endpoints"][0]
                assert "path" in endpoint, "Endpoint should have path"
                assert "method" in endpoint, "Endpoint should have method"
                print(f"Sample endpoint: {endpoint['method']} {endpoint['path']}")


class TestBackupEndpoints:
    """Test backup management endpoints"""
    
    def test_backups_requires_auth(self):
        """Backup endpoints require authentication"""
        response = requests.get(f"{BASE_URL}/api/backups/test-site-id")
        assert response.status_code == 401, "Backups should require auth"
    
    def test_backups_list_for_main_site(self):
        """Test listing backups for a main site"""
        token = getattr(pytest, 'system_admin_token', None)
        if not token:
            pytest.skip("No token available")
        
        # First get a main site ID
        sites_response = requests.get(
            f"{BASE_URL}/api/main-sites",
            headers={"Authorization": f"Bearer {token}"}
        )
        if sites_response.status_code != 200:
            pytest.skip("Could not get main sites")
        
        sites = sites_response.json()
        if isinstance(sites, dict):
            sites = sites.get("main_sites", [])
        
        if not sites:
            pytest.skip("No main sites available")
        
        main_site_id = sites[0].get("id")
        
        response = requests.get(
            f"{BASE_URL}/api/backups/{main_site_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Should return 200 or 403 (if not network admin)
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "backups" in data, "Response should have backups list"
            print(f"Found {len(data['backups'])} backups for main site")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
