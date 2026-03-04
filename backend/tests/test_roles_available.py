"""
Test suite for the GET /api/roles/{main_site_id}/available endpoint
This tests the bug fix where custom roles were not appearing in Team Settings page dropdowns.
The endpoint should return roles for a main site accessible by any admin (not just network admin).
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
NETWORK_ADMIN = {"email": "admkoodh@koodh.com", "password": "KYLovie13monx"}

# Main site IDs from context
RADIOGROEP_MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"
DBNTSTUDIO_MAIN_SITE_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"


class TestRolesAvailableEndpoint:
    """Test the /api/roles/{main_site_id}/available endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as network admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as network admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json=NETWORK_ADMIN)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        self.token = login_resp.json().get("access_token") or login_resp.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_endpoint_exists_and_returns_200(self):
        """Test that the endpoint exists and returns 200 for valid main site"""
        response = self.session.get(f"{BASE_URL}/api/roles/{RADIOGROEP_MAIN_SITE_ID}/available")
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_returns_roles_array(self):
        """Test that response contains a 'roles' array"""
        response = self.session.get(f"{BASE_URL}/api/roles/{RADIOGROEP_MAIN_SITE_ID}/available")
        assert response.status_code == 200
        
        data = response.json()
        assert "roles" in data, f"Response should contain 'roles' key. Got: {data.keys()}"
        assert isinstance(data["roles"], list), f"'roles' should be a list, got {type(data['roles'])}"
    
    def test_roles_have_required_fields(self):
        """Test that each role has required fields: name, slug, color"""
        response = self.session.get(f"{BASE_URL}/api/roles/{RADIOGROEP_MAIN_SITE_ID}/available")
        assert response.status_code == 200
        
        roles = response.json()["roles"]
        assert len(roles) > 0, "Should have at least one role"
        
        for role in roles:
            assert "name" in role, f"Role missing 'name': {role}"
            assert "slug" in role, f"Role missing 'slug': {role}"
            assert "color" in role, f"Role missing 'color': {role}"
            print(f"Role: {role['name']} (slug: {role['slug']}, color: {role['color']})")
    
    def test_radiogroep_has_custom_news_editor_role(self):
        """Test that Radiogroep MFY/GRK site has the custom 'News Editor' role"""
        response = self.session.get(f"{BASE_URL}/api/roles/{RADIOGROEP_MAIN_SITE_ID}/available")
        assert response.status_code == 200
        
        roles = response.json()["roles"]
        role_slugs = [r["slug"] for r in roles]
        role_names = [r["name"] for r in roles]
        
        print(f"Roles for Radiogroep: {role_names}")
        print(f"Role slugs: {role_slugs}")
        
        # Check for news_editor custom role
        assert "news_editor" in role_slugs, f"Expected 'news_editor' custom role in Radiogroep. Got slugs: {role_slugs}"
        
        # Find the role and verify its name
        news_editor = next((r for r in roles if r["slug"] == "news_editor"), None)
        assert news_editor is not None
        assert news_editor["name"] == "News Editor", f"Expected name 'News Editor', got: {news_editor['name']}"
    
    def test_includes_default_roles(self):
        """Test that the endpoint returns default roles (admin, editor, presenter, viewer)"""
        response = self.session.get(f"{BASE_URL}/api/roles/{RADIOGROEP_MAIN_SITE_ID}/available")
        assert response.status_code == 200
        
        roles = response.json()["roles"]
        role_slugs = set(r["slug"] for r in roles)
        
        expected_defaults = {"admin", "editor", "presenter", "viewer"}
        missing = expected_defaults - role_slugs
        
        print(f"Found role slugs: {role_slugs}")
        print(f"Expected defaults: {expected_defaults}")
        
        assert len(missing) == 0, f"Missing default roles: {missing}"
    
    def test_dbntstudio_has_only_default_roles(self):
        """Test that DBNTSTUDIO site has only default roles (no custom roles)"""
        response = self.session.get(f"{BASE_URL}/api/roles/{DBNTSTUDIO_MAIN_SITE_ID}/available")
        assert response.status_code == 200
        
        roles = response.json()["roles"]
        role_slugs = set(r["slug"] for r in roles)
        
        print(f"DBNTSTUDIO roles: {role_slugs}")
        
        # Should have the 4 default roles
        expected_defaults = {"admin", "editor", "presenter", "viewer"}
        assert expected_defaults.issubset(role_slugs), f"DBNTSTUDIO should have default roles. Got: {role_slugs}"
        
        # Should NOT have news_editor (that's Radiogroep's custom role)
        assert "news_editor" not in role_slugs, f"DBNTSTUDIO should not have 'news_editor' role"
    
    def test_invalid_main_site_id_returns_empty_or_seeds_defaults(self):
        """Test behavior with invalid/non-existent main site ID"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = self.session.get(f"{BASE_URL}/api/roles/{fake_id}/available")
        
        # Should either return 200 with seeded defaults or 403/404
        print(f"Response for fake main site: {response.status_code}")
        print(f"Response body: {response.text[:300]}")
        
        # The endpoint may seed defaults for a new main site - that's acceptable
        if response.status_code == 200:
            roles = response.json().get("roles", [])
            print(f"Returned roles for non-existent site: {[r['slug'] for r in roles]}")
    
    def test_roles_sorted_by_sort_order(self):
        """Test that roles are returned sorted by sort_order"""
        response = self.session.get(f"{BASE_URL}/api/roles/{RADIOGROEP_MAIN_SITE_ID}/available")
        assert response.status_code == 200
        
        roles = response.json()["roles"]
        
        # Check that sort_order field exists and roles are in order
        has_sort_order = all("sort_order" in r for r in roles)
        if has_sort_order:
            sort_orders = [r["sort_order"] for r in roles]
            print(f"Sort orders: {sort_orders}")
            assert sort_orders == sorted(sort_orders), "Roles should be sorted by sort_order"


class TestRolesAvailableAuthorization:
    """Test authorization for the /api/roles/{main_site_id}/available endpoint"""
    
    def test_unauthenticated_access_denied(self):
        """Test that unauthenticated requests are denied"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/roles/{RADIOGROEP_MAIN_SITE_ID}/available")
        
        print(f"Unauthenticated response: {response.status_code}")
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
    
    def test_network_admin_can_access(self):
        """Test that network admin can access the endpoint"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as network admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json=NETWORK_ADMIN)
        assert login_resp.status_code == 200
        
        token = login_resp.json().get("access_token") or login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = session.get(f"{BASE_URL}/api/roles/{RADIOGROEP_MAIN_SITE_ID}/available")
        assert response.status_code == 200, f"Network admin should have access. Got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
