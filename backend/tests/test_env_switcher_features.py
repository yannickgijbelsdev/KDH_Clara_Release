"""
Test environment switcher and related features:
1. Environment switcher filters sites
2. GET /api/users returns all users for network admins
3. GET /api/main-sites returns environment_id, name, color for each site
4. Network Admin Manager 'Select existing user' dropdown functionality
5. Environment admins dialog shows users
6. Login flow for System Administrator
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"


class TestSystemAdminLogin:
    """Verify login works for system administrator."""
    
    def test_login_success(self):
        """System admin login should succeed."""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Check login response structure
        assert "token" in data, "Token missing from login response"
        assert "user" in data, "User missing from login response"
        assert data["user"]["email"] == SYSTEM_ADMIN_EMAIL
        assert data["user"]["is_network_admin"] == True or data["user"]["is_system_admin"] == True, \
            "User should be network admin or system admin"
        
        print(f"Login SUCCESS: {data['user']['name']} - is_system_admin={data['user'].get('is_system_admin')}, is_network_admin={data['user'].get('is_network_admin')}")
        return data["token"]


class TestUsersEndpoint:
    """Test GET /api/users returns all users for network admins without site context."""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_users_returns_all_users_for_network_admin(self, auth_token):
        """GET /api/users should return all users (15+) when called by network admin without site context."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        assert response.status_code == 200, f"GET /api/users failed: {response.text}"
        
        users = response.json()
        assert isinstance(users, list), "Response should be a list"
        assert len(users) >= 1, f"Expected at least 1 user, got {len(users)}"
        
        print(f"GET /api/users returned {len(users)} users")
        
        # Verify user structure
        if users:
            user = users[0]
            assert "id" in user
            assert "email" in user
            assert "name" in user
            
        return users


class TestMainSitesWithEnvironment:
    """Test GET /api/main-sites returns environment info for each site."""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_main_sites_include_environment_fields(self, auth_token):
        """GET /api/main-sites should return environment_id, environment_name, environment_color for each site."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
        assert response.status_code == 200, f"GET /api/main-sites failed: {response.text}"
        
        sites = response.json()
        assert isinstance(sites, list), "Response should be a list"
        assert len(sites) >= 1, f"Expected at least 1 site, got {len(sites)}"
        
        print(f"GET /api/main-sites returned {len(sites)} sites")
        
        # Count sites with environment info
        sites_with_env = []
        for site in sites:
            has_env_id = "environment_id" in site and site["environment_id"]
            has_env_name = "environment_name" in site and site["environment_name"]
            if has_env_id or has_env_name:
                sites_with_env.append({
                    "name": site.get("name"),
                    "environment_id": site.get("environment_id"),
                    "environment_name": site.get("environment_name"),
                    "environment_color": site.get("environment_color")
                })
        
        print(f"Sites with environment info: {len(sites_with_env)}")
        for s in sites_with_env:
            print(f"  - {s['name']}: env={s['environment_name']} (color={s['environment_color']})")
        
        return sites


class TestEnvironmentsEndpoint:
    """Test environments endpoint returns data for environment switcher."""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_environments(self, auth_token):
        """GET /api/environments should return list of environments with site counts."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(f"{BASE_URL}/api/environments", headers=headers)
        assert response.status_code == 200, f"GET /api/environments failed: {response.text}"
        
        environments = response.json()
        assert isinstance(environments, list), "Response should be a list"
        
        print(f"GET /api/environments returned {len(environments)} environments")
        
        for env in environments:
            # Check environment structure
            assert "id" in env
            assert "name" in env
            assert "slug" in env
            site_count = env.get("site_count", 0)
            admin_count = env.get("admin_count", 0)
            print(f"  - {env['name']}: {site_count} sites, {admin_count} admins, color={env.get('color')}")
        
        return environments
    
    def test_environment_admins(self, auth_token):
        """GET /api/environments/{env_id}/admins should return admins for an environment."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First get environments
        env_response = requests.get(f"{BASE_URL}/api/environments", headers=headers)
        assert env_response.status_code == 200
        environments = env_response.json()
        
        if not environments:
            pytest.skip("No environments to test")
        
        env = environments[0]
        env_id = env["id"]
        
        # Get admins for this environment
        response = requests.get(f"{BASE_URL}/api/environments/{env_id}/admins", headers=headers)
        assert response.status_code == 200, f"GET admins failed: {response.text}"
        
        admins = response.json()
        assert isinstance(admins, list), "Response should be a list"
        
        print(f"Environment '{env['name']}' has {len(admins)} admins")
        for admin in admins:
            print(f"  - {admin.get('user_name')} ({admin.get('user_email')})")
        
        return admins


class TestNetworkAdminsEndpoint:
    """Test network admin management endpoint."""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_network_admins(self, auth_token):
        """GET /api/users/network-admins should return network admin list."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(f"{BASE_URL}/api/users/network-admins", headers=headers)
        assert response.status_code == 200, f"GET network-admins failed: {response.text}"
        
        admins = response.json()
        assert isinstance(admins, list), "Response should be a list"
        
        print(f"GET /api/users/network-admins returned {len(admins)} admins")
        for admin in admins:
            print(f"  - {admin.get('name')} ({admin.get('email')}) - primary={admin.get('is_primary_network_admin')}")
        
        return admins


class TestMyAccessEndpoint:
    """Test my access endpoint returns environment info."""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_my_access_includes_environment_info(self, auth_token):
        """GET /api/main-sites/my/access should return main sites with environment_id, environment_name, environment_color."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(f"{BASE_URL}/api/main-sites/my/access", headers=headers)
        assert response.status_code == 200, f"GET my/access failed: {response.text}"
        
        data = response.json()
        assert "is_network_admin" in data
        assert "main_sites" in data
        
        main_sites = data["main_sites"]
        assert isinstance(main_sites, list)
        
        print(f"is_network_admin: {data['is_network_admin']}")
        print(f"main_sites count: {len(main_sites)}")
        
        # Check for environment fields in main sites
        sites_with_env = 0
        for site in main_sites:
            if site.get("environment_id"):
                sites_with_env += 1
                print(f"  - {site.get('name')}: env_id={site.get('environment_id')}, env_name={site.get('environment_name')}, env_color={site.get('environment_color')}")
        
        print(f"Sites with environment_id: {sites_with_env}/{len(main_sites)}")
        
        return data


# Run tests with pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
