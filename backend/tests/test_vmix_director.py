"""
vMix Director API Tests
Tests for vMix overlay configuration, ticker messages, and public HTML overlay endpoints.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SERVER_SITE_ID = "9d51a9a0-90ea-41c5-8324-d240fedbd99c"  # Clara XML Server

class TestVmixConfig:
    """Test vMix configuration endpoints - GET/PUT /api/vmix/config"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Authenticate before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Main-Site-ID": SERVER_SITE_ID,
            "Content-Type": "application/json"
        }
    
    def test_get_vmix_config_returns_default_with_5_elements(self):
        """GET /api/vmix/config should return config with 5 default elements"""
        response = requests.get(f"{BASE_URL}/api/vmix/config", headers=self.headers)
        assert response.status_code == 200, f"Failed to get config: {response.text}"
        
        data = response.json()
        assert "elements" in data, "Response missing 'elements' field"
        assert len(data["elements"]) == 5, f"Expected 5 elements, got {len(data['elements'])}"
        
        # Verify all expected element types exist
        element_types = [el["type"] for el in data["elements"]]
        expected_types = ["logo", "clock", "ticker", "now_playing_show", "now_playing_track"]
        for expected in expected_types:
            assert expected in element_types, f"Missing element type: {expected}"
        
        # Verify config has expected fields
        assert "canvas_bg" in data
        assert "ticker_separator" in data
        assert "ticker_scroll" in data
        assert "clock_format" in data
        
    def test_put_vmix_config_saves_changes(self):
        """PUT /api/vmix/config should save updated configuration"""
        # First get current config
        get_resp = requests.get(f"{BASE_URL}/api/vmix/config", headers=self.headers)
        assert get_resp.status_code == 200
        config = get_resp.json()
        
        # Update config
        config["ticker_separator"] = "dash"
        config["ticker_scroll"] = False
        config["clock_format"] = "HH:mm"
        
        # Save config
        put_resp = requests.put(f"{BASE_URL}/api/vmix/config", headers=self.headers, json=config)
        assert put_resp.status_code == 200, f"Failed to save config: {put_resp.text}"
        
        updated = put_resp.json()
        assert updated["ticker_separator"] == "dash", "ticker_separator not updated"
        assert updated["ticker_scroll"] == False, "ticker_scroll not updated"
        assert updated["clock_format"] == "HH:mm", "clock_format not updated"
        
        # Reset to default for other tests
        config["ticker_separator"] = "bullet"
        config["ticker_scroll"] = True
        config["clock_format"] = "HH:mm:ss"
        requests.put(f"{BASE_URL}/api/vmix/config", headers=self.headers, json=config)
    
    def test_get_config_without_main_site_header_returns_null_site(self):
        """GET /api/vmix/config without X-Main-Site-ID returns config with null main_site_id"""
        headers = {"Authorization": f"Bearer {self.token}"}  # No X-Main-Site-ID
        response = requests.get(f"{BASE_URL}/api/vmix/config", headers=headers)
        # Returns 200 with main_site_id: null (creates/returns a default config)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("main_site_id") is None, "Expected main_site_id to be null"


class TestLogoUpload:
    """Test logo upload endpoint - POST /api/vmix/logo/upload"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Authenticate before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Main-Site-ID": SERVER_SITE_ID
        }
    
    def test_logo_upload_accepts_image(self):
        """POST /api/vmix/logo/upload should accept image files"""
        # Create a simple PNG file (1x1 pixel)
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {"file": ("test_logo.png", png_data, "image/png")}
        response = requests.post(f"{BASE_URL}/api/vmix/logo/upload", headers=self.headers, files=files)
        
        assert response.status_code == 200, f"Logo upload failed: {response.text}"
        data = response.json()
        assert "logo_url" in data, "Response missing logo_url"
        assert data["logo_url"], "logo_url should not be empty"
    
    def test_logo_upload_rejects_non_image(self):
        """POST /api/vmix/logo/upload should reject non-image files"""
        files = {"file": ("test.txt", b"not an image", "text/plain")}
        response = requests.post(f"{BASE_URL}/api/vmix/logo/upload", headers=self.headers, files=files)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"


class TestTickerMessages:
    """Test ticker messages CRUD - /api/vmix/ticker-messages"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Authenticate before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Main-Site-ID": SERVER_SITE_ID,
            "Content-Type": "application/json"
        }
        self.created_message_ids = []
    
    def teardown_method(self):
        """Clean up created test messages"""
        for msg_id in self.created_message_ids:
            try:
                requests.delete(f"{BASE_URL}/api/vmix/ticker-messages/{msg_id}", headers=self.headers)
            except:
                pass
    
    def test_create_ticker_message(self):
        """POST /api/vmix/ticker-messages should create a new message"""
        response = requests.post(f"{BASE_URL}/api/vmix/ticker-messages", headers=self.headers, json={
            "text": "TEST_vMix ticker message",
            "order": 0,
            "active": True
        })
        assert response.status_code == 200, f"Failed to create message: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response missing id"
        assert data["text"] == "TEST_vMix ticker message"
        assert data["active"] == True
        
        self.created_message_ids.append(data["id"])
    
    def test_get_ticker_messages_list(self):
        """GET /api/vmix/ticker-messages should return list of messages"""
        # Create a message first
        create_resp = requests.post(f"{BASE_URL}/api/vmix/ticker-messages", headers=self.headers, json={
            "text": "TEST_list message",
            "order": 0,
            "active": True
        })
        assert create_resp.status_code == 200
        self.created_message_ids.append(create_resp.json()["id"])
        
        # Get messages list
        response = requests.get(f"{BASE_URL}/api/vmix/ticker-messages", headers=self.headers)
        assert response.status_code == 200, f"Failed to get messages: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_update_ticker_message(self):
        """PUT /api/vmix/ticker-messages/{id} should update message"""
        # Create message
        create_resp = requests.post(f"{BASE_URL}/api/vmix/ticker-messages", headers=self.headers, json={
            "text": "TEST_original text",
            "order": 0,
            "active": True
        })
        assert create_resp.status_code == 200
        msg_id = create_resp.json()["id"]
        self.created_message_ids.append(msg_id)
        
        # Update message
        update_resp = requests.put(f"{BASE_URL}/api/vmix/ticker-messages/{msg_id}", headers=self.headers, json={
            "text": "TEST_updated text",
            "active": False
        })
        assert update_resp.status_code == 200, f"Failed to update: {update_resp.text}"
        
        updated = update_resp.json()
        assert updated["text"] == "TEST_updated text"
        assert updated["active"] == False
    
    def test_delete_ticker_message(self):
        """DELETE /api/vmix/ticker-messages/{id} should delete message"""
        # Create message
        create_resp = requests.post(f"{BASE_URL}/api/vmix/ticker-messages", headers=self.headers, json={
            "text": "TEST_to be deleted",
            "order": 0,
            "active": True
        })
        assert create_resp.status_code == 200
        msg_id = create_resp.json()["id"]
        
        # Delete message
        delete_resp = requests.delete(f"{BASE_URL}/api/vmix/ticker-messages/{msg_id}", headers=self.headers)
        assert delete_resp.status_code == 200, f"Failed to delete: {delete_resp.text}"
        
        data = delete_resp.json()
        assert data.get("status") == "deleted"


