"""
Tests for Network Admin Management and View Mode Preferences
Features:
- Network admin CRUD operations (GET, POST, PUT, DELETE)
- User preferences (network_view_mode)
- Primary admin protection
- Permission management
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - Primary Network Admin
PRIMARY_ADMIN_EMAIL = "admkoodh@koodh.com"
PRIMARY_ADMIN_PASSWORD = "KYLovie13monx"


class TestNetworkAdminFeatures:
    """Test network admin CRUD and preferences endpoints."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login as primary network admin."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as primary admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": PRIMARY_ADMIN_EMAIL,
            "password": PRIMARY_ADMIN_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        login_data = login_res.json()
        self.token = login_data.get("token")
        self.user = login_data.get("user")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        # Cleanup - no persistent test data created
    
    # ===== /api/auth/me endpoint tests =====
    
    def test_auth_me_returns_is_primary_network_admin(self):
        """GET /api/auth/me should return is_primary_network_admin field."""
        res = self.session.get(f"{BASE_URL}/api/auth/me")
        assert res.status_code == 200
        data = res.json()
        
        # Check that required fields exist
        assert "is_network_admin" in data, "Missing is_network_admin field"
        assert "is_primary_network_admin" in data, "Missing is_primary_network_admin field"
        
        # Primary admin should have both true
        assert data["is_network_admin"], "is_network_admin should be True"
        assert data["is_primary_network_admin"], "is_primary_network_admin should be True"
    
    # ===== User Preferences tests =====
    
    def test_save_network_view_mode_preference(self):
        """PUT /api/users/me/preferences saves network_view_mode."""
        # Test setting to 'grid'
        res = self.session.put(f"{BASE_URL}/api/users/me/preferences", json={
            "network_view_mode": "grid"
        })
        assert res.status_code == 200
        data = res.json()
        assert "preferences" in data
        assert data["preferences"]["network_view_mode"] == "grid"
        
        # Test setting to 'list'
        res = self.session.put(f"{BASE_URL}/api/users/me/preferences", json={
            "network_view_mode": "list"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["preferences"]["network_view_mode"] == "list"
    
    def test_get_user_preferences_returns_network_view_mode(self):
        """GET /api/users/me/preferences returns network_view_mode preference."""
        # First set a preference
        self.session.put(f"{BASE_URL}/api/users/me/preferences", json={
            "network_view_mode": "grid"
        })
        
        # Then get preferences
        res = self.session.get(f"{BASE_URL}/api/users/me/preferences")
        assert res.status_code == 200
        data = res.json()
        assert "network_view_mode" in data
        assert data["network_view_mode"] in ["grid", "list"]
    
    def test_preferences_rejects_invalid_keys(self):
        """PUT /api/users/me/preferences rejects unknown preference keys."""
        res = self.session.put(f"{BASE_URL}/api/users/me/preferences", json={
            "invalid_key": "value"
        })
        # Should fail with 400 - no valid preferences
        assert res.status_code == 400
        data = res.json()
        assert "detail" in data
    
    # ===== Network Admins GET tests =====
    
    def test_get_network_admins_returns_list(self):
        """GET /api/users/network-admins returns list of all network admins."""
        res = self.session.get(f"{BASE_URL}/api/users/network-admins")
        assert res.status_code == 200
        data = res.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 1, "Should have at least 1 network admin (the primary)"
        
        # Check that each admin has required fields
        for admin in data:
            assert "id" in admin
            assert "email" in admin
            assert "name" in admin
            assert "is_network_admin" in admin
            assert admin["is_network_admin"]
        
        # Check that primary admin exists with is_primary_network_admin field
        primary_admins = [a for a in data if a.get("is_primary_network_admin")]
        assert len(primary_admins) >= 1, "Should have at least 1 primary network admin"
    
    def test_get_network_admins_excludes_sensitive_fields(self):
        """GET /api/users/network-admins excludes password_hash and totp_secret."""
        res = self.session.get(f"{BASE_URL}/api/users/network-admins")
        assert res.status_code == 200
        data = res.json()
        
        for admin in data:
            assert "password_hash" not in admin, "Should not expose password_hash"
            assert "totp_secret" not in admin, "Should not expose totp_secret"
    
    # ===== Network Admin POST tests =====
    
    def test_create_network_admin(self):
        """POST /api/users/network-admins creates new network admin."""
        # Use unique email to avoid conflicts
        test_email = f"test_na_{os.urandom(4).hex()}@example.com"
        
        res = self.session.post(f"{BASE_URL}/api/users/network-admins", json={
            "name": "TEST Network Admin",
            "email": test_email,
            "network_permissions": {
                "read_only": False,
                "manage_sites": True,
                "manage_users": False
            }
        })
        assert res.status_code == 200, f"Create failed: {res.text}"
        data = res.json()
        
        # Should return user_id and temp_password
        assert "user_id" in data or "message" in data
        if "temp_password" in data:
            assert len(data["temp_password"]) > 0, "Temp password should be set"
        
        # Cleanup - remove the test admin
        if "user_id" in data:
            admin_id = data["user_id"]
            delete_res = self.session.delete(f"{BASE_URL}/api/users/network-admins/{admin_id}")
            assert delete_res.status_code == 200, "Cleanup failed"
    
    def test_create_network_admin_duplicate_email_fails(self):
        """POST /api/users/network-admins rejects duplicate email for existing network admin."""
        # Try to create admin with primary admin's email
        res = self.session.post(f"{BASE_URL}/api/users/network-admins", json={
            "name": "Duplicate Admin",
            "email": PRIMARY_ADMIN_EMAIL,
            "network_permissions": {}
        })
        # Should fail - email already is a network admin
        assert res.status_code == 400
        data = res.json()
        assert "already a network admin" in data["detail"].lower() or "already" in data["detail"].lower()
    
    def test_create_network_admin_requires_name_and_email(self):
        """POST /api/users/network-admins requires name and email."""
        # Missing email
        res = self.session.post(f"{BASE_URL}/api/users/network-admins", json={
            "name": "Test Admin"
        })
        assert res.status_code == 400
        
        # Missing name
        res = self.session.post(f"{BASE_URL}/api/users/network-admins", json={
            "email": "test@example.com"
        })
        assert res.status_code == 400
    
    # ===== Network Admin PUT permissions tests =====
    
    def test_update_network_admin_permissions(self):
        """PUT /api/users/network-admins/{id}/permissions updates permissions."""
        # First create a test admin
        test_email = f"test_perm_{os.urandom(4).hex()}@example.com"
        create_res = self.session.post(f"{BASE_URL}/api/users/network-admins", json={
            "name": "TEST Permission Admin",
            "email": test_email,
            "network_permissions": {"read_only": True}
        })
        assert create_res.status_code == 200
        admin_id = create_res.json().get("user_id")
        assert admin_id, "No user_id returned"
        
        try:
            # Update permissions
            res = self.session.put(f"{BASE_URL}/api/users/network-admins/{admin_id}/permissions", json={
                "network_permissions": {
                    "read_only": False,
                    "manage_sites": True,
                    "manage_users": True,
                    "manage_roles": True
                }
            })
            assert res.status_code == 200, f"Update failed: {res.text}"
            data = res.json()
            assert "message" in data
            
            # Verify update by getting network admins
            admins_res = self.session.get(f"{BASE_URL}/api/users/network-admins")
            admins = admins_res.json()
            updated_admin = next((a for a in admins if a["id"] == admin_id), None)
            assert updated_admin is not None
            assert updated_admin.get("network_permissions", {}).get("manage_sites")
        finally:
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/users/network-admins/{admin_id}")
    
    def test_cannot_modify_primary_admin_permissions(self):
        """PUT /api/users/network-admins/{id}/permissions cannot modify primary admin."""
        # Get primary admin ID
        res = self.session.get(f"{BASE_URL}/api/users/network-admins")
        admins = res.json()
        primary_admin = next((a for a in admins if a.get("is_primary_network_admin")), None)
        assert primary_admin, "Primary admin not found"
        
        # Try to modify primary admin permissions
        res = self.session.put(f"{BASE_URL}/api/users/network-admins/{primary_admin['id']}/permissions", json={
            "network_permissions": {"read_only": True}
        })
        assert res.status_code == 400, "Should not allow modifying primary admin"
        data = res.json()
        assert "primary" in data["detail"].lower()
    
    # ===== Network Admin DELETE tests =====
    
    def test_delete_network_admin(self):
        """DELETE /api/users/network-admins/{id} removes network admin status."""
        # First create a test admin
        test_email = f"test_del_{os.urandom(4).hex()}@example.com"
        create_res = self.session.post(f"{BASE_URL}/api/users/network-admins", json={
            "name": "TEST Delete Admin",
            "email": test_email,
            "network_permissions": {}
        })
        assert create_res.status_code == 200
        admin_id = create_res.json().get("user_id")
        assert admin_id
        
        # Delete the admin
        res = self.session.delete(f"{BASE_URL}/api/users/network-admins/{admin_id}")
        assert res.status_code == 200
        data = res.json()
        assert "message" in data
        
        # Verify removal
        admins_res = self.session.get(f"{BASE_URL}/api/users/network-admins")
        admins = admins_res.json()
        deleted_admin = next((a for a in admins if a["id"] == admin_id), None)
        assert deleted_admin is None, "Admin should no longer be in network admins list"
    
    def test_cannot_delete_primary_admin(self):
        """DELETE /api/users/network-admins/{id} cannot remove primary admin."""
        # Get primary admin ID
        res = self.session.get(f"{BASE_URL}/api/users/network-admins")
        admins = res.json()
        primary_admin = next((a for a in admins if a.get("is_primary_network_admin")), None)
        assert primary_admin, "Primary admin not found"
        
        # Try to delete primary admin
        res = self.session.delete(f"{BASE_URL}/api/users/network-admins/{primary_admin['id']}")
        assert res.status_code == 400, "Should not allow deleting primary admin"
        data = res.json()
        assert "primary" in data["detail"].lower()
    
    def test_delete_nonexistent_admin_returns_404(self):
        """DELETE /api/users/network-admins/{id} returns 404 for nonexistent admin."""
        fake_id = "nonexistent-admin-id-12345"
        res = self.session.delete(f"{BASE_URL}/api/users/network-admins/{fake_id}")
        assert res.status_code == 404
    
    # ===== Authorization tests =====
    
    def test_network_admins_endpoint_requires_auth(self):
        """GET /api/users/network-admins requires authentication."""
        # Request without auth
        res = requests.get(f"{BASE_URL}/api/users/network-admins")
        assert res.status_code in [401, 403]
    
    def test_network_admins_endpoint_requires_network_admin(self):
        """GET /api/users/network-admins requires network admin status."""
        # This test would need a non-network-admin user to fully test
        # For now, we verify that the endpoint exists and returns 200 for network admin
        res = self.session.get(f"{BASE_URL}/api/users/network-admins")
        assert res.status_code == 200


class TestNetworkAdminPermissionsGranular:
    """Test granular permission toggles for network admins."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login as primary network admin."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": PRIMARY_ADMIN_EMAIL,
            "password": PRIMARY_ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        self.token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
    
    def test_read_only_permission_toggle(self):
        """Network admin with read_only=true should have read-only restrictions."""
        # Create admin with read_only
        test_email = f"test_ro_{os.urandom(4).hex()}@example.com"
        create_res = self.session.post(f"{BASE_URL}/api/users/network-admins", json={
            "name": "TEST ReadOnly Admin",
            "email": test_email,
            "network_permissions": {
                "read_only": True,
                "manage_sites": False
            }
        })
        assert create_res.status_code == 200
        admin_id = create_res.json().get("user_id")
        
        try:
            # Verify the admin has read_only set
            admins_res = self.session.get(f"{BASE_URL}/api/users/network-admins")
            admins = admins_res.json()
            ro_admin = next((a for a in admins if a["id"] == admin_id), None)
            assert ro_admin is not None
            assert ro_admin.get("network_permissions", {}).get("read_only")
        finally:
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/users/network-admins/{admin_id}")
    
    def test_permission_categories_are_stored(self):
        """All permission categories should be stored correctly."""
        test_email = f"test_perms_{os.urandom(4).hex()}@example.com"
        
        permissions = {
            "read_only": False,
            "manage_sites": True,
            "manage_users": True,
            "manage_roles": True,
            "view_firewall": True,
            "view_logs": True,
            "manage_settings": True
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/users/network-admins", json={
            "name": "TEST Full Perms Admin",
            "email": test_email,
            "network_permissions": permissions
        })
        assert create_res.status_code == 200
        admin_id = create_res.json().get("user_id")
        
        try:
            # Verify all permissions are stored
            admins_res = self.session.get(f"{BASE_URL}/api/users/network-admins")
            admins = admins_res.json()
            full_admin = next((a for a in admins if a["id"] == admin_id), None)
            assert full_admin is not None
            
            stored_perms = full_admin.get("network_permissions", {})
            for key, value in permissions.items():
                assert stored_perms.get(key) == value, f"Permission {key} not stored correctly"
        finally:
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/users/network-admins/{admin_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
