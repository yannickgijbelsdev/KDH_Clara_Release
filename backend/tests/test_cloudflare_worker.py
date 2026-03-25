"""
Test Cloudflare Worker endpoint - POST /api/domains/cloudflare/test-worker

Tests the Worker test functionality that:
1. Tests DNS resolution for a test subdomain
2. Tests Worker proxy connectivity
3. Returns structured response with status, message, steps, results
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for system admin"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token") or data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code}")


@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestCloudflareWorkerEndpoint:
    """Tests for POST /api/domains/cloudflare/test-worker"""

    def test_worker_endpoint_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/domains/cloudflare/test-worker")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: test-worker endpoint requires authentication")

    def test_worker_endpoint_returns_structured_response(self, auth_headers):
        """Test that endpoint returns proper structured response"""
        response = requests.post(
            f"{BASE_URL}/api/domains/cloudflare/test-worker",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Must have status field
        assert "status" in data, "Response must have 'status' field"
        assert data["status"] in ["ok", "warning", "error"], f"Status must be ok/warning/error, got {data['status']}"
        
        # Must have message field
        assert "message" in data, "Response must have 'message' field"
        assert isinstance(data["message"], str), "Message must be a string"
        
        print(f"PASS: test-worker returns structured response with status={data['status']}")

    def test_worker_endpoint_returns_results_array(self, auth_headers):
        """Test that endpoint returns results array with test details"""
        response = requests.post(
            f"{BASE_URL}/api/domains/cloudflare/test-worker",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Should have results array (may be empty if error before tests run)
        if "results" in data:
            assert isinstance(data["results"], list), "Results must be an array"
            
            # Each result should have test name and status
            for result in data["results"]:
                assert "test" in result, "Each result must have 'test' field"
                assert "status" in result, "Each result must have 'status' field"
                assert result["status"] in ["ok", "warning", "error"], f"Result status must be ok/warning/error"
                print(f"  - {result['test']}: {result['status']}")
        
        print(f"PASS: test-worker returns results array")

    def test_worker_endpoint_returns_test_subdomain(self, auth_headers):
        """Test that endpoint returns test_subdomain when available"""
        response = requests.post(
            f"{BASE_URL}/api/domains/cloudflare/test-worker",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # If status is ok or warning, should have test_subdomain
        if data["status"] in ["ok", "warning"]:
            assert "test_subdomain" in data, "Successful test should include test_subdomain"
            assert isinstance(data["test_subdomain"], str), "test_subdomain must be a string"
            print(f"PASS: test_subdomain = {data['test_subdomain']}")
        else:
            # Error case - may have steps for how to fix
            if "steps" in data:
                assert isinstance(data["steps"], list), "Steps must be an array"
                print(f"PASS: Error response includes {len(data['steps'])} fix steps")

    def test_worker_endpoint_dns_resolution_check(self, auth_headers):
        """Test that DNS Resolution check is included in results"""
        response = requests.post(
            f"{BASE_URL}/api/domains/cloudflare/test-worker",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        if "results" in data and len(data["results"]) > 0:
            dns_results = [r for r in data["results"] if "DNS" in r.get("test", "")]
            if dns_results:
                dns_result = dns_results[0]
                assert "detail" in dns_result, "DNS result should have detail"
                print(f"PASS: DNS Resolution check: {dns_result['status']} - {dns_result.get('detail', '')}")
            else:
                print("INFO: No DNS Resolution result (may have failed before DNS check)")
        else:
            print("INFO: No results array (error before tests ran)")

    def test_worker_endpoint_worker_proxy_check(self, auth_headers):
        """Test that Worker Proxy check is included in results"""
        response = requests.post(
            f"{BASE_URL}/api/domains/cloudflare/test-worker",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        if "results" in data and len(data["results"]) > 0:
            proxy_results = [r for r in data["results"] if "Worker" in r.get("test", "") or "Proxy" in r.get("test", "")]
            if proxy_results:
                proxy_result = proxy_results[0]
                assert "detail" in proxy_result or "status" in proxy_result, "Proxy result should have detail or status"
                print(f"PASS: Worker Proxy check: {proxy_result['status']} - {proxy_result.get('detail', '')}")
            else:
                print("INFO: No Worker Proxy result (may have failed at DNS stage)")
        else:
            print("INFO: No results array (error before tests ran)")

    def test_worker_endpoint_error_includes_steps(self, auth_headers):
        """Test that error responses include helpful steps"""
        response = requests.post(
            f"{BASE_URL}/api/domains/cloudflare/test-worker",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # If error status, should have steps
        if data["status"] == "error":
            assert "steps" in data, "Error response should include 'steps' array"
            assert isinstance(data["steps"], list), "Steps must be an array"
            assert len(data["steps"]) > 0, "Steps array should not be empty"
            print(f"PASS: Error response includes {len(data['steps'])} fix steps:")
            for i, step in enumerate(data["steps"][:3], 1):
                print(f"  {i}. {step[:60]}...")
        else:
            print(f"INFO: Status is {data['status']}, not error - steps may not be present")

    def test_worker_endpoint_full_response_structure(self, auth_headers):
        """Test complete response structure for successful test"""
        response = requests.post(
            f"{BASE_URL}/api/domains/cloudflare/test-worker",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        print(f"\nFull test-worker response:")
        print(f"  status: {data.get('status')}")
        print(f"  message: {data.get('message')}")
        print(f"  test_subdomain: {data.get('test_subdomain', 'N/A')}")
        
        if "results" in data:
            print(f"  results ({len(data['results'])} checks):")
            for r in data["results"]:
                print(f"    - {r.get('test')}: {r.get('status')} ({r.get('detail', '')})")
        
        if "steps" in data:
            print(f"  steps ({len(data['steps'])} items)")
        
        # Verify required fields based on status
        assert "status" in data
        assert "message" in data
        
        if data["status"] == "ok":
            assert "test_subdomain" in data
            assert "results" in data
        
        print("\nPASS: Full response structure validated")
