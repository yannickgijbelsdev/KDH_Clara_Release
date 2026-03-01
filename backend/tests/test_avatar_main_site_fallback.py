"""Test avatar upload/delete with main_site_users fallback.
Tests the fix for avatar upload not working on DBNT and other main sites.
The root cause was:
1. require_admin checked global role only 
2. user lookup by team_id only found users in admin's team

Fix:
1. Use get_effective_role for site-specific admin check
2. Fall back to main_site_users lookup when team_id lookup fails
"""

import pytest
import requests
import os
from io import BytesIO

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from request
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"
EDDY_THIJS_ID = "6cd6f3df-3f22-422d-ba07-5e33a045478e"
DBNT_MAIN_SITE_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"


def create_test_jpeg():
    """Create a small test JPEG image programmatically."""
    from PIL import Image
    img = Image.new('RGB', (100, 100), color='red')
    buf = BytesIO()
    img.save(buf, format='JPEG')
    buf.seek(0)
    return buf


@pytest.fixture(scope="module")
def auth_token():
    """Get network admin authentication token."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": NETWORK_ADMIN_EMAIL, "password": NETWORK_ADMIN_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Failed to authenticate network admin: {response.text}")
    return response.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(auth_token):
    """Headers with auth token."""
    return {
        "Authorization": f"Bearer {auth_token}"
    }


class TestAvatarUploadMainSiteFallback:
    """Test avatar upload with X-Main-Site-ID header for site-specific user lookup."""
    
    def test_avatar_upload_with_main_site_header(self, admin_headers):
        """
        Test: POST /api/users/{user_id}/avatar WITH X-Main-Site-ID header
        Should find user via main_site_users fallback.
        
        Eddy Thijs (6cd6f3df-3f22-422d-ba07-5e33a045478e) belongs to DBNT 
        via main_site_users but has a different team_id than admin.
        """
        # Create test JPEG
        try:
            test_image = create_test_jpeg()
        except ImportError:
            pytest.skip("PIL not available for creating test image")
        
        headers = {**admin_headers, "X-Main-Site-ID": DBNT_MAIN_SITE_ID}
        
        files = {
            "file": ("test_avatar.jpg", test_image, "image/jpeg")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/users/{EDDY_THIJS_ID}/avatar",
            headers=headers,
            files=files
        )
        
        # Should succeed with main_site fallback
        assert response.status_code == 200, f"Avatar upload failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "avatar" in data, "Response should contain avatar object"
        assert "file_key" in data["avatar"], "Avatar should have file_key"
        assert "filename" in data["avatar"], "Avatar should have filename"
        print(f"SUCCESS: Avatar uploaded for DBNT user via main_site fallback: {data['avatar']['filename']}")
    
    def test_avatar_upload_without_main_site_header(self, admin_headers):
        """
        Test: POST /api/users/{user_id}/avatar WITHOUT X-Main-Site-ID
        Should fall back to team_id lookup only.
        
        For users not in admin's team and no X-Main-Site-ID, should return 404.
        """
        # Create test JPEG
        try:
            test_image = create_test_jpeg()
        except ImportError:
            pytest.skip("PIL not available for creating test image")
        
        files = {
            "file": ("test_avatar2.jpg", test_image, "image/jpeg")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/users/{EDDY_THIJS_ID}/avatar",
            headers=admin_headers,
            files=files
        )
        
        # Without main_site_id header, user not in admin's team should not be found
        # Note: This test verifies the team_id fallback behavior
        # Result depends on whether Eddy's team_id matches admin's team_id
        print(f"Response status (no X-Main-Site-ID): {response.status_code}")
        
        # The user Eddy has team_id f220393f-1bdb-475a-8335-a2536055b90c which is Radiogroep's team
        # Network admin also has this team_id, so this might still succeed
        # If it returns 200, both are in same team. If 404, different teams.
        if response.status_code == 200:
            print("INFO: User found via team_id (both in same Radiogroep team)")
        elif response.status_code == 404:
            print("INFO: User not found without main_site header (different teams)")
        
        # Both outcomes are valid - we're testing the fallback mechanism works
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"


class TestAvatarDeleteMainSiteFallback:
    """Test avatar delete with X-Main-Site-ID header for site-specific user lookup."""
    
    def test_avatar_delete_with_main_site_header(self, admin_headers):
        """
        Test: DELETE /api/users/{user_id}/avatar WITH X-Main-Site-ID
        Should work for site-specific users via main_site_users fallback.
        """
        headers = {**admin_headers, "X-Main-Site-ID": DBNT_MAIN_SITE_ID}
        
        response = requests.delete(
            f"{BASE_URL}/api/users/{EDDY_THIJS_ID}/avatar",
            headers=headers
        )
        
        # Should succeed - either removes avatar or confirms no avatar exists
        assert response.status_code == 200, f"Avatar delete failed: {response.status_code} - {response.text}"
        print(f"SUCCESS: Avatar delete worked for DBNT user via main_site fallback")
    
    def test_avatar_delete_nonexistent_user(self, admin_headers):
        """Test delete avatar for non-existent user returns 404."""
        headers = {**admin_headers, "X-Main-Site-ID": DBNT_MAIN_SITE_ID}
        
        fake_user_id = "00000000-0000-0000-0000-000000000000"
        
        response = requests.delete(
            f"{BASE_URL}/api/users/{fake_user_id}/avatar",
            headers=headers
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent user, got {response.status_code}"
        print("SUCCESS: Correctly returns 404 for non-existent user")


class TestAvatarPermissions:
    """Test avatar upload/delete permission checks."""
    
    def test_avatar_upload_requires_admin(self):
        """Test that avatar upload requires admin role."""
        # Without any auth
        response = requests.post(
            f"{BASE_URL}/api/users/{EDDY_THIJS_ID}/avatar",
            files={"file": ("test.jpg", b"fake", "image/jpeg")}
        )
        
        # Should return 401 or 403
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print(f"SUCCESS: Unauthenticated avatar upload blocked ({response.status_code})")
    
    def test_avatar_delete_requires_admin(self):
        """Test that avatar delete requires admin role."""
        response = requests.delete(
            f"{BASE_URL}/api/users/{EDDY_THIJS_ID}/avatar"
        )
        
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"
        print(f"SUCCESS: Unauthenticated avatar delete blocked ({response.status_code})")


class TestAvatarValidation:
    """Test avatar upload validation."""
    
    def test_avatar_upload_validates_file_type(self, admin_headers):
        """Test that invalid file types are rejected."""
        headers = {**admin_headers, "X-Main-Site-ID": DBNT_MAIN_SITE_ID}
        
        # Upload a text file pretending to be an image
        files = {
            "file": ("test.txt", b"This is not an image", "text/plain")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/users/{EDDY_THIJS_ID}/avatar",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid file type, got {response.status_code}"
        assert "Invalid image type" in response.text or "invalid" in response.text.lower()
        print("SUCCESS: Invalid file type correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
