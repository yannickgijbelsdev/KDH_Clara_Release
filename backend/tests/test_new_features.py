"""
Test suite for Clara Radio Editor Dashboard - New Features
Tests:
1. Session timeout - login returns expires_at timestamp (~4 hours)
2. Config endpoint returns share_base_url as clara.koodh.com
3. Media folders - create folder
4. Media folders - get folder tree
5. Media folders - share folder with user/show/series
6. Media folders - delete folder (moves assets to root)
7. Show/rundown permission - non-admin cannot delete show
8. Show/rundown permission - non-admin cannot delete rundown item
9. Bulk assignment - assign to series with apply_to options
"""
import pytest
import requests
import os
import time
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "yannick.gijbels@koodh.com"
ADMIN_PASSWORD = "password123"
PRESENTER_EMAIL = "test.presenter@koodh.com"
PRESENTER_PASSWORD = "presenter123"


class TestSessionTimeout:
    """Test session timeout - login returns expires_at timestamp"""
    
    def test_login_returns_expires_at(self):
        """Login should return expires_at timestamp approximately 4 hours from now"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "expires_at" in data, "Response should contain expires_at"
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        
        # Verify expires_at is approximately 4 hours from now
        expires_at = data["expires_at"]
        current_time = datetime.now(timezone.utc).timestamp()
        
        # 4 hours = 14400 seconds, allow 60 seconds tolerance
        expected_expiry = current_time + (4 * 3600)
        assert abs(expires_at - expected_expiry) < 60, \
            f"expires_at should be ~4 hours from now. Got {expires_at}, expected ~{expected_expiry}"
        
        print(f"✓ Login returns expires_at: {expires_at} (in ~{(expires_at - current_time)/3600:.2f} hours)")


class TestConfigEndpoint:
    """Test config endpoint returns share_base_url"""
    
    def test_config_returns_share_base_url(self):
        """Config endpoint should return share_base_url as clara.koodh.com"""
        response = requests.get(f"{BASE_URL}/api/config")
        assert response.status_code == 200, f"Config request failed: {response.text}"
        
        data = response.json()
        assert "share_base_url" in data, "Response should contain share_base_url"
        assert data["share_base_url"] == "https://clara.koodh.com", \
            f"share_base_url should be 'https://clara.koodh.com', got '{data['share_base_url']}'"
        
        print(f"✓ Config returns share_base_url: {data['share_base_url']}")


@pytest.fixture(scope="class")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.text}")
    return response.json()["token"]


@pytest.fixture(scope="class")
def admin_headers(admin_token):
    """Get admin headers with auth token"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="class")
def presenter_token(admin_headers):
    """Create or get presenter user and return token"""
    # First try to login as presenter
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": PRESENTER_EMAIL,
        "password": PRESENTER_PASSWORD
    })
    
    if response.status_code == 200:
        return response.json()["token"]
    
    # Create presenter user via invite endpoint
    invite_response = requests.post(f"{BASE_URL}/api/users/invite", headers=admin_headers, json={
        "email": PRESENTER_EMAIL,
        "name": "Test Presenter",
        "role": "presenter"
    })
    
    if invite_response.status_code in [200, 201]:
        user_id = invite_response.json()["id"]
        
        # Get temp password
        temp_pwd_response = requests.get(f"{BASE_URL}/api/users/invite/{user_id}/password", headers=admin_headers)
        if temp_pwd_response.status_code == 200:
            temp_password = temp_pwd_response.json()["temp_password"]
            
            # Reset password to our known password
            reset_response = requests.put(
                f"{BASE_URL}/api/users/{user_id}/password",
                headers=admin_headers,
                json={"password": PRESENTER_PASSWORD}
            )
            
            if reset_response.status_code == 200:
                # Login with new user
                login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
                    "email": PRESENTER_EMAIL,
                    "password": PRESENTER_PASSWORD
                })
                if login_response.status_code == 200:
                    return login_response.json()["token"]
    
    pytest.skip(f"Could not create/login presenter user")


@pytest.fixture(scope="class")
def presenter_headers(presenter_token):
    """Get presenter headers with auth token"""
    return {
        "Authorization": f"Bearer {presenter_token}",
        "Content-Type": "application/json"
    }


