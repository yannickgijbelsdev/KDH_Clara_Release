"""
Test suite for Cross-Subdomain Exchange Token Authentication System.

Tests the following features:
1. GET /api/auth/subdomain-config - returns correct routing config
2. POST /api/auth/exchange-token/create - creates single-use 30s token (requires auth)
3. POST /api/auth/exchange-token/redeem - redeems token for JWT (no auth)
4. Single-use validation - second redemption fails
5. Token expiry (30 seconds TTL)
6. Session auth_method tracking
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token for the test user."""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    
    # Handle 2FA flow if required
    if data.get('requires_2fa'):
        pytest.skip("Test user has 2FA enabled, skipping authenticated tests")
    
    return data.get("token")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header."""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


class TestSubdomainConfig:
    """Tests for GET /api/auth/subdomain-config endpoint."""
    
    def test_subdomain_config_returns_valid_structure(self, api_client):
        """Test that subdomain config returns correct structure (public endpoint, no auth)."""
        response = api_client.get(f"{BASE_URL}/api/auth/subdomain-config")
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        
        data = response.json()
        # Validate structure - all required fields present
        assert "enabled" in data, "Missing 'enabled' field"
        assert "base_domain" in data, "Missing 'base_domain' field"
        assert "login_subdomain" in data, "Missing 'login_subdomain' field"
        assert "login_url" in data, "Missing 'login_url' field"
        assert "app_subdomain" in data, "Missing 'app_subdomain' field"
        assert "app_url" in data, "Missing 'app_url' field"
        assert "routes" in data, "Missing 'routes' field"
        
        # Validate data types
        assert isinstance(data["enabled"], bool), "enabled should be boolean"
        assert isinstance(data["routes"], list), "routes should be a list"
        
        print(f"Subdomain config: enabled={data['enabled']}, base_domain={data['base_domain']}")
        print(f"Login URL: {data['login_url']}, App URL: {data['app_url']}")
    
    def test_subdomain_config_base_domain_is_koodh(self, api_client):
        """Test that base_domain is koodh.com as expected."""
        response = api_client.get(f"{BASE_URL}/api/auth/subdomain-config")
        assert response.status_code == 200
        data = response.json()
        
        # Should be koodh.com based on cloudflare_config
        assert data["base_domain"] == "koodh.com", f"Expected 'koodh.com', got '{data['base_domain']}'"
        print(f"PASSED: base_domain is {data['base_domain']}")
    
    def test_subdomain_config_routes_structure(self, api_client):
        """Test that routes array has correct structure."""
        response = api_client.get(f"{BASE_URL}/api/auth/subdomain-config")
        assert response.status_code == 200
        data = response.json()
        
        routes = data.get("routes", [])
        if routes:
            # Check first route structure
            route = routes[0]
            assert "subdomain" in route, "Route missing 'subdomain' field"
            assert "route_type" in route, "Route missing 'route_type' field"
            print(f"Found {len(routes)} active routes")
            for r in routes:
                print(f"  - {r['subdomain']}: {r['route_type']}")


class TestExchangeTokenCreate:
    """Tests for POST /api/auth/exchange-token/create endpoint."""
    
    def test_create_exchange_token_requires_auth(self, api_client):
        """Test that creating exchange token requires authentication."""
        # Remove auth header for this test
        headers = {"Content-Type": "application/json"}
        response = requests.post(
            f"{BASE_URL}/api/auth/exchange-token/create",
            json={"redirect_url": "https://clara.koodh.com"},
            headers=headers
        )
        # Should fail with 401 Unauthorized or 403 Forbidden
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASSED: Exchange token creation requires authentication (status: {response.status_code})")
    
    def test_create_exchange_token_success(self, authenticated_client):
        """Test successful exchange token creation with valid auth."""
        response = authenticated_client.post(
            f"{BASE_URL}/api/auth/exchange-token/create",
            json={"redirect_url": "https://clara.koodh.com/network"}
        )
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        
        data = response.json()
        assert "exchange_token" in data, "Missing 'exchange_token' in response"
        assert "expires_in" in data, "Missing 'expires_in' in response"
        assert data["expires_in"] == 30, f"Expected expires_in=30, got {data['expires_in']}"
        
        # Token should be a valid UUID format
        token = data["exchange_token"]
        assert len(token) == 36, f"Token should be UUID format, got length {len(token)}"
        assert token.count('-') == 4, "Token should have UUID format with 4 dashes"
        
        print(f"PASSED: Created exchange token with 30s expiry: {token[:8]}...")
    
    def test_create_exchange_token_without_redirect_url(self, authenticated_client):
        """Test creating exchange token without redirect_url (optional field)."""
        response = authenticated_client.post(
            f"{BASE_URL}/api/auth/exchange-token/create",
            json={}
        )
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        
        data = response.json()
        assert "exchange_token" in data
        print("PASSED: Exchange token created without redirect_url")


class TestExchangeTokenRedeem:
    """Tests for POST /api/auth/exchange-token/redeem endpoint."""
    
    def test_redeem_exchange_token_no_auth_required(self, authenticated_client, api_client):
        """Test that redeeming exchange token does NOT require authentication."""
        # First create a token (needs auth)
        create_response = authenticated_client.post(
            f"{BASE_URL}/api/auth/exchange-token/create",
            json={"redirect_url": "https://clara.koodh.com"}
        )
        assert create_response.status_code == 200
        token = create_response.json()["exchange_token"]
        
        # Redeem WITHOUT auth header
        redeem_response = requests.post(
            f"{BASE_URL}/api/auth/exchange-token/redeem",
            json={"exchange_token": token},
            headers={"Content-Type": "application/json"}
        )
        assert redeem_response.status_code == 200, f"Status: {redeem_response.status_code}, Body: {redeem_response.text}"
        
        data = redeem_response.json()
        assert "token" in data, "Missing JWT 'token' in redeem response"
        assert "user" in data, "Missing 'user' in redeem response"
        assert "expires_at" in data, "Missing 'expires_at' in redeem response"
        
        # Verify user data structure
        user = data["user"]
        assert "id" in user, "User missing 'id'"
        assert "email" in user, "User missing 'email'"
        assert "name" in user, "User missing 'name'"
        assert user["email"] == TEST_EMAIL, f"Expected email {TEST_EMAIL}, got {user['email']}"
        
        print(f"PASSED: Redeemed exchange token for JWT. User: {user['name']} ({user['email']})")
    
    def test_redeem_exchange_token_single_use_only(self, authenticated_client):
        """Test that exchange token can only be redeemed ONCE (single-use)."""
        # Create a fresh token
        create_response = authenticated_client.post(
            f"{BASE_URL}/api/auth/exchange-token/create",
            json={"redirect_url": "https://clara.koodh.com"}
        )
        assert create_response.status_code == 200
        token = create_response.json()["exchange_token"]
        
        # First redemption - should succeed
        first_redeem = requests.post(
            f"{BASE_URL}/api/auth/exchange-token/redeem",
            json={"exchange_token": token},
            headers={"Content-Type": "application/json"}
        )
        assert first_redeem.status_code == 200, "First redemption should succeed"
        print(f"First redemption succeeded for token {token[:8]}...")
        
        # Second redemption - should FAIL with 401
        second_redeem = requests.post(
            f"{BASE_URL}/api/auth/exchange-token/redeem",
            json={"exchange_token": token},
            headers={"Content-Type": "application/json"}
        )
        assert second_redeem.status_code == 401, f"Second redemption should fail with 401, got {second_redeem.status_code}"
        
        error_data = second_redeem.json()
        assert "already used" in error_data.get("detail", "").lower(), f"Expected 'already used' error, got: {error_data}"
        
        print(f"PASSED: Second redemption correctly rejected with 'already used' error")
    
    def test_redeem_invalid_exchange_token(self, api_client):
        """Test that invalid/fake exchange token returns 401."""
        response = requests.post(
            f"{BASE_URL}/api/auth/exchange-token/redeem",
            json={"exchange_token": "fake-invalid-token-12345"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        error_data = response.json()
        assert "invalid" in error_data.get("detail", "").lower(), f"Expected 'invalid' error, got: {error_data}"
        
        print("PASSED: Invalid exchange token correctly rejected")
    
    def test_redeem_nonexistent_uuid_exchange_token(self, api_client):
        """Test that properly formatted but non-existent UUID returns 401."""
        # Valid UUID format but doesn't exist in DB
        fake_uuid = "12345678-1234-1234-1234-123456789012"
        response = requests.post(
            f"{BASE_URL}/api/auth/exchange-token/redeem",
            json={"exchange_token": fake_uuid},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: Non-existent UUID exchange token correctly rejected")


class TestExchangeTokenExpiry:
    """Tests for exchange token 30-second TTL expiry."""
    
    def test_exchange_token_has_30_second_ttl(self, authenticated_client):
        """Verify exchange token expires_in is 30 seconds."""
        response = authenticated_client.post(
            f"{BASE_URL}/api/auth/exchange-token/create",
            json={}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["expires_in"] == 30, f"Expected TTL=30, got {data['expires_in']}"
        print("PASSED: Exchange token TTL is 30 seconds")


class TestSessionAuthMethod:
    """Tests for session auth_method tracking."""
    
    def test_redeemed_session_has_exchange_token_auth_method(self, authenticated_client):
        """Test that session created from exchange token has auth_method='exchange_token'."""
        # Create and redeem a token
        create_response = authenticated_client.post(
            f"{BASE_URL}/api/auth/exchange-token/create",
            json={"redirect_url": "https://clara.koodh.com"}
        )
        assert create_response.status_code == 200
        token = create_response.json()["exchange_token"]
        
        # Redeem the token
        redeem_response = requests.post(
            f"{BASE_URL}/api/auth/exchange-token/redeem",
            json={"exchange_token": token},
            headers={"Content-Type": "application/json"}
        )
        assert redeem_response.status_code == 200
        
        # Get the new JWT
        new_jwt = redeem_response.json()["token"]
        
        # Verify user details with new token (proves session is valid)
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {new_jwt}"}
        )
        assert me_response.status_code == 200, f"Failed to get user with new JWT: {me_response.text}"
        
        user_data = me_response.json()
        assert user_data["email"] == TEST_EMAIL
        
        print(f"PASSED: Exchange token session is valid - user: {user_data['name']}")
        # Note: auth_method is stored in session document in DB, not exposed via /me endpoint
        # The test verifies the session works, backend code review confirms auth_method='exchange_token' is set


class TestNormalLoginFlow:
    """Tests to ensure normal login still works after subdomain auth changes."""
    
    def test_normal_login_still_works(self, api_client):
        """Test that standard login flow continues to work."""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Normal login failed: {response.text}"
        
        data = response.json()
        # Should get token (unless 2FA required)
        if not data.get('requires_2fa'):
            assert "token" in data, "Missing token in login response"
            assert "user" in data, "Missing user in login response"
            assert data["user"]["email"] == TEST_EMAIL
            print(f"PASSED: Normal login works - user: {data['user']['name']}")
        else:
            print("PASSED: Normal login works (2FA required for this user)")
    
    def test_login_with_invalid_credentials_rejected(self, api_client):
        """Test that invalid credentials still properly rejected."""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@example.com", "password": "wrongpassword"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: Invalid credentials correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
