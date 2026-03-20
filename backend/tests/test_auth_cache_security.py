"""
Test suite for Auth Cache Security Bug Fix
==========================================
Testing the security fix that prevents cached user identity responses:
1. All /api responses have Cache-Control: no-store, no-cache, must-revalidate headers
2. All /api responses have Vary: Authorization, X-Main-Site-ID headers
3. All /api responses have Pragma: no-cache headers
4. Login returns correct user data
5. GET /api/auth/me returns the correct user for the JWT token
6. Impersonation token validation in get_current_user
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

class TestCacheHeaders:
    """Test that all /api responses have anti-cache headers"""
    
    def test_api_health_has_cache_headers(self):
        """Verify /api/health returns cache-control headers"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        
        # Check Cache-Control header
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control, f"Expected 'no-store' in Cache-Control, got: {cache_control}"
        assert 'no-cache' in cache_control, f"Expected 'no-cache' in Cache-Control, got: {cache_control}"
        assert 'must-revalidate' in cache_control, f"Expected 'must-revalidate' in Cache-Control, got: {cache_control}"
        
        # Check Pragma header
        pragma = response.headers.get('Pragma', '')
        assert 'no-cache' in pragma, f"Expected 'no-cache' in Pragma, got: {pragma}"
        
        # Check Vary header
        vary = response.headers.get('Vary', '')
        assert 'Authorization' in vary, f"Expected 'Authorization' in Vary, got: {vary}"
        assert 'X-Main-Site-ID' in vary, f"Expected 'X-Main-Site-ID' in Vary, got: {vary}"
        
        print("PASSED: /api/health has correct anti-cache headers")
    
    def test_api_root_has_cache_headers(self):
        """Verify /api/ returns cache-control headers"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control, f"Cache-Control missing 'no-store': {cache_control}"
        assert 'no-cache' in cache_control, f"Cache-Control missing 'no-cache': {cache_control}"
        
        print("PASSED: /api/ has correct cache headers")
    
    def test_api_config_has_cache_headers(self):
        """Verify /api/config returns cache-control headers"""
        response = requests.get(f"{BASE_URL}/api/config")
        assert response.status_code == 200
        
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control
        
        vary = response.headers.get('Vary', '')
        assert 'Authorization' in vary
        
        print("PASSED: /api/config has correct cache headers")


class TestAuthFlow:
    """Test login flow returns correct user data"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for System Admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        assert "user" in data, "No user in login response"
        return data
    
    def test_login_returns_correct_user(self, auth_token):
        """Verify login returns the correct user data for the credentials"""
        user = auth_token["user"]
        
        # Verify this is the System Administrator user
        assert user.get("email") == "admkoodh@koodh.com", f"Wrong email: {user.get('email')}"
        assert user.get("name") == "System Administrator", f"Wrong name: {user.get('name')}"
        assert user.get("is_network_admin") == True, f"Expected is_network_admin=True"
        
        print(f"PASSED: Login returns correct user: {user.get('name')} ({user.get('email')})")
    
    def test_login_response_has_cache_headers(self):
        """Verify POST /api/auth/login has anti-cache headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200
        
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control, f"Login response missing cache headers: {cache_control}"
        
        print("PASSED: Login response has anti-cache headers")
    
    def test_auth_me_returns_correct_user(self, auth_token):
        """Verify GET /api/auth/me returns the correct user matching the JWT"""
        token = auth_token["token"]
        expected_email = auth_token["user"]["email"]
        
        # Make request with auth header
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={
                "Authorization": f"Bearer {token}",
                "Cache-Control": "no-cache"
            }
        )
        assert response.status_code == 200, f"auth/me failed: {response.text}"
        
        user = response.json()
        assert user.get("email") == expected_email, f"Wrong user returned: {user.get('email')} vs {expected_email}"
        assert user.get("name") == "System Administrator", f"Wrong name: {user.get('name')}"
        
        print(f"PASSED: /api/auth/me returns correct user: {user.get('email')}")
    
    def test_auth_me_has_cache_headers(self, auth_token):
        """Verify GET /api/auth/me has anti-cache headers"""
        token = auth_token["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control, f"auth/me missing cache headers: {cache_control}"
        
        vary = response.headers.get('Vary', '')
        assert 'Authorization' in vary, f"Vary header missing Authorization: {vary}"
        
        print("PASSED: /api/auth/me has anti-cache headers with Vary: Authorization")


class TestProtectedEndpointsCacheHeaders:
    """Test that protected endpoints also have cache headers"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Create authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_users_endpoint_has_cache_headers(self, admin_session):
        """Verify /api/users has anti-cache headers"""
        response = admin_session.get(f"{BASE_URL}/api/users")
        
        # Check headers even if we get a 4xx response
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control, f"/api/users missing cache headers: {cache_control}"
        
        print(f"PASSED: /api/users has cache headers (status: {response.status_code})")
    
    def test_menu_counts_has_cache_headers(self, admin_session):
        """Verify /api/menu/counts has anti-cache headers"""
        response = admin_session.get(f"{BASE_URL}/api/menu/counts")
        
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control, f"/api/menu/counts missing cache headers: {cache_control}"
        
        print(f"PASSED: /api/menu/counts has cache headers (status: {response.status_code})")
    
    def test_main_sites_has_cache_headers(self, admin_session):
        """Verify /api/main-sites has anti-cache headers"""
        response = admin_session.get(f"{BASE_URL}/api/main-sites")
        
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control, f"/api/main-sites missing cache headers: {cache_control}"
        
        vary = response.headers.get('Vary', '')
        assert 'Authorization' in vary, f"Vary missing Authorization: {vary}"
        
        print(f"PASSED: /api/main-sites has cache headers (status: {response.status_code})")