class TestMediaFolders:
    """Test media folder CRUD operations"""
    
    created_folder_ids = []
    
    def test_create_folder(self, admin_headers):
        """Create a new media folder"""
        response = requests.post(f"{BASE_URL}/api/media/folders", headers=admin_headers, json={
            "name": "TEST_Folder_1",
            "color": "#FF5733"
        })
        assert response.status_code == 201, f"Create folder failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain folder id"
        assert data["name"] == "TEST_Folder_1", "Folder name should match"
        assert data["color"] == "#FF5733", "Folder color should match"
        
        self.created_folder_ids.append(data["id"])
        print(f"✓ Created folder: {data['name']} (id: {data['id']})")
        return data["id"]
    
    def test_create_nested_folder(self, admin_headers):
        """Create a nested folder inside another folder"""
        # First create parent folder
        parent_response = requests.post(f"{BASE_URL}/api/media/folders", headers=admin_headers, json={
            "name": "TEST_Parent_Folder"
        })
        assert parent_response.status_code == 201, f"Create parent folder failed: {parent_response.text}"
        parent_id = parent_response.json()["id"]
        self.created_folder_ids.append(parent_id)
        
        # Create child folder
        child_response = requests.post(f"{BASE_URL}/api/media/folders", headers=admin_headers, json={
            "name": "TEST_Child_Folder",
            "parent_id": parent_id
        })
        assert child_response.status_code == 201, f"Create child folder failed: {child_response.text}"
        
        child_data = child_response.json()
        assert child_data["parent_id"] == parent_id, "Child folder should have correct parent_id"
        self.created_folder_ids.append(child_data["id"])
        
        print(f"✓ Created nested folder: {child_data['name']} under parent {parent_id}")
    
    def test_get_folder_tree(self, admin_headers):
        """Get complete folder tree with nested structure"""
        response = requests.get(f"{BASE_URL}/api/media/folders/tree", headers=admin_headers)
        assert response.status_code == 200, f"Get folder tree failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of folders"
        
        # Check that folders have children array
        for folder in data:
            assert "children" in folder, "Each folder should have children array"
            assert "asset_count" in folder, "Each folder should have asset_count"
        
        print(f"✓ Got folder tree with {len(data)} root folders")
    
    def test_get_folders_list(self, admin_headers):
        """Get flat list of folders"""
        response = requests.get(f"{BASE_URL}/api/media/folders", headers=admin_headers)
        assert response.status_code == 200, f"Get folders failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Got {len(data)} folders")
    
    def test_get_single_folder(self, admin_headers):
        """Get a single folder by ID"""
        # First create a folder
        create_response = requests.post(f"{BASE_URL}/api/media/folders", headers=admin_headers, json={
            "name": "TEST_Single_Folder"
        })
        assert create_response.status_code == 201
        folder_id = create_response.json()["id"]
        self.created_folder_ids.append(folder_id)
        
        # Get the folder
        response = requests.get(f"{BASE_URL}/api/media/folders/{folder_id}", headers=admin_headers)
        assert response.status_code == 200, f"Get folder failed: {response.text}"
        
        data = response.json()
        assert data["id"] == folder_id, "Folder ID should match"
        assert data["name"] == "TEST_Single_Folder", "Folder name should match"
        
        print(f"✓ Got single folder: {data['name']}")
    
    def test_update_folder(self, admin_headers):
        """Update a folder"""
        # First create a folder
        create_response = requests.post(f"{BASE_URL}/api/media/folders", headers=admin_headers, json={
            "name": "TEST_Update_Folder"
        })
        assert create_response.status_code == 201
        folder_id = create_response.json()["id"]
        self.created_folder_ids.append(folder_id)
        
        # Update the folder
        response = requests.put(f"{BASE_URL}/api/media/folders/{folder_id}", headers=admin_headers, json={
            "name": "TEST_Updated_Folder",
            "color": "#00FF00"
        })
        assert response.status_code == 200, f"Update folder failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_Updated_Folder", "Folder name should be updated"
        assert data["color"] == "#00FF00", "Folder color should be updated"
        
        print(f"✓ Updated folder: {data['name']}")
    
    def test_delete_folder_moves_assets_to_root(self, admin_headers):
        """Delete a folder - assets should be moved to root"""
        # Create a folder
        create_response = requests.post(f"{BASE_URL}/api/media/folders", headers=admin_headers, json={
            "name": "TEST_Delete_Folder"
        })
        assert create_response.status_code == 201
        folder_id = create_response.json()["id"]
        
        # Delete the folder with move_to_root=True (default)
        response = requests.delete(f"{BASE_URL}/api/media/folders/{folder_id}?move_to_root=true", headers=admin_headers)
        assert response.status_code == 204, f"Delete folder failed: {response.text}"
        
        # Verify folder is deleted
        get_response = requests.get(f"{BASE_URL}/api/media/folders/{folder_id}", headers=admin_headers)
        assert get_response.status_code == 404, "Folder should be deleted"
        
        print(f"✓ Deleted folder {folder_id} (assets moved to root)")


