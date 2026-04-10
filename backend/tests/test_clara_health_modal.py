"""
Tests for Clara Health Modal features:
- Health scan endpoint returns site_id, site_slug, site_type per check
- Retest-check endpoint for wordpress and rds_stream types
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestClaraHealthModal:
    """Tests for Clara Health Modal backend endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as system admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("token")
        assert token, f"No token returned: {login_response.json()}"
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
    
    def test_health_scan_returns_site_metadata(self):
        """Test that health-scan returns site_id, site_slug, site_type per check"""
        response = self.session.get(f"{BASE_URL}/api/clara-test/health-scan")
        assert response.status_code == 200, f"Health scan failed: {response.text}"
        
        data = response.json()
        assert "has_issues" in data, "Missing has_issues field"
        assert "diagnosis" in data, "Missing diagnosis field"
        assert "checks" in data, "Missing checks field"
        
        # Verify each check has required metadata
        for check in data["checks"]:
            assert "site" in check, f"Check missing 'site' field: {check}"
            assert "site_id" in check, f"Check missing 'site_id' field: {check}"
            assert "site_slug" in check, f"Check missing 'site_slug' field: {check}"
            assert "site_type" in check, f"Check missing 'site_type' field: {check}"
            assert "type" in check, f"Check missing 'type' field: {check}"
            assert "target" in check, f"Check missing 'target' field: {check}"
            assert "success" in check, f"Check missing 'success' field: {check}"
            
            # Type should be wordpress or rds_stream
            assert check["type"] in ["wordpress", "rds_stream"], f"Invalid check type: {check['type']}"
        
        print(f"Health scan returned {len(data['checks'])} checks")
        print(f"Has issues: {data['has_issues']}")
        
    def test_health_scan_requires_admin(self):
        """Test that health-scan requires admin access"""
        # Create a new session without auth
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.get(f"{BASE_URL}/api/clara-test/health-scan")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_retest_check_wordpress_no_connection(self):
        """Test retest-check for wordpress type when connection not found"""
        response = self.session.post(f"{BASE_URL}/api/clara-test/retest-check", json={
            "type": "wordpress",
            "site": "Test Site",
            "wp_base_url": "https://nonexistent-site.example.com"
        })
        assert response.status_code == 200, f"Retest check failed: {response.text}"
        
        data = response.json()
        assert "success" in data, "Missing success field"
        assert "diagnosis" in data, "Missing diagnosis field"
        # Should fail because connection not found
        assert data["success"] == False, "Expected failure for nonexistent connection"
        print(f"WordPress retest diagnosis: {data['diagnosis'][:100]}...")
    
    def test_retest_check_rds_stream_no_url(self):
        """Test retest-check for rds_stream type without stream URL"""
        response = self.session.post(f"{BASE_URL}/api/clara-test/retest-check", json={
            "type": "rds_stream",
            "site": "Test Site",
            "stream_url": ""
        })
        assert response.status_code == 200, f"Retest check failed: {response.text}"
        
        data = response.json()
        assert "success" in data, "Missing success field"
        assert "diagnosis" in data, "Missing diagnosis field"
        assert data["success"] == False, "Expected failure for empty stream URL"
        print(f"RDS retest diagnosis: {data['diagnosis'][:100]}...")
    
    def test_retest_check_rds_stream_with_url(self):
        """Test retest-check for rds_stream type with a stream URL"""
        # Use a known stream URL from the system
        response = self.session.post(f"{BASE_URL}/api/clara-test/retest-check", json={
            "type": "rds_stream",
            "site": "Test Station",
            "stream_url": "https://stream.example.com/stats"
        })
        assert response.status_code == 200, f"Retest check failed: {response.text}"
        
        data = response.json()
        assert "success" in data, "Missing success field"
        assert "diagnosis" in data, "Missing diagnosis field"
        # May succeed or fail depending on actual stream
        print(f"RDS stream retest result: success={data['success']}")
        print(f"Diagnosis: {data['diagnosis'][:100]}...")
    
    def test_retest_check_unknown_type(self):
        """Test retest-check with unknown check type"""
        response = self.session.post(f"{BASE_URL}/api/clara-test/retest-check", json={
            "type": "unknown_type",
            "site": "Test Site"
        })
        assert response.status_code == 200, f"Retest check failed: {response.text}"
        
        data = response.json()
        assert data["success"] == False, "Expected failure for unknown type"
        assert "Unknown check type" in data["diagnosis"], f"Unexpected diagnosis: {data['diagnosis']}"
    
    def test_retest_check_requires_auth(self):
        """Test that retest-check requires authentication"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(f"{BASE_URL}/api/clara-test/retest-check", json={
            "type": "wordpress",
            "site": "Test Site",
            "wp_base_url": "https://example.com"
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_health_scan_check_structure(self):
        """Test that health scan checks have proper structure for frontend"""
        response = self.session.get(f"{BASE_URL}/api/clara-test/health-scan")
        assert response.status_code == 200
        
        data = response.json()
        
        # Find a failed check if any
        failed_checks = [c for c in data["checks"] if not c.get("success")]
        
        if failed_checks:
            check = failed_checks[0]
            print(f"Sample failed check structure:")
            print(f"  site: {check.get('site')}")
            print(f"  site_id: {check.get('site_id')}")
            print(f"  site_slug: {check.get('site_slug')}")
            print(f"  site_type: {check.get('site_type')}")
            print(f"  type: {check.get('type')}")
            print(f"  target: {check.get('target')}")
            print(f"  error: {check.get('error')}")
            
            # WordPress checks should have wp_base_url
            if check["type"] == "wordpress":
                assert "wp_base_url" in check, "WordPress check missing wp_base_url"
            # RDS checks should have stream_url
            elif check["type"] == "rds_stream":
                assert "stream_url" in check, "RDS check missing stream_url"
        else:
            print("No failed checks found - all connections healthy")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