class TestPublicOverlayEndpoints:
    """Test public HTML overlay endpoints - no auth required for vMix to load"""
    
    def test_overlay_logo_returns_html(self):
        """GET /api/vmix/overlay/{id}/logo should return HTML"""
        response = requests.get(f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/logo")
        assert response.status_code == 200, f"Logo overlay failed: {response.text}"
        assert "text/html" in response.headers.get("content-type", "")
        assert "<!DOCTYPE html>" in response.text
    
    def test_overlay_clock_returns_html(self):
        """GET /api/vmix/overlay/{id}/clock should return HTML with clock script"""
        response = requests.get(f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/clock")
        assert response.status_code == 200, f"Clock overlay failed: {response.text}"
        assert "text/html" in response.headers.get("content-type", "")
        assert "clock" in response.text.lower()
    
    def test_overlay_ticker_returns_html(self):
        """GET /api/vmix/overlay/{id}/ticker should return HTML with ticker"""
        response = requests.get(f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/ticker")
        assert response.status_code == 200, f"Ticker overlay failed: {response.text}"
        assert "text/html" in response.headers.get("content-type", "")
        assert "ticker" in response.text.lower()
    
    def test_overlay_now_playing_show_returns_html(self):
        """GET /api/vmix/overlay/{id}/now-playing-show should return HTML"""
        response = requests.get(f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/now-playing-show")
        assert response.status_code == 200, f"Now playing show overlay failed: {response.text}"
        assert "text/html" in response.headers.get("content-type", "")
        assert "Now Playing" in response.text
    
    def test_overlay_now_playing_track_returns_html(self):
        """GET /api/vmix/overlay/{id}/now-playing-track should return HTML"""
        response = requests.get(f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/now-playing-track")
        assert response.status_code == 200, f"Now playing track overlay failed: {response.text}"
        assert "text/html" in response.headers.get("content-type", "")
        assert "Now Playing" in response.text
    
    def test_overlays_are_public_no_auth_required(self):
        """All overlay endpoints should work without authentication"""
        endpoints = [
            f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/logo",
            f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/clock",
            f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/ticker",
            f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/now-playing-show",
            f"{BASE_URL}/api/vmix/overlay/{SERVER_SITE_ID}/now-playing-track",
        ]
        
        for endpoint in endpoints:
            response = requests.get(endpoint)  # No auth headers
            assert response.status_code == 200, f"Public endpoint {endpoint} failed without auth"


class TestXmlServersEndpoint:
    """Test XML servers list endpoint - GET /api/vmix/xml-servers"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Authenticate before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Main-Site-ID": SERVER_SITE_ID
        }
    
    def test_get_xml_servers_returns_list(self):
        """GET /api/vmix/xml-servers should return list of server-type sites"""
        response = requests.get(f"{BASE_URL}/api/vmix/xml-servers", headers=self.headers)
        assert response.status_code == 200, f"Failed to get XML servers: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # If there are server sites, they should have id, name, slug
        for server in data:
            assert "id" in server
            assert "name" in server


class TestNowPlayingEndpoint:
    """Test now playing data endpoint - GET /api/vmix/now-playing/{id}"""
    
    def test_get_now_playing_returns_data_structure(self):
        """GET /api/vmix/now-playing/{id} should return show and track data"""
        response = requests.get(f"{BASE_URL}/api/vmix/now-playing/{SERVER_SITE_ID}")
        assert response.status_code == 200, f"Failed to get now playing: {response.text}"
        
        data = response.json()
        # Should have show and track fields (may be null if no data)
        assert "show" in data
        assert "track" in data
