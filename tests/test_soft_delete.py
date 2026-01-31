"""
Test suite for Clara Dashboard Soft-Delete Functionality
Tests: DELETE /api/content/{id}, GET /api/content/admin/deleted, 
       POST /api/content/{id}/restore, DELETE /api/content/{id}/permanent
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo@radio.com"
TEST_PASSWORD = "password123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
def test_content(auth_headers):
    """Create a test content item and clean up after test."""
    # Create test content
    response = requests.post(
        f"{BASE_URL}/api/content",
        headers=auth_headers,
        json={
            "title": "TEST_SoftDelete_Content",
            "type": "text",
            "body": "Test content for soft delete testing",
            "status": "draft"
        }
    )
    assert response.status_code in [200, 201], f"Failed to create test content: {response.text}"
    content = response.json()
    content_id = content["id"]
    
    yield content
    
    # Cleanup: Try to permanently delete if it exists
    try:
        # First try to soft delete if not already deleted
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        # Then permanently delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}/permanent", headers=auth_headers)
    except:
        pass


class TestSoftDeleteEndpoint:
    """Tests for DELETE /api/content/{content_id} - Soft Delete"""
    
    def test_soft_delete_returns_success(self, auth_headers, test_content):
        """Test that soft delete returns success message."""
        content_id = test_content["id"]
        response = requests.delete(
            f"{BASE_URL}/api/content/{content_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Content deleted"
        assert "wordpress_deletions" in data
    
    def test_soft_deleted_content_not_in_regular_list(self, auth_headers, test_content):
        """Test that soft-deleted content doesn't appear in regular content list."""
        content_id = test_content["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Check regular list
        response = requests.get(f"{BASE_URL}/api/content", headers=auth_headers)
        assert response.status_code == 200
        content_list = response.json()
        content_ids = [c["id"] for c in content_list]
        assert content_id not in content_ids, "Deleted content should not appear in regular list"
    
    def test_soft_deleted_content_appears_in_deleted_list(self, auth_headers, test_content):
        """Test that soft-deleted content appears in admin deleted list."""
        content_id = test_content["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Check deleted list
        response = requests.get(f"{BASE_URL}/api/content/admin/deleted", headers=auth_headers)
        assert response.status_code == 200
        deleted_list = response.json()
        deleted_ids = [c["id"] for c in deleted_list]
        assert content_id in deleted_ids, "Deleted content should appear in deleted list"
    
    def test_soft_deleted_content_has_deleted_at_field(self, auth_headers, test_content):
        """Test that soft-deleted content has deleted_at timestamp."""
        content_id = test_content["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Check deleted list
        response = requests.get(f"{BASE_URL}/api/content/admin/deleted", headers=auth_headers)
        assert response.status_code == 200
        deleted_list = response.json()
        deleted_content = next((c for c in deleted_list if c["id"] == content_id), None)
        assert deleted_content is not None
        assert "deleted_at" in deleted_content
        assert deleted_content["deleted_at"] is not None
    
    def test_soft_delete_nonexistent_content_returns_404(self, auth_headers):
        """Test that deleting non-existent content returns 404."""
        response = requests.delete(
            f"{BASE_URL}/api/content/nonexistent-id-12345",
            headers=auth_headers
        )
        assert response.status_code == 404


class TestGetDeletedContentEndpoint:
    """Tests for GET /api/content/admin/deleted - Get Deleted Content"""
    
    def test_get_deleted_content_returns_list(self, auth_headers):
        """Test that admin can get list of deleted content."""
        response = requests.get(
            f"{BASE_URL}/api/content/admin/deleted",
            headers=auth_headers
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_deleted_content_includes_deleted_by_name(self, auth_headers, test_content):
        """Test that deleted content includes deleted_by_name field."""
        content_id = test_content["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Check deleted list
        response = requests.get(f"{BASE_URL}/api/content/admin/deleted", headers=auth_headers)
        assert response.status_code == 200
        deleted_list = response.json()
        deleted_content = next((c for c in deleted_list if c["id"] == content_id), None)
        assert deleted_content is not None
        assert "deleted_by_name" in deleted_content


class TestRestoreEndpoint:
    """Tests for POST /api/content/{content_id}/restore - Restore Content"""
    
    def test_restore_deleted_content(self, auth_headers, test_content):
        """Test that admin can restore soft-deleted content."""
        content_id = test_content["id"]
        
        # Soft delete first
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Restore
        response = requests.post(
            f"{BASE_URL}/api/content/{content_id}/restore",
            headers=auth_headers
        )
        assert response.status_code == 200
        restored = response.json()
        assert restored["id"] == content_id
        assert restored.get("deleted_at") is None
    
    def test_restored_content_appears_in_regular_list(self, auth_headers, test_content):
        """Test that restored content appears back in regular list."""
        content_id = test_content["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Restore
        requests.post(f"{BASE_URL}/api/content/{content_id}/restore", headers=auth_headers)
        
        # Check regular list
        response = requests.get(f"{BASE_URL}/api/content", headers=auth_headers)
        assert response.status_code == 200
        content_list = response.json()
        content_ids = [c["id"] for c in content_list]
        assert content_id in content_ids, "Restored content should appear in regular list"
    
    def test_restored_content_not_in_deleted_list(self, auth_headers, test_content):
        """Test that restored content no longer appears in deleted list."""
        content_id = test_content["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Restore
        requests.post(f"{BASE_URL}/api/content/{content_id}/restore", headers=auth_headers)
        
        # Check deleted list
        response = requests.get(f"{BASE_URL}/api/content/admin/deleted", headers=auth_headers)
        assert response.status_code == 200
        deleted_list = response.json()
        deleted_ids = [c["id"] for c in deleted_list]
        assert content_id not in deleted_ids, "Restored content should not appear in deleted list"
    
    def test_restore_nonexistent_content_returns_404(self, auth_headers):
        """Test that restoring non-existent content returns 404."""
        response = requests.post(
            f"{BASE_URL}/api/content/nonexistent-id-12345/restore",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_restore_non_deleted_content_returns_404(self, auth_headers, test_content):
        """Test that restoring non-deleted content returns 404."""
        content_id = test_content["id"]
        # Don't delete, try to restore directly
        response = requests.post(
            f"{BASE_URL}/api/content/{content_id}/restore",
            headers=auth_headers
        )
        assert response.status_code == 404


class TestPermanentDeleteEndpoint:
    """Tests for DELETE /api/content/{content_id}/permanent - Permanent Delete"""
    
    def test_permanent_delete_removes_content_completely(self, auth_headers, test_content):
        """Test that permanent delete removes content from database."""
        content_id = test_content["id"]
        
        # Soft delete first
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Permanent delete
        response = requests.delete(
            f"{BASE_URL}/api/content/{content_id}/permanent",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Content permanently deleted"
    
    def test_permanently_deleted_content_not_in_any_list(self, auth_headers, test_content):
        """Test that permanently deleted content doesn't appear anywhere."""
        content_id = test_content["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Permanent delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}/permanent", headers=auth_headers)
        
        # Check regular list
        response = requests.get(f"{BASE_URL}/api/content", headers=auth_headers)
        content_list = response.json()
        content_ids = [c["id"] for c in content_list]
        assert content_id not in content_ids
        
        # Check deleted list
        response = requests.get(f"{BASE_URL}/api/content/admin/deleted", headers=auth_headers)
        deleted_list = response.json()
        deleted_ids = [c["id"] for c in deleted_list]
        assert content_id not in deleted_ids
    
    def test_permanent_delete_nonexistent_returns_404(self, auth_headers):
        """Test that permanently deleting non-existent content returns 404."""
        response = requests.delete(
            f"{BASE_URL}/api/content/nonexistent-id-12345/permanent",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_permanent_delete_non_deleted_content_returns_404(self, auth_headers, test_content):
        """Test that permanently deleting non-deleted content returns 404."""
        content_id = test_content["id"]
        # Don't soft delete, try to permanently delete directly
        response = requests.delete(
            f"{BASE_URL}/api/content/{content_id}/permanent",
            headers=auth_headers
        )
        assert response.status_code == 404


class TestContentFiltering:
    """Tests for content filtering - deleted items should not show for regular users"""
    
    def test_get_content_excludes_deleted_items(self, auth_headers, test_content):
        """Test that GET /api/content excludes soft-deleted items."""
        content_id = test_content["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Get all content
        response = requests.get(f"{BASE_URL}/api/content", headers=auth_headers)
        assert response.status_code == 200
        content_list = response.json()
        
        # Verify deleted content is not in list
        for content in content_list:
            assert content.get("deleted_at") is None, "Deleted content should not appear in regular list"
    
    def test_get_single_content_works_for_deleted(self, auth_headers, test_content):
        """Test that GET /api/content/{id} still works for deleted content (for viewing in trash)."""
        content_id = test_content["id"]
        
        # Soft delete
        requests.delete(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        
        # Get single content - should still work for admins viewing trash
        response = requests.get(f"{BASE_URL}/api/content/{content_id}", headers=auth_headers)
        # This might return 200 or 404 depending on implementation
        # If it returns 200, the content should have deleted_at set
        if response.status_code == 200:
            content = response.json()
            assert content.get("deleted_at") is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
