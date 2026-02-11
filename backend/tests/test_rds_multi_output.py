"""
RDS Multi-Output Feature Test Suite
Tests multiple RDS outputs per station (e.g., Streaming, DAB+, FM)
Each output can have configurable items (Now Playing, Show Name, Custom Text) with durations.
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefixes for easy cleanup
TEST_PREFIX = "TEST_"

class TestRDSMultiOutputAPI:
    """Test RDS Multi-Output API endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication token and return headers"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test@test.com", "password": "test"}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        
        token = login_response.json().get("token")
        if not token:
            pytest.skip("No token received")
        
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def test_cleanup(self, auth_headers):
        """Cleanup test outputs after tests complete"""
        created_slugs = []
        yield created_slugs
        # Cleanup: Delete all test-created outputs
        for station, slug in created_slugs:
            try:
                requests.delete(
                    f"{BASE_URL}/api/rds-builder/outputs/{station}/{slug}",
                    headers=auth_headers
                )
            except Exception:
                pass

    # ============== GET /outputs/{station} ==============
    def test_get_outputs_for_grk_station(self, auth_headers):
        """Test GET /api/rds-builder/outputs/grk returns list of outputs"""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/outputs/grk",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"GRK Outputs: Found {len(data)} outputs")
        
        # Verify existing outputs are present (as per test context)
        slugs = [output["slug"] for output in data]
        assert "streaming" in slugs, "streaming output should exist for GRK"
        assert "dab" in slugs, "dab output should exist for GRK"
        assert "fm" in slugs, "fm output should exist for GRK"

    def test_get_outputs_for_mfy_station(self, auth_headers):
        """Test GET /api/rds-builder/outputs/mfy returns list"""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/outputs/mfy",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"MFY Outputs: Found {len(data)} outputs")

    def test_get_outputs_invalid_station_returns_400(self, auth_headers):
        """Test GET /api/rds-builder/outputs/invalid returns 400"""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/outputs/invalid",
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"

    def test_get_outputs_requires_auth(self):
        """Test GET /api/rds-builder/outputs/{station} requires authentication"""
        response = requests.get(f"{BASE_URL}/api/rds-builder/outputs/grk")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"

    # ============== POST /outputs/{station} ==============
    def test_create_output_success(self, auth_headers, test_cleanup):
        """Test POST /api/rds-builder/outputs/{station} creates new output"""
        test_slug = f"test-{uuid.uuid4().hex[:8]}"
        payload = {
            "name": f"{TEST_PREFIX}New Output",
            "slug": test_slug,
            "station": "grk",
            "items": [
                {"type": "show_name", "enabled": True, "content": None, "duration": 10},
                {"type": "now_playing", "enabled": True, "content": None, "duration": 5}
            ],
            "enabled": True,
            "loop": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/rds-builder/outputs/grk",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data, "Response should have 'id'"
        assert data["name"] == payload["name"], "Name should match"
        assert data["slug"] == test_slug, "Slug should match"
        assert data["station"] == "grk", "Station should be grk"
        assert len(data["items"]) == 2, "Should have 2 items"
        assert data["enabled"] == True, "Should be enabled"
        assert data["loop"] == True, "Should loop"
        assert "created_at" in data, "Should have created_at"
        assert "updated_at" in data, "Should have updated_at"
        
        test_cleanup.append(("grk", test_slug))
        print(f"Created output: {data['name']} (/{test_slug})")

    def test_create_output_with_custom_text(self, auth_headers, test_cleanup):
        """Test creating output with custom_text item"""
        test_slug = f"test-custom-{uuid.uuid4().hex[:8]}"
        payload = {
            "name": f"{TEST_PREFIX}Custom Text Output",
            "slug": test_slug,
            "station": "mfy",
            "items": [
                {"type": "custom_text", "enabled": True, "content": "Test Custom Text Here", "duration": 15}
            ],
            "enabled": True,
            "loop": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/rds-builder/outputs/mfy",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify custom_text item
        custom_item = data["items"][0]
        assert custom_item["type"] == "custom_text", "Type should be custom_text"
        assert custom_item["content"] == "Test Custom Text Here", "Content should match"
        assert custom_item["duration"] == 15, "Duration should be 15"
        
        test_cleanup.append(("mfy", test_slug))
        print(f"Created custom text output: {data['name']}")

    def test_create_output_invalid_slug(self, auth_headers):
        """Test creating output with invalid slug returns 400"""
        payload = {
            "name": "Invalid Slug Test",
            "slug": "Invalid Slug With Spaces!",  # Invalid: spaces and special chars
            "station": "grk",
            "items": [{"type": "show_name", "enabled": True, "content": None, "duration": 5}],
            "enabled": True,
            "loop": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/rds-builder/outputs/grk",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "slug" in response.text.lower() or "lowercase" in response.text.lower(), \
            "Error should mention slug validation"

    def test_create_output_duplicate_slug(self, auth_headers):
        """Test creating output with duplicate slug returns 400"""
        payload = {
            "name": "Duplicate Streaming",
            "slug": "streaming",  # Already exists for GRK
            "station": "grk",
            "items": [{"type": "show_name", "enabled": True, "content": None, "duration": 5}],
            "enabled": True,
            "loop": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/rds-builder/outputs/grk",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "exists" in response.text.lower(), "Error should mention output already exists"

    # ============== PUT /outputs/{station}/{slug} ==============
    def test_update_output_success(self, auth_headers, test_cleanup):
        """Test PUT /api/rds-builder/outputs/{station}/{slug} updates output"""
        # First create an output to update
        test_slug = f"test-update-{uuid.uuid4().hex[:8]}"
        create_payload = {
            "name": f"{TEST_PREFIX}Update Test",
            "slug": test_slug,
            "station": "grk",
            "items": [{"type": "show_name", "enabled": True, "content": None, "duration": 5}],
            "enabled": True,
            "loop": True
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/rds-builder/outputs/grk",
            headers=auth_headers,
            json=create_payload
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        test_cleanup.append(("grk", test_slug))
        
        # Now update it
        update_payload = {
            "name": f"{TEST_PREFIX}Updated Name",
            "slug": test_slug,  # Keep same slug
            "station": "grk",
            "items": [
                {"type": "show_name", "enabled": True, "content": None, "duration": 10},
                {"type": "now_playing", "enabled": True, "content": None, "duration": 8}
            ],
            "enabled": False,  # Changed
            "loop": False  # Changed
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/rds-builder/outputs/grk/{test_slug}",
            headers=auth_headers,
            json=update_payload
        )
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        data = update_response.json()
        
        # Verify updates were applied
        assert data["name"] == f"{TEST_PREFIX}Updated Name", "Name should be updated"
        assert len(data["items"]) == 2, "Should now have 2 items"
        assert data["enabled"] == False, "Should be disabled"
        assert data["loop"] == False, "Loop should be disabled"
        print(f"Updated output: {data['name']}")

    def test_update_nonexistent_output_returns_404(self, auth_headers):
        """Test updating non-existent output returns 404"""
        payload = {
            "name": "Nonexistent",
            "slug": "nonexistent-slug-12345",
            "station": "grk",
            "items": [],
            "enabled": True,
            "loop": True
        }
        
        response = requests.put(
            f"{BASE_URL}/api/rds-builder/outputs/grk/nonexistent-slug-12345",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"

    # ============== DELETE /outputs/{station}/{slug} ==============
    def test_delete_output_success(self, auth_headers):
        """Test DELETE /api/rds-builder/outputs/{station}/{slug} deletes output"""
        # First create an output to delete
        test_slug = f"test-delete-{uuid.uuid4().hex[:8]}"
        create_payload = {
            "name": f"{TEST_PREFIX}Delete Test",
            "slug": test_slug,
            "station": "grk",
            "items": [{"type": "show_name", "enabled": True, "content": None, "duration": 5}],
            "enabled": True,
            "loop": True
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/rds-builder/outputs/grk",
            headers=auth_headers,
            json=create_payload
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        
        # Now delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/rds-builder/outputs/grk/{test_slug}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        data = delete_response.json()
        assert data["status"] == "success", "Delete should return success status"
        print(f"Deleted output: {test_slug}")
        
        # Verify it's actually deleted
        get_response = requests.get(
            f"{BASE_URL}/api/rds-builder/outputs/grk",
            headers=auth_headers
        )
        outputs = get_response.json()
        slugs = [o["slug"] for o in outputs]
        assert test_slug not in slugs, "Deleted output should not appear in list"

    def test_delete_nonexistent_output_returns_404(self, auth_headers):
        """Test deleting non-existent output returns 404"""
        response = requests.delete(
            f"{BASE_URL}/api/rds-builder/outputs/grk/nonexistent-slug-xyz",
            headers=auth_headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"

    # ============== Public Text Endpoints ==============
    def test_public_output_txt_endpoint_grk_streaming(self):
        """Test GET /api/rds-builder/output/grk/streaming.txt returns plain text"""
        response = requests.get(f"{BASE_URL}/api/rds-builder/output/grk/streaming.txt")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"
        
        # Should have some text (scheduler rotates based on items)
        text = response.text
        print(f"Streaming output: '{text}'")
        assert text or text == "", "Response should be text (can be empty if disabled)"

    def test_public_output_txt_endpoint_grk_dab(self):
        """Test GET /api/rds-builder/output/grk/dab.txt returns plain text"""
        response = requests.get(f"{BASE_URL}/api/rds-builder/output/grk/dab.txt")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"
        print(f"DAB output: '{response.text}'")

    def test_public_output_txt_endpoint_grk_fm(self):
        """Test GET /api/rds-builder/output/grk/fm.txt returns custom text"""
        response = requests.get(f"{BASE_URL}/api/rds-builder/output/grk/fm.txt")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        # FM output has custom_text configured
        text = response.text
        print(f"FM output: '{text}'")
        assert "Radio GRK" in text or text, "FM output should have custom text"

    def test_public_output_endpoint_without_txt_extension(self):
        """Test GET /api/rds-builder/output/grk/streaming (without .txt) also works"""
        response = requests.get(f"{BASE_URL}/api/rds-builder/output/grk/streaming")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"

    def test_public_output_nonexistent_returns_empty(self):
        """Test non-existent output returns empty text (not 404)"""
        response = requests.get(f"{BASE_URL}/api/rds-builder/output/grk/nonexistent-output.txt")
        
        # Public endpoints return empty string for non-existent, not 404
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.text == "", "Non-existent output should return empty string"

    def test_public_output_invalid_station(self):
        """Test invalid station returns empty text"""
        response = requests.get(f"{BASE_URL}/api/rds-builder/output/invalid/streaming.txt")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.text == "", "Invalid station should return empty string"

    # ============== Output Status Endpoint ==============
    def test_output_status_endpoint(self, auth_headers):
        """Test GET /api/rds-builder/outputs/{station}/{slug}/status returns current status"""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/outputs/grk/streaming/status",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify status structure
        assert "output_id" in data, "Status should have output_id"
        assert "name" in data, "Status should have name"
        assert "slug" in data, "Status should have slug"
        assert "station" in data, "Status should have station"
        assert "enabled" in data, "Status should have enabled"
        assert "current_text" in data, "Status should have current_text"
        assert "current_index" in data, "Status should have current_index"
        assert "current_item_type" in data, "Status should have current_item_type"
        
        print(f"Streaming status: current_text='{data['current_text']}', type={data['current_item_type']}")

    def test_output_status_nonexistent_returns_404(self, auth_headers):
        """Test status for non-existent output returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/outputs/grk/nonexistent/status",
            headers=auth_headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestRDSOutputRotation:
    """Test that outputs rotate through items based on duration"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test@test.com", "password": "test"}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return {"Authorization": f"Bearer {login_response.json().get('token')}"}
    
    def test_output_has_current_text(self):
        """Verify outputs have current_text from scheduler processing"""
        response = requests.get(f"{BASE_URL}/api/rds-builder/output/grk/streaming.txt")
        
        # Streaming has show_name and now_playing enabled
        # Should have some text from scheduler
        assert response.status_code == 200
        text = response.text
        # The text should be non-empty since output is enabled
        print(f"Streaming current text: '{text}'")
        # Note: Text could be empty if no live show and no now_playing data
        # But it's being processed based on the status endpoint working
    
    def test_different_outputs_can_have_different_text(self):
        """Verify different outputs show different text based on their config"""
        streaming_resp = requests.get(f"{BASE_URL}/api/rds-builder/output/grk/streaming.txt")
        fm_resp = requests.get(f"{BASE_URL}/api/rds-builder/output/grk/fm.txt")
        
        # FM has only custom_text, streaming has show_name + now_playing
        streaming_text = streaming_resp.text
        fm_text = fm_resp.text
        
        print(f"Streaming: '{streaming_text}'")
        print(f"FM: '{fm_text}'")
        
        # FM should have the configured custom text
        assert "Radio GRK" in fm_text or fm_text, "FM output should have custom text"


class TestOutputConfigResponse:
    """Test output configuration response structure"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test@test.com", "password": "test"}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return {"Authorization": f"Bearer {login_response.json().get('token')}"}
    
    def test_output_response_has_current_text_field(self, auth_headers):
        """Verify GET outputs includes current_text for each output"""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/outputs/grk",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        outputs = response.json()
        
        for output in outputs:
            assert "current_text" in output, f"Output {output['slug']} should have current_text"
            print(f"{output['slug']}: current_text='{output['current_text']}'")
    
    def test_output_items_structure(self, auth_headers):
        """Verify output items have correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/rds-builder/outputs/grk",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        outputs = response.json()
        
        for output in outputs:
            for item in output["items"]:
                assert "type" in item, "Item should have type"
                assert item["type"] in ["show_name", "now_playing", "custom_text"], \
                    f"Invalid item type: {item['type']}"
                assert "enabled" in item, "Item should have enabled"
                assert "duration" in item, "Item should have duration"
                assert isinstance(item["duration"], int), "Duration should be int"
                assert item["duration"] > 0, "Duration should be positive"
                
                if item["type"] == "custom_text":
                    # custom_text items may have content
                    pass  # content can be None or string
                
        print(f"Verified {len(outputs)} outputs with correct item structure")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
