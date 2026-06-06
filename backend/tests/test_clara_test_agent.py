"""
Test Clara Test Agent - AI-powered connection testing and site health scanning.
Tests the following endpoints:
- POST /api/clara-test/test-wordpress - Tests WP credentials and returns AI diagnosis
- POST /api/clara-test/test-rds-stream - Tests stream URL and returns AI diagnosis
- GET /api/clara-test/health-scan - Scans all sites and returns issues
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestClaraTestAgent:
    """Clara Test Agent endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.admin_email = "admkoodh@koodh.com"
        self.admin_password = "KYLovie13monx"
        self.token = None
        
    def get_auth_token(self):
        """Get authentication token for admin user"""
        if self.token:
            return self.token
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            return self.token
        pytest.skip(f"Authentication failed: {response.status_code}")
        
    def test_health_check(self):
        """Test that the API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        print("✓ API health check passed")
        
    def test_test_wordpress_missing_fields(self):
        """Test WordPress test endpoint with missing fields returns error"""
        token = self.get_auth_token()
        response = requests.post(
            f"{BASE_URL}/api/clara-test/test-wordpress",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"wp_base_url": "", "username": "", "app_password": ""}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "error", "Expected error status for missing fields"
        assert "diagnosis" in data, "Response should contain diagnosis"
        print(f"✓ WordPress test with missing fields returns error: {data.get('diagnosis')[:50]}...")
        
    def test_test_wordpress_invalid_url(self):
        """Test WordPress test endpoint with invalid URL"""
        token = self.get_auth_token()
        response = requests.post(
            f"{BASE_URL}/api/clara-test/test-wordpress",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "name": "Test Site",
                "wp_base_url": "https://invalid-nonexistent-domain-12345.com",
                "username": "testuser",
                "app_password": "testpass"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "error", "Expected error status for invalid URL"
        assert "diagnosis" in data, "Response should contain diagnosis"
        assert "raw_result" in data, "Response should contain raw_result"
        print("✓ WordPress test with invalid URL returns error diagnosis")
        print(f"  Raw result: {data.get('raw_result')}")
        
    def test_test_rds_stream_missing_url(self):
        """Test RDS stream test endpoint with missing URL"""
        token = self.get_auth_token()
        response = requests.post(
            f"{BASE_URL}/api/clara-test/test-rds-stream",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"stream_url": "", "station_name": "Test Station"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "error", "Expected error status for missing URL"
        assert "diagnosis" in data, "Response should contain diagnosis"
        print(f"✓ RDS stream test with missing URL returns error: {data.get('diagnosis')[:50]}...")
        
    def test_test_rds_stream_invalid_url(self):
        """Test RDS stream test endpoint with invalid URL"""
        token = self.get_auth_token()
        response = requests.post(
            f"{BASE_URL}/api/clara-test/test-rds-stream",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "stream_url": "http://invalid-stream-url-12345.com:9010/stats",
                "station_name": "Test Station",
                "stream_type": "shoutcast_v1"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "error", "Expected error status for invalid stream URL"
        assert "diagnosis" in data, "Response should contain diagnosis"
        assert "raw_result" in data, "Response should contain raw_result"
        print("✓ RDS stream test with invalid URL returns error diagnosis")
        print(f"  Raw result: {data.get('raw_result')}")
        
    def test_health_scan_requires_admin(self):
        """Test health scan endpoint requires admin access"""
        # First test without auth
        response = requests.get(f"{BASE_URL}/api/clara-test/health-scan")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ Health scan requires authentication")
        
    def test_health_scan_with_admin(self):
        """Test health scan endpoint with admin user"""
        token = self.get_auth_token()
        response = requests.get(
            f"{BASE_URL}/api/clara-test/health-scan",
            headers={"Authorization": f"Bearer {token}"},
            timeout=60  # Health scan can take up to 30s
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Validate response structure
        assert "has_issues" in data, "Response should contain has_issues"
        assert "diagnosis" in data, "Response should contain diagnosis"
        assert "checks" in data, "Response should contain checks"
        assert isinstance(data["checks"], list), "checks should be a list"
        
        print("✓ Health scan completed successfully")
        print(f"  Has issues: {data['has_issues']}")
        print(f"  Total checks: {len(data['checks'])}")
        print(f"  Diagnosis preview: {data['diagnosis'][:100]}...")
        
        # Log individual checks
        for check in data["checks"]:
            status = "✓" if check.get("success") else "✗"
            print(f"  {status} {check.get('site')} / {check.get('type')} / {check.get('target')}")
            
    def test_test_wordpress_unauthorized(self):
        """Test WordPress test endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/clara-test/test-wordpress",
            headers={"Content-Type": "application/json"},
            json={"wp_base_url": "https://example.com", "username": "test", "app_password": "test"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ WordPress test requires authentication")
        
    def test_test_rds_stream_unauthorized(self):
        """Test RDS stream test endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/clara-test/test-rds-stream",
            headers={"Content-Type": "application/json"},
            json={"stream_url": "http://example.com:9010/stats"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ RDS stream test requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
