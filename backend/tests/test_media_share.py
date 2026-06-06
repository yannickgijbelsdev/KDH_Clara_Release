"""
Media Library Share Feature Tests
Tests for creating, getting, revoking share links and accessing shared files publicly.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "yannick.gijbels@koodh.com"
TEST_PASSWORD = "password123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for testing."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def test_media_asset(auth_headers):
    """Get or create a test media asset for share testing."""
    # First, try to get existing media assets
    response = requests.get(f"{BASE_URL}/api/media", headers=auth_headers)
    assert response.status_code == 200, f"Failed to get media assets: {response.text}"
    
    assets = response.json()
    if assets:
        # Return the first asset
        return assets[0]
    
    # If no assets exist, upload a test file
    files = {
        'file': ('test-share-file.txt', b'Test content for share feature', 'text/plain')
    }
    upload_response = requests.post(
        f"{BASE_URL}/api/media",
        headers={"Authorization": auth_headers["Authorization"]},
        files=files
    )
    assert upload_response.status_code == 201, f"Failed to upload test file: {upload_response.text}"
    return upload_response.json()


class TestMediaShareEndpoints:
    """Test Media Library Share API endpoints."""
    
    # ============== GET SHARE LINK STATUS ==============
    
    def test_get_share_link_no_existing_link(self, auth_headers, test_media_asset):
        """Test GET /api/media/{asset_id}/share when no share link exists."""
        asset_id = test_media_asset["id"]
        
        # First revoke any existing share link
        requests.delete(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        
        # Now check share status
        response = requests.get(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get share status: {response.text}"
        
        data = response.json()
        assert "has_share_link" in data
        assert not data["has_share_link"]
        print("PASS: GET share link returns has_share_link=False when no link exists")
    
    # ============== CREATE SHARE LINK ==============
    
    def test_create_share_link(self, auth_headers, test_media_asset):
        """Test POST /api/media/{asset_id}/share creates a share link."""
        asset_id = test_media_asset["id"]
        
        # First revoke any existing share link
        requests.delete(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        
        # Create new share link
        response = requests.post(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert response.status_code == 200, f"Failed to create share link: {response.text}"
        
        data = response.json()
        assert "share_token" in data, "Response missing share_token"
        assert "created_at" in data, "Response missing created_at"
        assert len(data["share_token"]) > 20, "Share token too short"
        
        print(f"PASS: Created share link with token: {data['share_token'][:20]}...")
        return data["share_token"]
    
    def test_create_share_link_returns_existing(self, auth_headers, test_media_asset):
        """Test POST /api/media/{asset_id}/share returns existing link if one exists."""
        asset_id = test_media_asset["id"]
        
        # Create first share link
        response1 = requests.post(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert response1.status_code == 200
        token1 = response1.json()["share_token"]
        
        # Try to create again - should return same token
        response2 = requests.post(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert response2.status_code == 200
        token2 = response2.json()["share_token"]
        
        assert token1 == token2, "Creating share link twice should return same token"
        print("PASS: Creating share link twice returns same token")
    
    def test_create_share_link_nonexistent_asset(self, auth_headers):
        """Test POST /api/media/{asset_id}/share with non-existent asset returns 404."""
        response = requests.post(
            f"{BASE_URL}/api/media/nonexistent-asset-id/share",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Creating share link for non-existent asset returns 404")
    
    # ============== GET SHARE LINK WITH EXISTING LINK ==============
    
    def test_get_share_link_with_existing_link(self, auth_headers, test_media_asset):
        """Test GET /api/media/{asset_id}/share returns share info when link exists."""
        asset_id = test_media_asset["id"]
        
        # Ensure share link exists
        create_response = requests.post(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert create_response.status_code == 200
        created_token = create_response.json()["share_token"]
        
        # Get share status
        response = requests.get(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get share status: {response.text}"
        
        data = response.json()
        assert data["has_share_link"]
        assert data["share_token"] == created_token
        assert "created_at" in data
        
        print("PASS: GET share link returns correct share info")
    
    # ============== PUBLIC SHARE ACCESS ==============
    
    def test_public_share_access(self, auth_headers, test_media_asset):
        """Test GET /api/share/{share_token} allows public access to shared file."""
        asset_id = test_media_asset["id"]
        
        # Ensure share link exists
        create_response = requests.post(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert create_response.status_code == 200
        share_token = create_response.json()["share_token"]
        
        # Access shared file WITHOUT authentication
        public_response = requests.get(f"{BASE_URL}/api/share/{share_token}")
        assert public_response.status_code == 200, f"Public share access failed: {public_response.status_code}"
        
        # Verify content-type header is set
        content_type = public_response.headers.get("content-type", "")
        assert content_type, "Response missing content-type header"
        
        print("PASS: Public share access works without authentication")
    
    def test_public_share_invalid_token(self):
        """Test GET /api/share/{share_token} with invalid token returns 404."""
        response = requests.get(f"{BASE_URL}/api/share/invalid-token-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Invalid share token returns 404")
    
    # ============== REVOKE SHARE LINK ==============
    
    def test_revoke_share_link(self, auth_headers, test_media_asset):
        """Test DELETE /api/media/{asset_id}/share revokes the share link."""
        asset_id = test_media_asset["id"]
        
        # Ensure share link exists
        create_response = requests.post(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert create_response.status_code == 200
        create_response.json()["share_token"]
        
        # Revoke share link
        revoke_response = requests.delete(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert revoke_response.status_code == 200, f"Failed to revoke share link: {revoke_response.text}"
        
        data = revoke_response.json()
        assert "message" in data
        
        print("PASS: Share link revoked successfully")
    
    def test_revoke_share_link_makes_public_access_fail(self, auth_headers, test_media_asset):
        """Test that revoking share link makes public access fail."""
        asset_id = test_media_asset["id"]
        
        # Create share link
        create_response = requests.post(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert create_response.status_code == 200
        share_token = create_response.json()["share_token"]
        
        # Verify public access works
        public_response1 = requests.get(f"{BASE_URL}/api/share/{share_token}")
        assert public_response1.status_code == 200, "Public access should work before revoke"
        
        # Revoke share link
        revoke_response = requests.delete(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert revoke_response.status_code == 200
        
        # Verify public access now fails
        public_response2 = requests.get(f"{BASE_URL}/api/share/{share_token}")
        assert public_response2.status_code == 404, f"Public access should fail after revoke, got {public_response2.status_code}"
        
        print("PASS: Revoking share link makes public access fail")
    
    def test_revoke_nonexistent_share_link(self, auth_headers, test_media_asset):
        """Test DELETE /api/media/{asset_id}/share when no share link exists returns 404."""
        asset_id = test_media_asset["id"]
        
        # First revoke any existing share link
        requests.delete(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        
        # Try to revoke again - should return 404
        response = requests.delete(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("PASS: Revoking non-existent share link returns 404")
    
    def test_revoke_share_link_nonexistent_asset(self, auth_headers):
        """Test DELETE /api/media/{asset_id}/share with non-existent asset returns 404."""
        response = requests.delete(
            f"{BASE_URL}/api/media/nonexistent-asset-id/share",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Revoking share link for non-existent asset returns 404")


class TestMediaLibraryCRUD:
    """Test basic Media Library CRUD operations."""
    
    def test_get_media_assets(self, auth_headers):
        """Test GET /api/media returns list of assets."""
        response = requests.get(f"{BASE_URL}/api/media", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get media assets: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/media returns {len(data)} assets")
    
    def test_get_media_assets_with_kind_filter(self, auth_headers):
        """Test GET /api/media with kind filter."""
        response = requests.get(f"{BASE_URL}/api/media?kind=document", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get media assets: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # All returned assets should be documents
        for asset in data:
            assert asset.get("kind") == "document", f"Asset kind should be document, got {asset.get('kind')}"
        
        print("PASS: GET /api/media with kind=document filter works")
    
    def test_upload_media_asset(self, auth_headers):
        """Test POST /api/media uploads a new asset."""
        files = {
            'file': ('TEST_upload_test.txt', b'Test upload content', 'text/plain')
        }
        response = requests.post(
            f"{BASE_URL}/api/media",
            headers={"Authorization": auth_headers["Authorization"]},
            files=files
        )
        assert response.status_code == 201, f"Failed to upload: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["title"] == "TEST_upload_test.txt"
        assert data["kind"] == "document"
        
        # Cleanup - delete the test asset
        requests.delete(
            f"{BASE_URL}/api/media/{data['id']}",
            headers=auth_headers
        )
        
        print("PASS: POST /api/media uploads asset successfully")
    
    def test_get_single_media_asset(self, auth_headers, test_media_asset):
        """Test GET /api/media/{asset_id} returns single asset."""
        asset_id = test_media_asset["id"]
        
        response = requests.get(f"{BASE_URL}/api/media/{asset_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get asset: {response.text}"
        
        data = response.json()
        assert data["id"] == asset_id
        assert "title" in data
        assert "kind" in data
        
        print(f"PASS: GET /api/media/{asset_id} returns asset details")
    
    def test_update_media_asset_title(self, auth_headers, test_media_asset):
        """Test PUT /api/media/{asset_id} updates asset title."""
        asset_id = test_media_asset["id"]
        original_title = test_media_asset["title"]
        new_title = f"TEST_renamed_{original_title}"
        
        response = requests.put(
            f"{BASE_URL}/api/media/{asset_id}",
            headers=auth_headers,
            json={"title": new_title}
        )
        assert response.status_code == 200, f"Failed to update asset: {response.text}"
        
        data = response.json()
        assert data["title"] == new_title
        
        # Restore original title
        requests.put(
            f"{BASE_URL}/api/media/{asset_id}",
            headers=auth_headers,
            json={"title": original_title}
        )
        
        print(f"PASS: PUT /api/media/{asset_id} updates title successfully")


class TestMediaShareEdgeCases:
    """Test edge cases for Media Share feature."""
    
    def test_share_link_persists_after_asset_rename(self, auth_headers, test_media_asset):
        """Test that share link still works after renaming the asset."""
        asset_id = test_media_asset["id"]
        original_title = test_media_asset["title"]
        
        # Create share link
        create_response = requests.post(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert create_response.status_code == 200
        share_token = create_response.json()["share_token"]
        
        # Rename asset
        new_title = f"TEST_renamed_{original_title}"
        rename_response = requests.put(
            f"{BASE_URL}/api/media/{asset_id}",
            headers=auth_headers,
            json={"title": new_title}
        )
        assert rename_response.status_code == 200
        
        # Verify share link still works
        public_response = requests.get(f"{BASE_URL}/api/share/{share_token}")
        assert public_response.status_code == 200, "Share link should still work after rename"
        
        # Restore original title
        requests.put(
            f"{BASE_URL}/api/media/{asset_id}",
            headers=auth_headers,
            json={"title": original_title}
        )
        
        print("PASS: Share link persists after asset rename")
    
    def test_delete_asset_removes_share_link(self, auth_headers):
        """Test that deleting an asset also removes its share link."""
        # Upload a test file
        files = {
            'file': ('TEST_delete_share_test.txt', b'Test content for delete', 'text/plain')
        }
        upload_response = requests.post(
            f"{BASE_URL}/api/media",
            headers={"Authorization": auth_headers["Authorization"]},
            files=files
        )
        assert upload_response.status_code == 201
        asset_id = upload_response.json()["id"]
        
        # Create share link
        create_response = requests.post(f"{BASE_URL}/api/media/{asset_id}/share", headers=auth_headers)
        assert create_response.status_code == 200
        share_token = create_response.json()["share_token"]
        
        # Verify share link works
        public_response1 = requests.get(f"{BASE_URL}/api/share/{share_token}")
        assert public_response1.status_code == 200
        
        # Delete the asset
        delete_response = requests.delete(f"{BASE_URL}/api/media/{asset_id}", headers=auth_headers)
        assert delete_response.status_code == 204
        
        # Verify share link no longer works
        public_response2 = requests.get(f"{BASE_URL}/api/share/{share_token}")
        assert public_response2.status_code == 404, "Share link should fail after asset deletion"
        
        print("PASS: Deleting asset removes share link")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
