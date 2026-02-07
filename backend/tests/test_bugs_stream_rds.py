"""
Backend tests for Stream Proxy and RDS Builder APIs
Testing bugs: Custom text input and Stream Monitor functionality
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@test.nl"
TEST_PASSWORD = "test1234"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for protected endpoints."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code}")


@pytest.fixture
def auth_headers(auth_token):
    """Create headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestStreamProxyAPI:
    """Tests for Stream Proxy endpoints (/api/streams/*)"""
    
    def test_stream_status_mfy(self):
        """Test GET /api/streams/mfy/status - should return online status."""
        response = requests.get(f"{BASE_URL}/api/streams/mfy/status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "stream_id" in data
        assert data["stream_id"] == "mfy"
        assert "status" in data
        print(f"MFY stream status: {data['status']}")
        
    def test_stream_status_grk(self):
        """Test GET /api/streams/grk/status - should return online status."""
        response = requests.get(f"{BASE_URL}/api/streams/grk/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data["stream_id"] == "grk"
        print(f"GRK stream status: {data['status']}")
        
    def test_stream_status_grk2(self):
        """Test GET /api/streams/grk2/status - should return status."""
        response = requests.get(f"{BASE_URL}/api/streams/grk2/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data["stream_id"] == "grk2"
        print(f"GRK2 stream status: {data['status']}")
        
    def test_stream_proxy_returns_audio_data(self):
        """Test GET /api/streams/mfy - should return audio stream data."""
        # Use a timeout and stream to just get the headers and first chunk
        response = requests.get(
            f"{BASE_URL}/api/streams/mfy",
            stream=True,
            timeout=10
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "audio" in response.headers.get("content-type", ""), "Content-Type should be audio"
        
        # Verify CORS headers
        assert response.headers.get("access-control-allow-origin") == "*", "CORS header missing"
        
        # Read first chunk to verify we get data
        first_chunk = next(response.iter_content(chunk_size=1024), None)
        response.close()
        
        assert first_chunk is not None, "No audio data received"
        assert len(first_chunk) > 0, "Empty audio chunk"
        print(f"Received {len(first_chunk)} bytes of audio data")
        
    def test_stream_unknown_returns_404(self):
        """Test GET /api/streams/unknown/status - should return 404."""
        response = requests.get(f"{BASE_URL}/api/streams/unknown/status")
        assert response.status_code == 404


class TestRDSBuilderAPI:
    """Tests for RDS Builder endpoints (/api/rds-builder/*)"""
    
    def test_get_sequence_requires_auth(self):
        """Test GET /api/rds-builder/sequence/mfy - requires authentication."""
        response = requests.get(f"{BASE_URL}/api/rds-builder/sequence/mfy")
        # Should fail without auth
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        
    def test_get_sequence_mfy_with_auth(self, auth_headers):
        """Test GET /api/rds-builder/sequence/mfy - with auth."""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/sequence/mfy",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "station" in data
        assert data["station"] == "mfy"
        assert "items" in data
        assert "enabled" in data
        print(f"MFY sequence has {len(data.get('items', []))} items")
        
    def test_get_sequence_grk_with_auth(self, auth_headers):
        """Test GET /api/rds-builder/sequence/grk - with auth."""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/sequence/grk",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["station"] == "grk"
        
    def test_update_sequence_with_custom_text(self, auth_headers):
        """Test PUT /api/rds-builder/sequence/mfy - update with custom text item."""
        # First get current sequence
        get_response = requests.get(
            f"{BASE_URL}/api/rds-builder/sequence/mfy",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        current_data = get_response.json()
        
        # Create new sequence with custom text
        test_custom_text = f"TEST_Custom_Text_{int(time.time())}"
        new_items = [
            {
                "id": "test-item-1",
                "type": "custom_text",
                "content": test_custom_text,
                "duration": 5
            }
        ]
        
        update_data = {
            "station": "mfy",
            "items": new_items,
            "enabled": False,  # Don't enable during test
            "loop": True
        }
        
        response = requests.put(
            f"{BASE_URL}/api/rds-builder/sequence/mfy",
            headers=auth_headers,
            json=update_data
        )
        
        assert response.status_code == 200, f"Update failed: {response.status_code}: {response.text}"
        
        # Verify the update
        verify_response = requests.get(
            f"{BASE_URL}/api/rds-builder/sequence/mfy",
            headers=auth_headers
        )
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        
        # Check that custom text was saved
        assert len(verify_data.get("items", [])) >= 1
        custom_items = [i for i in verify_data["items"] if i.get("type") == "custom_text"]
        assert len(custom_items) >= 1, "Custom text item not found after update"
        
        # Verify content matches
        found_test_text = any(
            i.get("content") == test_custom_text 
            for i in custom_items
        )
        assert found_test_text, f"Custom text '{test_custom_text}' not found in saved items"
        print(f"Custom text '{test_custom_text}' saved and verified successfully")
        
    def test_public_output_endpoint(self):
        """Test GET /api/rds-builder/output/mfy - public endpoint, no auth needed."""
        response = requests.get(f"{BASE_URL}/api/rds-builder/output/mfy")
        
        # Should return 200 even without auth (public endpoint)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", "")
        print(f"Output text: '{response.text}'")
        
    def test_public_output_txt_endpoint(self):
        """Test GET /api/rds-builder/output/mfy.txt - public endpoint with .txt extension."""
        response = requests.get(f"{BASE_URL}/api/rds-builder/output/mfy.txt")
        
        assert response.status_code == 200
        assert "text/plain" in response.headers.get("content-type", "")
        
    def test_status_endpoint(self, auth_headers):
        """Test GET /api/rds-builder/status/mfy - requires auth."""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/status/mfy",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "station" in data
        assert "enabled" in data
        assert "current_text" in data


class TestHealthEndpoint:
    """Basic health check."""
    
    def test_health_endpoint(self):
        """Test GET /api/health - should return healthy."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
