"""
Tests for Sites new features:
1. Logo scale slider (10-200%) - General tab
2. Button color picker - Form tab  
3. File upload toggle (form_file_upload_enabled) - Form tab
4. Public file upload endpoint POST /api/sites/public/{slug}/upload-file
5. Public page logo scaling
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"

# Existing site for testing
EXISTING_SITE_ID = "3a91dfc9-e52f-4c6b-a426-84dc778ad8a1"
EXISTING_SITE_SLUG = "radio-test"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(auth_token):
    """Create authenticated session."""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestLogoScaleFeature:
    """Tests for logo scale slider functionality."""
    
    def test_logo_scale_field_exists_in_site_response(self, authenticated_client):
        """Verify logo_scale field is returned in site data."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}")
        assert response.status_code == 200
        
        site = response.json()
        assert "logo_scale" in site, "logo_scale field missing from site response"
        
        # logo_scale should be a number between 10 and 200
        logo_scale = site.get("logo_scale")
        assert logo_scale is not None
        assert isinstance(logo_scale, (int, float))
        print(f"✓ logo_scale field exists, current value: {logo_scale}%")
    
    def test_update_logo_scale(self, authenticated_client):
        """Test updating logo_scale setting."""
        # Get current value
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}")
        original_scale = response.json().get("logo_scale", 100)
        
        # Update to a new value
        new_scale = 75
        response = authenticated_client.put(
            f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}",
            json={"logo_scale": new_scale}
        )
        assert response.status_code == 200
        
        updated_site = response.json()
        assert updated_site.get("logo_scale") == new_scale
        print(f"✓ Logo scale updated to {new_scale}%")
        
        # Verify change persisted
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}")
        assert response.json().get("logo_scale") == new_scale
        print(f"✓ Logo scale change persisted in database")
    
    def test_logo_scale_in_public_response(self):
        """Verify logo_scale is returned in public site response."""
        response = requests.get(f"{BASE_URL}/api/sites/public/{EXISTING_SITE_SLUG}")
        assert response.status_code == 200
        
        public_site = response.json()
        assert "logo_scale" in public_site, "logo_scale missing from public site response"
        print(f"✓ logo_scale in public response: {public_site.get('logo_scale')}%")


class TestButtonColorFeature:
    """Tests for button color picker functionality."""
    
    def test_button_color_field_exists_in_site_response(self, authenticated_client):
        """Verify button_color field is returned in site data."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}")
        assert response.status_code == 200
        
        site = response.json()
        assert "button_color" in site, "button_color field missing from site response"
        print(f"✓ button_color field exists, current value: {site.get('button_color')}")
    
    def test_update_button_color(self, authenticated_client):
        """Test updating button_color setting."""
        # Update to a custom color
        custom_color = "#3b82f6"  # Blue
        response = authenticated_client.put(
            f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}",
            json={"button_color": custom_color}
        )
        assert response.status_code == 200
        
        updated_site = response.json()
        assert updated_site.get("button_color") == custom_color
        print(f"✓ Button color updated to {custom_color}")
        
        # Verify change persisted
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}")
        assert response.json().get("button_color") == custom_color
        print(f"✓ Button color change persisted in database")
        
        # Reset to default orange
        response = authenticated_client.put(
            f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}",
            json={"button_color": "#f97316"}
        )
        assert response.status_code == 200
        print(f"✓ Button color reset to default orange")
    
    def test_button_color_in_public_response(self):
        """Verify button_color is returned in public site response."""
        response = requests.get(f"{BASE_URL}/api/sites/public/{EXISTING_SITE_SLUG}")
        assert response.status_code == 200
        
        public_site = response.json()
        assert "button_color" in public_site, "button_color missing from public site response"
        print(f"✓ button_color in public response: {public_site.get('button_color')}")


class TestFileUploadToggleFeature:
    """Tests for file upload toggle (form_file_upload_enabled)."""
    
    def test_file_upload_enabled_field_exists(self, authenticated_client):
        """Verify form_file_upload_enabled field is returned in site data."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}")
        assert response.status_code == 200
        
        site = response.json()
        assert "form_file_upload_enabled" in site, "form_file_upload_enabled field missing"
        
        enabled = site.get("form_file_upload_enabled")
        assert isinstance(enabled, bool)
        print(f"✓ form_file_upload_enabled field exists, current value: {enabled}")
    
    def test_toggle_file_upload_enabled(self, authenticated_client):
        """Test toggling form_file_upload_enabled setting."""
        # Get current value
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}")
        current_value = response.json().get("form_file_upload_enabled", False)
        
        # Toggle to opposite
        new_value = not current_value
        response = authenticated_client.put(
            f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}",
            json={"form_file_upload_enabled": new_value}
        )
        assert response.status_code == 200
        
        updated_site = response.json()
        assert updated_site.get("form_file_upload_enabled") == new_value
        print(f"✓ form_file_upload_enabled toggled to {new_value}")
        
        # Verify change persisted
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}")
        assert response.json().get("form_file_upload_enabled") == new_value
        print(f"✓ Toggle change persisted in database")
    
    def test_file_upload_enabled_in_public_response(self):
        """Verify form_file_upload_enabled is returned in public site response."""
        response = requests.get(f"{BASE_URL}/api/sites/public/{EXISTING_SITE_SLUG}")
        assert response.status_code == 200
        
        public_site = response.json()
        assert "form_file_upload_enabled" in public_site
        print(f"✓ form_file_upload_enabled in public response: {public_site.get('form_file_upload_enabled')}")


