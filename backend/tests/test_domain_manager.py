"""
Domain Manager API Tests
Tests domain configurations, subdomain routing, and Cloudflare config endpoints.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for system admin user."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def headers(auth_token):
    """Create headers with auth token."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestDomainOverview:
    """Tests for GET /api/domains/overview endpoint."""
    
    def test_get_overview_returns_200(self, headers):
        """Overview endpoint returns 200 and correct stats structure."""
        response = requests.get(f"{BASE_URL}/api/domains/overview", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify required fields
        assert "total_sites" in data
        assert "configured_domains" in data
        assert "unconfigured" in data
        assert "koodh_domains" in data
        assert "custom_domains" in data
        assert "verified" in data
        assert "pending_verification" in data
        assert "active_routes" in data
        assert "total_routes" in data
        assert "cloudflare_configured" in data
        assert "base_domain" in data
        
        print(f"Domain overview stats: total_sites={data['total_sites']}, configured={data['configured_domains']}, koodh={data['koodh_domains']}, custom={data['custom_domains']}")
        
    def test_overview_unconfigured_count_matches(self, headers):
        """Verify unconfigured count = total_sites - configured_domains."""
        response = requests.get(f"{BASE_URL}/api/domains/overview", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["unconfigured"] == data["total_sites"] - data["configured_domains"], \
            f"Unconfigured count mismatch: {data['unconfigured']} != {data['total_sites']} - {data['configured_domains']}"


class TestDomainConfigs:
    """Tests for domain configuration endpoints."""
    
    def test_get_configs_returns_200(self, headers):
        """GET /api/domains/configs returns list of domain configs."""
        response = requests.get(f"{BASE_URL}/api/domains/configs", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} domain configs")
        
        # Check structure of first config if exists
        if len(data) > 0:
            config = data[0]
            assert "main_site_id" in config
            assert "domain_type" in config
            assert "site_name" in config
            print(f"First config: site={config['site_name']}, type={config['domain_type']}, domain={config.get('full_domain', config.get('subdomain'))}")
    
    def test_get_config_by_site_id(self, headers):
        """GET /api/domains/configs/{main_site_id} returns config for specific site."""
        # First get list to find a configured site
        response = requests.get(f"{BASE_URL}/api/domains/configs", headers=headers)
        assert response.status_code == 200
        
        configs = response.json()
        if len(configs) > 0:
            site_id = configs[0]["main_site_id"]
            response = requests.get(f"{BASE_URL}/api/domains/configs/{site_id}", headers=headers)
            assert response.status_code == 200
            
            config = response.json()
            assert config["main_site_id"] == site_id
            print(f"Retrieved config for site {site_id}: {config.get('full_domain')}")
        else:
            # Test unconfigured site returns empty config
            # Get a main site that doesn't have config
            sites_response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
            if sites_response.status_code == 200:
                sites = sites_response.json()
                if len(sites) > 0:
                    site_id = sites[0]["id"]
                    response = requests.get(f"{BASE_URL}/api/domains/configs/{site_id}", headers=headers)
                    assert response.status_code == 200
                    config = response.json()
                    assert config.get("configured") == False or config.get("domain_type") == "none"
                    print(f"Unconfigured site returns: {config}")
    
    def test_create_koodh_domain_config(self, headers):
        """POST /api/domains/configs creates koodh.com domain config."""
        # First get a main site to configure
        sites_response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
        assert sites_response.status_code == 200
        sites = sites_response.json()
        
        # Find a site without existing domain config for test
        configs_response = requests.get(f"{BASE_URL}/api/domains/configs", headers=headers)
        configs = configs_response.json()
        configured_site_ids = [c["main_site_id"] for c in configs]
        
        unconfigured_sites = [s for s in sites if s["id"] not in configured_site_ids]
        
        if len(unconfigured_sites) > 0:
            test_site = unconfigured_sites[0]
            test_subdomain = f"test-{test_site['slug'][:10]}"
            
            # Create koodh domain config
            response = requests.post(f"{BASE_URL}/api/domains/configs", headers=headers, json={
                "main_site_id": test_site["id"],
                "domain_type": "koodh",
                "subdomain": test_subdomain
            })
            
            # Accept 200 or 201 for creation
            assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
            
            data = response.json()
            assert data["domain_type"] == "koodh"
            assert data["subdomain"] == test_subdomain
            assert data["verification_status"] == "verified"  # koodh domains auto-verified
            assert data["ssl_enabled"] == True
            print(f"Created koodh domain: {data['full_domain']}, verified={data['verification_status']}")
            
            # Cleanup - delete the test config
            delete_response = requests.delete(f"{BASE_URL}/api/domains/configs/{test_site['id']}", headers=headers)
            assert delete_response.status_code in [200, 204]
            print(f"Cleaned up test domain config")
        else:
            print("No unconfigured sites available for test - skipping create test")
            pytest.skip("No unconfigured sites available")
    
    def test_delete_domain_config(self, headers):
        """DELETE /api/domains/configs/{main_site_id} removes config."""
        # Get sites and create a temp config to delete
        sites_response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
        assert sites_response.status_code == 200
        sites = sites_response.json()
        
        configs_response = requests.get(f"{BASE_URL}/api/domains/configs", headers=headers)
        configs = configs_response.json()
        configured_site_ids = [c["main_site_id"] for c in configs]
        
        unconfigured_sites = [s for s in sites if s["id"] not in configured_site_ids]
        
        if len(unconfigured_sites) > 0:
            test_site = unconfigured_sites[0]
            
            # Create temp config
            create_response = requests.post(f"{BASE_URL}/api/domains/configs", headers=headers, json={
                "main_site_id": test_site["id"],
                "domain_type": "koodh",
                "subdomain": f"temp-del-{test_site['slug'][:8]}"
            })
            assert create_response.status_code in [200, 201]
            
            # Delete it
            delete_response = requests.delete(f"{BASE_URL}/api/domains/configs/{test_site['id']}", headers=headers)
            assert delete_response.status_code in [200, 204], f"Expected 200/204, got {delete_response.status_code}: {delete_response.text}"
            
            # Verify deleted
            get_response = requests.get(f"{BASE_URL}/api/domains/configs/{test_site['id']}", headers=headers)
            config = get_response.json()
            assert config.get("configured") == False or config.get("domain_type") == "none"
            print(f"Successfully deleted domain config for site {test_site['id']}")
        else:
            pytest.skip("No unconfigured sites available")


class TestSubdomainRoutes:
    """Tests for subdomain routing endpoints."""
    
    def test_get_routes_returns_200(self, headers):
        """GET /api/domains/routes returns list of subdomain routes."""
        response = requests.get(f"{BASE_URL}/api/domains/routes", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} subdomain routes")
        
        # Check for system routes (clara, login, global)
        subdomains = [r["subdomain"] for r in data]
        expected_system_routes = ["clara", "login", "global"]
        for expected in expected_system_routes:
            assert expected in subdomains, f"Expected system route '{expected}' not found"
        print(f"System routes present: {expected_system_routes}")
    
    def test_routes_have_required_fields(self, headers):
        """Verify routes have required fields."""
        response = requests.get(f"{BASE_URL}/api/domains/routes", headers=headers)
        assert response.status_code == 200
        
        routes = response.json()
        for route in routes:
            assert "id" in route
            assert "subdomain" in route
            assert "label" in route
            assert "route_type" in route
            assert "target_path" in route
            assert "is_active" in route
            assert "is_system" in route
        
        # Print route details
        for r in routes:
            print(f"Route: {r['subdomain']}.koodh.com -> {r['target_path']} ({r['route_type']}, active={r['is_active']}, system={r['is_system']})")
    
    def test_update_route_toggle_active(self, headers):
        """PUT /api/domains/routes/{id} can toggle active status."""
        response = requests.get(f"{BASE_URL}/api/domains/routes", headers=headers)
        assert response.status_code == 200
        routes = response.json()
        
        # Find the 'login' route which is system and initially inactive
        login_route = next((r for r in routes if r["subdomain"] == "login"), None)
        assert login_route is not None, "Login route not found"
        
        original_active = login_route["is_active"]
        
        # Toggle it
        update_response = requests.put(f"{BASE_URL}/api/domains/routes/{login_route['id']}", headers=headers, json={
            "is_active": not original_active
        })
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        # Verify changed
        verify_response = requests.get(f"{BASE_URL}/api/domains/routes", headers=headers)
        updated_routes = verify_response.json()
        updated_login = next((r for r in updated_routes if r["subdomain"] == "login"), None)
        assert updated_login["is_active"] == (not original_active), "Active status not toggled"
        
        print(f"Toggled login route active: {original_active} -> {not original_active}")
        
        # Restore original state
        requests.put(f"{BASE_URL}/api/domains/routes/{login_route['id']}", headers=headers, json={
            "is_active": original_active
        })
        print(f"Restored login route to original state: {original_active}")
    
    def test_create_custom_route(self, headers):
        """POST /api/domains/routes creates new custom route."""
        # Create a test route
        test_subdomain = "test-api-route"
        
        # First check if it already exists and delete it
        routes_response = requests.get(f"{BASE_URL}/api/domains/routes", headers=headers)
        routes = routes_response.json()
        existing = next((r for r in routes if r["subdomain"] == test_subdomain), None)
        if existing:
            requests.delete(f"{BASE_URL}/api/domains/routes/{existing['id']}", headers=headers)
        
        # Create new route
        response = requests.post(f"{BASE_URL}/api/domains/routes", headers=headers, json={
            "subdomain": test_subdomain,
            "label": "Test API Route",
            "description": "Created by automated test",
            "route_type": "app",
            "target_path": "/test-path",
            "is_active": False
        })
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["subdomain"] == test_subdomain
        assert data["is_system"] == False  # Custom routes are not system routes
        print(f"Created custom route: {data['subdomain']}.koodh.com -> {data['target_path']}")
        
        # Cleanup - delete the test route
        delete_response = requests.delete(f"{BASE_URL}/api/domains/routes/{data['id']}", headers=headers)
        assert delete_response.status_code in [200, 204]
        print(f"Cleaned up test route")
    
    def test_cannot_delete_system_route(self, headers):
        """DELETE system routes should fail."""
        response = requests.get(f"{BASE_URL}/api/domains/routes", headers=headers)
        routes = response.json()
        
        # Find a system route
        system_route = next((r for r in routes if r["is_system"]), None)
        assert system_route is not None, "No system route found"
        
        # Try to delete it
        delete_response = requests.delete(f"{BASE_URL}/api/domains/routes/{system_route['id']}", headers=headers)
        assert delete_response.status_code == 400, f"Expected 400 for system route deletion, got {delete_response.status_code}"
        print(f"Correctly prevented deletion of system route '{system_route['subdomain']}'")


class TestCloudflareConfig:
    """Tests for Cloudflare configuration endpoints."""
    
    def test_get_cloudflare_config(self, headers):
        """GET /api/domains/cloudflare/config returns config status."""
        response = requests.get(f"{BASE_URL}/api/domains/cloudflare/config", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "configured" in data
        assert "api_token_set" in data
        assert "zone_id" in data
        assert "base_domain" in data
        
        print(f"Cloudflare config: configured={data['configured']}, zone_id={data['zone_id']}, base_domain={data['base_domain']}")
    
    def test_update_cloudflare_config(self, headers):
        """PUT /api/domains/cloudflare/config saves credentials."""
        # Get current config
        get_response = requests.get(f"{BASE_URL}/api/domains/cloudflare/config", headers=headers)
        current_config = get_response.json()
        
        # Update with test values
        response = requests.put(f"{BASE_URL}/api/domains/cloudflare/config", headers=headers, json={
            "zone_id": "test-zone-id-12345",
            "base_domain": "koodh.com"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify updated
        verify_response = requests.get(f"{BASE_URL}/api/domains/cloudflare/config", headers=headers)
        updated = verify_response.json()
        assert updated["zone_id"] == "test-zone-id-12345"
        print(f"Successfully updated Cloudflare zone_id")
        
        # Restore original zone_id if it existed
        if current_config.get("zone_id"):
            requests.put(f"{BASE_URL}/api/domains/cloudflare/config", headers=headers, json={
                "zone_id": current_config["zone_id"]
            })
            print(f"Restored original zone_id: {current_config['zone_id']}")


class TestDomainConfigVerification:
    """Tests for domain verification endpoint."""
    
    def test_verify_custom_domain_endpoint_exists(self, headers):
        """POST /api/domains/configs/{main_site_id}/verify endpoint exists."""
        # Get a configured custom domain to test verify endpoint
        response = requests.get(f"{BASE_URL}/api/domains/configs", headers=headers)
        configs = response.json()
        
        custom_config = next((c for c in configs if c["domain_type"] == "custom"), None)
        
        if custom_config:
            # Call verify endpoint - it may fail DNS check but endpoint should work
            verify_response = requests.post(
                f"{BASE_URL}/api/domains/configs/{custom_config['main_site_id']}/verify", 
                headers=headers
            )
            # Endpoint should return 200 even if verification fails (returns verification result)
            assert verify_response.status_code == 200, f"Expected 200, got {verify_response.status_code}: {verify_response.text}"
            
            data = verify_response.json()
            assert "verified" in data
            assert "verify_domain" in data
            assert "expected_target" in data
            print(f"Verify endpoint works: verified={data['verified']}, verify_domain={data['verify_domain']}")
        else:
            print("No custom domain config found - skipping verification test")
            pytest.skip("No custom domain to verify")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
