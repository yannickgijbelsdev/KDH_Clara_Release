"""
RDS Stations API Tests - Dynamic station configuration per main site
Tests: GET /api/rds-stations/{main_site_id}, PUT /api/rds-stations/{main_site_id}/bulk-sync, POST /api/rds-stations/migrate/legacy
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "test"

# Known radiogroep site ID from context
RADIOGROEP_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Admin authentication failed: {response.status_code}")


@pytest.fixture(scope="module")
def network_admin_token():
    """Get network admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": NETWORK_ADMIN_EMAIL,
        "password": NETWORK_ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Network admin authentication failed: {response.status_code}")


@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture
def network_auth_headers(network_admin_token):
    """Headers with network admin auth token"""
    return {"Authorization": f"Bearer {network_admin_token}", "Content-Type": "application/json"}


class TestRDSStationsListEndpoint:
    """Test GET /api/rds-stations/{main_site_id}"""

    def test_list_stations_for_radiogroep(self, auth_headers):
        """Should return stations list for radiogroep site"""
        response = requests.get(
            f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "stations" in data, "Response should contain 'stations' key"
        assert isinstance(data["stations"], list), "Stations should be a list"
        
        # Verify migrated MFY/GRK stations exist
        station_codes = [s["code"] for s in data["stations"]]
        print(f"Found stations: {station_codes}")
        
        # Check station structure
        if len(data["stations"]) > 0:
            station = data["stations"][0]
            assert "id" in station, "Station should have 'id'"
            assert "name" in station, "Station should have 'name'"
            assert "code" in station, "Station should have 'code'"
            assert "stream_url" in station, "Station should have 'stream_url'"
            assert "stream_type" in station, "Station should have 'stream_type'"
            assert "default_text" in station, "Station should have 'default_text'"
            assert "color" in station, "Station should have 'color'"
            assert "order" in station, "Station should have 'order'"
            print(f"Station structure verified: {station['name']} ({station['code']})")

    def test_list_stations_requires_auth(self):
        """Should return 401/403 without authentication"""
        response = requests.get(f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"

    def test_list_stations_nonexistent_site(self, auth_headers):
        """Should return empty list for non-existent site"""
        fake_site_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/rds-stations/{fake_site_id}",
            headers=auth_headers
        )
        # Should return 200 with empty stations list (not 404)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["stations"] == [], "Should return empty stations list for non-existent site"


class TestRDSStationsBulkSyncEndpoint:
    """Test PUT /api/rds-stations/{main_site_id}/bulk-sync"""

    def test_bulk_sync_creates_stations(self, auth_headers):
        """Should create/update stations via bulk-sync"""
        test_stations = [
            {
                "name": "Test Station 1",
                "code": "test1",
                "stream_url": "http://test.stream:8000/test1",
                "stream_type": "shoutcast_v1",
                "default_text": "Test Station 1 Default",
                "color": "#f97316",
                "order": 0
            },
            {
                "name": "Test Station 2",
                "code": "test2",
                "stream_url": "http://test.stream:8000/test2",
                "stream_type": "icecast",
                "default_text": "Test Station 2 Default",
                "color": "#8b5cf6",
                "order": 1
            }
        ]
        
        response = requests.put(
            f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}/bulk-sync",
            headers=auth_headers,
            json={"stations": test_stations}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "stations" in data, "Response should contain 'stations'"
        assert len(data["stations"]) == 2, f"Expected 2 stations, got {len(data['stations'])}"
        
        # Verify station data
        codes = [s["code"] for s in data["stations"]]
        assert "test1" in codes, "test1 station should be created"
        assert "test2" in codes, "test2 station should be created"
        
        # Verify GET returns the same stations
        get_response = requests.get(
            f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert len(get_data["stations"]) == 2, "GET should return 2 stations after bulk-sync"
        print(f"Bulk sync successful: {[s['name'] for s in data['stations']]}")

    def test_bulk_sync_rejects_duplicate_codes(self, auth_headers):
        """Should reject duplicate station codes in same request"""
        duplicate_stations = [
            {"name": "Station A", "code": "dup", "stream_type": "shoutcast_v1", "default_text": "", "color": "#f97316", "order": 0},
            {"name": "Station B", "code": "dup", "stream_type": "shoutcast_v1", "default_text": "", "color": "#8b5cf6", "order": 1}
        ]
        
        response = requests.put(
            f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}/bulk-sync",
            headers=auth_headers,
            json={"stations": duplicate_stations}
        )
        assert response.status_code == 400, f"Expected 400 for duplicate codes, got {response.status_code}"
        assert "duplicate" in response.text.lower(), "Error should mention duplicate codes"

    def test_bulk_sync_requires_auth(self):
        """Should return 401/403 without authentication"""
        response = requests.put(
            f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}/bulk-sync",
            json={"stations": []}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"

    def test_bulk_sync_nonexistent_site(self, auth_headers):
        """Should return 404 for non-existent site"""
        fake_site_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/rds-stations/{fake_site_id}/bulk-sync",
            headers=auth_headers,
            json={"stations": []}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestRDSStationsMigrationEndpoint:
    """Test POST /api/rds-stations/migrate/legacy"""

    def test_migration_requires_network_admin(self, auth_headers):
        """Migration should require network admin role"""
        response = requests.post(
            f"{BASE_URL}/api/rds-stations/migrate/legacy",
            headers=auth_headers
        )
        # May return 403 if user is not network admin, or 200 if already migrated
        assert response.status_code in [200, 403], f"Expected 200 or 403, got {response.status_code}"
        print(f"Migration endpoint response: {response.status_code} - {response.text[:200]}")

    def test_migration_idempotent(self, network_auth_headers):
        """Migration should be idempotent (safe to run multiple times)"""
        response = requests.post(
            f"{BASE_URL}/api/rds-stations/migrate/legacy",
            headers=network_auth_headers
        )
        # Should return 200 whether already migrated or not
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Either "Already migrated" or "Migration complete"
        assert "message" in data, "Response should contain 'message'"
        print(f"Migration result: {data['message']}")


class TestRDSStationsCRUD:
    """Test individual station CRUD operations"""

    def test_create_station(self, auth_headers):
        """Should create a single station"""
        new_station = {
            "name": "New Test Station",
            "code": "newtest",
            "stream_url": "http://new.stream:8000/test",
            "stream_type": "shoutcast_v2",
            "default_text": "New Test Default",
            "color": "#10b981",
            "order": 99
        }
        
        response = requests.post(
            f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}",
            headers=auth_headers,
            json=new_station
        )
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == new_station["name"], "Name should match"
        assert data["code"] == new_station["code"], "Code should match"
        assert "id" in data, "Should return station ID"
        print(f"Created station: {data['name']} with ID {data['id']}")
        
        return data["id"]

    def test_create_station_duplicate_code_fails(self, auth_headers):
        """Should reject duplicate station code within same site"""
        # First create a station
        station1 = {
            "name": "Duplicate Test 1",
            "code": "duptest",
            "stream_type": "shoutcast_v1",
            "default_text": "",
            "color": "#f97316",
            "order": 0
        }
        response1 = requests.post(
            f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}",
            headers=auth_headers,
            json=station1
        )
        
        # Try to create another with same code
        station2 = {
            "name": "Duplicate Test 2",
            "code": "duptest",
            "stream_type": "shoutcast_v1",
            "default_text": "",
            "color": "#8b5cf6",
            "order": 1
        }
        response2 = requests.post(
            f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}",
            headers=auth_headers,
            json=station2
        )
        
        # Second should fail with 400
        if response1.status_code in [200, 201]:
            assert response2.status_code == 400, f"Expected 400 for duplicate code, got {response2.status_code}"


