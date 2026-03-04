"""
Test module for Role & Permissions management system
Tests: GET /api/roles/schema, GET /api/roles/{main_site_id}, 
       POST /api/roles/{main_site_id}, PUT /api/roles/{main_site_id}/{role_id},
       DELETE /api/roles/{main_site_id}/{role_id}
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"

# Expected permission categories
EXPECTED_CATEGORIES = ["Shows", "Content", "Communication", "Streaming & RDS", "Sites", "Administration"]
EXPECTED_ACTIONS = ["view", "create", "edit", "delete"]

# Default roles
DEFAULT_ROLE_NAMES = ["Admin", "Editor", "Presenter", "Viewer"]


class TestRolesPermissions:
    """Role & Permissions management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data.get("token") or data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_res.status_code} - {login_res.text}")
    
    # ============ Permission Schema Tests ============
    
    def test_get_permission_schema(self):
        """GET /api/roles/schema - Returns permission categories and actions"""
        response = self.session.get(f"{BASE_URL}/api/roles/schema")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "categories" in data, "Response should contain 'categories'"
        assert "actions" in data, "Response should contain 'actions'"
        
        # Verify categories structure
        categories = data["categories"]
        assert len(categories) > 0, "Should have at least one category"
        
        category_names = [c["group"] for c in categories]
        for expected in EXPECTED_CATEGORIES:
            assert expected in category_names, f"Category '{expected}' should be present"
        
        # Verify actions
        actions = data["actions"]
        assert actions == EXPECTED_ACTIONS, f"Actions should be {EXPECTED_ACTIONS}, got {actions}"
        
        # Verify permission structure within categories
        for cat in categories:
            assert "group" in cat, "Category should have 'group' field"
            assert "permissions" in cat, "Category should have 'permissions' field"
            for perm in cat["permissions"]:
                assert "id" in perm, "Permission should have 'id' field"
                assert "label" in perm, "Permission should have 'label' field"
        
        print(f"✓ Schema has {len(categories)} categories and {len(actions)} actions")
    
    def test_schema_all_permission_ids(self):
        """Verify all expected permission IDs are present in schema"""
        response = self.session.get(f"{BASE_URL}/api/roles/schema")
        assert response.status_code == 200
        
        data = response.json()
        all_perm_ids = []
        for cat in data["categories"]:
            for perm in cat["permissions"]:
                all_perm_ids.append(perm["id"])
        
        # Expected permissions from the code
        expected_perms = [
            "shows", "calendar", "show_management",  # Shows
            "content_library", "media_library", "content_approval", "trash",  # Content
            "team_chat",  # Communication
            "rds_settings", "rds_builder", "rds_monitor", "stream_monitor", "call_studio",  # Streaming & RDS
            "sites",  # Sites
            "team_settings", "wordpress", "activity_logs", "firewall", "support_tickets"  # Administration
        ]
        
        for expected in expected_perms:
            assert expected in all_perm_ids, f"Permission '{expected}' should be in schema"
        
        # 19 permissions * 4 actions = 76 total permission slots
        assert len(all_perm_ids) == 19, f"Should have 19 permissions, got {len(all_perm_ids)}"
        print(f"✓ All {len(all_perm_ids)} permission IDs present (19 * 4 actions = 76 total)")
    
    # ============ List Roles Tests ============
    
    def test_list_roles_for_main_site(self):
        """GET /api/roles/{main_site_id} - Lists roles for a main site"""
        response = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "roles" in data, "Response should contain 'roles'"
        
        roles = data["roles"]
        assert len(roles) >= len(DEFAULT_ROLE_NAMES), f"Should have at least {len(DEFAULT_ROLE_NAMES)} default roles"
        
        # Verify default roles are present
        role_names = [r["name"] for r in roles]
        for default_role in DEFAULT_ROLE_NAMES:
            assert default_role in role_names, f"Default role '{default_role}' should be present"
        
        print(f"✓ Found {len(roles)} roles: {role_names}")
    
    def test_admin_role_has_all_permissions(self):
        """Admin role should have all 76 permissions enabled (19 features * 4 actions)"""
        response = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        assert response.status_code == 200
        
        data = response.json()
        roles = data["roles"]
        
        admin_role = next((r for r in roles if r["name"] == "Admin"), None)
        assert admin_role is not None, "Admin role should exist"
        
        permissions = admin_role.get("permissions", {})
        
        # Count enabled permissions
        total_enabled = 0
        for feature_perms in permissions.values():
            for action, enabled in feature_perms.items():
                if enabled:
                    total_enabled += 1
        
        # 19 features * 4 actions = 76
        assert total_enabled == 76, f"Admin should have 76 permissions enabled, got {total_enabled}"
        print(f"✓ Admin role has {total_enabled} permissions enabled")
    
    def test_admin_role_is_system_protected(self):
        """Admin role should have is_system=True flag"""
        response = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        assert response.status_code == 200
        
        data = response.json()
        admin_role = next((r for r in data["roles"] if r["name"] == "Admin"), None)
        
        assert admin_role is not None, "Admin role should exist"
        assert admin_role.get("is_system") == True, "Admin role should have is_system=True"
        print("✓ Admin role is_system=True (protected)")
    
    def test_roles_have_required_fields(self):
        """All roles should have required fields"""
        response = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        assert response.status_code == 200
        
        data = response.json()
        required_fields = ["id", "name", "slug", "permissions", "color", "main_site_id"]
        
        for role in data["roles"]:
            for field in required_fields:
                assert field in role, f"Role '{role.get('name')}' should have '{field}' field"
        
        print(f"✓ All {len(data['roles'])} roles have required fields")
    
    # ============ Create Role Tests ============
    
    def test_create_custom_role(self):
        """POST /api/roles/{main_site_id} - Create a new custom role"""
        new_role_name = "TEST_Custom_Role_Create"
        
        # Clean up first if exists
        existing = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        if existing.status_code == 200:
            for role in existing.json().get("roles", []):
                if role["name"] == new_role_name:
                    self.session.delete(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{role['id']}")
        
        response = self.session.post(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}", json={
            "name": new_role_name,
            "color": "#22c55e",
            "description": "Test role for automated testing"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == new_role_name
        assert data["color"] == "#22c55e"
        assert data["is_system"] == False, "Custom role should not be system role"
        assert "id" in data, "Response should include role ID"
        assert "permissions" in data, "Response should include permissions"
        
        # Clean up
        self.session.delete(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{data['id']}")
        print(f"✓ Created and cleaned up custom role: {new_role_name}")
    
    def test_create_role_duplicate_name_rejected(self):
        """Creating role with duplicate name should fail"""
        # Admin always exists
        response = self.session.post(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}", json={
            "name": "Admin",
            "color": "#ef4444"
        })
        
        assert response.status_code == 400, f"Expected 400 for duplicate name, got {response.status_code}"
        
        data = response.json()
        assert "already exists" in data.get("detail", "").lower(), f"Should indicate name exists: {data}"
        print("✓ Duplicate role name correctly rejected")
    
    def test_create_role_empty_name_rejected(self):
        """Creating role with empty name should fail"""
        response = self.session.post(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}", json={
            "name": "",
            "color": "#6b7280"
        })
        
        assert response.status_code == 400, f"Expected 400 for empty name, got {response.status_code}"
        print("✓ Empty role name correctly rejected")
    
    # ============ Update Role Tests ============
    
    def test_update_custom_role_name_and_color(self):
        """PUT /api/roles/{main_site_id}/{role_id} - Update role name, description, color"""
        # First create a test role
        create_res = self.session.post(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}", json={
            "name": "TEST_Update_Role",
            "color": "#3b82f6",
            "description": "Original description"
        })
        assert create_res.status_code == 200
        role_id = create_res.json()["id"]
        
        # Update the role
        update_res = self.session.put(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{role_id}", json={
            "name": "TEST_Updated_Name",
            "color": "#ec4899",
            "description": "Updated description"
        })
        
        assert update_res.status_code == 200, f"Expected 200, got {update_res.status_code}: {update_res.text}"
        
        data = update_res.json()
        assert data["name"] == "TEST_Updated_Name"
        assert data["color"] == "#ec4899"
        assert data["description"] == "Updated description"
        
        # Verify with GET
        get_res = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        roles = get_res.json()["roles"]
        updated_role = next((r for r in roles if r["id"] == role_id), None)
        assert updated_role["name"] == "TEST_Updated_Name"
        
        # Clean up
        self.session.delete(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{role_id}")
        print("✓ Role name, color, description updated successfully")
    
    def test_update_role_permissions(self):
        """Update role permissions"""
        # Create test role
        create_res = self.session.post(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}", json={
            "name": "TEST_Perm_Update",
            "color": "#6b7280"
        })
        assert create_res.status_code == 200
        role_id = create_res.json()["id"]
        
        # Update permissions
        new_permissions = {
            "shows": {"view": True, "create": True, "edit": True, "delete": False},
            "calendar": {"view": True, "create": False, "edit": False, "delete": False}
        }
        
        update_res = self.session.put(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{role_id}", json={
            "permissions": new_permissions
        })
        
        assert update_res.status_code == 200
        data = update_res.json()
        
        assert data["permissions"]["shows"]["view"] == True
        assert data["permissions"]["shows"]["delete"] == False
        assert data["permissions"]["calendar"]["create"] == False
        
        # Clean up
        self.session.delete(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{role_id}")
        print("✓ Role permissions updated successfully")
    
    def test_cannot_rename_admin_role(self):
        """System Admin role name cannot be changed"""
        # Get Admin role ID
        roles_res = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        admin_role = next((r for r in roles_res.json()["roles"] if r["name"] == "Admin"), None)
        assert admin_role is not None
        
        # Try to update name
        update_res = self.session.put(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{admin_role['id']}", json={
            "name": "Super Admin"
        })
        
        # Should succeed but name should not change
        assert update_res.status_code == 200
        data = update_res.json()
        assert data["name"] == "Admin", "Admin role name should not change"
        print("✓ Admin role name correctly protected")
    
    # ============ Delete Role Tests ============
    
    def test_delete_custom_role(self):
        """DELETE /api/roles/{main_site_id}/{role_id} - Delete custom role"""
        # Create role to delete
        create_res = self.session.post(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}", json={
            "name": "TEST_Delete_Role",
            "color": "#ef4444"
        })
        assert create_res.status_code == 200
        role_id = create_res.json()["id"]
        
        # Delete the role
        delete_res = self.session.delete(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{role_id}")
        
        assert delete_res.status_code == 200, f"Expected 200, got {delete_res.status_code}: {delete_res.text}"
        
        data = delete_res.json()
        assert data.get("deleted") == True
        
        # Verify role is gone
        get_res = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        role_names = [r["name"] for r in get_res.json()["roles"]]
        assert "TEST_Delete_Role" not in role_names
        
        print("✓ Custom role deleted successfully")
    
    def test_cannot_delete_system_admin_role(self):
        """System Admin role cannot be deleted"""
        # Get Admin role ID
        roles_res = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        admin_role = next((r for r in roles_res.json()["roles"] if r["name"] == "Admin"), None)
        assert admin_role is not None
        
        # Try to delete
        delete_res = self.session.delete(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{admin_role['id']}")
        
        assert delete_res.status_code == 400, f"Expected 400 for deleting system role, got {delete_res.status_code}"
        
        data = delete_res.json()
        assert "system" in data.get("detail", "").lower() or "cannot" in data.get("detail", "").lower()
        
        print("✓ System Admin role correctly protected from deletion")
    
    def test_delete_nonexistent_role(self):
        """Deleting non-existent role should return 404"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        delete_res = self.session.delete(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{fake_id}")
        
        assert delete_res.status_code == 404
        print("✓ Non-existent role returns 404")
    
    # ============ Default Role Seeding Tests ============
    
    def test_viewer_role_has_limited_permissions(self):
        """Viewer role should have only view permissions for specific features"""
        response = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        assert response.status_code == 200
        
        viewer_role = next((r for r in response.json()["roles"] if r["name"] == "Viewer"), None)
        assert viewer_role is not None, "Viewer role should exist"
        
        permissions = viewer_role.get("permissions", {})
        
        # Viewer should have view-only on shows, calendar, support_tickets
        assert permissions.get("shows", {}).get("view") == True
        assert permissions.get("shows", {}).get("create") == False
        assert permissions.get("calendar", {}).get("view") == True
        
        print("✓ Viewer role has limited permissions as expected")
    
    def test_editor_role_permissions(self):
        """Editor role should have expanded but not full permissions"""
        response = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        assert response.status_code == 200
        
        editor_role = next((r for r in response.json()["roles"] if r["name"] == "Editor"), None)
        assert editor_role is not None, "Editor role should exist"
        
        permissions = editor_role.get("permissions", {})
        
        # Editor should have full access to content-related features
        assert permissions.get("content_library", {}).get("view") == True
        assert permissions.get("content_library", {}).get("create") == True
        
        # But limited access to admin features
        assert permissions.get("team_settings", {}).get("view") == False
        assert permissions.get("firewall", {}).get("edit") == False
        
        print("✓ Editor role has appropriate permissions")
    
    def test_presenter_role_permissions(self):
        """Presenter role should have show-focused permissions"""
        response = self.session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        assert response.status_code == 200
        
        presenter_role = next((r for r in response.json()["roles"] if r["name"] == "Presenter"), None)
        assert presenter_role is not None, "Presenter role should exist"
        
        permissions = presenter_role.get("permissions", {})
        
        # Presenter should be able to view and edit shows
        assert permissions.get("shows", {}).get("view") == True
        assert permissions.get("shows", {}).get("edit") == True
        
        # Can upload to media library but can't delete
        assert permissions.get("media_library", {}).get("create") == True
        assert permissions.get("media_library", {}).get("delete") == False
        
        print("✓ Presenter role has show-focused permissions")


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_roles():
    """Clean up TEST_ prefixed roles after all tests"""
    yield
    
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": NETWORK_ADMIN_EMAIL,
        "password": NETWORK_ADMIN_PASSWORD
    })
    
    if login_res.status_code == 200:
        data = login_res.json()
        token = data.get("token") or data.get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get all roles and delete TEST_ prefixed ones
        roles_res = session.get(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}")
        if roles_res.status_code == 200:
            for role in roles_res.json().get("roles", []):
                if role["name"].startswith("TEST_") and not role.get("is_system"):
                    session.delete(f"{BASE_URL}/api/roles/{MAIN_SITE_ID}/{role['id']}")
                    print(f"Cleaned up test role: {role['name']}")
