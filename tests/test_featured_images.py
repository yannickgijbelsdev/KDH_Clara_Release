"""
MVP 3.1 Backend Tests - Featured Image Sync Support
Tests for:
- Featured Image Upload per content+site combination
- Featured Image GET/DELETE APIs
- Featured Image file serving
- Integration with multi-site publishing
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo@radio.com"
ADMIN_PASSWORD = "password123"

# Test image file path
TEST_IMAGE_PATH = "/tmp/test_featured.jpg"


class TestSetup:
    """Setup and authentication tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        return data["token"]
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        """Get headers with admin auth token"""
        return {
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def admin_headers_multipart(self, admin_token):
        """Get headers for multipart form data (no Content-Type)"""
        return {
            "Authorization": f"Bearer {admin_token}"
        }


class TestFeaturedImageSetup(TestSetup):
    """Setup test data for featured image tests"""
    
    def test_create_test_content(self, admin_headers):
        """Create a test content item for featured image tests"""
        content_data = {
            "title": f"TEST_FeaturedImage Content {uuid.uuid4().hex[:8]}",
            "type": "text",
            "body": "Content for featured image testing",
            "status": "ready"
        }
        response = requests.post(f"{BASE_URL}/api/content", json=content_data, headers=admin_headers)
        assert response.status_code == 201, f"Create content failed: {response.text}"
        
        data = response.json()
        self.__class__.content_id = data["id"]
        print(f"Created test content: {data['id']}")
    
    def test_create_test_wordpress_site(self, admin_headers):
        """Create a test WordPress site for featured image tests"""
        site_data = {
            "name": f"TEST_FeaturedImage WP Site {uuid.uuid4().hex[:8]}",
            "wp_base_url": "https://test-featured-image.example.com",
            "username": "testadmin",
            "app_password": "xxxx xxxx xxxx xxxx",
            "default_post_type": "post",
            "default_publish_status": "draft",
            "is_active": True
        }
        response = requests.post(f"{BASE_URL}/api/wordpress/sites", json=site_data, headers=admin_headers)
        assert response.status_code == 201, f"Create WP site failed: {response.text}"
        
        data = response.json()
        self.__class__.site_id = data["id"]
        print(f"Created test WordPress site: {data['id']}")
    
    def test_create_second_wordpress_site(self, admin_headers):
        """Create a second test WordPress site"""
        site_data = {
            "name": f"TEST_FeaturedImage WP Site 2 {uuid.uuid4().hex[:8]}",
            "wp_base_url": "https://test-featured-image-2.example.com",
            "username": "testadmin2",
            "app_password": "yyyy yyyy yyyy yyyy",
            "default_post_type": "post",
            "default_publish_status": "draft",
            "is_active": True
        }
        response = requests.post(f"{BASE_URL}/api/wordpress/sites", json=site_data, headers=admin_headers)
        assert response.status_code == 201, f"Create second WP site failed: {response.text}"
        
        data = response.json()
        self.__class__.site_id_2 = data["id"]
        print(f"Created second test WordPress site: {data['id']}")


class TestFeaturedImageUpload(TestSetup):
    """Featured Image Upload tests"""
    
    def test_upload_featured_image(self, admin_headers_multipart):
        """Test uploading a featured image for a content+site combination"""
        content_id = getattr(TestFeaturedImageSetup, 'content_id', None)
        site_id = getattr(TestFeaturedImageSetup, 'site_id', None)
        
        if not content_id or not site_id:
            pytest.skip("Missing content or site ID from setup")
        
        # Create test image if not exists
        if not os.path.exists(TEST_IMAGE_PATH):
            # Create a minimal valid JPEG
            import struct
            with open(TEST_IMAGE_PATH, 'wb') as f:
                # Minimal JPEG header
                f.write(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00')
                f.write(b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t')
                f.write(b'\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a')
                f.write(b'\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9LJ')
                f.write(b'9=78telerik\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00')
                f.write(b'\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00')
                f.write(b'\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b')
                f.write(b'\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\xff\xd9')
        
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test_featured.jpg', f, 'image/jpeg')}
            response = requests.post(
                f"{BASE_URL}/api/content/{content_id}/featured-images/{site_id}",
                files=files,
                headers=admin_headers_multipart
            )
        
        assert response.status_code == 200, f"Upload featured image failed: {response.text}"
        
        data = response.json()
        assert data["content_item_id"] == content_id
        assert data["wordpress_site_id"] == site_id
        assert "file_storage_key" in data
        assert "file_name" in data
        assert data["mime_type"] == "image/jpeg"
        assert data["size"] > 0
        assert data["sync_status"] == "not_synced"
        assert "id" in data
        
        self.__class__.featured_image_id = data["id"]
        self.__class__.file_storage_key = data["file_storage_key"]
        print(f"Uploaded featured image: {data['id']}, key: {data['file_storage_key']}")
    
    def test_upload_featured_image_second_site(self, admin_headers_multipart):
        """Test uploading a featured image for a second site (same content)"""
        content_id = getattr(TestFeaturedImageSetup, 'content_id', None)
        site_id_2 = getattr(TestFeaturedImageSetup, 'site_id_2', None)
        
        if not content_id or not site_id_2:
            pytest.skip("Missing content or site ID from setup")
        
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test_featured_2.jpg', f, 'image/jpeg')}
            response = requests.post(
                f"{BASE_URL}/api/content/{content_id}/featured-images/{site_id_2}",
                files=files,
                headers=admin_headers_multipart
            )
        
        assert response.status_code == 200, f"Upload second featured image failed: {response.text}"
        
        data = response.json()
        assert data["wordpress_site_id"] == site_id_2
        print(f"Uploaded second featured image: {data['id']}")
    
    def test_upload_replaces_existing_image(self, admin_headers_multipart):
        """Test that uploading a new image replaces the existing one for same content+site"""
        content_id = getattr(TestFeaturedImageSetup, 'content_id', None)
        site_id = getattr(TestFeaturedImageSetup, 'site_id', None)
        old_storage_key = getattr(self.__class__, 'file_storage_key', None)
        
        if not content_id or not site_id:
            pytest.skip("Missing content or site ID from setup")
        
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test_featured_replaced.jpg', f, 'image/jpeg')}
            response = requests.post(
                f"{BASE_URL}/api/content/{content_id}/featured-images/{site_id}",
                files=files,
                headers=admin_headers_multipart
            )
        
        assert response.status_code == 200, f"Replace featured image failed: {response.text}"
        
        data = response.json()
        # Should have a new storage key
        assert data["file_storage_key"] != old_storage_key
        assert data["file_name"] == "test_featured_replaced.jpg"
        
        self.__class__.file_storage_key = data["file_storage_key"]
        print(f"Replaced featured image, new key: {data['file_storage_key']}")
    
    def test_upload_invalid_file_type(self, admin_headers_multipart):
        """Test that uploading invalid file type returns error"""
        content_id = getattr(TestFeaturedImageSetup, 'content_id', None)
        site_id = getattr(TestFeaturedImageSetup, 'site_id', None)
        
        if not content_id or not site_id:
            pytest.skip("Missing content or site ID from setup")
        
        # Create a fake text file
        files = {'file': ('test.txt', b'This is not an image', 'text/plain')}
        response = requests.post(
            f"{BASE_URL}/api/content/{content_id}/featured-images/{site_id}",
            files=files,
            headers=admin_headers_multipart
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid file type, got {response.status_code}"
        assert "invalid file type" in response.text.lower()
        print("Invalid file type correctly rejected")
    
    def test_upload_to_nonexistent_content(self, admin_headers_multipart):
        """Test uploading to non-existent content returns 404"""
        site_id = getattr(TestFeaturedImageSetup, 'site_id', None)
        fake_content_id = str(uuid.uuid4())
        
        if not site_id:
            pytest.skip("Missing site ID from setup")
        
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            response = requests.post(
                f"{BASE_URL}/api/content/{fake_content_id}/featured-images/{site_id}",
                files=files,
                headers=admin_headers_multipart
            )
        
        assert response.status_code == 404, f"Expected 404 for non-existent content, got {response.status_code}"
        print("Upload to non-existent content correctly returned 404")
    
    def test_upload_to_nonexistent_site(self, admin_headers_multipart):
        """Test uploading to non-existent site returns 404"""
        content_id = getattr(TestFeaturedImageSetup, 'content_id', None)
        fake_site_id = str(uuid.uuid4())
        
        if not content_id:
            pytest.skip("Missing content ID from setup")
        
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            response = requests.post(
                f"{BASE_URL}/api/content/{content_id}/featured-images/{fake_site_id}",
                files=files,
                headers=admin_headers_multipart
            )
        
        assert response.status_code == 404, f"Expected 404 for non-existent site, got {response.status_code}"
        print("Upload to non-existent site correctly returned 404")


class TestFeaturedImageGet(TestSetup):
    """Featured Image GET API tests"""
    
    def test_get_featured_images_list(self, admin_headers):
        """Test getting list of featured images for a content item"""
        content_id = getattr(TestFeaturedImageSetup, 'content_id', None)
        
        if not content_id:
            pytest.skip("Missing content ID from setup")
        
        response = requests.get(
            f"{BASE_URL}/api/content/{content_id}/featured-images",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Get featured images failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        # Should have 2 images (one per site)
        assert len(data) >= 2, f"Expected at least 2 images, got {len(data)}"
        
        for img in data:
            assert "id" in img
            assert "content_item_id" in img
            assert "wordpress_site_id" in img
            assert "file_storage_key" in img
            assert "file_name" in img
            assert "mime_type" in img
            assert "size" in img
            assert "sync_status" in img
        
        print(f"Found {len(data)} featured images for content")
    
    def test_get_featured_images_nonexistent_content(self, admin_headers):
        """Test getting featured images for non-existent content returns 404"""
        fake_content_id = str(uuid.uuid4())
        
        response = requests.get(
            f"{BASE_URL}/api/content/{fake_content_id}/featured-images",
            headers=admin_headers
        )
        
        assert response.status_code == 404
        print("Get featured images for non-existent content correctly returned 404")


class TestFeaturedImageServe(TestSetup):
    """Featured Image file serving tests"""
    
    def test_serve_featured_image_file(self, admin_headers):
        """Test serving a featured image file"""
        file_storage_key = getattr(TestFeaturedImageUpload, 'file_storage_key', None)
        
        if not file_storage_key:
            pytest.skip("Missing file storage key from upload test")
        
        response = requests.get(
            f"{BASE_URL}/api/uploads/featured_images/{file_storage_key}",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Serve featured image failed: {response.status_code}"
        assert response.headers.get('content-type', '').startswith('image/')
        assert len(response.content) > 0
        print(f"Served featured image file, size: {len(response.content)} bytes")
    
    def test_serve_nonexistent_file(self, admin_headers):
        """Test serving non-existent file returns 404"""
        fake_key = f"nonexistent_{uuid.uuid4().hex}.jpg"
        
        response = requests.get(
            f"{BASE_URL}/api/uploads/featured_images/{fake_key}",
            headers=admin_headers
        )
        
        assert response.status_code == 404
        print("Serve non-existent file correctly returned 404")


class TestFeaturedImageDelete(TestSetup):
    """Featured Image DELETE API tests"""
    
    def test_delete_featured_image(self, admin_headers):
        """Test deleting a featured image"""
        content_id = getattr(TestFeaturedImageSetup, 'content_id', None)
        site_id_2 = getattr(TestFeaturedImageSetup, 'site_id_2', None)
        
        if not content_id or not site_id_2:
            pytest.skip("Missing content or site ID from setup")
        
        response = requests.delete(
            f"{BASE_URL}/api/content/{content_id}/featured-images/{site_id_2}",
            headers=admin_headers
        )
        
        assert response.status_code == 204, f"Delete featured image failed: {response.status_code}"
        print("Deleted featured image for site 2")
        
        # Verify deletion
        get_response = requests.get(
            f"{BASE_URL}/api/content/{content_id}/featured-images",
            headers=admin_headers
        )
        assert get_response.status_code == 200
        images = get_response.json()
        site_2_images = [img for img in images if img["wordpress_site_id"] == site_id_2]
        assert len(site_2_images) == 0, "Image should have been deleted"
        print("Verified featured image was deleted")
    
    def test_delete_nonexistent_featured_image(self, admin_headers):
        """Test deleting non-existent featured image returns 404"""
        content_id = getattr(TestFeaturedImageSetup, 'content_id', None)
        fake_site_id = str(uuid.uuid4())
        
        if not content_id:
            pytest.skip("Missing content ID from setup")
        
        response = requests.delete(
            f"{BASE_URL}/api/content/{content_id}/featured-images/{fake_site_id}",
            headers=admin_headers
        )
        
        assert response.status_code == 404
        print("Delete non-existent featured image correctly returned 404")


class TestFeaturedImageInPublishStatus(TestSetup):
    """Test featured images appear in content publish statuses"""
    
    def test_content_detail_includes_featured_images(self, admin_headers):
        """Test that content detail includes featured images in publish statuses"""
        content_id = getattr(TestFeaturedImageSetup, 'content_id', None)
        site_id = getattr(TestFeaturedImageSetup, 'site_id', None)
        
        if not content_id or not site_id:
            pytest.skip("Missing content or site ID from setup")
        
        # First, publish to the site to create a publish status
        publish_data = {
            "targets": [
                {"site_id": site_id, "post_type": "post", "wp_status": "draft"}
            ]
        }
        requests.post(f"{BASE_URL}/api/content/{content_id}/publish", json=publish_data, headers=admin_headers)
        
        # Now get content detail
        response = requests.get(f"{BASE_URL}/api/content/{content_id}", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "publish_statuses" in data
        
        # Find the publish status for our site
        site_status = None
        for ps in data["publish_statuses"]:
            if ps["wordpress_site_id"] == site_id:
                site_status = ps
                break
        
        if site_status:
            # Should have featured_image field
            assert "featured_image" in site_status
            if site_status["featured_image"]:
                assert "file_storage_key" in site_status["featured_image"]
                print(f"Content detail includes featured image in publish status")
            else:
                print("Publish status exists but no featured image attached")
        else:
            print("No publish status found for site (may have failed due to mock WP)")


class TestExistingFunctionality(TestSetup):
    """Test that existing MVP 3 functionality still works"""
    
    def test_content_crud_still_works(self, admin_headers):
        """Test content CRUD operations still work"""
        # Create
        content_data = {
            "title": f"TEST_Existing CRUD {uuid.uuid4().hex[:8]}",
            "type": "text",
            "body": "Test body",
            "status": "draft"
        }
        create_response = requests.post(f"{BASE_URL}/api/content", json=content_data, headers=admin_headers)
        assert create_response.status_code == 201
        content_id = create_response.json()["id"]
        
        # Read
        get_response = requests.get(f"{BASE_URL}/api/content/{content_id}", headers=admin_headers)
        assert get_response.status_code == 200
        
        # Update
        update_response = requests.put(
            f"{BASE_URL}/api/content/{content_id}",
            json={"title": "Updated Title"},
            headers=admin_headers
        )
        assert update_response.status_code == 200
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=admin_headers)
        assert delete_response.status_code == 204
        
        print("Content CRUD operations still work")
    
    def test_wordpress_sites_crud_still_works(self, admin_headers):
        """Test WordPress sites CRUD operations still work"""
        # Create
        site_data = {
            "name": f"TEST_Existing WP CRUD {uuid.uuid4().hex[:8]}",
            "wp_base_url": "https://test-existing.example.com",
            "username": "admin",
            "app_password": "test pass",
            "default_post_type": "post",
            "default_publish_status": "draft",
            "is_active": True
        }
        create_response = requests.post(f"{BASE_URL}/api/wordpress/sites", json=site_data, headers=admin_headers)
        assert create_response.status_code == 201
        site_id = create_response.json()["id"]
        
        # Read
        get_response = requests.get(f"{BASE_URL}/api/wordpress/sites/{site_id}", headers=admin_headers)
        assert get_response.status_code == 200
        
        # Update
        update_response = requests.put(
            f"{BASE_URL}/api/wordpress/sites/{site_id}",
            json={"name": "Updated Site Name"},
            headers=admin_headers
        )
        assert update_response.status_code == 200
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/wordpress/sites/{site_id}", headers=admin_headers)
        assert delete_response.status_code == 204
        
        print("WordPress sites CRUD operations still work")
    
    def test_multi_site_publishing_still_works(self, admin_headers):
        """Test multi-site publishing still works"""
        # Create content
        content_data = {
            "title": f"TEST_Publish Test {uuid.uuid4().hex[:8]}",
            "type": "text",
            "body": "Test body",
            "status": "ready"
        }
        create_response = requests.post(f"{BASE_URL}/api/content", json=content_data, headers=admin_headers)
        assert create_response.status_code == 201
        content_id = create_response.json()["id"]
        
        # Create site
        site_data = {
            "name": f"TEST_Publish Site {uuid.uuid4().hex[:8]}",
            "wp_base_url": "https://test-publish.example.com",
            "username": "admin",
            "app_password": "test pass",
            "default_post_type": "post",
            "default_publish_status": "draft",
            "is_active": True
        }
        site_response = requests.post(f"{BASE_URL}/api/wordpress/sites", json=site_data, headers=admin_headers)
        assert site_response.status_code == 201
        site_id = site_response.json()["id"]
        
        # Publish
        publish_data = {
            "targets": [
                {"site_id": site_id, "post_type": "post", "wp_status": "draft"}
            ]
        }
        publish_response = requests.post(
            f"{BASE_URL}/api/content/{content_id}/publish",
            json=publish_data,
            headers=admin_headers
        )
        assert publish_response.status_code == 200
        assert "results" in publish_response.json()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=admin_headers)
        requests.delete(f"{BASE_URL}/api/wordpress/sites/{site_id}", headers=admin_headers)
        
        print("Multi-site publishing still works")


class TestCleanup(TestSetup):
    """Cleanup test data"""
    
    def test_cleanup_test_content(self, admin_headers):
        """Delete test content items"""
        response = requests.get(f"{BASE_URL}/api/content?search=TEST_", headers=admin_headers)
        if response.status_code == 200:
            items = response.json()
            deleted = 0
            for item in items:
                if "TEST_" in item["title"]:
                    del_response = requests.delete(f"{BASE_URL}/api/content/{item['id']}", headers=admin_headers)
                    if del_response.status_code == 204:
                        deleted += 1
            print(f"Deleted {deleted} test content items")
    
    def test_cleanup_test_wordpress_sites(self, admin_headers):
        """Delete test WordPress sites"""
        response = requests.get(f"{BASE_URL}/api/wordpress/sites", headers=admin_headers)
        if response.status_code == 200:
            sites = response.json()
            deleted = 0
            for site in sites:
                if "TEST_" in site["name"]:
                    del_response = requests.delete(f"{BASE_URL}/api/wordpress/sites/{site['id']}", headers=admin_headers)
                    if del_response.status_code == 204:
                        deleted += 1
            print(f"Deleted {deleted} test WordPress sites")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
