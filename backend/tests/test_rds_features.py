"""
RDS Features Test Suite
Tests RDS settings, endpoints, cached-rundown, live endpoints, and logs API
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPublicRDSEndpoints:
    """Test public RDS endpoints (no authentication required)"""
    
    def test_rds_live_endpoint_returns_plain_text(self):
        """Test GET /api/rds/live returns plain text"""
        response = requests.get(f"{BASE_URL}/api/rds/live")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        # Should return text/plain content type
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"
        print(f"Live endpoint response: '{response.text}'")
        
    def test_rds_live_txt_endpoint_returns_plain_text(self):
        """Test GET /api/rds/live.txt returns plain text"""
        response = requests.get(f"{BASE_URL}/api/rds/live.txt")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"
        print(f"Live.txt endpoint response: '{response.text}'")
    
    def test_rds_cached_rundown_public_access(self):
        """Test GET /api/rds/cached-rundown is accessible without auth"""
        response = requests.get(f"{BASE_URL}/api/rds/cached-rundown")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should have 'status' field"
        # Status can be 'success' or 'no_live_show'
        assert data["status"] in ["success", "no_live_show"], \
            f"Unexpected status: {data['status']}"
        
        # Verify response structure
        if data["status"] == "no_live_show":
            assert "message" in data, "no_live_show response should have 'message'"
            assert data["show"] is None, "no_live_show should have show=None"
            assert data["items"] == [], "no_live_show should have items=[]"
            print(f"Cached rundown: No live show - {data.get('message', '')}")
        else:
            assert "show" in data, "success response should have 'show' object"
            assert "items" in data, "success response should have 'items' list"
            assert "cached_at" in data, "success response should have 'cached_at'"
            print(f"Cached rundown: Show '{data['show'].get('title', 'N/A')}' with {len(data['items'])} items")


class TestAuthenticatedRDSEndpoints:
    """Test RDS endpoints that require admin authentication"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication token and return headers"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "yannick.gijbels@koodh.com", "password": "password123"}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        
        token = login_response.json().get("token")
        if not token:
            pytest.skip("No token received")
        
        return {"Authorization": f"Bearer {token}"}
    
    def test_rds_settings_returns_correct_structure(self, auth_headers):
        """Test GET /api/rds/settings returns correct settings structure"""
        response = requests.get(
            f"{BASE_URL}/api/rds/settings",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify required fields
        assert "id" in data, "Settings should have 'id'"
        assert "team_id" in data, "Settings should have 'team_id'"
        assert "production_base_url" in data, "Settings should have 'production_base_url'"
        assert "cache_refresh_interval" in data, "Settings should have 'cache_refresh_interval'"
        assert "created_at" in data, "Settings should have 'created_at'"
        assert "updated_at" in data, "Settings should have 'updated_at'"
        
        # Verify production_base_url is present (main feature requirement)
        assert data["production_base_url"], "production_base_url should not be empty"
        print(f"RDS Settings: base_url={data['production_base_url']}, interval={data['cache_refresh_interval']}min")
        
    def test_rds_settings_requires_auth(self):
        """Test GET /api/rds/settings returns 401/403 without auth"""
        response = requests.get(f"{BASE_URL}/api/rds/settings")
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
    
    def test_rds_endpoints_returns_api_list(self, auth_headers):
        """Test GET /api/rds/endpoints returns list of available API endpoints"""
        response = requests.get(
            f"{BASE_URL}/api/rds/endpoints",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "base_url" in data, "Response should have 'base_url'"
        assert "endpoints" in data, "Response should have 'endpoints' list"
        assert isinstance(data["endpoints"], list), "endpoints should be a list"
        assert len(data["endpoints"]) > 0, "Should have at least one endpoint"
        
        # Check endpoint structure
        endpoint = data["endpoints"][0]
        required_fields = ["name", "description", "path", "full_url", "method", "auth_required", "response_type"]
        for field in required_fields:
            assert field in endpoint, f"Endpoint should have '{field}' field"
        
        # Check that /api/rds/live endpoint is in the list
        live_endpoint_found = any(ep["path"] == "/api/rds/live" for ep in data["endpoints"])
        assert live_endpoint_found, "/api/rds/live endpoint should be in the list"
        
        # Check that cached-rundown endpoint is in the list
        cached_endpoint_found = any(ep["path"] == "/api/rds/cached-rundown" for ep in data["endpoints"])
        assert cached_endpoint_found, "/api/rds/cached-rundown endpoint should be in the list"
        
        print(f"RDS Endpoints: Found {len(data['endpoints'])} endpoints with base_url={data['base_url']}")
        for ep in data["endpoints"]:
            print(f"  - {ep['name']}: {ep['path']} (auth={ep['auth_required']})")
    
    def test_rds_endpoints_requires_auth(self):
        """Test GET /api/rds/endpoints returns 401/403 without auth"""
        response = requests.get(f"{BASE_URL}/api/rds/endpoints")
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
    
    def test_rds_logs_returns_list(self, auth_headers):
        """Test GET /api/rds/logs returns cache logs list"""
        response = requests.get(
            f"{BASE_URL}/api/rds/logs",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Logs should be a list"
        
        # If there are logs, verify structure
        if len(data) > 0:
            log = data[0]
            required_fields = ["id", "team_id", "timestamp", "status", "message"]
            for field in required_fields:
                assert field in log, f"Log should have '{field}' field"
            assert log["status"] in ["success", "failed", "no_show"], \
                f"Log status should be valid, got '{log['status']}'"
        
        print(f"RDS Logs: Found {len(data)} log entries")
    
    def test_rds_logs_requires_auth(self):
        """Test GET /api/rds/logs returns 401/403 without auth"""
        response = requests.get(f"{BASE_URL}/api/rds/logs")
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
    
    def test_rds_manual_refresh_cache(self, auth_headers):
        """Test POST /api/rds/refresh-cache manually triggers cache refresh"""
        response = requests.post(
            f"{BASE_URL}/api/rds/refresh-cache",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "status" in data, "Response should have 'status'"
        assert "message" in data, "Response should have 'message'"
        print(f"Cache refresh: status={data['status']}, message={data['message']}")


class TestWordPressAudioFormat:
    """Test that WordPress publish uses audio format"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication token and return headers"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "yannick.gijbels@koodh.com", "password": "password123"}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        
        token = login_response.json().get("token")
        if not token:
            pytest.skip("No token received")
        
        return {"Authorization": f"Bearer {token}"}
    
    def test_wordpress_code_contains_audio_format(self):
        """Verify WordPress publish code includes format: audio"""
        # Read the wordpress.py file and check for the audio format
        wp_file_path = "/app/backend/routers/wordpress.py"
        try:
            with open(wp_file_path, 'r') as f:
                content = f.read()
            
            # Check if format: audio is in the wp_data dictionary
            assert '"format": "audio"' in content or "'format': 'audio'" in content, \
                "WordPress publish code should include format: 'audio' in wp_data"
            print("WordPress code contains 'format: audio' - PASS")
        except FileNotFoundError:
            pytest.skip(f"WordPress router file not found at {wp_file_path}")


class TestRDSScheduler:
    """Test RDS scheduler is properly configured"""
    
    def test_scheduler_file_exists(self):
        """Verify RDS scheduler service file exists"""
        scheduler_path = "/app/backend/services/rds_scheduler.py"
        assert os.path.exists(scheduler_path), f"RDS scheduler file should exist at {scheduler_path}"
        print("RDS scheduler file exists - PASS")
    
    def test_scheduler_has_5_minute_interval(self):
        """Verify RDS scheduler is configured for 5-minute interval"""
        scheduler_path = "/app/backend/services/rds_scheduler.py"
        with open(scheduler_path, 'r') as f:
            content = f.read()
        
        # Check for 300 seconds (5 minutes) interval
        assert "check_interval = 300" in content or "300  # 5 minutes" in content, \
            "Scheduler should have 5-minute (300 seconds) interval"
        print("RDS scheduler has 5-minute interval - PASS")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
