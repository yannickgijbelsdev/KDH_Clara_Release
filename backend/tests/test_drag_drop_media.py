"""
Test drag-and-drop media asset functionality.
Tests moving assets between folders and to root.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDragDropMedia:
    """Test drag-and-drop media asset functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "yannick.gijbels@koodh.com",
            "password": "password123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        
        # Cleanup: Move test asset back to root if it exists
        try:
            assets = self.session.get(f"{BASE_URL}/api/media").json()
            for asset in assets:
                if asset.get("title", "").startswith("TEST_"):
                    self.session.delete(f"{BASE_URL}/api/media/{asset['id']}")
        except Exception:
            pass
    
    def test_get_media_assets(self):
        """Test GET /api/media returns assets list"""
        response = self.session.get(f"{BASE_URL}/api/media")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} media assets")
    
    def test_get_folders_tree(self):
        """Test GET /api/media/folders/tree returns folder structure"""
        response = self.session.get(f"{BASE_URL}/api/media/folders/tree")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} root folders")
    
    def test_move_asset_to_folder(self):
        """Test PUT /api/media/{id} with folder_id moves asset to folder"""
        # Get existing assets
        assets_response = self.session.get(f"{BASE_URL}/api/media")
        assert assets_response.status_code == 200
        assets = assets_response.json()
        
        if len(assets) == 0:
            pytest.skip("No assets available for testing")
        
        # Get existing folders
        folders_response = self.session.get(f"{BASE_URL}/api/media/folders/tree")
        assert folders_response.status_code == 200
        folders = folders_response.json()
        
        if len(folders) == 0:
            pytest.skip("No folders available for testing")
        
        asset_id = assets[0]["id"]
        folder_id = folders[0]["id"]
        original_folder_id = assets[0].get("folder_id")
        
        # Move asset to folder
        response = self.session.put(f"{BASE_URL}/api/media/{asset_id}", json={
            "folder_id": folder_id
        })
        assert response.status_code == 200
        data = response.json()
        assert data["folder_id"] == folder_id, f"Expected folder_id {folder_id}, got {data['folder_id']}"
        print(f"✓ Asset moved to folder {folder_id}")
        
        # Verify with GET
        verify_response = self.session.get(f"{BASE_URL}/api/media/{asset_id}")
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data["folder_id"] == folder_id
        print("✓ Asset folder_id verified via GET")
        
        # Restore original state
        self.session.put(f"{BASE_URL}/api/media/{asset_id}", json={
            "folder_id": original_folder_id
        })
    
    def test_move_asset_to_root(self):
        """Test PUT /api/media/{id} with folder_id=null moves asset to root"""
        # Get existing assets
        assets_response = self.session.get(f"{BASE_URL}/api/media")
        assert assets_response.status_code == 200
        assets = assets_response.json()
        
        if len(assets) == 0:
            pytest.skip("No assets available for testing")
        
        # Get existing folders
        folders_response = self.session.get(f"{BASE_URL}/api/media/folders/tree")
        assert folders_response.status_code == 200
        folders = folders_response.json()
        
        if len(folders) == 0:
            pytest.skip("No folders available for testing")
        
        asset_id = assets[0]["id"]
        folder_id = folders[0]["id"]
        original_folder_id = assets[0].get("folder_id")
        
        # First move asset to a folder
        self.session.put(f"{BASE_URL}/api/media/{asset_id}", json={
            "folder_id": folder_id
        })
        
        # Now move asset back to root (folder_id = null)
        response = self.session.put(f"{BASE_URL}/api/media/{asset_id}", json={
            "folder_id": None
        })
        assert response.status_code == 200
        data = response.json()
        assert data["folder_id"] is None, f"Expected folder_id None, got {data['folder_id']}"
        print("✓ Asset moved to root (folder_id = null)")
        
        # Verify with GET
        verify_response = self.session.get(f"{BASE_URL}/api/media/{asset_id}")
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data["folder_id"] is None
        print("✓ Asset root location verified via GET")
        
        # Restore original state
        if original_folder_id:
            self.session.put(f"{BASE_URL}/api/media/{asset_id}", json={
                "folder_id": original_folder_id
            })
    
    def test_update_asset_title_only(self):
        """Test PUT /api/media/{id} with title only doesn't affect folder_id"""
        # Get existing assets
        assets_response = self.session.get(f"{BASE_URL}/api/media")
        assert assets_response.status_code == 200
        assets = assets_response.json()
        
        if len(assets) == 0:
            pytest.skip("No assets available for testing")
        
        asset_id = assets[0]["id"]
        original_title = assets[0]["title"]
        original_folder_id = assets[0].get("folder_id")
        
        # Update only title
        new_title = f"TEST_{original_title}"
        response = self.session.put(f"{BASE_URL}/api/media/{asset_id}", json={
            "title": new_title
        })
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == new_title
        assert data["folder_id"] == original_folder_id, "folder_id should not change when only updating title"
        print("✓ Title updated without affecting folder_id")
        
        # Restore original title
        self.session.put(f"{BASE_URL}/api/media/{asset_id}", json={
            "title": original_title
        })
    
    def test_get_assets_by_folder(self):
        """Test GET /api/media?folder_id={id} filters by folder"""
        # Get existing folders
        folders_response = self.session.get(f"{BASE_URL}/api/media/folders/tree")
        assert folders_response.status_code == 200
        folders = folders_response.json()
        
        if len(folders) == 0:
            pytest.skip("No folders available for testing")
        
        folder_id = folders[0]["id"]
        
        # Get assets in folder
        response = self.session.get(f"{BASE_URL}/api/media?folder_id={folder_id}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all returned assets are in the folder
        for asset in data:
            assert asset["folder_id"] == folder_id, f"Asset {asset['id']} has wrong folder_id"
        
        print(f"✓ Found {len(data)} assets in folder {folder_id}")
    
    def test_folder_asset_count(self):
        """Test folder tree includes correct asset_count"""
        response = self.session.get(f"{BASE_URL}/api/media/folders/tree")
        assert response.status_code == 200
        folders = response.json()
        
        for folder in folders:
            assert "asset_count" in folder, "Folder should have asset_count field"
            assert isinstance(folder["asset_count"], int), "asset_count should be integer"
            print(f"✓ Folder '{folder['name']}' has {folder['asset_count']} assets")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
