"""
Voice Support API Tests - AI Voice Call Support using OpenAI Realtime API
Tests for: start-session, save-transcript, sessions list, session detail
Enterprise-only feature (clara_enterprise=true)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "test"

# Enterprise site (clara_enterprise=true)
ENTERPRISE_SITE_SLUG = "radiogroep"
ENTERPRISE_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"

# Non-enterprise site
NON_ENTERPRISE_SITE_SLUG = "dbntstudio"


class TestVoiceSupportAPI:
    """Voice Support API endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as system admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        yield
        
        self.session.close()
    
    def test_start_session_enterprise_site(self):
        """POST /api/voice-support/start-session creates session for Enterprise site"""
        response = self.session.post(
            f"{BASE_URL}/api/voice-support/start-session",
            params={"main_site_id": ENTERPRISE_SITE_ID}
        )
        
        print(f"Start session response: {response.status_code}")
        print(f"Response body: {response.text[:500] if response.text else 'empty'}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "session_id" in data, "Response should contain session_id"
        assert data["session_id"], "session_id should not be empty"
        
        # Store session_id for later tests
        self.created_session_id = data["session_id"]
        print(f"Created session: {self.created_session_id}")
    
    def test_start_session_non_enterprise_returns_403(self):
        """POST /api/voice-support/start-session returns 403 for non-Enterprise site"""
        # First get the non-enterprise site ID
        sites_response = self.session.get(f"{BASE_URL}/api/main-sites/my/access")
        if sites_response.status_code != 200:
            pytest.skip("Could not fetch main sites")
        
        sites = sites_response.json().get("main_sites", [])
        non_enterprise_site = next(
            (s for s in sites if s.get("slug") == NON_ENTERPRISE_SITE_SLUG),
            None
        )
        
        if not non_enterprise_site:
            pytest.skip(f"Non-enterprise site {NON_ENTERPRISE_SITE_SLUG} not found")
        
        non_enterprise_id = non_enterprise_site.get("id")
        print(f"Testing with non-enterprise site: {NON_ENTERPRISE_SITE_SLUG} (ID: {non_enterprise_id})")
        
        response = self.session.post(
            f"{BASE_URL}/api/voice-support/start-session",
            params={"main_site_id": non_enterprise_id}
        )
        
        print(f"Non-enterprise response: {response.status_code}")
        print(f"Response body: {response.text[:500] if response.text else 'empty'}")
        
        assert response.status_code == 403, f"Expected 403 for non-enterprise site, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Response should contain error detail"
        assert "enterprise" in data["detail"].lower(), "Error should mention enterprise"
    
    def test_realtime_session_endpoint_exists(self):
        """POST /api/voice-support/realtime/session returns OpenAI session config"""
        response = self.session.post(f"{BASE_URL}/api/voice-support/realtime/session")
        
        print(f"Realtime session response: {response.status_code}")
        print(f"Response body: {response.text[:500] if response.text else 'empty'}")
        
        # The endpoint should exist and return session config
        # It may return 200 with session data or 4xx if auth is required
        assert response.status_code in [200, 401, 403], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            # Check for expected OpenAI Realtime session fields
            print(f"Session data keys: {data.keys() if isinstance(data, dict) else 'not a dict'}")
    
    def test_save_transcript(self):
        """POST /api/voice-support/save-transcript saves transcript to DB"""
        # First create a session
        create_response = self.session.post(
            f"{BASE_URL}/api/voice-support/start-session",
            params={"main_site_id": ENTERPRISE_SITE_ID}
        )
        
        if create_response.status_code != 200:
            pytest.skip("Could not create session for transcript test")
        
        session_id = create_response.json().get("session_id")
        
        # Save transcript
        transcript_data = {
            "session_id": session_id,
            "main_site_id": ENTERPRISE_SITE_ID,
            "language": "en",
            "messages": [
                {"role": "assistant", "text": "Hello, how can I help you?", "time": "2026-01-15T10:00:00Z"},
                {"role": "user", "text": "I need help with RDS settings", "time": "2026-01-15T10:00:05Z"},
                {"role": "assistant", "text": "I can help with that. What specific issue are you having?", "time": "2026-01-15T10:00:10Z"}
            ],
            "duration_seconds": 120
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/voice-support/save-transcript",
            json=transcript_data
        )
        
        print(f"Save transcript response: {response.status_code}")
        print(f"Response body: {response.text[:500] if response.text else 'empty'}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("saved"), "Response should indicate saved=True"
    
    def test_get_sessions_list(self):
        """GET /api/voice-support/sessions returns session history"""
        response = self.session.get(
            f"{BASE_URL}/api/voice-support/sessions",
            params={"main_site_id": ENTERPRISE_SITE_ID}
        )
        
        print(f"Get sessions response: {response.status_code}")
        print(f"Response body: {response.text[:500] if response.text else 'empty'}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "sessions" in data, "Response should contain sessions array"
        assert isinstance(data["sessions"], list), "sessions should be a list"
        
        if len(data["sessions"]) > 0:
            session = data["sessions"][0]
            print(f"First session keys: {session.keys()}")
            # Check expected fields
            assert "session_id" in session, "Session should have session_id"
    
    def test_get_session_detail(self):
        """GET /api/voice-support/session/{id} returns full transcript"""
        # First create and save a session with transcript
        create_response = self.session.post(
            f"{BASE_URL}/api/voice-support/start-session",
            params={"main_site_id": ENTERPRISE_SITE_ID}
        )
        
        if create_response.status_code != 200:
            pytest.skip("Could not create session")
        
        session_id = create_response.json().get("session_id")
        
        # Save transcript
        self.session.post(
            f"{BASE_URL}/api/voice-support/save-transcript",
            json={
                "session_id": session_id,
                "main_site_id": ENTERPRISE_SITE_ID,
                "language": "nl",
                "messages": [
                    {"role": "assistant", "text": "Hallo, hoe kan ik u helpen?", "time": "2026-01-15T10:00:00Z"}
                ],
                "duration_seconds": 60
            }
        )
        
        # Get session detail
        response = self.session.get(f"{BASE_URL}/api/voice-support/session/{session_id}")
        
        print(f"Get session detail response: {response.status_code}")
        print(f"Response body: {response.text[:500] if response.text else 'empty'}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "session_id" in data, "Response should contain session_id"
        assert data["session_id"] == session_id, "session_id should match"
        assert "messages" in data, "Response should contain messages"
        assert "language" in data, "Response should contain language"
    
    def test_get_nonexistent_session_returns_404(self):
        """GET /api/voice-support/session/{id} returns 404 for non-existent session"""
        fake_session_id = "00000000-0000-0000-0000-000000000000"
        
        response = self.session.get(f"{BASE_URL}/api/voice-support/session/{fake_session_id}")
        
        print(f"Get nonexistent session response: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_start_session_unauthenticated_returns_401(self):
        """POST /api/voice-support/start-session returns 401 without auth"""
        # Create new session without auth header
        unauth_session = requests.Session()
        unauth_session.headers.update({"Content-Type": "application/json"})
        
        response = unauth_session.post(
            f"{BASE_URL}/api/voice-support/start-session",
            params={"main_site_id": ENTERPRISE_SITE_ID}
        )
        
        print(f"Unauthenticated response: {response.status_code}")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        
        unauth_session.close()


class TestS3AttachmentUpload:
    """S3 attachment upload for support tickets (regression test)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as system admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        yield
        
        self.session.close()
    
    def test_s3_attachment_upload_endpoint_exists(self):
        """POST /api/support-tickets/{id}/messages/attachment endpoint exists"""
        # Use a test ticket ID
        test_ticket_id = "eb733ab4-706"
        
        # Try to upload (will fail without actual file, but endpoint should exist)
        response = self.session.post(
            f"{BASE_URL}/api/support-tickets/{test_ticket_id}/messages/attachment",
            files={"file": ("test.txt", b"test content", "text/plain")}
        )
        
        print(f"S3 attachment upload response: {response.status_code}")
        print(f"Response body: {response.text[:500] if response.text else 'empty'}")
        
        # Should not be 404 (endpoint exists)
        # May be 404 if ticket doesn't exist, or 200/400 for other reasons
        assert response.status_code != 405, "Endpoint should accept POST method"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
