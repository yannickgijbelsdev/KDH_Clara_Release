"""
Test the public routes API endpoint for subdomain routing.
This endpoint is used by Cloudflare Worker and frontend subdomain detection.
No authentication required.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestPublicRoutesAPI:
    """Tests for GET /api/domains/routes/public endpoint"""
    
    def test_public_routes_no_auth_required(self):
        """Verify the endpoint works WITHOUT authentication"""
        response = requests.get(f"{BASE_URL}/api/domains/routes/public")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Public routes endpoint accessible without auth")
    
    def test_public_routes_response_structure(self):
        """Verify response includes base_domain, routes, site_domains, cache_ttl"""
        response = requests.get(f"{BASE_URL}/api/domains/routes/public")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "base_domain" in data, "Missing 'base_domain' field"
        assert "routes" in data, "Missing 'routes' field"
        assert "site_domains" in data, "Missing 'site_domains' field"
        assert "cache_ttl" in data, "Missing 'cache_ttl' field"
        
        # Verify types
        assert isinstance(data["base_domain"], str), "base_domain should be string"
        assert isinstance(data["routes"], list), "routes should be list"
        assert isinstance(data["site_domains"], list), "site_domains should be list"
        assert isinstance(data["cache_ttl"], int), "cache_ttl should be int"
        
        print(f"PASS: Response structure correct - base_domain={data['base_domain']}, routes={len(data['routes'])}, site_domains={len(data['site_domains'])}, cache_ttl={data['cache_ttl']}")
    
    def test_routes_have_required_fields(self):
        """Verify each route has subdomain, target_path, route_type, label"""
        response = requests.get(f"{BASE_URL}/api/domains/routes/public")
        assert response.status_code == 200
        data = response.json()
        
        routes = data.get("routes", [])
        if len(routes) == 0:
            pytest.skip("No routes configured - cannot verify route structure")
        
        for route in routes:
            assert "subdomain" in route, f"Route missing 'subdomain': {route}"
            assert "target_path" in route, f"Route missing 'target_path': {route}"
            assert "route_type" in route, f"Route missing 'route_type': {route}"
            assert "label" in route, f"Route missing 'label': {route}"
            
            # Verify types
            assert isinstance(route["subdomain"], str), "subdomain should be string"
            assert isinstance(route["target_path"], str), "target_path should be string"
            assert isinstance(route["route_type"], str), "route_type should be string"
            assert isinstance(route["label"], str), "label should be string"
        
        print(f"PASS: All {len(routes)} routes have required fields (subdomain, target_path, route_type, label)")
    
    def test_login_route_exists(self):
        """Verify login route is configured (per user requirement)"""
        response = requests.get(f"{BASE_URL}/api/domains/routes/public")
        assert response.status_code == 200
        data = response.json()
        
        routes = data.get("routes", [])
        login_route = next((r for r in routes if r.get("subdomain") == "login"), None)
        
        assert login_route is not None, "Login route not found in public routes"
        assert login_route.get("target_path") == "/login", f"Login route target_path should be '/login', got '{login_route.get('target_path')}'"
        assert login_route.get("route_type") == "auth", f"Login route type should be 'auth', got '{login_route.get('route_type')}'"
        
        print(f"PASS: Login route configured - subdomain=login, target_path=/login, route_type=auth")
    
    def test_clara_route_exists(self):
        """Verify clara (main app) route is configured"""
        response = requests.get(f"{BASE_URL}/api/domains/routes/public")
        assert response.status_code == 200
        data = response.json()
        
        routes = data.get("routes", [])
        clara_route = next((r for r in routes if r.get("subdomain") == "clara"), None)
        
        assert clara_route is not None, "Clara route not found in public routes"
        assert clara_route.get("target_path") == "/", f"Clara route target_path should be '/', got '{clara_route.get('target_path')}'"
        
        print(f"PASS: Clara route configured - subdomain=clara, target_path=/")
    
    def test_base_domain_is_koodh(self):
        """Verify base_domain is koodh.com"""
        response = requests.get(f"{BASE_URL}/api/domains/routes/public")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("base_domain") == "koodh.com", f"Expected base_domain='koodh.com', got '{data.get('base_domain')}'"
        print("PASS: base_domain is koodh.com")
    
    def test_cache_ttl_is_reasonable(self):
        """Verify cache_ttl is a reasonable value (60-600 seconds)"""
        response = requests.get(f"{BASE_URL}/api/domains/routes/public")
        assert response.status_code == 200
        data = response.json()
        
        cache_ttl = data.get("cache_ttl", 0)
        assert 60 <= cache_ttl <= 600, f"cache_ttl should be between 60-600 seconds, got {cache_ttl}"
        print(f"PASS: cache_ttl={cache_ttl} seconds (reasonable)")


class TestAuthenticatedRoutesEndpoint:
    """Tests for authenticated routes endpoint (for comparison)"""
    
    def test_authenticated_routes_requires_auth(self):
        """Verify /api/domains/routes requires authentication"""
        response = requests.get(f"{BASE_URL}/api/domains/routes")
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("PASS: Authenticated routes endpoint requires auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