class TestPublicFileUploadEndpoint:
    """Tests for public file upload endpoint POST /api/sites/public/{slug}/upload-file."""
    
    def test_upload_endpoint_exists(self):
        """Verify the upload-file endpoint exists."""
        # Try to upload without file (should fail with 422, not 404)
        response = requests.post(f"{BASE_URL}/api/sites/public/{EXISTING_SITE_SLUG}/upload-file")
        assert response.status_code != 404, "upload-file endpoint does not exist"
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        print(f"✓ upload-file endpoint exists (status {response.status_code} without file)")
    
    def test_upload_rejected_when_disabled(self, authenticated_client):
        """Verify uploads are rejected when form_file_upload_enabled is False."""
        # First ensure file upload is disabled
        response = authenticated_client.put(
            f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}",
            json={"form_file_upload_enabled": False, "form_enabled": True}
        )
        assert response.status_code == 200
        
        # Create a test image file
        img_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        files = {"file": ("test.png", io.BytesIO(img_data), "image/png")}
        
        response = requests.post(
            f"{BASE_URL}/api/sites/public/{EXISTING_SITE_SLUG}/upload-file",
            files=files
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        error = response.json()
        assert "niet toegestaan" in error.get("detail", "").lower() or "not allowed" in error.get("detail", "").lower()
        print(f"✓ Upload correctly rejected when disabled: {error.get('detail')}")
    
    def test_upload_accepted_when_enabled(self, authenticated_client):
        """Verify uploads work when form_file_upload_enabled is True."""
        # First enable file uploads
        response = authenticated_client.put(
            f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}",
            json={"form_file_upload_enabled": True, "form_enabled": True}
        )
        assert response.status_code == 200
        
        # Create a test image file (minimal valid PNG)
        img_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        files = {"file": ("test_upload.png", io.BytesIO(img_data), "image/png")}
        
        response = requests.post(
            f"{BASE_URL}/api/sites/public/{EXISTING_SITE_SLUG}/upload-file",
            files=files
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert "file_url" in result, "file_url missing from response"
        assert "filename" in result, "filename missing from response"
        assert "content_type" in result, "content_type missing from response"
        
        print(f"✓ File upload successful!")
        print(f"  file_url: {result.get('file_url')}")
        print(f"  filename: {result.get('filename')}")
        print(f"  content_type: {result.get('content_type')}")
    
    def test_upload_rejects_invalid_file_type(self, authenticated_client):
        """Verify only allowed file types can be uploaded."""
        # Ensure file uploads are enabled
        authenticated_client.put(
            f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}",
            json={"form_file_upload_enabled": True, "form_enabled": True}
        )
        
        # Try to upload a text file (not allowed)
        files = {"file": ("test.txt", io.BytesIO(b"test content"), "text/plain")}
        
        response = requests.post(
            f"{BASE_URL}/api/sites/public/{EXISTING_SITE_SLUG}/upload-file",
            files=files
        )
        assert response.status_code == 400, f"Expected 400 for invalid file type, got {response.status_code}"
        print(f"✓ Invalid file type correctly rejected")
    
    def test_upload_nonexistent_site(self):
        """Verify 404 for nonexistent site slug."""
        img_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        files = {"file": ("test.png", io.BytesIO(img_data), "image/png")}
        
        response = requests.post(
            f"{BASE_URL}/api/sites/public/nonexistent-slug-xyz/upload-file",
            files=files
        )
        assert response.status_code == 404
        print(f"✓ 404 returned for nonexistent site slug")


class TestDashboardHeaderNoLogo:
    """Tests to verify dashboard header does not show logo."""
    
    def test_api_returns_site_data_without_exposing_logo_in_header(self, authenticated_client):
        """API test - dashboard header is frontend-only, verify API works correctly."""
        # This is a frontend concern, but we can verify the API returns data correctly
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{EXISTING_SITE_ID}")
        assert response.status_code == 200
        site = response.json()
        
        # Site has logo data, but dashboard header won't display it
        # This is controlled by frontend DashboardLayout.js
        assert "logo_url" in site
        print(f"✓ Site API returns logo_url (frontend controls display)")
        print(f"  Note: Dashboard header logo removal is frontend-only change")


class TestPublicPageCompactHeader:
    """Tests for public page compact header layout."""
    
    def test_public_site_returns_all_required_fields(self):
        """Verify public site response has all fields for compact header."""
        response = requests.get(f"{BASE_URL}/api/sites/public/{EXISTING_SITE_SLUG}")
        assert response.status_code == 200
        
        site = response.json()
        
        # Required fields for compact header
        required_fields = [
            "name",
            "logo_url",
            "logo_scale",
            "header_image_url",
            "button_color",
            "audio_enabled",
            "audio_url",
            "video_enabled",
            "video_url",
            "form_enabled",
            "form_file_upload_enabled"
        ]
        
        for field in required_fields:
            assert field in site, f"Missing field: {field}"
        
        print(f"✓ Public site has all required fields for compact header:")
        print(f"  name: {site.get('name')}")
        print(f"  logo_url: {site.get('logo_url')}")
        print(f"  logo_scale: {site.get('logo_scale')}%")
        print(f"  button_color: {site.get('button_color')}")
        print(f"  form_file_upload_enabled: {site.get('form_file_upload_enabled')}")
