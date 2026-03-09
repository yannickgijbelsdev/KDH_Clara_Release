"""
Test suite for branding settings API endpoints.
Tests: GET/PUT /api/branding, file uploads (logo, favicon, login images), and file deletion.
"""
import pytest
import requests
import os
from io import BytesIO

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API_URL = f"{BASE_URL}/api"

# Admin credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def auth_token():
    """Get admin authentication token."""
    response = requests.post(f"{API_URL}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def session(auth_token):
    """Create authenticated session."""
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return s


class TestBrandingGetEndpoint:
    """Test GET /api/branding - public endpoint (no auth required)."""
    
    def test_get_branding_no_auth(self):
        """GET /api/branding should work without authentication (public)."""
        response = requests.get(f"{API_URL}/branding")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify default/expected fields exist
        assert "platform_name" in data, "Missing platform_name field"
        assert "logo_type" in data, "Missing logo_type field"
        assert "login_layout" in data, "Missing login_layout field"
        assert "login_image_type" in data, "Missing login_image_type field"
        print(f"GET /api/branding response: platform_name={data.get('platform_name')}, logo_type={data.get('logo_type')}")
        
    def test_get_branding_returns_expected_structure(self):
        """Verify branding response has all expected fields."""
        response = requests.get(f"{API_URL}/branding")
        assert response.status_code == 200
        
        data = response.json()
        expected_fields = ["platform_name", "logo_type", "logo_url", "favicon_url", 
                          "login_layout", "login_image_type", "login_images"]
        
        for field in expected_fields:
            assert field in data, f"Missing expected field: {field}"
        
        # Verify login_images is a list
        assert isinstance(data.get("login_images"), list), "login_images should be a list"
        print(f"Branding structure valid: {list(data.keys())}")


class TestBrandingUpdateEndpoint:
    """Test PUT /api/branding - admin only endpoint."""
    
    def test_update_branding_requires_auth(self):
        """PUT /api/branding should require authentication."""
        response = requests.put(f"{API_URL}/branding", json={
            "platform_name": "TestBrand"
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PUT /api/branding without auth correctly returns {response.status_code}")
    
    def test_update_platform_name(self, session):
        """Test updating platform name."""
        # Get current branding
        original = requests.get(f"{API_URL}/branding").json()
        original_name = original.get("platform_name", "Clara")
        
        # Update to test name
        test_name = "TestBrandPlatform"
        response = session.put(f"{API_URL}/branding", json={
            "platform_name": test_name
        })
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        updated = response.json()
        assert updated.get("platform_name") == test_name, f"Expected '{test_name}', got '{updated.get('platform_name')}'"
        print(f"Platform name updated successfully to '{test_name}'")
        
        # Verify GET returns updated value
        get_response = requests.get(f"{API_URL}/branding")
        assert get_response.json().get("platform_name") == test_name
        
        # Restore original
        session.put(f"{API_URL}/branding", json={"platform_name": original_name})
        print(f"Platform name restored to '{original_name}'")
    
    def test_update_login_layout(self, session):
        """Test updating login layout."""
        original = requests.get(f"{API_URL}/branding").json()
        original_layout = original.get("login_layout", "left")
        
        # Try different layouts
        for layout in ["right", "fullscreen", "left"]:
            response = session.put(f"{API_URL}/branding", json={
                "login_layout": layout
            })
            assert response.status_code == 200, f"Layout update to '{layout}' failed"
            assert response.json().get("login_layout") == layout
            print(f"Login layout updated to '{layout}'")
        
        # Restore original
        session.put(f"{API_URL}/branding", json={"login_layout": original_layout})
    
    def test_update_login_image_type(self, session):
        """Test updating login image type."""
        original = requests.get(f"{API_URL}/branding").json()
        original_type = original.get("login_image_type", "static")
        
        # Try different image types
        for img_type in ["carousel", "static"]:
            response = session.put(f"{API_URL}/branding", json={
                "login_image_type": img_type
            })
            assert response.status_code == 200, f"Image type update to '{img_type}' failed"
            assert response.json().get("login_image_type") == img_type
            print(f"Login image type updated to '{img_type}'")
        
        # Restore original
        session.put(f"{API_URL}/branding", json={"login_image_type": original_type})


class TestBrandingFileUploads:
    """Test file upload endpoints for branding."""
    
    def test_upload_logo_requires_auth(self):
        """POST /api/branding/upload-logo should require auth."""
        # Create a fake image file
        fake_file = BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)
        files = {"file": ("test_logo.png", fake_file, "image/png")}
        
        response = requests.post(f"{API_URL}/branding/upload-logo", files=files)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"Logo upload without auth correctly returns {response.status_code}")
    
    def test_upload_favicon_requires_auth(self):
        """POST /api/branding/upload-favicon should require auth."""
        fake_file = BytesIO(b'\x00\x00\x01\x00' + b'\x00' * 100)
        files = {"file": ("test_favicon.ico", fake_file, "image/x-icon")}
        
        response = requests.post(f"{API_URL}/branding/upload-favicon", files=files)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"Favicon upload without auth correctly returns {response.status_code}")
    
    def test_upload_login_image_requires_auth(self):
        """POST /api/branding/upload-login-image should require auth."""
        fake_file = BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)
        files = {"file": ("test_bg.png", fake_file, "image/png")}
        
        response = requests.post(f"{API_URL}/branding/upload-login-image", files=files)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"Login image upload without auth correctly returns {response.status_code}")


class TestBrandingDeleteLoginImage:
    """Test DELETE /api/branding/login-image endpoint."""
    
    def test_delete_login_image_requires_auth(self):
        """DELETE /api/branding/login-image should require auth."""
        response = requests.delete(f"{API_URL}/branding/login-image", params={
            "image_url": "/api/uploads/branding/test.jpg"
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"Delete login image without auth correctly returns {response.status_code}")


class TestBrandingIntegration:
    """Integration tests verifying branding data flow."""
    
    def test_branding_update_and_verify(self, session):
        """Test full flow: update branding, verify GET returns updated values."""
        # Get original
        original = requests.get(f"{API_URL}/branding").json()
        
        # Update multiple fields
        test_update = {
            "platform_name": "IntegrationTestBrand",
            "login_layout": "fullscreen",
            "login_image_type": "carousel"
        }
        
        response = session.put(f"{API_URL}/branding", json=test_update)
        assert response.status_code == 200
        
        # Verify updates
        updated = response.json()
        assert updated.get("platform_name") == test_update["platform_name"]
        assert updated.get("login_layout") == test_update["login_layout"]
        assert updated.get("login_image_type") == test_update["login_image_type"]
        
        # Verify GET also returns updated values
        get_response = requests.get(f"{API_URL}/branding")
        get_data = get_response.json()
        assert get_data.get("platform_name") == test_update["platform_name"]
        assert get_data.get("login_layout") == test_update["login_layout"]
        assert get_data.get("login_image_type") == test_update["login_image_type"]
        print("Branding integration test PASSED: update and verify works correctly")
        
        # Restore original values
        restore_data = {
            "platform_name": original.get("platform_name", "Clara"),
            "login_layout": original.get("login_layout", "left"),
            "login_image_type": original.get("login_image_type", "static")
        }
        session.put(f"{API_URL}/branding", json=restore_data)
        print(f"Restored branding to original values")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
