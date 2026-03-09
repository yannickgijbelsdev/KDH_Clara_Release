"""
Test avatar display fix across the entire application.
Tests that users with uploaded photos show their photo URL everywhere.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"
MAIN_SITE_SLUG = "radiogroep"
SHOW_WITH_MEMBERS = "f95b9165-0311-42e7-b85b-3e846dde974f"

# Known users with avatars
USERS_WITH_AVATARS = ["Yannick Gijbels", "Chiel van Gansewinkel", "Hadewig Weyen"]
USERS_WITHOUT_AVATARS = ["System Administrator", "Eddy Thijs", "Test User"]


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def headers(auth_token):
    """Headers with auth token and main site ID."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Main-Site-ID": MAIN_SITE_ID,
        "Content-Type": "application/json"
    }


class TestAvatarURLResolution:
    """Test that avatar URLs are correctly resolved in API responses."""

    def test_main_sites_users_returns_avatar_url(self, headers):
        """GET /api/main-sites/{site_id}/users returns avatar_url with resolved local paths."""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/{MAIN_SITE_ID}/users",
            headers=headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        assert len(users) > 0, "No users returned"
        
        # Check users with avatars have avatar_url
        users_with_avatars_found = 0
        for user in users:
            if user["user_name"] in USERS_WITH_AVATARS:
                assert "avatar_url" in user and user["avatar_url"], \
                    f"User {user['user_name']} should have avatar_url"
                assert user["avatar_url"].startswith("/api/uploads/avatars/"), \
                    f"User {user['user_name']} avatar_url should start with /api/uploads/avatars/"
                users_with_avatars_found += 1
        
        assert users_with_avatars_found > 0, "Expected to find users with avatars"
        print(f"✓ Found {users_with_avatars_found} users with correct avatar_url")

    def test_show_members_returns_avatar_url(self, headers):
        """GET /api/shows/{show_id}/members returns avatar_url with resolved local paths."""
        response = requests.get(
            f"{BASE_URL}/api/shows/{SHOW_WITH_MEMBERS}/members",
            headers=headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        members = response.json()
        assert len(members) > 0, "No members returned"
        
        # Check all members have avatar_url field (even if None)
        for member in members:
            assert "avatar_url" in member, f"Member {member['name']} missing avatar_url field"
            print(f"  Member {member['name']}: avatar_url={member.get('avatar_url', 'None')}")
        
        # Check members with avatars have proper URLs
        members_with_avatars = [m for m in members if m["name"] in USERS_WITH_AVATARS]
        for member in members_with_avatars:
            assert member["avatar_url"] is not None, \
                f"Member {member['name']} should have avatar_url"
            assert member["avatar_url"].startswith("/api/uploads/avatars/"), \
                f"Member {member['name']} avatar_url should be local path"
        
        print(f"✓ {len(members_with_avatars)} members have correct avatar_url")

    def test_avatar_endpoint_returns_image(self, headers):
        """GET /api/uploads/avatars/{file_key} returns image/png with 200 status."""
        # First get a user with avatar to get the file_key
        response = requests.get(
            f"{BASE_URL}/api/main-sites/{MAIN_SITE_ID}/users",
            headers=headers
        )
        assert response.status_code == 200
        
        users = response.json()
        user_with_avatar = next(
            (u for u in users if u["user_name"] in USERS_WITH_AVATARS and u.get("avatar_url")),
            None
        )
        
        if user_with_avatar:
            avatar_url = user_with_avatar["avatar_url"]
            # Test the avatar endpoint
            avatar_response = requests.get(
                f"{BASE_URL}{avatar_url}",
                headers={"Authorization": headers["Authorization"]}
            )
            assert avatar_response.status_code == 200, \
                f"Avatar endpoint failed: {avatar_response.status_code}"
            assert "image" in avatar_response.headers.get("Content-Type", ""), \
                f"Expected image content type, got {avatar_response.headers.get('Content-Type')}"
            print(f"✓ Avatar endpoint {avatar_url} returns image correctly")
        else:
            pytest.skip("No users with avatars found to test endpoint")

    def test_team_users_returns_avatar_object(self, headers):
        """GET /api/users returns avatar objects for users with uploaded photos."""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers=headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        users_with_avatar_data = 0
        
        for user in users:
            if user.get("name") in USERS_WITH_AVATARS:
                # User should have avatar object
                assert "avatar" in user, f"User {user['name']} should have avatar field"
                if user.get("avatar"):
                    users_with_avatar_data += 1
                    avatar = user["avatar"]
                    # Avatar should have file_key for local storage
                    assert "file_key" in avatar or "s3_url" in avatar, \
                        f"User {user['name']} avatar should have file_key or s3_url"
                    print(f"  {user['name']}: avatar has {'file_key' if 'file_key' in avatar else 's3_url'}")
        
        print(f"✓ Found {users_with_avatar_data} users with avatar data")


class TestRundownAttribution:
    """Test rundown item attribution includes avatar URLs."""

    def test_rundown_items_have_attribution_with_avatar(self, headers):
        """Rundown items should have created_by and last_edited_by with avatar_url."""
        # Get rundown items for the show
        response = requests.get(
            f"{BASE_URL}/api/shows/{SHOW_WITH_MEMBERS}/rundown",
            headers=headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        items = response.json()
        if len(items) == 0:
            pytest.skip("No rundown items to test")
        
        # Check attribution fields exist
        for item in items:
            if item.get("created_by"):
                assert "id" in item["created_by"], "created_by should have id"
                assert "name" in item["created_by"], "created_by should have name"
                assert "avatar_url" in item["created_by"], "created_by should have avatar_url"
                
            if item.get("last_edited_by"):
                assert "id" in item["last_edited_by"], "last_edited_by should have id"
                assert "name" in item["last_edited_by"], "last_edited_by should have name"
                assert "avatar_url" in item["last_edited_by"], "last_edited_by should have avatar_url"
        
        print(f"✓ {len(items)} rundown items have proper attribution structure")


class TestShowPresenters:
    """Test show presenter information includes avatar data."""

    def test_show_presenters_have_avatar(self, headers):
        """GET /api/shows/{show_id} should return presenters with avatar info."""
        response = requests.get(
            f"{BASE_URL}/api/shows/{SHOW_WITH_MEMBERS}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        show = response.json()
        
        if show.get("presenters"):
            for presenter in show["presenters"]:
                assert "id" in presenter, "Presenter should have id"
                assert "name" in presenter, "Presenter should have name"
                # Avatar info should be present (even if None)
                if presenter["name"] in USERS_WITH_AVATARS:
                    assert "avatar" in presenter, \
                        f"Presenter {presenter['name']} should have avatar field"
                print(f"  Presenter {presenter['name']}: avatar present")
            print(f"✓ {len(show['presenters'])} presenters have proper structure")
        else:
            print("✓ Show has no presenters (acceptable)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
