"""
Radioplayer Integration API Tests
Tests for: GET/PUT config, POST push-now-playing, POST push-schedule, GET push-log
Auth required for all endpoints (admin-only)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def auth_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Auth failed: {response.status_code} - {response.text[:200]}")
    data = response.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestRadioplayerAuthRequired:
    """Test that all Radioplayer endpoints require authentication"""
    
    def test_config_get_requires_auth(self):
        """GET /api/radioplayer/config returns 401/403 without auth"""
        response = requests.get(f"{BASE_URL}/api/radioplayer/config")
        assert response.status_code in (401, 403), f"Expected 401/403, got {response.status_code}"
    
    def test_config_put_requires_auth(self):
        """PUT /api/radioplayer/config returns 401/403 without auth"""
        response = requests.put(f"{BASE_URL}/api/radioplayer/config", json={"enabled": False})
        assert response.status_code in (401, 403), f"Expected 401/403, got {response.status_code}"
    
    def test_push_np_requires_auth(self):
        """POST /api/radioplayer/push-now-playing returns 401/403 without auth"""
        response = requests.post(f"{BASE_URL}/api/radioplayer/push-now-playing")
        assert response.status_code in (401, 403), f"Expected 401/403, got {response.status_code}"
    
    def test_push_schedule_requires_auth(self):
        """POST /api/radioplayer/push-schedule returns 401/403 without auth"""
        response = requests.post(f"{BASE_URL}/api/radioplayer/push-schedule")
        assert response.status_code in (401, 403), f"Expected 401/403, got {response.status_code}"
    
    def test_push_log_requires_auth(self):
        """GET /api/radioplayer/push-log returns 401/403 without auth"""
        response = requests.get(f"{BASE_URL}/api/radioplayer/push-log")
        assert response.status_code in (401, 403), f"Expected 401/403, got {response.status_code}"


class TestRadioplayerConfig:
    """Test GET and PUT /api/radioplayer/config"""
    
    def test_get_config_success(self, auth_headers):
        """GET /api/radioplayer/config returns config with masked password"""
        response = requests.get(f"{BASE_URL}/api/radioplayer/config", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        # Config should have these fields (may be empty initially)
        assert isinstance(data, dict), "Response should be dict"
        # Password should be masked if set
        if data.get("password"):
            assert data["password"] == "***", "Password should be masked"
        print(f"Config fields: {list(data.keys())}")
    
    def test_update_config_success(self, auth_headers):
        """PUT /api/radioplayer/config updates configuration"""
        config_update = {
            "enabled": True,
            "username": "eddy.thijs@grk.fm",
            "password": "KYLovie13monx",
            "rpid": "056028",
            "country_code": "056",
            "ingest_base_url": "https://core-ingest.radioplayer.cloud",
            "auto_np": True,
            "auto_schedule": True
        }
        response = requests.put(f"{BASE_URL}/api/radioplayer/config", headers=auth_headers, json=config_update)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        assert data.get("status") == "ok", f"Expected status='ok', got {data}"
        assert "updated" in data.get("message", "").lower() or "ok" in data.get("message", "").lower()
    
    def test_get_config_after_update(self, auth_headers):
        """Verify config fields after update"""
        response = requests.get(f"{BASE_URL}/api/radioplayer/config", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        # Verify the config was saved
        assert data.get("enabled") == True, "enabled should be True"
        assert data.get("username") == "eddy.thijs@grk.fm", f"username mismatch: {data.get('username')}"
        assert data.get("rpid") == "056028", f"rpid mismatch: {data.get('rpid')}"
        assert data.get("country_code") == "056", f"country_code mismatch: {data.get('country_code')}"
        assert data.get("auto_np") == True, "auto_np should be True"
        assert data.get("auto_schedule") == True, "auto_schedule should be True"
        # Password should be masked
        assert data.get("password") == "***", "Password should be masked as ***"
        assert data.get("password_set") == True, "password_set should be True"
    
    def test_update_with_masked_password_preserves_password(self, auth_headers):
        """PUT with password='***' should preserve existing password"""
        # Update with masked password
        config_update = {
            "enabled": True,
            "username": "eddy.thijs@grk.fm",
            "password": "***",  # Masked - should preserve existing
            "rpid": "056028",
            "auto_np": True,
            "auto_schedule": True
        }
        response = requests.put(f"{BASE_URL}/api/radioplayer/config", headers=auth_headers, json=config_update)
        assert response.status_code == 200
        
        # Verify password is still set
        get_response = requests.get(f"{BASE_URL}/api/radioplayer/config", headers=auth_headers)
        data = get_response.json()
        assert data.get("password_set") == True, "password should still be set after masked update"


class TestRadioplayerPushNowPlaying:
    """Test POST /api/radioplayer/push-now-playing"""
    
    def test_push_np_manual(self, auth_headers):
        """POST /api/radioplayer/push-now-playing triggers manual NP push"""
        response = requests.post(f"{BASE_URL}/api/radioplayer/push-now-playing", headers=auth_headers)
        # May return 200 with success or error message (403 from Radioplayer API is expected)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        # Either success with pushed message, or error if no song data
        assert "status" in data, f"Response should have status field: {data}"
        print(f"Push NP response: {data}")


class TestRadioplayerPushSchedule:
    """Test POST /api/radioplayer/push-schedule"""
    
    def test_push_schedule_manual(self, auth_headers):
        """POST /api/radioplayer/push-schedule triggers manual schedule push"""
        response = requests.post(f"{BASE_URL}/api/radioplayer/push-schedule", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        assert data.get("status") == "ok", f"Expected status='ok', got {data}"
        assert "triggered" in data.get("message", "").lower() or "schedule" in data.get("message", "").lower()
        print(f"Push Schedule response: {data}")


class TestRadioplayerPushLog:
    """Test GET /api/radioplayer/push-log"""
    
    def test_get_push_log(self, auth_headers):
        """GET /api/radioplayer/push-log returns log entries"""
        response = requests.get(f"{BASE_URL}/api/radioplayer/push-log?limit=50", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        data = response.json()
        assert "logs" in data, f"Response should have 'logs' field: {data}"
        assert isinstance(data["logs"], list), "logs should be a list"
        assert "total" in data, "Response should have 'total' field"
        
        # Check log entry structure if there are entries
        if data["logs"]:
            entry = data["logs"][0]
            assert "type" in entry, "Log entry should have 'type'"
            assert "status" in entry, "Log entry should have 'status'"
            assert "timestamp" in entry, "Log entry should have 'timestamp'"
            print(f"Found {len(data['logs'])} log entries")
            print(f"Latest entry: type={entry.get('type')}, status={entry.get('status')}, detail={entry.get('detail', '')[:50]}")
        else:
            print("No log entries yet")
    
    def test_push_log_entries_have_correct_structure(self, auth_headers):
        """Verify log entries have expected fields"""
        # First trigger a push to create a log entry
        requests.post(f"{BASE_URL}/api/radioplayer/push-schedule", headers=auth_headers)
        
        # Wait a moment for log to be written
        import time
        time.sleep(1)
        
        response = requests.get(f"{BASE_URL}/api/radioplayer/push-log?limit=5", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        if data["logs"]:
            entry = data["logs"][0]
            # Verify all expected fields
            expected_fields = ["type", "status", "detail", "timestamp"]
            for field in expected_fields:
                assert field in entry, f"Log entry missing field: {field}"
            
            # Verify type is one of expected values
            assert entry["type"] in ("now_playing", "schedule"), f"Unexpected type: {entry['type']}"
            # Verify status is one of expected values
            assert entry["status"] in ("success", "error"), f"Unexpected status: {entry['status']}"


class TestRadioplayerAutoHooksCodeReview:
    """Code review verification for auto-push hooks"""
    
    def test_shoutcast_hook_exists(self):
        """Verify shoutcast.py has GRK NP push hook"""
        with open("/app/backend/services/shoutcast.py", "r") as f:
            content = f.read()
        
        # Check for GRK auto-push hook
        assert "auto_push_now_playing_for_grk" in content, "shoutcast.py should import auto_push_now_playing_for_grk"
        assert "station == \"grk\"" in content or 'station == "grk"' in content, "Hook should check for GRK station"
        print("PASS: shoutcast.py has GRK NP auto-push hook")
    
    def test_shows_router_hooks_exist(self):
        """Verify shows.py has Radioplayer schedule push hooks"""
        with open("/app/backend/routers/shows.py", "r") as f:
            content = f.read()
        
        # Check for Radioplayer schedule push hook
        assert "_trigger_radioplayer_schedule_push" in content, "shows.py should have _trigger_radioplayer_schedule_push"
        # Should be called in create, update, delete
        count = content.count("_trigger_radioplayer_schedule_push")
        assert count >= 3, f"Expected at least 3 calls to _trigger_radioplayer_schedule_push, found {count}"
        print(f"PASS: shows.py has {count} calls to _trigger_radioplayer_schedule_push")


class TestRadioplayerServiceCodeReview:
    """Code review of radioplayer.py service"""
    
    def test_service_has_required_functions(self):
        """Verify radioplayer.py has all required functions"""
        with open("/app/backend/services/radioplayer.py", "r") as f:
            content = f.read()
        
        required_functions = [
            "get_radioplayer_config",
            "push_now_playing",
            "push_schedule",
            "auto_push_now_playing_for_grk",
            "auto_push_schedule_for_grk",
            "_log_push",
            "_get_auth",
            "_get_ingest_url"
        ]
        
        for func in required_functions:
            assert f"def {func}" in content or f"async def {func}" in content, f"Missing function: {func}"
        print(f"PASS: radioplayer.py has all {len(required_functions)} required functions")
    
    def test_spi_xml_generation(self):
        """Verify service generates SPI XML for Radioplayer"""
        with open("/app/backend/services/radioplayer.py", "r") as f:
            content = f.read()
        
        # Check for XML generation
        assert "xml.etree.ElementTree" in content, "Should use ElementTree for XML"
        assert "<?xml version" in content, "Should generate XML declaration"
        assert "worlddab.org/schemas/spi" in content, "Should use SPI schema namespace"
        print("PASS: radioplayer.py generates proper SPI XML")
