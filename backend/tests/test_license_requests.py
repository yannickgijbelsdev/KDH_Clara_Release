"""
Test suite for License Request functionality
Tests:
- POST /api/main-sites creates site AND creates license_request in DB
- GET /api/licenses/requests returns list of pending requests
- PUT /api/licenses/requests/{request_id} with status 'approved'
- PUT /api/licenses/requests/{request_id} with status 'denied'
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


class TestLicenseRequests:
    """License request CRUD and auto-creation tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        
        self.token = data["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        print(f"✓ Login successful for {TEST_EMAIL}")
    
    def test_01_get_license_requests_endpoint(self):
        """Test GET /api/licenses/requests returns list"""
        response = self.session.get(f"{BASE_URL}/api/licenses/requests")
        assert response.status_code == 200, f"GET /api/licenses/requests failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/licenses/requests returned {len(data)} requests")
        
        # Store initial count for later comparison
        self.initial_request_count = len(data)
        return data
    
    def test_02_create_site_creates_license_request(self):
        """Test POST /api/main-sites creates a site AND creates a license_request"""
        # Generate unique slug
        unique_slug = f"test-lic-req-{uuid.uuid4().hex[:8]}"
        
        # Get initial license requests count
        initial_response = self.session.get(f"{BASE_URL}/api/licenses/requests")
        assert initial_response.status_code == 200
        initial_requests = initial_response.json()
        initial_count = len(initial_requests)
        print(f"✓ Initial license requests count: {initial_count}")
        
        # Create a new site
        site_payload = {
            "name": "TEST License Request Site",
            "slug": unique_slug,
            "description": "Test site for license request verification",
            "site_type": "radio",
            "enabled_features": [],
            "is_demo": False
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/main-sites", json=site_payload)
        assert create_response.status_code == 200, f"Create site failed: {create_response.text}"
        
        created_site = create_response.json()
        site_id = created_site["id"]
        print(f"✓ Created site: {created_site['name']} (ID: {site_id})")
        
        # Wait a moment for async license request creation
        time.sleep(2)
        
        # Verify license request was created
        requests_response = self.session.get(f"{BASE_URL}/api/licenses/requests")
        assert requests_response.status_code == 200
        new_requests = requests_response.json()
        
        # Find the license request for our site
        site_request = None
        for req in new_requests:
            if req.get("main_site_id") == site_id:
                site_request = req
                break
        
        assert site_request is not None, f"License request not found for site {site_id}"
        print(f"✓ License request found for site: {site_request['id']}")
        
        # Verify license request fields
        assert site_request["site_name"] == site_payload["name"], "site_name mismatch"
        assert site_request["site_type"] == site_payload["site_type"], "site_type mismatch"
        assert site_request["site_slug"] == unique_slug, "site_slug mismatch"
        assert site_request["status"] == "pending", f"Expected status 'pending', got '{site_request['status']}'"
        assert site_request["requester_email"] == TEST_EMAIL, "requester_email mismatch"
        print(f"✓ License request fields verified: status=pending, requester={TEST_EMAIL}")
        
        # Store for cleanup and further tests
        self.test_site_id = site_id
        self.test_request_id = site_request["id"]
        
        # Cleanup: Delete the test site
        delete_response = self.session.delete(f"{BASE_URL}/api/main-sites/{site_id}")
        assert delete_response.status_code == 200, f"Delete site failed: {delete_response.text}"
        print(f"✓ Cleanup: Deleted test site {site_id}")
    
    def test_03_approve_license_request(self):
        """Test PUT /api/licenses/requests/{request_id} with status 'approved'"""
        # Create a new site first
        unique_slug = f"test-approve-{uuid.uuid4().hex[:8]}"
        
        site_payload = {
            "name": "TEST Approve License Site",
            "slug": unique_slug,
            "description": "Test site for license approval",
            "site_type": "technical",
            "enabled_features": [],
            "is_demo": False
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/main-sites", json=site_payload)
        assert create_response.status_code == 200
        site_id = create_response.json()["id"]
        print(f"✓ Created test site for approval: {site_id}")
        
        time.sleep(2)
        
        # Find the license request
        requests_response = self.session.get(f"{BASE_URL}/api/licenses/requests")
        assert requests_response.status_code == 200
        requests = requests_response.json()
        
        site_request = next((r for r in requests if r.get("main_site_id") == site_id), None)
        assert site_request is not None, "License request not found"
        request_id = site_request["id"]
        print(f"✓ Found license request: {request_id}")
        
        # Approve the request
        approve_response = self.session.put(
            f"{BASE_URL}/api/licenses/requests/{request_id}",
            json={"status": "approved"}
        )
        assert approve_response.status_code == 200, f"Approve failed: {approve_response.text}"
        
        approve_data = approve_response.json()
        assert approve_data["status"] == "approved", f"Expected status 'approved', got '{approve_data['status']}'"
        print("✓ License request approved successfully")
        
        # Verify status persisted via GET
        verify_response = self.session.get(f"{BASE_URL}/api/licenses/requests")
        assert verify_response.status_code == 200
        updated_requests = verify_response.json()
        
        updated_request = next((r for r in updated_requests if r["id"] == request_id), None)
        assert updated_request is not None, "Request not found after update"
        assert updated_request["status"] == "approved", "Status not persisted"
        assert updated_request["reviewed_by"] is not None, "reviewed_by should be set"
        assert updated_request["reviewed_at"] is not None, "reviewed_at should be set"
        print(f"✓ Approval verified: reviewed_by={updated_request['reviewed_by']}")
        
        # Cleanup
        delete_response = self.session.delete(f"{BASE_URL}/api/main-sites/{site_id}")
        assert delete_response.status_code == 200
        print("✓ Cleanup: Deleted test site")
    
    def test_04_deny_license_request(self):
        """Test PUT /api/licenses/requests/{request_id} with status 'denied'"""
        # Create a new site first
        unique_slug = f"test-deny-{uuid.uuid4().hex[:8]}"
        
        site_payload = {
            "name": "TEST Deny License Site",
            "slug": unique_slug,
            "description": "Test site for license denial",
            "site_type": "server",
            "enabled_features": [],
            "is_demo": False
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/main-sites", json=site_payload)
        assert create_response.status_code == 200
        site_id = create_response.json()["id"]
        print(f"✓ Created test site for denial: {site_id}")
        
        time.sleep(2)
        
        # Find the license request
        requests_response = self.session.get(f"{BASE_URL}/api/licenses/requests")
        assert requests_response.status_code == 200
        requests = requests_response.json()
        
        site_request = next((r for r in requests if r.get("main_site_id") == site_id), None)
        assert site_request is not None, "License request not found"
        request_id = site_request["id"]
        print(f"✓ Found license request: {request_id}")
        
        # Deny the request
        deny_response = self.session.put(
            f"{BASE_URL}/api/licenses/requests/{request_id}",
            json={"status": "denied", "notes": "Test denial reason"}
        )
        assert deny_response.status_code == 200, f"Deny failed: {deny_response.text}"
        
        deny_data = deny_response.json()
        assert deny_data["status"] == "denied", f"Expected status 'denied', got '{deny_data['status']}'"
        print("✓ License request denied successfully")
        
        # Verify status persisted
        verify_response = self.session.get(f"{BASE_URL}/api/licenses/requests")
        assert verify_response.status_code == 200
        updated_requests = verify_response.json()
        
        updated_request = next((r for r in updated_requests if r["id"] == request_id), None)
        assert updated_request is not None, "Request not found after update"
        assert updated_request["status"] == "denied", "Status not persisted"
        print("✓ Denial verified")
        
        # Cleanup
        delete_response = self.session.delete(f"{BASE_URL}/api/main-sites/{site_id}")
        assert delete_response.status_code == 200
        print("✓ Cleanup: Deleted test site")
    
    def test_05_invalid_status_rejected(self):
        """Test PUT /api/licenses/requests/{request_id} with invalid status returns 400"""
        # Create a new site first
        unique_slug = f"test-invalid-{uuid.uuid4().hex[:8]}"
        
        site_payload = {
            "name": "TEST Invalid Status Site",
            "slug": unique_slug,
            "description": "Test site for invalid status",
            "site_type": "radio",
            "enabled_features": [],
            "is_demo": False
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/main-sites", json=site_payload)
        assert create_response.status_code == 200
        site_id = create_response.json()["id"]
        
        time.sleep(2)
        
        # Find the license request
        requests_response = self.session.get(f"{BASE_URL}/api/licenses/requests")
        assert requests_response.status_code == 200
        requests = requests_response.json()
        
        site_request = next((r for r in requests if r.get("main_site_id") == site_id), None)
        assert site_request is not None, "License request not found"
        request_id = site_request["id"]
        
        # Try invalid status
        invalid_response = self.session.put(
            f"{BASE_URL}/api/licenses/requests/{request_id}",
            json={"status": "invalid_status"}
        )
        assert invalid_response.status_code == 400, f"Expected 400, got {invalid_response.status_code}"
        print("✓ Invalid status correctly rejected with 400")
        
        # Cleanup
        delete_response = self.session.delete(f"{BASE_URL}/api/main-sites/{site_id}")
        assert delete_response.status_code == 200
        print("✓ Cleanup: Deleted test site")
    
    def test_06_nonexistent_request_returns_404(self):
        """Test PUT /api/licenses/requests/{request_id} with non-existent ID returns 404"""
        fake_request_id = "lr-nonexistent-12345"
        
        response = self.session.put(
            f"{BASE_URL}/api/licenses/requests/{fake_request_id}",
            json={"status": "approved"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent request correctly returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
