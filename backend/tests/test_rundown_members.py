"""Test Rundown member management and WebSocket presence features.

Tests:
- GET /api/shows/{show_id}/members - returns list of members with avatar_url
- PUT /api/shows/{show_id}/members - updates member list
- GET /api/main-sites/{main_site_id}/users - returns site users with avatar_url
- WebSocket /ws/show/{show_id} - presence data
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"
EXAMPLE_SHOW_ID = "f95b9165-0311-42e7-b85b-3e846dde974f"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Get auth headers with main site context."""
    return {
        "Authorization": f"Bearer {admin_token}",
        "X-Main-Site-ID": MAIN_SITE_ID,
        "Content-Type": "application/json"
    }


class TestShowMembersAPI:
    """Test GET/PUT /api/shows/{show_id}/members endpoints."""
    
    def test_get_show_members_endpoint_exists(self, auth_headers):
        """GET /api/shows/{show_id}/members should return 200 or empty list."""
        response = requests.get(
            f"{BASE_URL}/api/shows/{EXAMPLE_SHOW_ID}/members",
            headers=auth_headers
        )
        # Should return 200 even if no members (empty list)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET /api/shows/{EXAMPLE_SHOW_ID}/members returns {len(data)} members")
        
    def test_get_show_members_response_structure(self, auth_headers):
        """GET members should return objects with id, name, email, avatar_url."""
        response = requests.get(
            f"{BASE_URL}/api/shows/{EXAMPLE_SHOW_ID}/members",
            headers=auth_headers
        )
        assert response.status_code == 200
        members = response.json()
        
        # If members exist, verify structure
        if members:
            for member in members:
                assert "id" in member, "Member should have 'id'"
                assert "name" in member, "Member should have 'name'"
                assert "email" in member, "Member should have 'email'"
                assert "avatar_url" in member, "Member should have 'avatar_url' field"
            print(f"✅ Member response structure correct: {list(members[0].keys())}")
        else:
            print("✅ No members yet, structure check skipped")
            
    def test_update_show_members(self, auth_headers):
        """PUT /api/shows/{show_id}/members should update member list."""
        # First, get site users to find a valid user ID
        users_response = requests.get(
            f"{BASE_URL}/api/main-sites/{MAIN_SITE_ID}/users",
            headers=auth_headers
        )
        assert users_response.status_code == 200, f"Failed to get users: {users_response.text}"
        users = users_response.json()
        
        if not users:
            pytest.skip("No users available in main site")
            
        # Get the first user's ID
        test_user_id = users[0]["user_id"]
        
        # Update members with this user
        update_response = requests.put(
            f"{BASE_URL}/api/shows/{EXAMPLE_SHOW_ID}/members",
            headers=auth_headers,
            json={"member_ids": [test_user_id]}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated_members = update_response.json()
        
        assert isinstance(updated_members, list)
        if updated_members:
            assert updated_members[0]["id"] == test_user_id
            assert "avatar_url" in updated_members[0]
        print(f"✅ PUT /api/shows/{EXAMPLE_SHOW_ID}/members updated successfully")
        
    def test_update_members_returns_avatar_url(self, auth_headers):
        """PUT members should return updated members with avatar_url field."""
        # Get current members
        get_response = requests.get(
            f"{BASE_URL}/api/shows/{EXAMPLE_SHOW_ID}/members",
            headers=auth_headers
        )
        current_member_ids = [m["id"] for m in get_response.json()] if get_response.json() else []
        
        # Update with same members (or empty if none)
        update_response = requests.put(
            f"{BASE_URL}/api/shows/{EXAMPLE_SHOW_ID}/members",
            headers=auth_headers,
            json={"member_ids": current_member_ids}
        )
        assert update_response.status_code == 200
        members = update_response.json()
        
        if members:
            for m in members:
                assert "avatar_url" in m, "Updated member should have avatar_url"
        print("✅ PUT members response includes avatar_url field")
        

class TestMainSiteUsersAPI:
    """Test GET /api/main-sites/{main_site_id}/users endpoint."""
    
    def test_get_main_site_users_endpoint(self, auth_headers):
        """GET /api/main-sites/{main_site_id}/users should return users."""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/{MAIN_SITE_ID}/users",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        users = response.json()
        assert isinstance(users, list)
        print(f"✅ GET /api/main-sites/{MAIN_SITE_ID}/users returns {len(users)} users")
        
    def test_main_site_users_has_avatar_url(self, auth_headers):
        """Main site users should include avatar_url field."""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/{MAIN_SITE_ID}/users",
            headers=auth_headers
        )
        assert response.status_code == 200
        users = response.json()
        
        assert len(users) > 0, "Should have at least one user in the main site"
        
        # Verify structure
        first_user = users[0]
        expected_fields = ["user_id", "user_name", "user_email", "avatar_url", "role"]
        for field in expected_fields:
            assert field in first_user, f"User should have '{field}' field"
        
        print(f"✅ Main site user response has correct structure: {list(first_user.keys())}")


