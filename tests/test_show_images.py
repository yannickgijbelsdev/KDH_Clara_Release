"""
Test Show Image Upload/Replace/Remove Feature
Tests for POST /api/shows/{show_id}/image and DELETE /api/shows/{show_id}/image endpoints
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
TEST_EMAIL = "demo@radio.com"
TEST_PASSWORD = "password123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for testing."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated session."""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}"
    })
    return session


@pytest.fixture(scope="module")
def test_show(api_client):
    """Create a test show for image upload testing."""
    show_data = {
        "title": "TEST_Show_Image_Upload_Test",
        "description": "Test show for image upload feature",
        "date": "2026-02-15",
        "start_time": "10:00",
        "end_time": "12:00",
        "status": "draft"
    }
    response = api_client.post(f"{BASE_URL}/api/shows", json=show_data)
    assert response.status_code == 201, f"Failed to create test show: {response.text}"
    show = response.json()
    yield show
    # Cleanup: Delete the test show
    api_client.delete(f"{BASE_URL}/api/shows/{show['id']}")


def create_test_image(filename="test_image.jpg", content_type="image/jpeg", size=1024):
    """Create a fake image file for testing."""
    # Create a minimal valid JPEG header
    jpeg_header = bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00
    ])
    # Pad with zeros to reach desired size
    padding = bytes([0x00] * (size - len(jpeg_header) - 2))
    jpeg_footer = bytes([0xFF, 0xD9])
    return jpeg_header + padding + jpeg_footer


class TestShowImageUpload:
    """Test show image upload functionality."""
    
    def test_upload_show_image(self, api_client, test_show):
        """Test uploading an image to a show."""
        show_id = test_show["id"]
        
        # Create test image
        image_data = create_test_image()
        files = {
            "file": ("test_show_image.jpg", io.BytesIO(image_data), "image/jpeg")
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/shows/{show_id}/image",
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert data.get("success") is True
        assert "image" in data
        assert "file_storage_key" in data["image"]
        assert "file_name" in data["image"]
        assert data["image"]["file_name"] == "test_show_image.jpg"
        assert "mime_type" in data["image"]
        assert data["image"]["mime_type"] == "image/jpeg"
        assert "size" in data["image"]
        
        print(f"✓ Image uploaded successfully: {data['image']['file_storage_key']}")
    
    def test_show_image_persists_in_show_detail(self, api_client, test_show):
        """Test that uploaded image appears in show detail response."""
        show_id = test_show["id"]
        
        # Get show details
        response = api_client.get(f"{BASE_URL}/api/shows/{show_id}")
        assert response.status_code == 200
        
        show = response.json()
        assert "image" in show, "Show should have image field"
        assert show["image"] is not None, "Image should not be null after upload"
        assert "file_storage_key" in show["image"]
        
        print(f"✓ Image persists in show detail: {show['image']['file_storage_key']}")
    
    def test_show_image_in_shows_list(self, api_client, test_show):
        """Test that image appears in shows list response."""
        response = api_client.get(f"{BASE_URL}/api/shows")
        assert response.status_code == 200
        
        shows = response.json()
        test_show_in_list = next((s for s in shows if s["id"] == test_show["id"]), None)
        
        assert test_show_in_list is not None, "Test show should be in list"
        assert "image" in test_show_in_list, "Show in list should have image field"
        
        print(f"✓ Image appears in shows list")
    
    def test_show_image_file_accessible(self, api_client, test_show):
        """Test that the uploaded image file is accessible via the serving endpoint."""
        show_id = test_show["id"]
        
        # Get show to get the image storage key
        response = api_client.get(f"{BASE_URL}/api/shows/{show_id}")
        assert response.status_code == 200
        show = response.json()
        
        if show.get("image"):
            storage_key = show["image"]["file_storage_key"]
            
            # Try to access the image file
            img_response = requests.get(f"{BASE_URL}/api/uploads/show_images/{storage_key}")
            assert img_response.status_code == 200, f"Image file not accessible: {img_response.status_code}"
            assert "image" in img_response.headers.get("content-type", "")
            
            print(f"✓ Image file accessible at /api/uploads/show_images/{storage_key}")
    
    def test_replace_show_image(self, api_client, test_show):
        """Test replacing an existing show image."""
        show_id = test_show["id"]
        
        # Get current image storage key
        response = api_client.get(f"{BASE_URL}/api/shows/{show_id}")
        old_storage_key = response.json().get("image", {}).get("file_storage_key")
        
        # Upload new image
        new_image_data = create_test_image(size=2048)
        files = {
            "file": ("replacement_image.png", io.BytesIO(new_image_data), "image/png")
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/shows/{show_id}/image",
            files=files
        )
        
        assert response.status_code == 200, f"Replace failed: {response.text}"
        data = response.json()
        
        # Verify new image
        assert data["image"]["file_name"] == "replacement_image.png"
        new_storage_key = data["image"]["file_storage_key"]
        
        # Storage key should be different
        if old_storage_key:
            assert new_storage_key != old_storage_key, "New image should have different storage key"
        
        print(f"✓ Image replaced successfully: {new_storage_key}")
    
    def test_delete_show_image(self, api_client, test_show):
        """Test removing an image from a show."""
        show_id = test_show["id"]
        
        # Ensure show has an image first
        response = api_client.get(f"{BASE_URL}/api/shows/{show_id}")
        if not response.json().get("image"):
            # Upload an image first
            image_data = create_test_image()
            files = {"file": ("to_delete.jpg", io.BytesIO(image_data), "image/jpeg")}
            api_client.post(f"{BASE_URL}/api/shows/{show_id}/image", files=files)
        
        # Delete the image
        response = api_client.delete(f"{BASE_URL}/api/shows/{show_id}/image")
        assert response.status_code == 200, f"Delete failed: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        
        # Verify image is removed from show
        response = api_client.get(f"{BASE_URL}/api/shows/{show_id}")
        show = response.json()
        assert show.get("image") is None, "Image should be null after deletion"
        
        print("✓ Image deleted successfully")
    
    def test_upload_invalid_file_type(self, api_client, test_show):
        """Test that non-image files are rejected."""
        show_id = test_show["id"]
        
        # Try to upload a text file
        files = {
            "file": ("test.txt", io.BytesIO(b"This is not an image"), "text/plain")
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/shows/{show_id}/image",
            files=files
        )
        
        assert response.status_code == 400, f"Should reject non-image: {response.status_code}"
        assert "Invalid file type" in response.json().get("detail", "")
        
        print("✓ Invalid file type correctly rejected")
    
    def test_upload_to_nonexistent_show(self, api_client):
        """Test uploading to a non-existent show returns 404."""
        fake_show_id = "nonexistent-show-id-12345"
        
        image_data = create_test_image()
        files = {
            "file": ("test.jpg", io.BytesIO(image_data), "image/jpeg")
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/shows/{fake_show_id}/image",
            files=files
        )
        
        assert response.status_code == 404, f"Should return 404: {response.status_code}"
        
        print("✓ Upload to non-existent show returns 404")
    
    def test_delete_from_nonexistent_show(self, api_client):
        """Test deleting from a non-existent show returns 404."""
        fake_show_id = "nonexistent-show-id-12345"
        
        response = api_client.delete(f"{BASE_URL}/api/shows/{fake_show_id}/image")
        
        assert response.status_code == 404, f"Should return 404: {response.status_code}"
        
        print("✓ Delete from non-existent show returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
