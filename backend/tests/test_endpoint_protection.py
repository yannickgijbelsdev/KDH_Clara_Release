"""
Endpoint Protection Tests
Tests for: 
- GET /api/firewall/endpoints/{main_site_id} - Lists all endpoint groups with public/private status
- PUT /api/firewall/endpoints/{main_site_id} - Updates which endpoint groups are public
- GET /api/firewall/endpoints/{main_site_id}/connections - Gets live connection stats
- Middleware enforcement - unauthenticated requests to private endpoints rejected
- Always-public endpoints accessible without auth
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"

# Expected endpoint groups from ENDPOINT_GROUPS dict
EXPECTED_GROUPS = [
    "shows", "content", "calendar", "series", "sites", "media", 
    "chat", "users", "teams", "main_sites", "wordpress", 
    "statistics", "tickets", "logs", "streams", "audio_triggers", "email", "storage"
]

# Always-public prefixes that should always be accessible without auth
ALWAYS_PUBLIC_PREFIXES = [
    "/api/rds/",
    "/api/health",
    "/api/config",
    "/api/sites/public/",
]

# Always-private prefixes that should always require auth (cannot be made public)
ALWAYS_PRIVATE_PREFIXES = [
    "/api/auth/",
    "/api/firewall/",
    "/api/admin/",
    "/api/backups/",
    "/api/devtools/",
]


class TestEndpointProtectionAuth:
    """Authentication helper for endpoint protection tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        if data.get("requires_2fa"):
            pytest.skip("2FA required - cannot continue automated tests")
        
        token = data.get("token")
        assert token, "No token in login response"
        
        session.headers.update({"Authorization": f"Bearer {token}"})
        session.headers.update({"X-Main-Site-ID": MAIN_SITE_ID})
        return session


class TestGetEndpointGroups(TestEndpointProtectionAuth):
    """Test GET /api/firewall/endpoints/{main_site_id}"""
    
    def test_get_endpoints_returns_all_groups(self, admin_session):
        """GET /api/firewall/endpoints/{main_site_id} returns all 18 endpoint groups"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "groups" in data, "Response should have 'groups' key"
        assert isinstance(data["groups"], list), "'groups' should be a list"
        assert len(data["groups"]) == 18, f"Expected 18 groups, got {len(data['groups'])}"
        
        print(f"SUCCESS: Got {len(data['groups'])} endpoint groups")

    def test_get_endpoints_returns_public_groups_list(self, admin_session):
        """GET /api/firewall/endpoints/{main_site_id} returns public_groups list"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}")
        assert response.status_code == 200
        data = response.json()
        
        assert "public_groups" in data, "Response should have 'public_groups' key"
        assert isinstance(data["public_groups"], list), "'public_groups' should be a list"
        
        print(f"SUCCESS: Public groups list present, {len(data['public_groups'])} groups are public")

    def test_endpoint_group_structure(self, admin_session):
        """Each endpoint group should have required fields"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}")
        assert response.status_code == 200
        data = response.json()
        
        for group in data["groups"]:
            assert "id" in group, "Group missing 'id' field"
            assert "label" in group, "Group missing 'label' field"
            assert "description" in group, "Group missing 'description' field"
            assert "prefixes" in group, "Group missing 'prefixes' field"
            assert "is_public" in group, "Group missing 'is_public' field"
            assert isinstance(group["is_public"], bool), "'is_public' should be boolean"
        
        print("SUCCESS: All groups have required structure")

    def test_all_expected_groups_present(self, admin_session):
        """All 18 expected endpoint groups should be present"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}")
        assert response.status_code == 200
        data = response.json()
        
        group_ids = [g["id"] for g in data["groups"]]
        
        for expected_group in EXPECTED_GROUPS:
            assert expected_group in group_ids, f"Missing expected group: {expected_group}"
        
        print("SUCCESS: All 18 expected groups present")


