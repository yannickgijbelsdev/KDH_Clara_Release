"""
RDS Station-Specific Features Test Suite
Tests station-specific endpoints (MFY/GRK), Shoutcast now-playing, and rds_station field in ShowTitle
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestMFYStationEndpoints:
    """Test MFY station-specific public endpoints"""
    
    def test_mfy_live_returns_plain_text(self):
        """Test GET /api/rds/mfy/live returns plain text for MFY station"""
        response = requests.get(f"{BASE_URL}/api/rds/mfy/live")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"
        print(f"MFY Live: '{response.text}'")
    
    def test_mfy_now_playing_json(self):
        """Test GET /api/rds/mfy/now-playing returns JSON from Shoutcast"""
        response = requests.get(f"{BASE_URL}/api/rds/mfy/now-playing")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should have 'status'"
        assert "station" in data, "Response should have 'station'"
        assert data["station"] == "mfy", f"Station should be 'mfy', got '{data['station']}'"
        
        # Should have Shoutcast fields
        assert "song_title" in data, "Response should have 'song_title'"
        assert "current_listeners" in data, "Response should have 'current_listeners'"
        assert "stream_online" in data, "Response should have 'stream_online'"
        
        print(f"MFY Now Playing: {data.get('song_title', 'N/A')} - Listeners: {data.get('current_listeners', 0)}")
    
    def test_mfy_now_playing_txt(self):
        """Test GET /api/rds/mfy/now-playing.txt returns plain text song title"""
        response = requests.get(f"{BASE_URL}/api/rds/mfy/now-playing.txt")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"
        print(f"MFY Now Playing TXT: '{response.text}'")
    
    def test_mfy_cached_rundown(self):
        """Test GET /api/rds/mfy/cached-rundown returns MFY-specific rundown"""
        response = requests.get(f"{BASE_URL}/api/rds/mfy/cached-rundown")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should have 'status'"
        assert "station" in data, "Response should have 'station'"
        assert data["station"] == "mfy", f"Station should be 'mfy', got '{data['station']}'"
        assert data["status"] in ["success", "no_live_show"], f"Unexpected status: {data['status']}"
        
        if data["status"] == "no_live_show":
            assert "message" in data, "no_live_show should have 'message'"
            print(f"MFY Cached Rundown: {data['message']}")
        else:
            assert "show" in data, "success response should have 'show'"
            assert "items" in data, "success response should have 'items'"
            print(f"MFY Cached Rundown: Show '{data['show'].get('title', 'N/A')}' with {len(data['items'])} items")


class TestGRKStationEndpoints:
    """Test GRK station-specific public endpoints"""
    
    def test_grk_live_returns_plain_text(self):
        """Test GET /api/rds/grk/live returns plain text for GRK station"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/live")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"
        print(f"GRK Live: '{response.text}'")
    
    def test_grk_now_playing_json(self):
        """Test GET /api/rds/grk/now-playing returns JSON from Shoutcast"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/now-playing")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should have 'status'"
        assert "station" in data, "Response should have 'station'"
        assert data["station"] == "grk", f"Station should be 'grk', got '{data['station']}'"
        
        # Should have Shoutcast fields
        assert "song_title" in data, "Response should have 'song_title'"
        assert "current_listeners" in data, "Response should have 'current_listeners'"
        assert "stream_online" in data, "Response should have 'stream_online'"
        
        print(f"GRK Now Playing: {data.get('song_title', 'N/A')} - Listeners: {data.get('current_listeners', 0)}")
    
    def test_grk_now_playing_txt(self):
        """Test GET /api/rds/grk/now-playing.txt returns plain text song title"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/now-playing.txt")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"
        print(f"GRK Now Playing TXT: '{response.text}'")
    
    def test_grk_cached_rundown(self):
        """Test GET /api/rds/grk/cached-rundown returns GRK-specific rundown"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/cached-rundown")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should have 'status'"
        assert "station" in data, "Response should have 'station'"
        assert data["station"] == "grk", f"Station should be 'grk', got '{data['station']}'"
        assert data["status"] in ["success", "no_live_show"], f"Unexpected status: {data['status']}"
        
        if data["status"] == "no_live_show":
            assert "message" in data, "no_live_show should have 'message'"
            print(f"GRK Cached Rundown: {data['message']}")
        else:
            assert "show" in data, "success response should have 'show'"
            assert "items" in data, "success response should have 'items'"
            print(f"GRK Cached Rundown: Show '{data['show'].get('title', 'N/A')}' with {len(data['items'])} items")


class TestShowTitleRDSStation:
    """Test rds_station field in ShowTitle CRUD operations"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "yannick.gijbels@koodh.com", "password": "password123"}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        token = login_response.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_show_titles_have_rds_station_field(self, auth_headers):
        """Test that existing show titles return rds_station field"""
        response = requests.get(f"{BASE_URL}/api/shows/titles", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        titles = response.json()
        assert len(titles) > 0, "Should have at least one show title"
        
        for title in titles:
            assert "rds_station" in title, f"Show title '{title['name']}' should have 'rds_station' field"
            assert title["rds_station"] in ["mfy", "grk", "both", "none", None], \
                f"Invalid rds_station value: {title['rds_station']}"
        
        print(f"Verified {len(titles)} show titles have rds_station field")
    
    def test_create_show_title_with_rds_station(self, auth_headers):
        """Test creating a show title with rds_station=mfy"""
        # Create test show title
        create_data = {
            "name": "TEST_RDS_MFY_Show",
            "description": "Test show for MFY station",
            "rds_station": "mfy"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/shows/titles",
            json=create_data,
            headers=auth_headers
        )
        
        # May return 201 or 200
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        created = response.json()
        assert created["name"] == "TEST_RDS_MFY_Show", f"Name mismatch: {created['name']}"
        assert created["rds_station"] == "mfy", f"rds_station should be 'mfy', got '{created['rds_station']}'"
        
        title_id = created["id"]
        print(f"Created show title with id={title_id}, rds_station=mfy")
        
        # Clean up
        delete_response = requests.delete(
            f"{BASE_URL}/api/shows/titles/{title_id}",
            headers=auth_headers
        )
        assert delete_response.status_code in [200, 204], f"Delete failed: {delete_response.status_code}"
        print("Cleanup: Deleted test show title")
    
    def test_update_show_title_rds_station(self, auth_headers):
        """Test updating rds_station on existing show title"""
        # Create a test show title first
        create_data = {
            "name": "TEST_RDS_Update_Show",
            "description": "Test show for update",
            "rds_station": "none"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/shows/titles",
            json=create_data,
            headers=auth_headers
        )
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        title_id = create_response.json()["id"]
        
        # Update rds_station to 'both'
        update_data = {"rds_station": "both"}
        update_response = requests.put(
            f"{BASE_URL}/api/shows/titles/{title_id}",
            json=update_data,
            headers=auth_headers
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated = update_response.json()
        assert updated["rds_station"] == "both", f"rds_station should be 'both', got '{updated['rds_station']}'"
        print("Updated show title rds_station to 'both'")
        
        # Clean up
        requests.delete(f"{BASE_URL}/api/shows/titles/{title_id}", headers=auth_headers)
        print("Cleanup: Deleted test show title")


class TestRDSEndpointsGroupedByStation:
    """Test that /api/rds/endpoints returns endpoints grouped by station"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "yannick.gijbels@koodh.com", "password": "password123"}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        token = login_response.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_endpoints_have_station_field(self, auth_headers):
        """Test that each endpoint has a station field (mfy, grk, all)"""
        response = requests.get(f"{BASE_URL}/api/rds/endpoints", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        endpoints = data.get("endpoints", [])
        assert len(endpoints) >= 10, f"Expected at least 10 endpoints, got {len(endpoints)}"
        
        stations = {"mfy": [], "grk": [], "all": []}
        for ep in endpoints:
            assert "station" in ep, f"Endpoint '{ep['name']}' should have 'station' field"
            station = ep["station"]
            assert station in stations, f"Invalid station: {station}"
            stations[station].append(ep["name"])
        
        # Should have MFY endpoints
        assert len(stations["mfy"]) >= 4, f"Should have at least 4 MFY endpoints, got {len(stations['mfy'])}"
        # Should have GRK endpoints
        assert len(stations["grk"]) >= 4, f"Should have at least 4 GRK endpoints, got {len(stations['grk'])}"
        # Should have generic endpoints
        assert len(stations["all"]) >= 2, f"Should have at least 2 general endpoints, got {len(stations['all'])}"
        
        print(f"Endpoints by station: MFY={len(stations['mfy'])}, GRK={len(stations['grk'])}, All={len(stations['all'])}")
    
    def test_endpoints_include_now_playing(self, auth_headers):
        """Test that now-playing endpoints are included"""
        response = requests.get(f"{BASE_URL}/api/rds/endpoints", headers=auth_headers)
        data = response.json()
        endpoints = data.get("endpoints", [])
        
        # Check for now-playing endpoints
        now_playing_endpoints = [ep for ep in endpoints if "now-playing" in ep["path"]]
        assert len(now_playing_endpoints) >= 4, f"Should have at least 4 now-playing endpoints, got {len(now_playing_endpoints)}"
        
        # Check MFY now-playing
        mfy_np = [ep for ep in now_playing_endpoints if "mfy" in ep["path"]]
        assert len(mfy_np) >= 2, "Should have MFY now-playing endpoints (.txt and JSON)"
        
        # Check GRK now-playing
        grk_np = [ep for ep in now_playing_endpoints if "grk" in ep["path"]]
        assert len(grk_np) >= 2, "Should have GRK now-playing endpoints (.txt and JSON)"
        
        print(f"Found {len(now_playing_endpoints)} now-playing endpoints (MFY: {len(mfy_np)}, GRK: {len(grk_np)})")


class TestShoutcastIntegration:
    """Test Shoutcast service integration"""
    
    def test_shoutcast_service_file_exists(self):
        """Verify shoutcast.py service file exists"""
        shoutcast_path = "/app/backend/services/shoutcast.py"
        assert os.path.exists(shoutcast_path), f"Shoutcast service should exist at {shoutcast_path}"
    
    def test_shoutcast_servers_configured(self):
        """Verify Shoutcast servers are configured for MFY and GRK"""
        shoutcast_path = "/app/backend/services/shoutcast.py"
        with open(shoutcast_path, 'r') as f:
            content = f.read()
        
        # Check MFY server config
        assert "mfy.level27.be" in content, "MFY Shoutcast server should be configured"
        
        # Check GRK server config
        assert "grk.level27.be" in content, "GRK Shoutcast server should be configured"
        
        print("Shoutcast servers configured: mfy.level27.be, grk.level27.be")


class TestRDSSchedulerStationSupport:
    """Test that RDS scheduler supports station-specific caching"""
    
    def test_scheduler_saves_rds_station_in_cache(self):
        """Verify scheduler code saves rds_station field when caching rundown"""
        scheduler_path = "/app/backend/services/rds_scheduler.py"
        with open(scheduler_path, 'r') as f:
            content = f.read()
        
        # Check that scheduler fetches rds_station from show_titles
        assert "rds_station" in content, "Scheduler should reference rds_station field"
        
        # Check that cached_data includes rds_station
        assert '"rds_station":' in content or "'rds_station':" in content, \
            "Scheduler should include rds_station in cached data"
        
        print("RDS scheduler includes rds_station in cache - PASS")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