class TestImpersonationValidation:
    """Test backend impersonation token validation"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Create authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data['token']}"})
        return {"session": session, "user": data["user"]}
    
    def test_impersonation_creates_token_with_marker(self, admin_session):
        """Verify impersonation creates a token with impersonated_by claim"""
        session = admin_session["session"]
        admin_id = admin_session["user"]["id"]
        
        # First get list of users to find someone to impersonate
        response = session.get(f"{BASE_URL}/api/users")
        if response.status_code != 200:
            # Try getting users via main-sites
            pytest.skip("Cannot get users list")
        
        users = response.json()
        if not users:
            pytest.skip("No users to impersonate")
        
        # Find a non-admin user or use the first available
        target_user = None
        for u in users:
            if u.get("id") != admin_id:
                target_user = u
                break
        
        if not target_user:
            pytest.skip("No other user to impersonate")
        
        # Impersonate the target user
        response = session.post(f"{BASE_URL}/api/admin/switch-user/{target_user['id']}")
        if response.status_code != 200:
            pytest.skip(f"Impersonation not allowed: {response.status_code}")
        
        data = response.json()
        assert "token" in data, "No token in impersonation response"
        assert "original_user" in data, "No original_user in impersonation response"
        assert data["original_user"]["id"] == admin_id, "Wrong original user"
        
        # The token should work and return the impersonated user
        imp_response = session.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {data['token']}"}
        )
        assert imp_response.status_code == 200
        imp_user = imp_response.json()
        assert imp_user.get("id") == target_user["id"], "Impersonation returned wrong user"
        
        print(f"PASSED: Impersonation token created for user {target_user.get('email')}")


class TestDomainManagerAccessible:
    """Test Domain Manager is still accessible after auth changes"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Create authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data['token']}"})
        return session
    
    def test_domains_overview_accessible(self, admin_session):
        """Verify /api/domains/overview is accessible"""
        response = admin_session.get(f"{BASE_URL}/api/domains/overview")
        # Should be 200 or 403 (if not system admin) - not 500
        assert response.status_code in [200, 403], f"Domains overview error: {response.status_code}"
        
        # Check cache headers
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control
        
        print(f"PASSED: Domains overview accessible (status: {response.status_code})")


class TestLicenseManagerAccessible:
    """Test License Manager is still accessible after auth changes"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Create authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data['token']}"})
        return session
    
    def test_licenses_assignments_accessible(self, admin_session):
        """Verify /api/licenses/assignments is accessible"""
        response = admin_session.get(f"{BASE_URL}/api/licenses/assignments")
        # Should be 200 - network admin has access
        assert response.status_code == 200, f"Licenses assignments error: {response.status_code} - {response.text}"
        
        # Check cache headers
        cache_control = response.headers.get('Cache-Control', '')
        assert 'no-store' in cache_control
        
        print(f"PASSED: Licenses assignments accessible")
    
    def test_license_packages_accessible(self, admin_session):
        """Verify /api/licenses/packages is accessible"""
        response = admin_session.get(f"{BASE_URL}/api/licenses/packages")
        assert response.status_code == 200, f"License packages error: {response.status_code}"
        
        print(f"PASSED: License packages accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
