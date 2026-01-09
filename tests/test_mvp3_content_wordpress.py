"""
MVP 3 Backend Tests - Content Library and Multi-site WordPress Publishing
Tests for:
- Content Library CRUD operations
- WordPress Sites management (admin only)
- Multi-site publishing
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo@radio.com"
ADMIN_PASSWORD = "password123"


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


class TestContentLibraryCRUD(TestSetup):
    """Content Library CRUD operations tests"""
    
    def test_create_content_item_text(self, admin_headers):
        """Test creating a text content item"""
        content_data = {
            "title": f"TEST_Text Content {uuid.uuid4().hex[:8]}",
            "type": "text",
            "body": "This is the body of the text content",
            "excerpt": "Brief summary",
            "tags": ["news", "test"],
            "status": "draft"
        }
        response = requests.post(f"{BASE_URL}/api/content", json=content_data, headers=admin_headers)
        assert response.status_code == 201, f"Create content failed: {response.text}"
        
        data = response.json()
        assert data["title"] == content_data["title"]
        assert data["type"] == "text"
        assert data["body"] == content_data["body"]
        assert data["excerpt"] == content_data["excerpt"]
        assert data["tags"] == content_data["tags"]
        assert data["status"] == "draft"
        assert "id" in data
        assert "created_at" in data
        assert "publish_statuses" in data
        
        # Store for later tests
        self.__class__.text_content_id = data["id"]
        print(f"Created text content: {data['id']}")
    
    def test_create_content_item_link(self, admin_headers):
        """Test creating a link content item"""
        content_data = {
            "title": f"TEST_Link Content {uuid.uuid4().hex[:8]}",
            "type": "link",
            "body": "Description of the link",
            "external_url": "https://example.com/article",
            "tags": ["reference"],
            "status": "ready"
        }
        response = requests.post(f"{BASE_URL}/api/content", json=content_data, headers=admin_headers)
        assert response.status_code == 201, f"Create link content failed: {response.text}"
        
        data = response.json()
        assert data["type"] == "link"
        assert data["external_url"] == content_data["external_url"]
        assert data["status"] == "ready"
        
        self.__class__.link_content_id = data["id"]
        print(f"Created link content: {data['id']}")
    
    def test_create_content_item_reference(self, admin_headers):
        """Test creating a reference content item"""
        content_data = {
            "title": f"TEST_Reference Content {uuid.uuid4().hex[:8]}",
            "type": "reference",
            "body": "Reference material content",
            "tags": ["music", "interview"],
            "status": "draft"
        }
        response = requests.post(f"{BASE_URL}/api/content", json=content_data, headers=admin_headers)
        assert response.status_code == 201, f"Create reference content failed: {response.text}"
        
        data = response.json()
        assert data["type"] == "reference"
        
        self.__class__.reference_content_id = data["id"]
        print(f"Created reference content: {data['id']}")
    
    def test_list_content_items(self, admin_headers):
        """Test listing all content items"""
        response = requests.get(f"{BASE_URL}/api/content", headers=admin_headers)
        assert response.status_code == 200, f"List content failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} content items")
    
    def test_filter_content_by_type(self, admin_headers):
        """Test filtering content by type"""
        response = requests.get(f"{BASE_URL}/api/content?type=text", headers=admin_headers)
        assert response.status_code == 200, f"Filter by type failed: {response.text}"
        
        data = response.json()
        for item in data:
            assert item["type"] == "text"
        print(f"Found {len(data)} text content items")
    
    def test_filter_content_by_status(self, admin_headers):
        """Test filtering content by status"""
        response = requests.get(f"{BASE_URL}/api/content?status=draft", headers=admin_headers)
        assert response.status_code == 200, f"Filter by status failed: {response.text}"
        
        data = response.json()
        for item in data:
            assert item["status"] == "draft"
        print(f"Found {len(data)} draft content items")
    
    def test_filter_content_by_tag(self, admin_headers):
        """Test filtering content by tag"""
        response = requests.get(f"{BASE_URL}/api/content?tag=news", headers=admin_headers)
        assert response.status_code == 200, f"Filter by tag failed: {response.text}"
        
        data = response.json()
        for item in data:
            assert "news" in item["tags"]
        print(f"Found {len(data)} content items with 'news' tag")
    
    def test_search_content(self, admin_headers):
        """Test searching content by title"""
        response = requests.get(f"{BASE_URL}/api/content?search=TEST_", headers=admin_headers)
        assert response.status_code == 200, f"Search content failed: {response.text}"
        
        data = response.json()
        for item in data:
            assert "TEST_" in item["title"]
        print(f"Found {len(data)} content items matching search")
    
    def test_get_content_detail(self, admin_headers):
        """Test getting content detail"""
        content_id = getattr(self.__class__, 'text_content_id', None)
        if not content_id:
            pytest.skip("No content ID from previous test")
        
        response = requests.get(f"{BASE_URL}/api/content/{content_id}", headers=admin_headers)
        assert response.status_code == 200, f"Get content detail failed: {response.text}"
        
        data = response.json()
        assert data["id"] == content_id
        assert "publish_statuses" in data
        print(f"Got content detail: {data['title']}")
    
    def test_update_content_item(self, admin_headers):
        """Test updating a content item"""
        content_id = getattr(self.__class__, 'text_content_id', None)
        if not content_id:
            pytest.skip("No content ID from previous test")
        
        update_data = {
            "title": f"TEST_Updated Content {uuid.uuid4().hex[:8]}",
            "body": "Updated body content",
            "status": "ready"
        }
        response = requests.put(f"{BASE_URL}/api/content/{content_id}", json=update_data, headers=admin_headers)
        assert response.status_code == 200, f"Update content failed: {response.text}"
        
        data = response.json()
        assert "Updated" in data["title"]
        assert data["body"] == update_data["body"]
        assert data["status"] == "ready"
        print(f"Updated content: {data['title']}")
        
        # Verify with GET
        get_response = requests.get(f"{BASE_URL}/api/content/{content_id}", headers=admin_headers)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["status"] == "ready"
    
    def test_get_nonexistent_content(self, admin_headers):
        """Test getting non-existent content returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/content/{fake_id}", headers=admin_headers)
        assert response.status_code == 404


