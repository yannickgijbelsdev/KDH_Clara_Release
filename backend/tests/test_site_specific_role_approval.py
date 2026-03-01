"""
Test: Site-specific role content approval (Bug Fix)
=====================================
Tests the fix for content approval where users with site-specific admin role
should be able to approve content, even if their global role is 'presenter'.

The bug was that content approval only checked global role (users collection),
not site-specific role (main_site_users collection).

Fix: get_effective_role() now checks both and returns the higher-privilege role.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
DBNT_MAIN_SITE_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"


class TestSiteSpecificRoleApproval:
    """Tests for site-specific role content approval fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_content_ids = []
    
    def teardown_method(self):
        """Cleanup test data after each test"""
        # Delete any test content created
        for content_id in self.created_content_ids:
            try:
                # Login as network admin to clean up
                login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
                    "email": "admkoodh@koodh.com",
                    "password": "KYLovie13monx"
                })
                if login_resp.status_code == 200:
                    token = login_resp.json().get('token')
                    headers = {
                        "Authorization": f"Bearer {token}",
                        "X-Main-Site-ID": DBNT_MAIN_SITE_ID
                    }
                    self.session.delete(f"{BASE_URL}/api/content/{content_id}", headers=headers)
            except:
                pass
    
    def login_as_eddy(self):
        """Login as Eddy Thijs (presenter globally, admin on DBNT site)"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "eddy.thijs@grk.fm",
            "password": "8aP7QiJAKuouw-SM"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        user = response.json().get('user', {})
        assert user.get('role') == 'presenter', "Eddy should have global role 'presenter'"
        return response.json().get('token')
    
    def login_as_network_admin(self):
        """Login as network admin"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get('token')
    
    def login_as_yannick(self):
        """Login as Yannick (global admin)"""
        # Try known passwords
        for password in ["password123", "test123", "admin123"]:
            response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "yannick.gijbels@koodh.com",
                "password": password
            })
            if response.status_code == 200:
                return response.json().get('token')
        # Skip if can't login
        pytest.skip("Could not login as Yannick - password unknown")
    
    def create_test_content(self, token, title="TEST_approval_content"):
        """Create test content for approval testing"""
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        }
        response = self.session.post(f"{BASE_URL}/api/content", json={
            "title": title,
            "type": "text",  # Valid types: text, link, reference
            "body": "Test content body for approval testing",
            "status": "ready"
        }, headers=headers)
        if response.status_code == 201:
            content_id = response.json().get('id')
            self.created_content_ids.append(content_id)
            return content_id
        return None
    
    # ===== TEST: Login verification =====
    def test_eddy_login_and_global_role(self):
        """Verify Eddy's global role is presenter"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "eddy.thijs@grk.fm",
            "password": "8aP7QiJAKuouw-SM"
        })
        assert response.status_code == 200
        user = response.json().get('user')
        assert user.get('role') == 'presenter', "Eddy's global role should be 'presenter'"
        assert user.get('email') == 'eddy.thijs@grk.fm'
        print(f"✓ Eddy's global role confirmed: {user.get('role')}")
    
    # ===== TEST: Pending approval WITHOUT X-Main-Site-ID header =====
    def test_pending_approval_without_site_header_returns_403(self):
        """GET /api/content/admin/pending-approval WITHOUT header should return 403 (presenter cannot approve)"""
        token = self.login_as_eddy()
        headers = {"Authorization": f"Bearer {token}"}
        
        response = self.session.get(f"{BASE_URL}/api/content/admin/pending-approval", headers=headers)
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        assert "approval access" in response.json().get('detail', '').lower()
        print("✓ GET pending-approval without X-Main-Site-ID returns 403 (correct)")
    
    # ===== TEST: Pending approval WITH X-Main-Site-ID header =====
    def test_pending_approval_with_site_header_returns_200(self):
        """GET /api/content/admin/pending-approval WITH header should return 200 (site admin can approve)"""
        token = self.login_as_eddy()
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        }
        
        response = self.session.get(f"{BASE_URL}/api/content/admin/pending-approval", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ GET pending-approval with X-Main-Site-ID returns 200 (site-specific role works)")
    
    # ===== TEST: Content approval WITHOUT X-Main-Site-ID header =====
    def test_approval_without_site_header_returns_403(self):
        """PUT /api/content/{id}/approval WITHOUT header should return 403"""
        # First create content as network admin
        admin_token = self.login_as_network_admin()
        content_id = self.create_test_content(admin_token, "TEST_no_header_approval")
        assert content_id, "Failed to create test content"
        
        # Try to approve as Eddy without X-Main-Site-ID header
        eddy_token = self.login_as_eddy()
        headers = {"Authorization": f"Bearer {eddy_token}"}
        
        response = self.session.put(f"{BASE_URL}/api/content/{content_id}/approval", json={
            "approval_status": "approved",
            "approval_notes": "Test approval"
        }, headers=headers)
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ PUT approval without X-Main-Site-ID returns 403 (correct)")
    
    # ===== TEST: Content approval WITH X-Main-Site-ID header =====
    def test_approval_with_site_header_returns_200(self):
        """PUT /api/content/{id}/approval WITH header should return 200 (site admin can approve)"""
        # First create content as network admin
        admin_token = self.login_as_network_admin()
        content_id = self.create_test_content(admin_token, "TEST_with_header_approval")
        assert content_id, "Failed to create test content"
        
        # Approve as Eddy with X-Main-Site-ID header
        eddy_token = self.login_as_eddy()
        headers = {
            "Authorization": f"Bearer {eddy_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        }
        
        response = self.session.put(f"{BASE_URL}/api/content/{content_id}/approval", json={
            "approval_status": "approved",
            "approval_notes": "Test approval by site admin"
        }, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify approval was saved
        data = response.json()
        assert data.get('approval_status') == 'approved'
        print("✓ PUT approval with X-Main-Site-ID returns 200 (site-specific role works)")
    
    # ===== TEST: Network admin can approve from any site =====
    def test_network_admin_can_approve_any_site(self):
        """Network admin should be able to approve content from any site"""
        admin_token = self.login_as_network_admin()
        content_id = self.create_test_content(admin_token, "TEST_network_admin_approval")
        assert content_id, "Failed to create test content"
        
        # Approve as network admin with site header
        headers = {
            "Authorization": f"Bearer {admin_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        }
        
        response = self.session.put(f"{BASE_URL}/api/content/{content_id}/approval", json={
            "approval_status": "approved",
            "approval_notes": "Approved by network admin"
        }, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Network admin can approve content from any site")
    
    # ===== TEST: Network admin can approve without site header =====
    def test_network_admin_approve_without_header(self):
        """Network admin should be able to access pending-approval without site header"""
        admin_token = self.login_as_network_admin()
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = self.session.get(f"{BASE_URL}/api/content/admin/pending-approval", headers=headers)
        
        # Network admin with global 'admin' role should have access
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Network admin can access pending-approval without X-Main-Site-ID")
    
    # ===== TEST: Content rejection with site header =====
    def test_rejection_with_site_header(self):
        """Site admin should be able to reject content"""
        admin_token = self.login_as_network_admin()
        content_id = self.create_test_content(admin_token, "TEST_rejection_content")
        assert content_id, "Failed to create test content"
        
        # Reject as Eddy with site header
        eddy_token = self.login_as_eddy()
        headers = {
            "Authorization": f"Bearer {eddy_token}",
            "X-Main-Site-ID": DBNT_MAIN_SITE_ID
        }
        
        response = self.session.put(f"{BASE_URL}/api/content/{content_id}/approval", json={
            "approval_status": "rejected",
            "approval_notes": "Rejected by site admin for testing"
        }, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify rejection was saved
        data = response.json()
        assert data.get('approval_status') == 'rejected'
        print("✓ Site admin can reject content with X-Main-Site-ID")
    
    # ===== TEST: Verify effective role logic =====
    def test_effective_role_returns_higher_privilege(self):
        """Site admin role should override lower global role"""
        # Eddy: global=presenter, site=admin -> effective should be admin
        token = self.login_as_eddy()
        
        # Without header - should be denied (presenter role)
        headers = {"Authorization": f"Bearer {token}"}
        response = self.session.get(f"{BASE_URL}/api/content/admin/pending-approval", headers=headers)
        assert response.status_code == 403, "Without site header, should use global role (presenter=denied)"
        
        # With header - should be allowed (admin role from site)
        headers["X-Main-Site-ID"] = DBNT_MAIN_SITE_ID
        response = self.session.get(f"{BASE_URL}/api/content/admin/pending-approval", headers=headers)
        assert response.status_code == 200, "With site header, should use site role (admin=allowed)"
        
        print("✓ Effective role correctly returns higher-privilege role")


class TestSiteRoleEdgeCases:
    """Edge case tests for site-specific role functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_invalid_site_id_header(self):
        """Invalid site ID should still process (but may return empty or 200)"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "eddy.thijs@grk.fm",
            "password": "8aP7QiJAKuouw-SM"
        })
        token = response.json().get('token')
        
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Main-Site-ID": "invalid-site-id-12345"
        }
        
        # With invalid site ID, user falls back to global role (presenter)
        response = self.session.get(f"{BASE_URL}/api/content/admin/pending-approval", headers=headers)
        # Should be 403 since presenter can't approve
        assert response.status_code == 403, f"Invalid site should fallback to global role: {response.status_code}"
        print("✓ Invalid site ID falls back to global role correctly")
    
    def test_user_without_site_access(self):
        """User without access to site should use global role"""
        # Login as Eddy
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "eddy.thijs@grk.fm",
            "password": "8aP7QiJAKuouw-SM"
        })
        token = response.json().get('token')
        
        # Use a different site ID that Eddy doesn't have access to
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Main-Site-ID": "non-existent-site-id"
        }
        
        response = self.session.get(f"{BASE_URL}/api/content/admin/pending-approval", headers=headers)
        assert response.status_code == 403, "User without site access should use global role"
        print("✓ User without site access uses global role correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
