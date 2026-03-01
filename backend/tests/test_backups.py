"""
Test Backup Management APIs for Clara Radio App
Tests: Backup CRUD, Restore, Clone, and Authorization
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
NON_ADMIN_EMAIL = "hadewig@mfy.be"
NON_ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"


class TestBackupAPIs:
    """Tests for backup management endpoints - network admin only"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get auth token for network admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json().get("token")

    @pytest.fixture(scope="class")
    def non_admin_token(self):
        """Get auth token for non-network-admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NON_ADMIN_EMAIL,
            "password": NON_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Non-admin login failed: {response.text}")
        return response.json().get("token")

    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        """Headers with admin auth token"""
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

    @pytest.fixture(scope="class")
    def non_admin_headers(self, non_admin_token):
        """Headers with non-admin auth token"""
        return {"Authorization": f"Bearer {non_admin_token}", "Content-Type": "application/json"}

    # ─────────────────────────────────────────────────────────────────────────
    # List Backups Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_list_backups_for_site(self, admin_headers):
        """GET /api/backups/{main_site_id} - should list backups for a site"""
        response = requests.get(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "backups" in data, "Response should contain 'backups' array"
        assert isinstance(data["backups"], list), "Backups should be a list"
        print(f"Found {len(data['backups'])} backups for main_site_id {MAIN_SITE_ID}")

    def test_list_all_backups(self, admin_headers):
        """GET /api/backups/all - should list all backups across sites"""
        response = requests.get(f"{BASE_URL}/api/backups/all", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "backups" in data, "Response should contain 'backups' array"
        print(f"Total backups across all sites: {len(data['backups'])}")

    # ─────────────────────────────────────────────────────────────────────────
    # Create Manual Backup Test
    # ─────────────────────────────────────────────────────────────────────────

    def test_create_manual_backup(self, admin_headers):
        """POST /api/backups/{main_site_id} - should create a manual backup with status=completed"""
        response = requests.post(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] == "completed", f"Expected status 'completed', got '{data.get('status')}'"
        assert "id" in data, "Response should contain 'id'"
        assert "document_count" in data, "Response should contain 'document_count'"
        assert "size_bytes" in data, "Response should contain 'size_bytes'"
        assert data["document_count"] > 0, "Backup should contain documents"
        assert data["size_bytes"] > 0, "Backup should have size > 0"
        assert data["type"] == "manual", f"Backup type should be 'manual', got '{data.get('type')}'"
        
        print(f"Created backup {data['id']}: {data['document_count']} docs, {data['size_bytes']} bytes")
        
        # Store backup_id for later tests
        TestBackupAPIs.created_backup_id = data["id"]

    def test_create_backup_nonexistent_site(self, admin_headers):
        """POST /api/backups/{invalid_id} - should return 404 for non-existent site"""
        response = requests.post(
            f"{BASE_URL}/api/backups/nonexistent-site-id",
            headers=admin_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"

    # ─────────────────────────────────────────────────────────────────────────
    # Restore Backup Test
    # ─────────────────────────────────────────────────────────────────────────

    def test_restore_backup_creates_safety_backup(self, admin_headers):
        """POST /api/backups/{main_site_id}/restore - should create safety backup before restoring"""
        # First get list of backups to find one to restore
        list_response = requests.get(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}",
            headers=admin_headers
        )
        backups = list_response.json().get("backups", [])
        completed_backups = [b for b in backups if b.get("status") == "completed"]
        
        if not completed_backups:
            pytest.skip("No completed backups available to test restore")
        
        backup_to_restore = completed_backups[0]
        backup_id = backup_to_restore["id"]
        
        response = requests.post(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}/restore",
            headers=admin_headers,
            json={"backup_id": backup_id}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("status") == "completed", f"Restore should complete, got: {data}"
        assert "safety_backup_id" in data, "Response should include safety_backup_id"
        assert data["backup_id"] == backup_id, "Response should confirm the restored backup_id"
        
        print(f"Restored from {backup_id}, safety backup created: {data['safety_backup_id']}")

    def test_restore_nonexistent_backup(self, admin_headers):
        """POST /api/backups/{main_site_id}/restore - should return 404 for non-existent backup"""
        response = requests.post(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}/restore",
            headers=admin_headers,
            json={"backup_id": "nonexistent-backup-id"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"

    # ─────────────────────────────────────────────────────────────────────────
    # Clone Site Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_clone_main_site(self, admin_headers):
        """POST /api/backups/{main_site_id}/clone - should clone site for testing"""
        clone_name = f"[TEST] Clone {int(time.time())}"
        response = requests.post(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}/clone",
            headers=admin_headers,
            json={"clone_name": clone_name}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("status") == "completed", f"Clone should complete, got: {data}"
        assert "clone_main_site_id" in data, "Response should include clone_main_site_id"
        assert data["clone_name"] == clone_name, f"Clone name mismatch: {data.get('clone_name')}"
        assert "document_count" in data, "Response should include document_count"
        assert data["document_count"] > 0, "Clone should contain documents"
        
        print(f"Created clone: {data['clone_main_site_id']} with {data['document_count']} docs")
        
        # Store clone_id for later cleanup
        TestBackupAPIs.created_clone_id = data["clone_main_site_id"]

    def test_list_clones(self, admin_headers):
        """GET /api/backups/{main_site_id}/clones - should list clones for a site"""
        response = requests.get(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}/clones",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "clones" in data, "Response should contain 'clones' array"
        assert isinstance(data["clones"], list), "Clones should be a list"
        
        # Check for our created clone
        if hasattr(TestBackupAPIs, 'created_clone_id'):
            clone_ids = [c.get("id") for c in data["clones"]]
            assert TestBackupAPIs.created_clone_id in clone_ids, "Created clone should appear in list"
        
        print(f"Found {len(data['clones'])} clones for main_site_id {MAIN_SITE_ID}")

    def test_delete_clone(self, admin_headers):
        """DELETE /api/backups/clone/{clone_id} - should delete a clone"""
        if not hasattr(TestBackupAPIs, 'created_clone_id'):
            pytest.skip("No clone was created to delete")
        
        clone_id = TestBackupAPIs.created_clone_id
        response = requests.delete(
            f"{BASE_URL}/api/backups/clone/{clone_id}",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("status") == "completed", f"Delete should complete, got: {data}"
        assert "documents_deleted" in data, "Response should include documents_deleted count"
        
        print(f"Deleted clone {clone_id}: {data['documents_deleted']} documents removed")

    # ─────────────────────────────────────────────────────────────────────────
    # Delete Backup Test
    # ─────────────────────────────────────────────────────────────────────────

    def test_delete_backup(self, admin_headers):
        """DELETE /api/backups/single/{backup_id} - should delete a backup"""
        # First create a backup to delete
        create_response = requests.post(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}",
            headers=admin_headers
        )
        if create_response.status_code != 200:
            pytest.skip("Could not create backup to delete")
        
        backup_id = create_response.json()["id"]
        
        response = requests.delete(
            f"{BASE_URL}/api/backups/single/{backup_id}",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("status") == "deleted", f"Expected status 'deleted', got: {data}"
        assert data.get("backup_id") == backup_id, "Response should confirm deleted backup_id"
        
        print(f"Deleted backup {backup_id}")

    def test_delete_nonexistent_backup(self, admin_headers):
        """DELETE /api/backups/single/{invalid_id} - should return 404"""
        response = requests.delete(
            f"{BASE_URL}/api/backups/single/nonexistent-backup-id",
            headers=admin_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"

    # ─────────────────────────────────────────────────────────────────────────
    # Authorization Tests (403 for non-network-admin)
    # ─────────────────────────────────────────────────────────────────────────

    def test_non_admin_list_backups_forbidden(self, non_admin_headers):
        """Non-network-admin should get 403 on GET /api/backups/{main_site_id}"""
        response = requests.get(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}",
            headers=non_admin_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

    def test_non_admin_create_backup_forbidden(self, non_admin_headers):
        """Non-network-admin should get 403 on POST /api/backups/{main_site_id}"""
        response = requests.post(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}",
            headers=non_admin_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

    def test_non_admin_restore_forbidden(self, non_admin_headers):
        """Non-network-admin should get 403 on POST /api/backups/{main_site_id}/restore"""
        response = requests.post(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}/restore",
            headers=non_admin_headers,
            json={"backup_id": "test"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

    def test_non_admin_clone_forbidden(self, non_admin_headers):
        """Non-network-admin should get 403 on POST /api/backups/{main_site_id}/clone"""
        response = requests.post(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}/clone",
            headers=non_admin_headers,
            json={"clone_name": "test"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

    def test_non_admin_list_clones_forbidden(self, non_admin_headers):
        """Non-network-admin should get 403 on GET /api/backups/{main_site_id}/clones"""
        response = requests.get(
            f"{BASE_URL}/api/backups/{MAIN_SITE_ID}/clones",
            headers=non_admin_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

    def test_non_admin_delete_backup_forbidden(self, non_admin_headers):
        """Non-network-admin should get 403 on DELETE /api/backups/single/{backup_id}"""
        response = requests.delete(
            f"{BASE_URL}/api/backups/single/test-id",
            headers=non_admin_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

    def test_non_admin_delete_clone_forbidden(self, non_admin_headers):
        """Non-network-admin should get 403 on DELETE /api/backups/clone/{clone_id}"""
        response = requests.delete(
            f"{BASE_URL}/api/backups/clone/test-id",
            headers=non_admin_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

    # ─────────────────────────────────────────────────────────────────────────
    # Unauthenticated Tests (401)
    # ─────────────────────────────────────────────────────────────────────────

    def test_unauthenticated_list_backups(self):
        """Unauthenticated request should get 401"""
        response = requests.get(f"{BASE_URL}/api/backups/{MAIN_SITE_ID}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"

    def test_unauthenticated_create_backup(self):
        """Unauthenticated request should get 401"""
        response = requests.post(f"{BASE_URL}/api/backups/{MAIN_SITE_ID}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