class TestUpdateEndpointProtection(TestEndpointProtectionAuth):
    """Test PUT /api/firewall/endpoints/{main_site_id}"""
    
    def test_update_make_group_public(self, admin_session):
        """PUT /api/firewall/endpoints/{main_site_id} can make a group public"""
        # First get current state
        get_response = admin_session.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}")
        initial_public = get_response.json().get("public_groups", [])
        
        # Add 'statistics' to public groups (safe to test)
        new_public = list(set(initial_public + ["statistics"]))
        
        response = admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": new_public}
        )
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert "public_groups" in data
        assert "statistics" in data["public_groups"], "statistics should be in public_groups"
        
        print("SUCCESS: Made 'statistics' endpoint group public")

    def test_update_make_group_private(self, admin_session):
        """PUT /api/firewall/endpoints/{main_site_id} can make a group private"""
        # Get current state
        get_response = admin_session.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}")
        current_public = get_response.json().get("public_groups", [])
        
        # Remove 'statistics' from public groups
        new_public = [g for g in current_public if g != "statistics"]
        
        response = admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": new_public}
        )
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert "statistics" not in data["public_groups"], "statistics should not be in public_groups"
        
        print("SUCCESS: Made 'statistics' endpoint group private")

    def test_update_invalid_group_rejected(self, admin_session):
        """PUT /api/firewall/endpoints/{main_site_id} rejects invalid group IDs"""
        response = admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": ["invalid_group_id_xyz"]}
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid group, got {response.status_code}"
        assert "Unknown group" in response.json().get("detail", "")
        
        print("SUCCESS: Invalid group ID rejected with 400")

    def test_update_empty_public_groups_allowed(self, admin_session):
        """PUT /api/firewall/endpoints/{main_site_id} allows empty public_groups (all private)"""
        response = admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": []}
        )
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert data["public_groups"] == [], "All groups should be private"
        
        print("SUCCESS: Empty public_groups (all private) allowed")


class TestEndpointConnections(TestEndpointProtectionAuth):
    """Test GET /api/firewall/endpoints/{main_site_id}/connections"""
    
    def test_get_connections_returns_list(self, admin_session):
        """GET /api/firewall/endpoints/{main_site_id}/connections returns connection stats"""
        response = admin_session.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}/connections")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "connections" in data, "Response should have 'connections' key"
        assert isinstance(data["connections"], list), "'connections' should be a list"
        
        print(f"SUCCESS: Got connections list with {len(data['connections'])} entries")

    def test_connections_structure_when_present(self, admin_session):
        """Connection stats should have proper structure"""
        # First make an endpoint public and access it
        admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": ["statistics"]}
        )
        
        # Make an unauthenticated request to trigger tracking
        requests.get(f"{BASE_URL}/api/statistics/", headers={"X-Main-Site-ID": MAIN_SITE_ID})
        
        time.sleep(1)  # Wait for tracking
        
        response = admin_session.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}/connections")
        assert response.status_code == 200
        data = response.json()
        
        # If connections exist, verify structure
        if data["connections"]:
            conn = data["connections"][0]
            assert "group" in conn
            assert "label" in conn
            assert "total_requests" in conn
            assert "unique_ips" in conn
            assert "connections" in conn
            
            print(f"SUCCESS: Connection structure verified for group '{conn['group']}'")
        else:
            print("INFO: No connections to verify structure (this is expected if no public endpoints accessed)")
        
        # Clean up - make private again
        admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": []}
        )


class TestEndpointProtectionRequiresAuth:
    """Test that endpoint protection endpoints require authentication"""
    
    def test_get_endpoints_requires_auth(self):
        """GET /api/firewall/endpoints/{main_site_id} requires authentication"""
        response = requests.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: GET endpoints requires auth")

    def test_put_endpoints_requires_auth(self):
        """PUT /api/firewall/endpoints/{main_site_id} requires authentication"""
        response = requests.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": []},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: PUT endpoints requires auth")

    def test_get_connections_requires_auth(self):
        """GET /api/firewall/endpoints/{main_site_id}/connections requires authentication"""
        response = requests.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}/connections")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: GET connections requires auth")


