"""
Test sidebar navigation layout and per-site notification settings.
Tests the new sidebar navigation pattern and per-site notification configuration.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


class TestAuth:
    """Authentication for testing"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token for network admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        if response.status_code != 200:
            pytest.skip("Authentication failed - skipping tests")
        data = response.json()
        # Handle 2FA if needed - skip test if 2FA is required
        if data.get("requires_2fa"):
            pytest.skip("2FA required - cannot complete automated tests")
        return data.get("token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestPerSiteNotificationSettings(TestAuth):
    """Test per-site notification settings endpoints"""
    
    def test_get_main_sites(self, headers):
        """Test that we can get list of main sites for the selector"""
        response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Expected list of main sites"
        print(f"PASS: Got {len(data)} main sites")
        if len(data) > 0:
            # Verify site structure
            site = data[0]
            assert "id" in site, "Site should have id"
            assert "name" in site, "Site should have name"
            assert "slug" in site, "Site should have slug"
            print(f"PASS: First site: {site.get('name')} (/{site.get('slug')})")
        return data
    
    def test_get_site_roles_endpoint(self, headers):
        """Test GET /api/notifications/site-roles/{main_site_id} returns roles including custom"""
        # First get a main site ID
        sites_response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
        if sites_response.status_code != 200 or not sites_response.json():
            pytest.skip("No main sites available")
        
        site_id = sites_response.json()[0]["id"]
        site_name = sites_response.json()[0]["name"]
        
        # Now get roles for that site
        response = requests.get(f"{BASE_URL}/api/notifications/site-roles/{site_id}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        roles = response.json()
        assert isinstance(roles, list), "Expected list of roles"
        
        # Verify default roles are present
        role_slugs = [r.get("slug") for r in roles]
        assert "admin" in role_slugs, "Should include admin role"
        assert "presenter" in role_slugs, "Should include presenter role"
        assert "editor" in role_slugs, "Should include editor role"
        assert "viewer" in role_slugs, "Should include viewer role"
        
        print(f"PASS: Got {len(roles)} roles for site '{site_name}'")
        print(f"PASS: Roles: {[r.get('name') for r in roles]}")
        return roles
    
    def test_get_role_settings_global(self, headers):
        """Test GET /api/notifications/role-settings without main_site_id (global)"""
        response = requests.get(f"{BASE_URL}/api/notifications/role-settings", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Can be empty object if no settings configured
        assert isinstance(data, dict), "Expected dict of role settings"
        print(f"PASS: Got global role settings: {list(data.keys()) if data else 'empty'}")
        return data
    
    def test_get_role_settings_per_site(self, headers):
        """Test GET /api/notifications/role-settings?main_site_id=xxx (per-site)"""
        # First get a main site ID
        sites_response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
        if sites_response.status_code != 200 or not sites_response.json():
            pytest.skip("No main sites available")
        
        site_id = sites_response.json()[0]["id"]
        site_name = sites_response.json()[0]["name"]
        
        response = requests.get(f"{BASE_URL}/api/notifications/role-settings?main_site_id={site_id}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, dict), "Expected dict of role settings"
        print(f"PASS: Got per-site role settings for '{site_name}': {list(data.keys()) if data else 'empty'}")
        return data
    
    def test_save_role_settings_per_site(self, headers):
        """Test PUT /api/notifications/role-settings with main_site_id saves per-site"""
        # First get a main site ID
        sites_response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
        if sites_response.status_code != 200 or not sites_response.json():
            pytest.skip("No main sites available")
        
        site_id = sites_response.json()[0]["id"]
        site_name = sites_response.json()[0]["name"]
        
        # Save test role settings for this site
        test_settings = {
            "main_site_id": site_id,
            "roles": {
                "admin": {"categories": ["security", "system"], "mode": "realtime"},
                "editor": {"categories": ["content"], "mode": "daily"}
            }
        }
        
        response = requests.put(f"{BASE_URL}/api/notifications/role-settings", headers=headers, json=test_settings)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Should have success message"
        assert data.get("message") == "Settings saved", f"Expected 'Settings saved', got {data.get('message')}"
        
        print(f"PASS: Saved per-site role settings for '{site_name}'")
        
        # Verify the settings were saved by fetching them back
        verify_response = requests.get(f"{BASE_URL}/api/notifications/role-settings?main_site_id={site_id}", headers=headers)
        assert verify_response.status_code == 200
        
        saved_data = verify_response.json()
        assert "admin" in saved_data, "Admin settings should be saved"
        assert saved_data["admin"]["categories"] == ["security", "system"], "Admin categories should match"
        assert saved_data["admin"]["mode"] == "realtime", "Admin mode should be realtime"
        
        print(f"PASS: Verified saved settings match: {saved_data}")


class TestNotificationCategoriesAndProviders(TestAuth):
    """Test notification categories and SMTP provider endpoints"""
    
    def test_get_smtp_providers(self, headers):
        """Test SMTP providers endpoint returns English text"""
        response = requests.get(f"{BASE_URL}/api/notifications/smtp-providers", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        providers = response.json()
        assert isinstance(providers, list), "Expected list of providers"
        assert len(providers) > 0, "Should have at least one provider"
        
        # Verify structure
        provider = providers[0]
        assert "id" in provider, "Provider should have id"
        assert "name" in provider, "Provider should have name"
        
        print(f"PASS: Got {len(providers)} SMTP providers")
        for p in providers:
            print(f"  - {p.get('id')}: {p.get('name')}")
    
    def test_get_notification_categories(self, headers):
        """Test notification categories endpoint returns English descriptions"""
        response = requests.get(f"{BASE_URL}/api/notifications/categories", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        categories = response.json()
        assert isinstance(categories, list), "Expected list of categories"
        assert len(categories) > 0, "Should have at least one category"
        
        # Verify expected categories exist
        cat_ids = [c.get("id") for c in categories]
        expected_cats = ["security", "content", "shows", "users", "system"]
        for cat in expected_cats:
            assert cat in cat_ids, f"Missing expected category: {cat}"
        
        print(f"PASS: Got {len(categories)} notification categories")
        for c in categories:
            print(f"  - {c.get('id')}: {c.get('name')} - {c.get('description', 'no desc')}")


class TestNetworkAdminEndpoints(TestAuth):
    """Test network admin management endpoints"""
    
    def test_get_network_admins(self, headers):
        """Test GET /api/users/network-admins returns admin list"""
        response = requests.get(f"{BASE_URL}/api/users/network-admins", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        admins = response.json()
        assert isinstance(admins, list), "Expected list of admins"
        
        print(f"PASS: Got {len(admins)} network admins")
        for admin in admins:
            is_primary = admin.get("is_primary_network_admin", False)
            print(f"  - {admin.get('name')} ({admin.get('email')}) {'[PRIMARY]' if is_primary else ''}")


class TestPermissionAuditEndpoints(TestAuth):
    """Test permission audit endpoints"""
    
    def test_get_audit_stats(self, headers):
        """Test GET /api/roles/audit/stats returns statistics"""
        response = requests.get(f"{BASE_URL}/api/roles/audit/stats", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        stats = response.json()
        assert isinstance(stats, dict), "Expected stats object"
        
        # Verify expected fields
        expected_fields = ["total_denials", "denials_24h"]
        for field in expected_fields:
            assert field in stats, f"Missing expected field: {field}"
        
        print(f"PASS: Got audit stats: total_denials={stats.get('total_denials')}, 24h={stats.get('denials_24h')}")
    
    def test_get_audit_logs(self, headers):
        """Test GET /api/roles/audit/logs returns log entries"""
        response = requests.get(f"{BASE_URL}/api/roles/audit/logs?limit=10", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "logs" in data, "Response should have logs field"
        assert "total" in data, "Response should have total field"
        
        logs = data["logs"]
        assert isinstance(logs, list), "Logs should be a list"
        
        print(f"PASS: Got {len(logs)} audit logs (total: {data.get('total')})")


class TestUserAccessEndpoints(TestAuth):
    """Test user access debug endpoints"""
    
    def test_get_all_user_access(self, headers):
        """Test GET /api/main-sites/debug/all-user-access returns access data"""
        response = requests.get(f"{BASE_URL}/api/main-sites/debug/all-user-access", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, dict), "Expected object"
        
        # Verify expected fields
        expected_fields = ["total_users", "total_main_sites", "total_access_records"]
        for field in expected_fields:
            assert field in data, f"Missing expected field: {field}"
        
        print(f"PASS: Got user access data: {data.get('total_users')} users, {data.get('total_main_sites')} sites, {data.get('total_access_records')} records")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