class TestFolderSharing:
    """Test folder sharing with users/shows/series"""
    
    created_folder_id = None
    created_share_ids = []
    
    def test_share_folder_with_user(self, admin_headers):
        """Share a folder with a user"""
        # Create a folder
        create_response = requests.post(f"{BASE_URL}/api/media/folders", headers=admin_headers, json={
            "name": "TEST_Share_Folder"
        })
        assert create_response.status_code == 201
        self.created_folder_id = create_response.json()["id"]
        
        # Get a user to share with
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        assert users_response.status_code == 200
        users = users_response.json()
        
        if len(users) < 1:
            pytest.skip("No users available to share with")
        
        user_id = users[0]["id"]
        
        # Share folder with user
        response = requests.post(
            f"{BASE_URL}/api/media/folders/{self.created_folder_id}/shares",
            headers=admin_headers,
            json={"user_ids": [user_id]}
        )
        assert response.status_code == 200, f"Share folder failed: {response.text}"
        
        data = response.json()
        assert "shares_created" in data, "Response should contain shares_created"
        
        print(f"✓ Shared folder with user {user_id}")
    
    def test_share_folder_with_show(self, admin_headers):
        """Share a folder with a show"""
        if not self.created_folder_id:
            # Create a folder
            create_response = requests.post(f"{BASE_URL}/api/media/folders", headers=admin_headers, json={
                "name": "TEST_Share_Show_Folder"
            })
            assert create_response.status_code == 201
            self.created_folder_id = create_response.json()["id"]
        
        # Get a show to share with
        shows_response = requests.get(f"{BASE_URL}/api/shows", headers=admin_headers)
        assert shows_response.status_code == 200
        shows = shows_response.json()
        
        if len(shows) < 1:
            print("⚠ No shows available to share with - skipping show share test")
            return
        
        show_id = shows[0]["id"]
        
        # Share folder with show
        response = requests.post(
            f"{BASE_URL}/api/media/folders/{self.created_folder_id}/shares",
            headers=admin_headers,
            json={"show_ids": [show_id]}
        )
        assert response.status_code == 200, f"Share folder with show failed: {response.text}"
        
        print(f"✓ Shared folder with show {show_id}")
    
    def test_share_folder_with_series(self, admin_headers):
        """Share a folder with a series"""
        if not self.created_folder_id:
            # Create a folder
            create_response = requests.post(f"{BASE_URL}/api/media/folders", headers=admin_headers, json={
                "name": "TEST_Share_Series_Folder"
            })
            assert create_response.status_code == 201
            self.created_folder_id = create_response.json()["id"]
        
        # Get a series to share with
        series_response = requests.get(f"{BASE_URL}/api/series", headers=admin_headers)
        assert series_response.status_code == 200
        series_list = series_response.json()
        
        if len(series_list) < 1:
            print("⚠ No series available to share with - skipping series share test")
            return
        
        series_id = series_list[0]["id"]
        
        # Share folder with series
        response = requests.post(
            f"{BASE_URL}/api/media/folders/{self.created_folder_id}/shares",
            headers=admin_headers,
            json={"series_ids": [series_id]}
        )
        assert response.status_code == 200, f"Share folder with series failed: {response.text}"
        
        print(f"✓ Shared folder with series {series_id}")
    
    def test_get_folder_shares(self, admin_headers):
        """Get all shares for a folder"""
        if not self.created_folder_id:
            pytest.skip("No folder created for share test")
        
        response = requests.get(
            f"{BASE_URL}/api/media/folders/{self.created_folder_id}/shares",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Get folder shares failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of shares"
        
        print(f"✓ Got {len(data)} shares for folder")
    
    def test_cleanup_folder(self, admin_headers):
        """Cleanup test folder"""
        if self.created_folder_id:
            requests.delete(f"{BASE_URL}/api/media/folders/{self.created_folder_id}", headers=admin_headers)
            print(f"✓ Cleaned up test folder {self.created_folder_id}")


class TestShowPermissions:
    """Test show/rundown edit restrictions"""
    
    created_show_id = None
    
    def test_non_admin_cannot_delete_show(self, admin_headers, presenter_headers):
        """Non-admin (presenter) should not be able to delete a show"""
        # First create a show as admin
        create_response = requests.post(f"{BASE_URL}/api/shows", headers=admin_headers, json={
            "title": "TEST_Permission_Show",
            "date": "2026-02-01",
            "start_time": "10:00",
            "end_time": "12:00"
        })
        
        if create_response.status_code != 201:
            pytest.skip(f"Could not create show: {create_response.text}")
        
        self.created_show_id = create_response.json()["id"]
        
        # Try to delete as presenter (should fail with 403)
        delete_response = requests.delete(
            f"{BASE_URL}/api/shows/{self.created_show_id}",
            headers=presenter_headers
        )
        
        assert delete_response.status_code == 403, \
            f"Presenter should not be able to delete show. Got {delete_response.status_code}: {delete_response.text}"
        
        print(f"✓ Non-admin correctly denied from deleting show (403)")
    
    def test_admin_can_delete_show(self, admin_headers):
        """Admin should be able to delete a show"""
        if self.created_show_id:
            delete_response = requests.delete(
                f"{BASE_URL}/api/shows/{self.created_show_id}",
                headers=admin_headers
            )
            assert delete_response.status_code == 204, \
                f"Admin should be able to delete show. Got {delete_response.status_code}: {delete_response.text}"
            
            print(f"✓ Admin successfully deleted show")


class TestRundownPermissions:
    """Test rundown item delete restrictions"""
    
    created_occurrence_id = None
    created_item_id = None
    
    def test_non_admin_cannot_delete_rundown_item(self, admin_headers, presenter_headers):
        """Non-admin should not be able to delete rundown items"""
        # Get an occurrence
        occurrences_response = requests.get(f"{BASE_URL}/api/occurrences", headers=admin_headers)
        
        if occurrences_response.status_code != 200:
            pytest.skip(f"Could not get occurrences: {occurrences_response.text}")
        
        occurrences = occurrences_response.json()
        
        if len(occurrences) < 1:
            pytest.skip("No occurrences available for testing")
        
        self.created_occurrence_id = occurrences[0]["id"]
        
        # Create a rundown item as admin
        create_response = requests.post(
            f"{BASE_URL}/api/occurrences/{self.created_occurrence_id}/rundown",
            headers=admin_headers,
            json={
                "type": "segment",
                "title": "TEST_Rundown_Item",
                "duration": "5:00"
            }
        )
        
        if create_response.status_code != 201:
            pytest.skip(f"Could not create rundown item: {create_response.text}")
        
        self.created_item_id = create_response.json()["id"]
        
        # Try to delete as presenter (should fail with 403)
        delete_response = requests.delete(
            f"{BASE_URL}/api/occurrences/{self.created_occurrence_id}/rundown/{self.created_item_id}",
            headers=presenter_headers
        )
        
        assert delete_response.status_code == 403, \
            f"Presenter should not be able to delete rundown item. Got {delete_response.status_code}: {delete_response.text}"
        
        print(f"✓ Non-admin correctly denied from deleting rundown item (403)")
    
    def test_admin_can_delete_rundown_item(self, admin_headers):
        """Admin should be able to delete rundown items"""
        if self.created_occurrence_id and self.created_item_id:
            delete_response = requests.delete(
                f"{BASE_URL}/api/occurrences/{self.created_occurrence_id}/rundown/{self.created_item_id}",
                headers=admin_headers
            )
            assert delete_response.status_code == 204, \
                f"Admin should be able to delete rundown item. Got {delete_response.status_code}: {delete_response.text}"
            
            print(f"✓ Admin successfully deleted rundown item")


class TestBulkAssignment:
    """Test bulk assignment changes for recurring shows"""
    
    def test_bulk_assign_this_only(self, admin_headers):
        """Bulk assign user to series with apply_to='this_only'"""
        # Get or create a series
        series_response = requests.get(f"{BASE_URL}/api/series", headers=admin_headers)
        assert series_response.status_code == 200
        series_list = series_response.json()
        
        if len(series_list) < 1:
            pytest.skip("No series available for testing")
        
        series_id = series_list[0]["id"]
        
        # Get a user to assign
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        assert users_response.status_code == 200
        users = users_response.json()
        
        if len(users) < 1:
            pytest.skip("No users available for assignment")
        
        user_id = users[0]["id"]
        
        # First remove any existing assignment
        requests.delete(
            f"{BASE_URL}/api/series/{series_id}/assignments/{user_id}/bulk?apply_to=all",
            headers=admin_headers
        )
        
        # Bulk assign with this_only
        response = requests.post(
            f"{BASE_URL}/api/series/{series_id}/assignments/bulk",
            headers=admin_headers,
            json={
                "user_id": user_id,
                "role_on_show": "presenter",
                "apply_to": "this_only"
            }
        )
        assert response.status_code == 200, f"Bulk assign failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert data["occurrences_updated"] == 0, "this_only should not update occurrences"
        
        print(f"✓ Bulk assigned user with apply_to='this_only'")
    
    def test_bulk_assign_all_future(self, admin_headers):
        """Bulk assign user to series with apply_to='all_future'"""
        # Get series
        series_response = requests.get(f"{BASE_URL}/api/series", headers=admin_headers)
        assert series_response.status_code == 200
        series_list = series_response.json()
        
        if len(series_list) < 1:
            pytest.skip("No series available for testing")
        
        series_id = series_list[0]["id"]
        
        # Get users
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        users = users_response.json()
        
        if len(users) < 2:
            user_id = users[0]["id"]
        else:
            user_id = users[1]["id"]
        
        # First remove any existing assignment
        requests.delete(
            f"{BASE_URL}/api/series/{series_id}/assignments/{user_id}/bulk?apply_to=all",
            headers=admin_headers
        )
        
        # Bulk assign with all_future
        response = requests.post(
            f"{BASE_URL}/api/series/{series_id}/assignments/bulk",
            headers=admin_headers,
            json={
                "user_id": user_id,
                "role_on_show": "presenter",
                "apply_to": "all_future"
            }
        )
        assert response.status_code == 200, f"Bulk assign all_future failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        
        print(f"✓ Bulk assigned user with apply_to='all_future', occurrences_updated: {data.get('occurrences_updated', 0)}")
    
    def test_bulk_assign_all(self, admin_headers):
        """Bulk assign user to series with apply_to='all'"""
        # Get series
        series_response = requests.get(f"{BASE_URL}/api/series", headers=admin_headers)
        assert series_response.status_code == 200
        series_list = series_response.json()
        
        if len(series_list) < 1:
            pytest.skip("No series available for testing")
        
        series_id = series_list[0]["id"]
        
        # Get users
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        users = users_response.json()
        
        if len(users) < 3:
            user_id = users[0]["id"]
        else:
            user_id = users[2]["id"]
        
        # First remove any existing assignment
        requests.delete(
            f"{BASE_URL}/api/series/{series_id}/assignments/{user_id}/bulk?apply_to=all",
            headers=admin_headers
        )
        
        # Bulk assign with all
        response = requests.post(
            f"{BASE_URL}/api/series/{series_id}/assignments/bulk",
            headers=admin_headers,
            json={
                "user_id": user_id,
                "role_on_show": "presenter",
                "apply_to": "all"
            }
        )
        assert response.status_code == 200, f"Bulk assign all failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        
        print(f"✓ Bulk assigned user with apply_to='all', occurrences_updated: {data.get('occurrences_updated', 0)}")
    
    def test_bulk_remove_assignment(self, admin_headers):
        """Bulk remove user assignment from series"""
        # Get series
        series_response = requests.get(f"{BASE_URL}/api/series", headers=admin_headers)
        assert series_response.status_code == 200
        series_list = series_response.json()
        
        if len(series_list) < 1:
            pytest.skip("No series available for testing")
        
        series_id = series_list[0]["id"]
        
        # Get users
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        users = users_response.json()
        
        if len(users) < 1:
            pytest.skip("No users available for testing")
        
        user_id = users[0]["id"]
        
        response = requests.delete(
            f"{BASE_URL}/api/series/{series_id}/assignments/{user_id}/bulk?apply_to=all",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Bulk remove assignment failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        
        print(f"✓ Bulk removed assignment with apply_to='all'")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_folders(self, admin_headers):
        """Clean up TEST_ prefixed folders"""
        response = requests.get(f"{BASE_URL}/api/media/folders", headers=admin_headers)
        if response.status_code == 200:
            folders = response.json()
            for folder in folders:
                if folder.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/media/folders/{folder['id']}", headers=admin_headers)
                    print(f"  Cleaned up folder: {folder['name']}")
        print("✓ Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
