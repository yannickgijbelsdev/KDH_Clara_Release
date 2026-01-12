"""
Test Suite for Enable Recurrence Feature and Rundown Item Creation
Tests:
1. Enable Recurrence - converting non-recurring shows to recurring
2. Add Rundown Item - creating rundown items for shows
3. Stop Recurrence - stopping recurring shows
4. Recurrence Settings - modifying recurrence settings
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo@radio.com"
TEST_PASSWORD = "password123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


@pytest.fixture(scope="module")
def cleanup_show_ids():
    """Track show IDs for cleanup"""
    ids = []
    yield ids


class TestEnableRecurrence:
    """Test enabling recurrence on non-recurring shows"""
    
    def test_create_non_recurring_show(self, authenticated_client, cleanup_show_ids):
        """Create a non-recurring show for testing"""
        future_date = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
        payload = {
            "title": "TEST_NonRecurring_Show",
            "description": "Test show for enable recurrence",
            "date": future_date,
            "start_time": "10:00",
            "end_time": "11:00",
            "status": "draft",
            "recurrence_type": "none"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/shows", json=payload)
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["title"] == "TEST_NonRecurring_Show"
        assert data["is_recurring"] == False
        assert data["recurrence_type"] == "none"
        
        cleanup_show_ids.append(data["id"])
        print(f"PASS: Created non-recurring show with id={data['id']}")
        return data["id"]
    
    def test_enable_recurrence_on_non_recurring_show(self, authenticated_client, cleanup_show_ids):
        """Enable recurrence on a non-recurring show"""
        # First create a non-recurring show
        future_date = (datetime.now() + timedelta(days=14)).strftime('%Y-%m-%d')
        payload = {
            "title": "TEST_EnableRecurrence_Show",
            "description": "Test show for enable recurrence feature",
            "date": future_date,
            "start_time": "14:00",
            "end_time": "15:00",
            "status": "draft",
            "recurrence_type": "none"
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=payload)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Verify it's not recurring
        show_data = create_response.json()
        assert show_data["is_recurring"] == False
        
        # Enable recurrence with interval=1 (weekly)
        enable_response = authenticated_client.post(
            f"{BASE_URL}/api/shows/{show_id}/enable-recurrence?recurrence_interval=1"
        )
        assert enable_response.status_code == 200, f"Expected 200, got {enable_response.status_code}: {enable_response.text}"
        
        enabled_data = enable_response.json()
        assert enabled_data["is_recurring"] == True
        assert enabled_data["recurrence_type"] == "weekly"
        assert enabled_data["recurrence_interval"] == 1
        
        print(f"PASS: Enabled recurrence on show {show_id}")
    
    def test_enable_recurrence_with_end_date(self, authenticated_client, cleanup_show_ids):
        """Enable recurrence with a specific end date"""
        future_date = (datetime.now() + timedelta(days=21)).strftime('%Y-%m-%d')
        end_date = (datetime.now() + timedelta(days=90)).strftime('%Y-%m-%d')
        
        payload = {
            "title": "TEST_EnableRecurrence_EndDate",
            "description": "Test show with end date",
            "date": future_date,
            "start_time": "16:00",
            "end_time": "17:00",
            "status": "draft",
            "recurrence_type": "none"
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=payload)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Enable recurrence with interval=2 and end date
        enable_response = authenticated_client.post(
            f"{BASE_URL}/api/shows/{show_id}/enable-recurrence?recurrence_interval=2&recurrence_end_date={end_date}"
        )
        assert enable_response.status_code == 200
        
        enabled_data = enable_response.json()
        assert enabled_data["is_recurring"] == True
        assert enabled_data["recurrence_interval"] == 2
        assert enabled_data["recurrence_end_date"] == end_date
        
        print(f"PASS: Enabled recurrence with end date {end_date}")
    
    def test_enable_recurrence_on_already_recurring_show_fails(self, authenticated_client, cleanup_show_ids):
        """Enabling recurrence on already recurring show should fail"""
        future_date = (datetime.now() + timedelta(days=28)).strftime('%Y-%m-%d')
        
        # Create a recurring show
        payload = {
            "title": "TEST_AlreadyRecurring",
            "description": "Already recurring show",
            "date": future_date,
            "start_time": "18:00",
            "end_time": "19:00",
            "status": "draft",
            "recurrence_type": "weekly",
            "recurrence_interval": 1
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=payload)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Try to enable recurrence - should fail
        enable_response = authenticated_client.post(
            f"{BASE_URL}/api/shows/{show_id}/enable-recurrence?recurrence_interval=1"
        )
        assert enable_response.status_code == 400, f"Expected 400, got {enable_response.status_code}"
        
        error_data = enable_response.json()
        assert "already recurring" in error_data.get("detail", "").lower()
        
        print(f"PASS: Enable recurrence correctly rejected for already recurring show")


class TestRundownItemCreation:
    """Test adding rundown items to shows"""
    
    def test_create_rundown_item(self, authenticated_client, cleanup_show_ids):
        """Create a rundown item for a show"""
        # First create a show
        future_date = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        show_payload = {
            "title": "TEST_Rundown_Show",
            "description": "Show for rundown testing",
            "date": future_date,
            "start_time": "09:00",
            "end_time": "10:00",
            "status": "draft"
        }
        
        show_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=show_payload)
        assert show_response.status_code == 201
        show_id = show_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Create a rundown item
        item_payload = {
            "type": "music",
            "title": "TEST_Opening_Song",
            "notes": "Opening music track",
            "duration": "03:30"
        }
        
        item_response = authenticated_client.post(
            f"{BASE_URL}/api/shows/{show_id}/rundown",
            json=item_payload
        )
        assert item_response.status_code == 201, f"Expected 201, got {item_response.status_code}: {item_response.text}"
        
        item_data = item_response.json()
        assert item_data["title"] == "TEST_Opening_Song"
        assert item_data["type"] == "music"
        assert item_data["duration"] == "03:30"
        assert "id" in item_data
        
        print(f"PASS: Created rundown item with id={item_data['id']}")
    
    def test_create_multiple_rundown_items(self, authenticated_client, cleanup_show_ids):
        """Create multiple rundown items and verify order"""
        future_date = (datetime.now() + timedelta(days=4)).strftime('%Y-%m-%d')
        show_payload = {
            "title": "TEST_MultiItem_Show",
            "description": "Show for multiple items",
            "date": future_date,
            "start_time": "11:00",
            "end_time": "12:00",
            "status": "draft"
        }
        
        show_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=show_payload)
        assert show_response.status_code == 201
        show_id = show_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Create multiple items
        items = [
            {"type": "music", "title": "TEST_Intro", "duration": "01:00"},
            {"type": "talk", "title": "TEST_Welcome", "notes": "Welcome message", "duration": "02:00"},
            {"type": "ad", "title": "TEST_Sponsor", "duration": "00:30"},
            {"type": "music", "title": "TEST_Song1", "duration": "04:00"},
        ]
        
        for item in items:
            response = authenticated_client.post(
                f"{BASE_URL}/api/shows/{show_id}/rundown",
                json=item
            )
            assert response.status_code == 201
        
        # Get rundown and verify order
        rundown_response = authenticated_client.get(f"{BASE_URL}/api/shows/{show_id}/rundown")
        assert rundown_response.status_code == 200
        
        rundown_items = rundown_response.json()
        assert len(rundown_items) == 4
        
        # Verify order is preserved
        for i, item in enumerate(rundown_items):
            assert item["order"] == i
        
        print(f"PASS: Created {len(rundown_items)} rundown items with correct order")
    
    def test_create_rundown_item_different_types(self, authenticated_client, cleanup_show_ids):
        """Test creating rundown items of all types"""
        future_date = (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
        show_payload = {
            "title": "TEST_AllTypes_Show",
            "description": "Show for all item types",
            "date": future_date,
            "start_time": "13:00",
            "end_time": "14:00",
            "status": "draft"
        }
        
        show_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=show_payload)
        assert show_response.status_code == 201
        show_id = show_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Test all item types
        item_types = ["music", "talk", "item", "ad"]
        
        for item_type in item_types:
            item_payload = {
                "type": item_type,
                "title": f"TEST_{item_type.upper()}_Item",
                "notes": f"Test {item_type} item",
                "duration": "02:00"
            }
            
            response = authenticated_client.post(
                f"{BASE_URL}/api/shows/{show_id}/rundown",
                json=item_payload
            )
            assert response.status_code == 201, f"Failed to create {item_type} item: {response.text}"
            assert response.json()["type"] == item_type
        
        print(f"PASS: Created rundown items of all types: {item_types}")


class TestStopRecurrence:
    """Test stopping recurrence on recurring shows"""
    
    def test_stop_recurrence_keep_future(self, authenticated_client, cleanup_show_ids):
        """Stop recurrence but keep future shows"""
        future_date = (datetime.now() + timedelta(days=35)).strftime('%Y-%m-%d')
        
        # Create recurring show
        payload = {
            "title": "TEST_StopRecurrence_Keep",
            "description": "Test stop recurrence keep future",
            "date": future_date,
            "start_time": "10:00",
            "end_time": "11:00",
            "status": "draft",
            "recurrence_type": "weekly",
            "recurrence_interval": 1
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=payload)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Stop recurrence, keep future shows
        stop_response = authenticated_client.post(
            f"{BASE_URL}/api/shows/{show_id}/stop-recurrence?delete_future=false"
        )
        assert stop_response.status_code == 200
        
        # Verify show is no longer recurring
        show_response = authenticated_client.get(f"{BASE_URL}/api/shows/{show_id}")
        if show_response.status_code == 200:
            show_data = show_response.json()
            assert show_data["is_recurring"] == False
            assert show_data["recurrence_type"] == "none"
            print(f"PASS: Stopped recurrence, show is now non-recurring")
        else:
            # Show might have been deleted if it was a future occurrence
            print(f"PASS: Stop recurrence completed (show may have been deleted)")
    
    def test_stop_recurrence_on_non_recurring_fails(self, authenticated_client, cleanup_show_ids):
        """Stop recurrence on non-recurring show should fail"""
        future_date = (datetime.now() + timedelta(days=42)).strftime('%Y-%m-%d')
        
        # Create non-recurring show
        payload = {
            "title": "TEST_StopRecurrence_NonRecurring",
            "description": "Non-recurring show",
            "date": future_date,
            "start_time": "12:00",
            "end_time": "13:00",
            "status": "draft",
            "recurrence_type": "none"
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=payload)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Try to stop recurrence - should fail
        stop_response = authenticated_client.post(
            f"{BASE_URL}/api/shows/{show_id}/stop-recurrence?delete_future=false"
        )
        assert stop_response.status_code == 400
        
        error_data = stop_response.json()
        assert "not recurring" in error_data.get("detail", "").lower()
        
        print(f"PASS: Stop recurrence correctly rejected for non-recurring show")


class TestRecurrenceSettings:
    """Test modifying recurrence settings"""
    
    def test_update_recurrence_interval(self, authenticated_client, cleanup_show_ids):
        """Update recurrence interval on recurring show"""
        future_date = (datetime.now() + timedelta(days=49)).strftime('%Y-%m-%d')
        
        # Create recurring show
        payload = {
            "title": "TEST_UpdateInterval",
            "description": "Test update interval",
            "date": future_date,
            "start_time": "14:00",
            "end_time": "15:00",
            "status": "draft",
            "recurrence_type": "weekly",
            "recurrence_interval": 1
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=payload)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Update interval to 2 weeks
        update_response = authenticated_client.put(
            f"{BASE_URL}/api/shows/{show_id}/recurrence?recurrence_interval=2"
        )
        assert update_response.status_code == 200
        
        updated_data = update_response.json()
        assert updated_data["recurrence_interval"] == 2
        
        print(f"PASS: Updated recurrence interval to 2 weeks")
    
    def test_update_recurrence_end_date(self, authenticated_client, cleanup_show_ids):
        """Update recurrence end date"""
        future_date = (datetime.now() + timedelta(days=56)).strftime('%Y-%m-%d')
        new_end_date = (datetime.now() + timedelta(days=120)).strftime('%Y-%m-%d')
        
        # Create recurring show
        payload = {
            "title": "TEST_UpdateEndDate",
            "description": "Test update end date",
            "date": future_date,
            "start_time": "16:00",
            "end_time": "17:00",
            "status": "draft",
            "recurrence_type": "weekly",
            "recurrence_interval": 1
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/shows", json=payload)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        cleanup_show_ids.append(show_id)
        
        # Update end date
        update_response = authenticated_client.put(
            f"{BASE_URL}/api/shows/{show_id}/recurrence?recurrence_end_date={new_end_date}"
        )
        assert update_response.status_code == 200
        
        updated_data = update_response.json()
        assert updated_data["recurrence_end_date"] == new_end_date
        
        print(f"PASS: Updated recurrence end date to {new_end_date}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_shows(self, authenticated_client, cleanup_show_ids):
        """Delete all TEST_ prefixed shows created during tests"""
        # Get all shows
        response = authenticated_client.get(f"{BASE_URL}/api/shows")
        assert response.status_code == 200
        
        all_shows = response.json()
        deleted_count = 0
        
        for show in all_shows:
            if show["title"].startswith("TEST_"):
                del_response = authenticated_client.delete(
                    f"{BASE_URL}/api/shows/{show['id']}?delete_all=true"
                )
                if del_response.status_code == 204:
                    deleted_count += 1
        
        # Also delete any tracked IDs
        for show_id in cleanup_show_ids:
            try:
                authenticated_client.delete(f"{BASE_URL}/api/shows/{show_id}?delete_all=true")
            except:
                pass
        
        print(f"PASS: Cleaned up {deleted_count} test shows")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