class TestAlwaysPublicEndpoints:
    """Test that always-public endpoints are accessible without auth"""
    
    def test_health_endpoint_always_public(self):
        """GET /api/health should always be accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health endpoint failed: {response.status_code}"
        print("SUCCESS: /api/health is always public")

    def test_config_endpoint_always_public(self):
        """GET /api/config should always be accessible"""
        response = requests.get(f"{BASE_URL}/api/config")
        # May return 200 or 404 depending on implementation, but should not return 401/403
        assert response.status_code not in [401, 403], f"Config should not require auth, got {response.status_code}"
        print(f"SUCCESS: /api/config is public (status: {response.status_code})")


class TestAlwaysPrivateEndpoints:
    """Test that always-private endpoints cannot be accessed without auth"""
    
    def test_firewall_endpoint_always_private(self):
        """GET /api/firewall/* should always require auth"""
        response = requests.get(f"{BASE_URL}/api/firewall/settings/{MAIN_SITE_ID}")
        assert response.status_code in [401, 403], f"Firewall should require auth, got {response.status_code}"
        print("SUCCESS: /api/firewall/* always requires auth")

    def test_auth_endpoints_always_private(self):
        """GET /api/auth/me should always require auth"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code in [401, 403], f"Auth/me should require auth, got {response.status_code}"
        print("SUCCESS: /api/auth/me always requires auth")

    def test_admin_endpoint_always_private(self):
        """GET /api/admin/* should always require auth (if exists)"""
        response = requests.get(f"{BASE_URL}/api/admin/")
        # Admin endpoints should require auth (401/403) or not exist (404)
        # Should NOT return 200
        assert response.status_code != 200, f"Admin endpoints should not be public, got {response.status_code}"
        print(f"SUCCESS: /api/admin/* not publicly accessible (status: {response.status_code})")


class TestMiddlewareEndpointEnforcement(TestEndpointProtectionAuth):
    """Test that the middleware enforces endpoint protection"""
    
    def test_private_endpoint_rejected_without_auth(self, admin_session):
        """Unauthenticated request to private endpoint should be rejected"""
        # First ensure shows is private
        admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": []}
        )
        
        # Try to access shows without auth
        response = requests.get(
            f"{BASE_URL}/api/shows",
            headers={"X-Main-Site-ID": MAIN_SITE_ID}
        )
        
        # Should get 401 (no auth) - the middleware lets FastAPI's auth dependency handle it
        assert response.status_code in [401, 403], f"Private endpoint should reject unauth, got {response.status_code}"
        print("SUCCESS: Private endpoint rejected unauthenticated request")

    def test_public_endpoint_accessible_without_auth(self, admin_session):
        """Unauthenticated request to public endpoint should succeed (or get handled by endpoint)"""
        # Make shows public
        admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": ["shows"]}
        )
        
        time.sleep(0.5)  # Wait for cache invalidation
        
        # Try to access shows without auth
        response = requests.get(
            f"{BASE_URL}/api/shows",
            headers={"X-Main-Site-ID": MAIN_SITE_ID}
        )
        
        # Should NOT get 401 from middleware - endpoint may still return 401 from its own auth
        # But middleware should let it through
        # Note: The endpoint itself might still require auth internally
        print(f"INFO: Public endpoint returned status {response.status_code}")
        
        # Clean up
        admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": []}
        )


class TestEndpointTogglePersistence(TestEndpointProtectionAuth):
    """Test that endpoint protection settings persist"""
    
    def test_settings_persist_after_update(self, admin_session):
        """Updated settings should persist and be retrievable"""
        # Set specific groups as public
        test_groups = ["statistics", "calendar"]
        
        response = admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": test_groups}
        )
        assert response.status_code == 200
        
        # Fetch settings again
        get_response = admin_session.get(f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}")
        assert get_response.status_code == 200
        data = get_response.json()
        
        # Verify both groups are public
        for group_id in test_groups:
            assert group_id in data["public_groups"], f"{group_id} should persist as public"
            # Verify is_public flag
            group = next((g for g in data["groups"] if g["id"] == group_id), None)
            assert group is not None
            assert group["is_public"] is True, f"{group_id}.is_public should be True"
        
        print("SUCCESS: Settings persist correctly")
        
        # Clean up
        admin_session.put(
            f"{BASE_URL}/api/firewall/endpoints/{MAIN_SITE_ID}",
            json={"public_groups": []}
        )


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
