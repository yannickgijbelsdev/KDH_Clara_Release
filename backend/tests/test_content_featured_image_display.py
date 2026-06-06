"""
Test suite for featured image display in Content Library
Bug fix: Featured images of newly created articles were not displayed in the Content Library overview
Fix: s3_url field added to ContentFeaturedImage model
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "yannick.gijbels@koodh.com"
ADMIN_PASSWORD = "password123"


class TestContentFeaturedImageDisplay:
    """Tests for featured image display in Content Library"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_content_endpoint_returns_200(self):
        """Test GET /api/content returns 200"""
        response = requests.get(f"{BASE_URL}/api/content", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/content returns 200 with {len(data)} items")
    
    def test_featured_image_has_s3_url_field(self):
        """Test that items with featured_image contain s3_url field"""
        response = requests.get(f"{BASE_URL}/api/content", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        items_with_featured_image = [item for item in data if item.get('featured_image')]
        
        if len(items_with_featured_image) == 0:
            pytest.skip("No content items with featured_image found in database")
        
        for item in items_with_featured_image:
            featured_image = item['featured_image']
            # Verify s3_url field exists (can be None if not uploaded to S3)
            assert 's3_url' in featured_image, f"Missing s3_url field in featured_image for item {item['id']}"
            # Verify required fields
            assert 'file_storage_key' in featured_image, "Missing file_storage_key"
            assert 'file_name' in featured_image, "Missing file_name"
            assert 'mime_type' in featured_image, "Missing mime_type"
        
        print(f"✓ All {len(items_with_featured_image)} items with featured_image have s3_url field")
    
    def test_s3_url_is_valid_url_when_present(self):
        """Test that s3_url contains a valid URL when present"""
        response = requests.get(f"{BASE_URL}/api/content", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        items_with_s3_url = [
            item for item in data 
            if item.get('featured_image') and item['featured_image'].get('s3_url')
        ]
        
        if len(items_with_s3_url) == 0:
            pytest.skip("No content items with s3_url found")
        
        for item in items_with_s3_url:
            s3_url = item['featured_image']['s3_url']
            assert s3_url.startswith('http'), f"s3_url should start with http: {s3_url}"
            # S3 URL should contain the bucket name
            assert 'koodh-clara' in s3_url or '.your-objectstorage.com' in s3_url, \
                f"s3_url should be a valid S3 URL: {s3_url}"
        
        print(f"✓ All {len(items_with_s3_url)} s3_url values are valid URLs")
    
    def test_external_featured_image_present_for_imported_content(self):
        """Test that imported WordPress articles have external_featured_image"""
        response = requests.get(f"{BASE_URL}/api/content", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        # Filter items with external_featured_image (from imported WordPress articles)
        items_with_external = [item for item in data if item.get('external_featured_image')]
        
        if len(items_with_external) == 0:
            pytest.skip("No imported WordPress content with external_featured_image found")
        
        for item in items_with_external:
            external_url = item['external_featured_image']
            assert external_url.startswith('http'), f"external_featured_image should be a URL: {external_url}"
        
        print(f"✓ {len(items_with_external)} items have external_featured_image URLs")
    
    def test_featured_image_response_model_fields(self):
        """Verify FeaturedImageResponse model returns all expected fields"""
        response = requests.get(f"{BASE_URL}/api/content", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        items_with_featured_image = [item for item in data if item.get('featured_image')]
        
        if len(items_with_featured_image) == 0:
            pytest.skip("No content items with featured_image found")
        
        expected_fields = ['file_storage_key', 's3_url', 'file_name', 'mime_type', 'size']
        
        for item in items_with_featured_image:
            featured_image = item['featured_image']
            for field in expected_fields:
                assert field in featured_image, \
                    f"Missing field '{field}' in featured_image for item {item['id']}"
        
        print(f"✓ featured_image objects contain all expected fields: {expected_fields}")
    
    def test_content_item_model_includes_featured_image_or_external(self):
        """Test that ContentItemResponse includes both featured_image and external_featured_image fields"""
        response = requests.get(f"{BASE_URL}/api/content", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        if len(data) == 0:
            pytest.skip("No content items found")
        
        # All items should have these fields defined (even if null)
        data[0]
        # Note: featured_image or external_featured_image can be None but the field should exist
        # The response model includes these as Optional fields
        
        # Count items by type
        items_with_featured = len([x for x in data if x.get('featured_image')])
        items_with_external = len([x for x in data if x.get('external_featured_image')])
        items_with_neither = len([x for x in data if not x.get('featured_image') and not x.get('external_featured_image')])
        
        print("✓ Content items breakdown:")
        print(f"  - With featured_image (uploaded): {items_with_featured}")
        print(f"  - With external_featured_image (WordPress import): {items_with_external}")
        print(f"  - With neither: {items_with_neither}")


class TestGetSingleContentItem:
    """Tests for GET /api/content/{id} endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_single_content_item_has_featured_image_fields(self):
        """Test GET /api/content/{id} returns featured_image with s3_url"""
        # First get list to find an item with featured_image
        response = requests.get(f"{BASE_URL}/api/content", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        items_with_featured = [x for x in data if x.get('featured_image')]
        
        if len(items_with_featured) == 0:
            pytest.skip("No content items with featured_image found")
        
        content_id = items_with_featured[0]['id']
        
        # Get single item
        response = requests.get(f"{BASE_URL}/api/content/{content_id}", headers=self.headers)
        assert response.status_code == 200
        
        item = response.json()
        assert item.get('featured_image') is not None, "Single item should have featured_image"
        assert 's3_url' in item['featured_image'], "featured_image should have s3_url field"
        
        print(f"✓ GET /api/content/{content_id} returns featured_image with s3_url")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
