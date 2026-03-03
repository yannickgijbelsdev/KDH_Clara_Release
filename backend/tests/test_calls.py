"""
Test suite for Call Studio feature - Audio profiles, Invite links, and Call lifecycle
Tests the backend API endpoints for the WebRTC calling system
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ticket-support-15.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


class TestCallsAuthentication:
    """Test authentication for calls endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_login_success(self):
        """Verify login works and returns token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert len(data["token"]) > 0


class TestAudioProfiles:
    """Test CRUD operations for audio profiles"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.created_profile_ids = []
    
    @pytest.fixture(autouse=True)
    def teardown(self):
        """Cleanup created test profiles after each test"""
        yield
        for profile_id in self.created_profile_ids:
            try:
                requests.delete(
                    f"{BASE_URL}/api/calls/profiles/{profile_id}",
                    headers=self.headers
                )
            except:
                pass
    
    def test_create_audio_profile(self):
        """POST /api/calls/profiles - Create audio profile"""
        profile_data = {
            "name": f"TEST_Profile_{uuid.uuid4().hex[:8]}",
            "input_device_id": "test-input-device-123",
            "input_device_label": "Test Microphone",
            "output_device_id": "test-output-device-456",
            "output_device_label": "Test Speakers"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.headers,
            json=profile_data
        )
        
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert data["name"] == profile_data["name"]
        assert data["input_device_id"] == profile_data["input_device_id"]
        assert data["input_device_label"] == profile_data["input_device_label"]
        assert data["output_device_id"] == profile_data["output_device_id"]
        assert data["output_device_label"] == profile_data["output_device_label"]
        assert "created_at" in data
        
        self.created_profile_ids.append(data["id"])
        
        # Verify profile was persisted by fetching it
        list_response = requests.get(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.headers
        )
        assert list_response.status_code == 200
        profiles = list_response.json()["profiles"]
        profile_ids = [p["id"] for p in profiles]
        assert data["id"] in profile_ids
    
    def test_create_profile_minimal(self):
        """POST /api/calls/profiles - Create profile with just name (minimal)"""
        profile_data = {
            "name": f"TEST_Minimal_{uuid.uuid4().hex[:8]}"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.headers,
            json=profile_data
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == profile_data["name"]
        assert data["input_device_id"] is None
        assert data["output_device_id"] is None
        
        self.created_profile_ids.append(data["id"])
    
    def test_list_audio_profiles(self):
        """GET /api/calls/profiles - List audio profiles"""
        response = requests.get(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "profiles" in data
        assert isinstance(data["profiles"], list)
    
    def test_update_audio_profile(self):
        """PUT /api/calls/profiles/{id} - Update audio profile"""
        # First create a profile
        create_response = requests.post(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.headers,
            json={"name": f"TEST_UpdateMe_{uuid.uuid4().hex[:8]}"}
        )
        assert create_response.status_code == 200
        profile_id = create_response.json()["id"]
        self.created_profile_ids.append(profile_id)
        
        # Update the profile
        update_data = {
            "name": f"TEST_Updated_{uuid.uuid4().hex[:8]}",
            "input_device_label": "Updated Mic"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/calls/profiles/{profile_id}",
            headers=self.headers,
            json=update_data
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["input_device_label"] == update_data["input_device_label"]
        
        # Verify update persisted
        list_response = requests.get(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.headers
        )
        profiles = list_response.json()["profiles"]
        updated_profile = next((p for p in profiles if p["id"] == profile_id), None)
        assert updated_profile is not None
        assert updated_profile["name"] == update_data["name"]
    
    def test_update_profile_empty_body(self):
        """PUT /api/calls/profiles/{id} - Update with no fields returns 400"""
        # Create a profile first
        create_response = requests.post(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.headers,
            json={"name": f"TEST_NoUpdate_{uuid.uuid4().hex[:8]}"}
        )
        profile_id = create_response.json()["id"]
        self.created_profile_ids.append(profile_id)
        
        # Try to update with empty body
        response = requests.put(
            f"{BASE_URL}/api/calls/profiles/{profile_id}",
            headers=self.headers,
            json={}
        )
        
        assert response.status_code == 400
    
    def test_delete_audio_profile(self):
        """DELETE /api/calls/profiles/{id} - Delete audio profile"""
        # Create a profile
        create_response = requests.post(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.headers,
            json={"name": f"TEST_DeleteMe_{uuid.uuid4().hex[:8]}"}
        )
        assert create_response.status_code == 200
        profile_id = create_response.json()["id"]
        
        # Delete the profile
        response = requests.delete(
            f"{BASE_URL}/api/calls/profiles/{profile_id}",
            headers=self.headers
        )
        
        assert response.status_code == 200
        assert response.json()["deleted"] is True
        
        # Verify deletion
        list_response = requests.get(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.headers
        )
        profiles = list_response.json()["profiles"]
        profile_ids = [p["id"] for p in profiles]
        assert profile_id not in profile_ids
    
    def test_delete_nonexistent_profile(self):
        """DELETE /api/calls/profiles/{id} - Delete non-existent profile returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/calls/profiles/{fake_id}",
            headers=self.headers
        )
        
        assert response.status_code == 404


class TestCallInvites:
    """Test CRUD operations for call invites"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.created_invite_ids = []
    
    @pytest.fixture(autouse=True)
    def teardown(self):
        """Cleanup created test invites after each test"""
        yield
        for invite_id in self.created_invite_ids:
            try:
                requests.delete(
                    f"{BASE_URL}/api/calls/invites/{invite_id}",
                    headers=self.headers
                )
            except:
                pass
    
    def test_create_invite(self):
        """POST /api/calls/invites - Create call invite link"""
        invite_data = {
            "label": f"TEST_Caller_{uuid.uuid4().hex[:8]}"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.headers,
            json=invite_data
        )
        
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert "token" in data
        assert len(data["token"]) == 8  # Short token
        assert "url" in data
        assert data["token"] in data["url"]
        assert data["label"] == invite_data["label"]
        assert data["status"] == "pending"
        assert "created_at" in data
        
        self.created_invite_ids.append(data["id"])
    
    def test_create_invite_no_label(self):
        """POST /api/calls/invites - Create invite without label"""
        response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.headers,
            json={}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["label"] == ""
        
        self.created_invite_ids.append(data["id"])
    
    def test_list_invites(self):
        """GET /api/calls/invites - List all invites"""
        response = requests.get(
            f"{BASE_URL}/api/calls/invites",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "invites" in data
        assert isinstance(data["invites"], list)
        
        # Each invite should have url field
        for invite in data["invites"]:
            assert "url" in invite
            assert "token" in invite
    
    def test_list_invites_filter_by_status(self):
        """GET /api/calls/invites?status=ended - Filter invites by status"""
        response = requests.get(
            f"{BASE_URL}/api/calls/invites?status=ended",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # All invites should have status=ended
        for invite in data["invites"]:
            assert invite["status"] == "ended"
    
    def test_delete_invite(self):
        """DELETE /api/calls/invites/{id} - Delete invite"""
        # Create an invite
        create_response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.headers,
            json={"label": f"TEST_Delete_{uuid.uuid4().hex[:8]}"}
        )
        invite_id = create_response.json()["id"]
        
        # Delete it
        response = requests.delete(
            f"{BASE_URL}/api/calls/invites/{invite_id}",
            headers=self.headers
        )
        
        assert response.status_code == 200
        assert response.json()["deleted"] is True
        
        # Verify deletion
        list_response = requests.get(
            f"{BASE_URL}/api/calls/invites",
            headers=self.headers
        )
        invite_ids = [inv["id"] for inv in list_response.json()["invites"]]
        assert invite_id not in invite_ids
    
    def test_delete_nonexistent_invite(self):
        """DELETE /api/calls/invites/{id} - Delete non-existent invite returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/calls/invites/{fake_id}",
            headers=self.headers
        )
        
        assert response.status_code == 404


class TestPublicCallJoin:
    """Test public endpoints for external callers (no auth required)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login to create invites for testing"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.auth_headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.created_invite_ids = []
    
    @pytest.fixture(autouse=True)
    def teardown(self):
        """Cleanup created test invites"""
        yield
        for invite_id in self.created_invite_ids:
            try:
                requests.delete(
                    f"{BASE_URL}/api/calls/invites/{invite_id}",
                    headers=self.auth_headers
                )
            except:
                pass
    
    def test_get_invite_info_public(self):
        """GET /api/calls/join/{token} - Public: Get invite info (no auth)"""
        # Create an invite first
        create_response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.auth_headers,
            json={"label": f"TEST_PublicInfo_{uuid.uuid4().hex[:8]}"}
        )
        invite = create_response.json()
        self.created_invite_ids.append(invite["id"])
        
        # Get invite info WITHOUT auth
        response = requests.get(
            f"{BASE_URL}/api/calls/join/{invite['token']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == invite["id"]
        assert data["token"] == invite["token"]
        assert data["status"] == "pending"
        assert "host_name" in data
    
    def test_get_invite_info_invalid_token(self):
        """GET /api/calls/join/{token} - Invalid token returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/calls/join/invalid123"
        )
        
        assert response.status_code == 404
    
    def test_accept_invite(self):
        """POST /api/calls/join/{token}/accept - Public: Accept invite"""
        # Create an invite
        create_response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.auth_headers,
            json={"label": f"TEST_Accept_{uuid.uuid4().hex[:8]}"}
        )
        invite = create_response.json()
        self.created_invite_ids.append(invite["id"])
        
        # Accept the invite (no auth needed)
        response = requests.post(
            f"{BASE_URL}/api/calls/join/{invite['token']}/accept",
            json={"name": "Test Caller Name"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "active"
        assert data["caller_name"] == "Test Caller Name"
        assert "room_id" in data
        
        # Verify the invite status was updated
        info_response = requests.get(
            f"{BASE_URL}/api/calls/join/{invite['token']}"
        )
        assert info_response.json()["status"] == "active"
    
    def test_accept_invite_guest_name(self):
        """POST /api/calls/join/{token}/accept - Default to 'Guest' if no name"""
        create_response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.auth_headers,
            json={"label": f"TEST_Guest_{uuid.uuid4().hex[:8]}"}
        )
        invite = create_response.json()
        self.created_invite_ids.append(invite["id"])
        
        # Accept without providing name
        response = requests.post(
            f"{BASE_URL}/api/calls/join/{invite['token']}/accept",
            json={}
        )
        
        assert response.status_code == 200
        assert response.json()["caller_name"] == "Guest"
    
    def test_caller_end_call(self):
        """POST /api/calls/join/{token}/end - Public: Caller ends call"""
        # Create and accept an invite
        create_response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.auth_headers,
            json={"label": f"TEST_CallerEnd_{uuid.uuid4().hex[:8]}"}
        )
        invite = create_response.json()
        self.created_invite_ids.append(invite["id"])
        
        # Accept the invite
        requests.post(
            f"{BASE_URL}/api/calls/join/{invite['token']}/accept",
            json={"name": "Caller"}
        )
        
        # Caller ends the call (no auth)
        response = requests.post(
            f"{BASE_URL}/api/calls/join/{invite['token']}/end"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["ended"] is True
        
        # Verify status is now ended
        info_response = requests.get(
            f"{BASE_URL}/api/calls/join/{invite['token']}"
        )
        assert info_response.json()["status"] == "ended"


class TestCallLifecycle:
    """Test complete call lifecycle: create -> accept -> end"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login to create invites for testing"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.auth_headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.created_invite_ids = []
    
    @pytest.fixture(autouse=True)
    def teardown(self):
        """Cleanup"""
        yield
        for invite_id in self.created_invite_ids:
            try:
                requests.delete(
                    f"{BASE_URL}/api/calls/invites/{invite_id}",
                    headers=self.auth_headers
                )
            except:
                pass
    
    def test_host_ends_active_call(self):
        """POST /api/calls/invites/{id}/end - Host ends active call"""
        # Create invite
        create_response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.auth_headers,
            json={"label": f"TEST_HostEnd_{uuid.uuid4().hex[:8]}"}
        )
        invite = create_response.json()
        self.created_invite_ids.append(invite["id"])
        
        # Accept invite (caller joins)
        requests.post(
            f"{BASE_URL}/api/calls/join/{invite['token']}/accept",
            json={"name": "Caller"}
        )
        
        # Host ends the call
        response = requests.post(
            f"{BASE_URL}/api/calls/invites/{invite['id']}/end",
            headers=self.auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["ended"] is True
        assert "duration_seconds" in data
        
        # Verify call appears in history
        history_response = requests.get(
            f"{BASE_URL}/api/calls/invites?status=ended",
            headers=self.auth_headers
        )
        ended_invites = history_response.json()["invites"]
        ended_ids = [inv["id"] for inv in ended_invites]
        assert invite["id"] in ended_ids
    
    def test_accept_already_ended_call(self):
        """POST /api/calls/join/{token}/accept - Cannot accept ended call"""
        # Create and accept invite
        create_response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.auth_headers,
            json={"label": f"TEST_EndedAccept_{uuid.uuid4().hex[:8]}"}
        )
        invite = create_response.json()
        self.created_invite_ids.append(invite["id"])
        
        # Accept then end
        requests.post(
            f"{BASE_URL}/api/calls/join/{invite['token']}/accept",
            json={"name": "Caller"}
        )
        requests.post(
            f"{BASE_URL}/api/calls/invites/{invite['id']}/end",
            headers=self.auth_headers
        )
        
        # Try to accept again
        response = requests.post(
            f"{BASE_URL}/api/calls/join/{invite['token']}/accept",
            json={"name": "AnotherCaller"}
        )
        
        assert response.status_code == 400
    
    def test_full_call_lifecycle(self):
        """Complete call flow: create profile, create invite, accept, end, check history"""
        # 1. Create audio profile
        profile_response = requests.post(
            f"{BASE_URL}/api/calls/profiles",
            headers=self.auth_headers,
            json={"name": f"TEST_Lifecycle_{uuid.uuid4().hex[:8]}"}
        )
        assert profile_response.status_code == 200
        profile = profile_response.json()
        
        # 2. Create invite
        invite_response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            headers=self.auth_headers,
            json={"label": "Lifecycle Test Call"}
        )
        assert invite_response.status_code == 200
        invite = invite_response.json()
        self.created_invite_ids.append(invite["id"])
        
        # 3. Public caller gets invite info
        info_response = requests.get(
            f"{BASE_URL}/api/calls/join/{invite['token']}"
        )
        assert info_response.status_code == 200
        assert info_response.json()["status"] == "pending"
        
        # 4. Caller accepts
        accept_response = requests.post(
            f"{BASE_URL}/api/calls/join/{invite['token']}/accept",
            json={"name": "Test Caller"}
        )
        assert accept_response.status_code == 200
        assert accept_response.json()["status"] == "active"
        
        # 5. Host ends call
        end_response = requests.post(
            f"{BASE_URL}/api/calls/invites/{invite['id']}/end",
            headers=self.auth_headers
        )
        assert end_response.status_code == 200
        
        # 6. Verify call in history
        history_response = requests.get(
            f"{BASE_URL}/api/calls/invites?status=ended",
            headers=self.auth_headers
        )
        assert history_response.status_code == 200
        ended_invites = history_response.json()["invites"]
        ended_invite = next((inv for inv in ended_invites if inv["id"] == invite["id"]), None)
        assert ended_invite is not None
        assert ended_invite["caller_name"] == "Test Caller"
        
        # Cleanup profile
        requests.delete(
            f"{BASE_URL}/api/calls/profiles/{profile['id']}",
            headers=self.auth_headers
        )


class TestUnauthorizedAccess:
    """Test that authenticated endpoints reject unauthenticated requests"""
    
    def test_profiles_requires_auth(self):
        """GET /api/calls/profiles - Requires authentication"""
        response = requests.get(f"{BASE_URL}/api/calls/profiles")
        assert response.status_code in [401, 403]  # Either is valid for unauthorized
    
    def test_create_profile_requires_auth(self):
        """POST /api/calls/profiles - Requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/calls/profiles",
            json={"name": "Test"}
        )
        assert response.status_code in [401, 403]
    
    def test_invites_requires_auth(self):
        """GET /api/calls/invites - Requires authentication"""
        response = requests.get(f"{BASE_URL}/api/calls/invites")
        assert response.status_code in [401, 403]
    
    def test_create_invite_requires_auth(self):
        """POST /api/calls/invites - Requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/calls/invites",
            json={"label": "Test"}
        )
        assert response.status_code in [401, 403]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