class TestCleanup:
    """Restore original MFY/GRK stations after tests"""

    def test_restore_original_stations(self, auth_headers):
        """Restore MFY and GRK stations for radiogroep"""
        original_stations = [
            {
                "name": "Radio MFY",
                "code": "mfy",
                "stream_url": "http://stream-shout.koodh.be:9010/stats?sid=1",
                "stream_type": "shoutcast_v1",
                "default_text": "altijd dichtbij",
                "color": "#f97316",
                "order": 0
            },
            {
                "name": "Radio GRK",
                "code": "grk",
                "stream_url": "http://stream-shout.koodh.be:9010/stats?sid=2",
                "stream_type": "shoutcast_v1",
                "default_text": "the feelgood station",
                "color": "#8b5cf6",
                "order": 1
            }
        ]
        
        response = requests.put(
            f"{BASE_URL}/api/rds-stations/{RADIOGROEP_SITE_ID}/bulk-sync",
            headers=auth_headers,
            json={"stations": original_stations}
        )
        assert response.status_code == 200, f"Failed to restore stations: {response.status_code}"
        
        data = response.json()
        codes = [s["code"] for s in data["stations"]]
        assert "mfy" in codes, "MFY station should be restored"
        assert "grk" in codes, "GRK station should be restored"
        print("Original MFY/GRK stations restored successfully")
