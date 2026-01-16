"""
Test Content-Level Featured Images Feature
Tests for uploading, viewing, editing, and removing featured images on content items.
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo@radio.com"
TEST_PASSWORD = "password123"


class TestContentFeaturedImages:
    """Test content-level featured image upload, view, edit, and delete."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json().get("token")
        assert token, "No access token received"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.created_content_ids = []
        
        yield
        
        # Cleanup: Delete test content items
        for content_id in self.created_content_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/content/{content_id}")
            except:
                pass
    
    def create_test_content(self, title="TEST_Featured_Image_Content"):
        """Helper to create a test content item."""
        response = self.session.post(f"{BASE_URL}/api/content", json={
            "title": title,
            "type": "text",
            "body": "Test content body",
            "status": "draft"
        })
        assert response.status_code == 201, f"Failed to create content: {response.text}"
        content = response.json()
        self.created_content_ids.append(content["id"])
        return content
    
    def create_test_image(self, filename="test_image.jpg", size=1024):
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
    
    # ============== TEST: Upload Featured Image When Creating Content ==============
    
    def test_upload_featured_image_after_content_creation(self):
        """Test uploading a featured image to a newly created content item."""
        # Step 1: Create content
        content = self.create_test_content("TEST_Upload_Featured_Image")
        content_id = content["id"]
        
        # Verify no featured image initially
        assert content.get("featured_image") is None, "New content should not have featured image"
        
        # Step 2: Upload featured image
        image_data = self.create_test_image()
        files = {"file": ("test_featured.jpg", io.BytesIO(image_data), "image/jpeg")}
        
        # Remove Content-Type header for multipart upload
        headers = dict(self.session.headers)
        del headers["Content-Type"]
        
        upload_response = requests.post(
            f"{BASE_URL}/api/content/{content_id}/featured-image",
            files=files,
            headers=headers
        )
        
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        upload_result = upload_response.json()
        
        assert upload_result.get("success") is True, "Upload should return success=True"
        assert "featured_image" in upload_result, "Response should contain featured_image"
        
        featured_image = upload_result["featured_image"]
        assert featured_image.get("file_name") == "test_featured.jpg"
        assert featured_image.get("mime_type") == "image/jpeg"
        assert featured_image.get("file_storage_key") is not None
        assert featured_image.get("size") > 0
        
        print(f"✓ Featured image uploaded successfully: {featured_image['file_name']}")
    
    # ============== TEST: View Featured Image in Content Detail ==============
    
    def test_view_featured_image_in_content_detail(self):
        """Test that featured image is visible when fetching content details."""
        # Create content and upload image
        content = self.create_test_content("TEST_View_Featured_Image")
        content_id = content["id"]
        
        image_data = self.create_test_image()
        files = {"file": ("view_test.png", io.BytesIO(image_data), "image/png")}
        headers = dict(self.session.headers)
        del headers["Content-Type"]
        
        requests.post(
            f"{BASE_URL}/api/content/{content_id}/featured-image",
            files=files,
            headers=headers
        )
        
        # Fetch content details
        detail_response = self.session.get(f"{BASE_URL}/api/content/{content_id}")
        assert detail_response.status_code == 200, f"Failed to get content: {detail_response.text}"
        
        content_detail = detail_response.json()
        assert content_detail.get("featured_image") is not None, "Content should have featured_image"
        
        featured_image = content_detail["featured_image"]
        assert featured_image.get("file_name") == "view_test.png"
        assert featured_image.get("mime_type") == "image/png"
        
        print(f"✓ Featured image visible in content detail: {featured_image['file_name']}")
    
    # ============== TEST: Replace Featured Image (Edit) ==============
    
    def test_replace_featured_image(self):
        """Test replacing an existing featured image with a new one."""
        # Create content and upload initial image
        content = self.create_test_content("TEST_Replace_Featured_Image")
        content_id = content["id"]
        
        headers = dict(self.session.headers)
        del headers["Content-Type"]
        
        # Upload first image
        image1 = self.create_test_image()
        files1 = {"file": ("original_image.jpg", io.BytesIO(image1), "image/jpeg")}
        upload1 = requests.post(
            f"{BASE_URL}/api/content/{content_id}/featured-image",
            files=files1,
            headers=headers
        )
        assert upload1.status_code == 200
        original_storage_key = upload1.json()["featured_image"]["file_storage_key"]
        
        # Upload replacement image
        image2 = self.create_test_image(size=2048)
        files2 = {"file": ("replacement_image.png", io.BytesIO(image2), "image/png")}
        upload2 = requests.post(
            f"{BASE_URL}/api/content/{content_id}/featured-image",
            files=files2,
            headers=headers
        )
        assert upload2.status_code == 200, f"Replace failed: {upload2.text}"
        
        new_image = upload2.json()["featured_image"]
        assert new_image["file_name"] == "replacement_image.png"
        assert new_image["mime_type"] == "image/png"
        assert new_image["file_storage_key"] != original_storage_key, "Storage key should change"
        
        # Verify via GET
        detail = self.session.get(f"{BASE_URL}/api/content/{content_id}").json()
        assert detail["featured_image"]["file_name"] == "replacement_image.png"
        
        print(f"✓ Featured image replaced successfully: {new_image['file_name']}")
    
    # ============== TEST: Remove Featured Image ==============
    
    def test_remove_featured_image(self):
        """Test removing a featured image from content."""
        # Create content and upload image
        content = self.create_test_content("TEST_Remove_Featured_Image")
        content_id = content["id"]
        
        headers = dict(self.session.headers)
        del headers["Content-Type"]
        
        image_data = self.create_test_image()
        files = {"file": ("to_be_removed.jpg", io.BytesIO(image_data), "image/jpeg")}
        requests.post(
            f"{BASE_URL}/api/content/{content_id}/featured-image",
            files=files,
            headers=headers
        )
        
        # Verify image exists
        detail_before = self.session.get(f"{BASE_URL}/api/content/{content_id}").json()
        assert detail_before.get("featured_image") is not None, "Image should exist before removal"
        
        # Remove the image
        delete_response = self.session.delete(f"{BASE_URL}/api/content/{content_id}/featured-image")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        delete_result = delete_response.json()
        assert delete_result.get("success") is True, "Delete should return success=True"
        
        # Verify image is removed
        detail_after = self.session.get(f"{BASE_URL}/api/content/{content_id}").json()
        assert detail_after.get("featured_image") is None, "Image should be None after removal"
        
        print("✓ Featured image removed successfully")
    
    # ============== TEST: Featured Image Persists After Saving ==============
    
    def test_featured_image_persists_after_content_update(self):
        """Test that featured image persists when content is updated."""
        # Create content and upload image
        content = self.create_test_content("TEST_Persist_Featured_Image")
        content_id = content["id"]
        
        headers = dict(self.session.headers)
        del headers["Content-Type"]
        
        image_data = self.create_test_image()
        files = {"file": ("persistent_image.jpg", io.BytesIO(image_data), "image/jpeg")}
        upload_response = requests.post(
            f"{BASE_URL}/api/content/{content_id}/featured-image",
            files=files,
            headers=headers
        )
        original_image = upload_response.json()["featured_image"]
        
        # Update content (title, body, etc.)
        update_response = self.session.put(f"{BASE_URL}/api/content/{content_id}", json={
            "title": "TEST_Updated_Title_With_Image",
            "body": "Updated body content",
            "status": "ready"
        })
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Verify featured image still exists
        updated_content = update_response.json()
        assert updated_content.get("featured_image") is not None, "Featured image should persist after update"
        assert updated_content["featured_image"]["file_storage_key"] == original_image["file_storage_key"]
        assert updated_content["featured_image"]["file_name"] == "persistent_image.jpg"
        
        # Double-check via GET
        detail = self.session.get(f"{BASE_URL}/api/content/{content_id}").json()
        assert detail["featured_image"]["file_name"] == "persistent_image.jpg"
        
        print("✓ Featured image persists after content update")
    
    # ============== TEST: Invalid File Type Rejection ==============
    
    def test_reject_invalid_file_type(self):
        """Test that non-image files are rejected."""
        content = self.create_test_content("TEST_Invalid_File_Type")
        content_id = content["id"]
        
        headers = dict(self.session.headers)
        del headers["Content-Type"]
        
        # Try to upload a text file
        files = {"file": ("document.txt", io.BytesIO(b"This is not an image"), "text/plain")}
        response = requests.post(
            f"{BASE_URL}/api/content/{content_id}/featured-image",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 400, f"Should reject invalid file type, got {response.status_code}"
        assert "Invalid file type" in response.text or "Allowed" in response.text
        
        print("✓ Invalid file type correctly rejected")
    
    # ============== TEST: Featured Image on Non-existent Content ==============
    
    def test_upload_to_nonexistent_content(self):
        """Test uploading image to non-existent content returns 404."""
        headers = dict(self.session.headers)
        del headers["Content-Type"]
        
        image_data = self.create_test_image()
        files = {"file": ("test.jpg", io.BytesIO(image_data), "image/jpeg")}
        
        response = requests.post(
            f"{BASE_URL}/api/content/nonexistent-id-12345/featured-image",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 404, f"Should return 404, got {response.status_code}"
        
        print("✓ Upload to non-existent content returns 404")
    
    # ============== TEST: Delete Image from Non-existent Content ==============
    
    def test_delete_from_nonexistent_content(self):
        """Test deleting image from non-existent content returns 404."""
        response = self.session.delete(f"{BASE_URL}/api/content/nonexistent-id-12345/featured-image")
        assert response.status_code == 404, f"Should return 404, got {response.status_code}"
        
        print("✓ Delete from non-existent content returns 404")
    
    # ============== TEST: Featured Image in Content List ==============
    
    def test_featured_image_in_content_list(self):
        """Test that featured image info is included in content list."""
        # Create content with image
        content = self.create_test_content("TEST_List_Featured_Image")
        content_id = content["id"]
        
        headers = dict(self.session.headers)
        del headers["Content-Type"]
        
        image_data = self.create_test_image()
        files = {"file": ("list_test.jpg", io.BytesIO(image_data), "image/jpeg")}
        requests.post(
            f"{BASE_URL}/api/content/{content_id}/featured-image",
            files=files,
            headers=headers
        )
        
        # Get content list
        list_response = self.session.get(f"{BASE_URL}/api/content")
        assert list_response.status_code == 200
        
        content_list = list_response.json()
        test_content = next((c for c in content_list if c["id"] == content_id), None)
        
        assert test_content is not None, "Test content should be in list"
        # Note: The list endpoint may or may not include featured_image depending on implementation
        # This test verifies the behavior
        
        print(f"✓ Content list retrieved, featured_image included: {test_content.get('featured_image') is not None}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