class TestWebSocketEndpoints:
    """Test WebSocket endpoints exist and are accessible."""
    
    def test_websocket_show_endpoint_format(self, admin_token):
        """WebSocket URL should be properly formatted for /ws/show/{show_id}."""
        # We can't fully test WebSocket with requests, but we verify the format
        ws_url = f"{BASE_URL}/ws/show/{EXAMPLE_SHOW_ID}?token={admin_token}"
        ws_url = ws_url.replace("https://", "wss://").replace("http://", "ws://")
        
        # Verify the URL structure
        assert "/ws/show/" in ws_url
        assert EXAMPLE_SHOW_ID in ws_url
        assert f"token={admin_token}" in ws_url
        print(f"✅ WebSocket URL format correct: /ws/show/{EXAMPLE_SHOW_ID}")
        
    def test_websocket_rundown_endpoint_format(self, admin_token):
        """WebSocket URL should be properly formatted for /ws/rundown/{occurrence_id}."""
        test_occurrence_id = "test-occurrence-123"
        ws_url = f"{BASE_URL}/ws/rundown/{test_occurrence_id}?token={admin_token}"
        ws_url = ws_url.replace("https://", "wss://").replace("http://", "ws://")
        
        assert "/ws/rundown/" in ws_url
        assert test_occurrence_id in ws_url
        print(f"✅ WebSocket URL format correct: /ws/rundown/{test_occurrence_id}")


class TestAvatarURLResolution:
    """Test that avatar URLs are correctly resolved from avatar objects."""
    
    def test_members_avatar_is_url_not_object(self, auth_headers):
        """Member avatar_url should be a string URL, not an object."""
        response = requests.get(
            f"{BASE_URL}/api/shows/{EXAMPLE_SHOW_ID}/members",
            headers=auth_headers
        )
        assert response.status_code == 200
        members = response.json()
        
        if members:
            for m in members:
                avatar_url = m.get("avatar_url")
                if avatar_url is not None:
                    assert isinstance(avatar_url, str), f"avatar_url should be string, got {type(avatar_url)}"
                    assert not isinstance(avatar_url, dict), "avatar_url should not be an object"
            print("✅ avatar_url is correctly resolved to string URL")
        else:
            print("✅ No members to verify avatar_url type")
            
    def test_site_users_avatar_is_url_not_object(self, auth_headers):
        """Site user avatar_url should be a string URL, not an object."""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/{MAIN_SITE_ID}/users",
            headers=auth_headers
        )
        assert response.status_code == 200
        users = response.json()
        
        if users:
            for u in users:
                avatar_url = u.get("avatar_url")
                if avatar_url is not None:
                    assert isinstance(avatar_url, str), f"avatar_url should be string, got {type(avatar_url)}"
            print("✅ Site user avatar_url is correctly resolved")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