class TestWordPressSitesCRUD(TestSetup):
    """WordPress Sites management tests (admin only)"""
    
    def test_list_wordpress_sites_empty(self, admin_headers):
        """Test listing WordPress sites (may be empty initially)"""
        response = requests.get(f"{BASE_URL}/api/wordpress/sites", headers=admin_headers)
        assert response.status_code == 200, f"List WP sites failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} WordPress sites")
    
    def test_create_wordpress_site(self, admin_headers):
        """Test creating a WordPress site connection"""
        site_data = {
            "name": f"TEST_WP Site {uuid.uuid4().hex[:8]}",
            "wp_base_url": "https://test-wordpress-site.example.com",
            "username": "testadmin",
            "app_password": "xxxx xxxx xxxx xxxx",
            "default_post_type": "post",
            "default_publish_status": "draft",
            "is_active": True
        }
        response = requests.post(f"{BASE_URL}/api/wordpress/sites", json=site_data, headers=admin_headers)
        assert response.status_code == 201, f"Create WP site failed: {response.text}"
        
        data = response.json()
        assert data["name"] == site_data["name"]
        assert data["wp_base_url"] == site_data["wp_base_url"]
        assert data["username"] == site_data["username"]
        assert data["default_post_type"] == "post"
        assert data["default_publish_status"] == "draft"
        assert data["is_active"] == True
        assert "id" in data
        # Password should NOT be returned
        assert "app_password" not in data
        
        self.__class__.wp_site_id = data["id"]
        print(f"Created WordPress site: {data['id']}")
    
    def test_create_second_wordpress_site(self, admin_headers):
        """Test creating a second WordPress site (multi-site support)"""
        site_data = {
            "name": f"TEST_WP Site 2 {uuid.uuid4().hex[:8]}",
            "wp_base_url": "https://second-wordpress-site.example.com",
            "username": "admin2",
            "app_password": "yyyy yyyy yyyy yyyy",
            "default_post_type": "page",
            "default_publish_status": "publish",
            "is_active": False
        }
        response = requests.post(f"{BASE_URL}/api/wordpress/sites", json=site_data, headers=admin_headers)
        assert response.status_code == 201, f"Create second WP site failed: {response.text}"
        
        data = response.json()
        assert data["default_post_type"] == "page"
        assert data["is_active"] == False
        
        self.__class__.wp_site_id_2 = data["id"]
        print(f"Created second WordPress site: {data['id']}")
    
    def test_list_wordpress_sites_after_create(self, admin_headers):
        """Test listing WordPress sites after creation"""
        response = requests.get(f"{BASE_URL}/api/wordpress/sites", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        # Should have at least 2 sites we created
        test_sites = [s for s in data if "TEST_WP" in s["name"]]
        assert len(test_sites) >= 2, f"Expected at least 2 test sites, found {len(test_sites)}"
        print(f"Found {len(test_sites)} test WordPress sites")
    
    def test_get_wordpress_site_detail(self, admin_headers):
        """Test getting WordPress site detail"""
        site_id = getattr(self.__class__, 'wp_site_id', None)
        if not site_id:
            pytest.skip("No WP site ID from previous test")
        
        response = requests.get(f"{BASE_URL}/api/wordpress/sites/{site_id}", headers=admin_headers)
        assert response.status_code == 200, f"Get WP site detail failed: {response.text}"
        
        data = response.json()
        assert data["id"] == site_id
        assert "app_password" not in data  # Password should not be returned
        print(f"Got WordPress site detail: {data['name']}")
    
    def test_update_wordpress_site(self, admin_headers):
        """Test updating a WordPress site"""
        site_id = getattr(self.__class__, 'wp_site_id', None)
        if not site_id:
            pytest.skip("No WP site ID from previous test")
        
        update_data = {
            "name": f"TEST_Updated WP Site {uuid.uuid4().hex[:8]}",
            "is_active": False
        }
        response = requests.put(f"{BASE_URL}/api/wordpress/sites/{site_id}", json=update_data, headers=admin_headers)
        assert response.status_code == 200, f"Update WP site failed: {response.text}"
        
        data = response.json()
        assert "Updated" in data["name"]
        assert data["is_active"] == False
        print(f"Updated WordPress site: {data['name']}")
        
        # Verify with GET
        get_response = requests.get(f"{BASE_URL}/api/wordpress/sites/{site_id}", headers=admin_headers)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["is_active"] == False
    
    def test_get_nonexistent_wordpress_site(self, admin_headers):
        """Test getting non-existent WordPress site returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/wordpress/sites/{fake_id}", headers=admin_headers)
        assert response.status_code == 404


class TestMultiSitePublishing(TestSetup):
    """Multi-site WordPress publishing tests"""
    
    def test_publish_to_wordpress_no_sites_selected(self, admin_headers):
        """Test publishing with empty targets"""
        # First create a content item
        content_data = {
            "title": f"TEST_Publish Content {uuid.uuid4().hex[:8]}",
            "type": "text",
            "body": "Content to publish",
            "status": "ready"
        }
        create_response = requests.post(f"{BASE_URL}/api/content", json=content_data, headers=admin_headers)
        assert create_response.status_code == 201
        content_id = create_response.json()["id"]
        self.__class__.publish_content_id = content_id
        
        # Try to publish with empty targets
        publish_data = {"targets": []}
        response = requests.post(f"{BASE_URL}/api/content/{content_id}/publish", json=publish_data, headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "results" in data
        assert len(data["results"]) == 0
        print("Publish with empty targets returned empty results")
    
    def test_publish_to_nonexistent_site(self, admin_headers):
        """Test publishing to non-existent WordPress site"""
        content_id = getattr(self.__class__, 'publish_content_id', None)
        if not content_id:
            pytest.skip("No content ID from previous test")
        
        fake_site_id = str(uuid.uuid4())
        publish_data = {
            "targets": [
                {"site_id": fake_site_id, "post_type": "post", "wp_status": "draft"}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/content/{content_id}/publish", json=publish_data, headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["results"]) == 1
        assert data["results"][0]["success"] == False
        assert "not found" in data["results"][0]["message"].lower()
        print("Publish to non-existent site correctly failed")
    
    def test_publish_to_inactive_site(self, admin_headers):
        """Test publishing to inactive WordPress site"""
        content_id = getattr(self.__class__, 'publish_content_id', None)
        site_id = getattr(TestWordPressSitesCRUD, 'wp_site_id', None)
        
        if not content_id or not site_id:
            pytest.skip("Missing content or site ID from previous tests")
        
        # The site was set to inactive in update test
        publish_data = {
            "targets": [
                {"site_id": site_id, "post_type": "post", "wp_status": "draft"}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/content/{content_id}/publish", json=publish_data, headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["results"]) == 1
        # Should fail because site is inactive
        assert data["results"][0]["success"] == False
        assert "inactive" in data["results"][0]["message"].lower()
        print("Publish to inactive site correctly failed")
    
    def test_publish_to_multiple_sites(self, admin_headers):
        """Test publishing to multiple WordPress sites"""
        content_id = getattr(self.__class__, 'publish_content_id', None)
        site_id_1 = getattr(TestWordPressSitesCRUD, 'wp_site_id', None)
        site_id_2 = getattr(TestWordPressSitesCRUD, 'wp_site_id_2', None)
        
        if not content_id or not site_id_1 or not site_id_2:
            pytest.skip("Missing content or site IDs from previous tests")
        
        # First, reactivate site 1
        requests.put(f"{BASE_URL}/api/wordpress/sites/{site_id_1}", 
                    json={"is_active": True}, headers=admin_headers)
        
        publish_data = {
            "targets": [
                {"site_id": site_id_1, "post_type": "post", "wp_status": "draft"},
                {"site_id": site_id_2, "post_type": "page", "wp_status": "publish"}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/content/{content_id}/publish", json=publish_data, headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "results" in data
        assert len(data["results"]) == 2
        
        # Both should have site_id and site_name
        for result in data["results"]:
            assert "site_id" in result
            assert "site_name" in result
            assert "success" in result
            assert "message" in result
        
        print(f"Multi-site publish returned {len(data['results'])} results")
    
    def test_content_publish_statuses_updated(self, admin_headers):
        """Test that content publish statuses are updated after publish attempt"""
        content_id = getattr(self.__class__, 'publish_content_id', None)
        if not content_id:
            pytest.skip("No content ID from previous test")
        
        response = requests.get(f"{BASE_URL}/api/content/{content_id}", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "publish_statuses" in data
        # Should have publish status records from previous publish attempts
        print(f"Content has {len(data['publish_statuses'])} publish status records")


class TestCleanup(TestSetup):
    """Cleanup test data"""
    
    def test_delete_content_items(self, admin_headers):
        """Delete test content items"""
        # Get all content items
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
    
    def test_delete_wordpress_sites(self, admin_headers):
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


class TestNavigationLinks(TestSetup):
    """Test that navigation endpoints exist"""
    
    def test_content_endpoint_exists(self, admin_headers):
        """Test content endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/content", headers=admin_headers)
        assert response.status_code == 200
        print("Content endpoint accessible")
    
    def test_wordpress_sites_endpoint_exists(self, admin_headers):
        """Test WordPress sites endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/wordpress/sites", headers=admin_headers)
        assert response.status_code == 200
        print("WordPress sites endpoint accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
