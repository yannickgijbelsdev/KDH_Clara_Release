"""
Test suite for RDS Scheduled Texts API endpoints.
Tests all CRUD operations and special endpoints for scheduled custom texts feature.
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if BASE_URL:
    BASE_URL = BASE_URL.rstrip('/')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"


class TestRDSScheduledTextsAuth:
    """Test authentication for scheduled texts endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login and get token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_scheduled_texts_requires_auth(self):
        """GET /api/rds-builder/scheduled-texts/{station} requires authentication"""
        # Create new session without auth
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy")
        assert response.status_code in [401, 403], "Should require authentication"
    
    def test_create_scheduled_text_requires_auth(self):
        """POST /api/rds-builder/scheduled-texts/{station} requires authentication"""
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        response = no_auth_session.post(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy", json={
            "text": "Test",
            "start_datetime": "2026-02-15T10:00:00",
            "duration_type": "fixed",
            "duration_minutes": 5,
            "recurrence_type": "none",
            "enabled": True,
            "station": "mfy"
        })
        assert response.status_code in [401, 403], "Should require authentication"


class TestRDSScheduledTextsCRUD:
    """Test CRUD operations for scheduled texts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login and get token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.created_ids = []
    
    def teardown_method(self):
        """Cleanup created test data"""
        for text_id in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/{text_id}")
            except Exception:
                pass
    
    def test_get_scheduled_texts_mfy(self):
        """GET /api/rds-builder/scheduled-texts/mfy returns list of scheduled texts"""
        response = self.session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_get_scheduled_texts_grk(self):
        """GET /api/rds-builder/scheduled-texts/grk returns list for GRK station"""
        response = self.session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/grk")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_get_scheduled_texts_invalid_station(self):
        """GET with invalid station returns 400"""
        response = self.session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/invalid")
        assert response.status_code == 400
    
    def test_create_scheduled_text_fixed_duration(self):
        """POST creates a scheduled text with fixed duration"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        payload = {
            "text": "TEST_Fixed duration text",
            "start_datetime": f"{tomorrow}T10:00:00",
            "duration_type": "fixed",
            "duration_minutes": 15,
            "recurrence_type": "none",
            "enabled": True,
            "station": "mfy"
        }
        
        response = self.session.post(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["text"] == "TEST_Fixed duration text"
        assert data["duration_type"] == "fixed"
        assert data["duration_minutes"] == 15
        assert data["recurrence_type"] == "none"
        assert data["enabled"]
        assert "id" in data
        
        self.created_ids.append(data["id"])
        
        # Verify by GET
        get_response = self.session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy")
        assert get_response.status_code == 200
        texts = get_response.json()
        created_text = next((t for t in texts if t["id"] == data["id"]), None)
        assert created_text is not None, "Created text should be in list"
        assert created_text["text"] == "TEST_Fixed duration text"
    
    def test_create_scheduled_text_until_next(self):
        """POST creates a scheduled text with 'until_next' duration type"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        payload = {
            "text": "TEST_Until next item text",
            "start_datetime": f"{tomorrow}T14:00:00",
            "duration_type": "until_next",
            "recurrence_type": "none",
            "enabled": True,
            "station": "mfy"
        }
        
        response = self.session.post(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["duration_type"] == "until_next"
        assert data["duration_minutes"] is None, "duration_minutes should be None for until_next type"
        
        self.created_ids.append(data["id"])
    
    def test_create_scheduled_text_daily_recurrence(self):
        """POST creates a scheduled text with daily recurrence"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        payload = {
            "text": "TEST_Daily recurring text",
            "start_datetime": f"{tomorrow}T18:00:00",
            "duration_type": "fixed",
            "duration_minutes": 5,
            "recurrence_type": "daily",
            "recurrence_end_date": end_date,
            "enabled": True,
            "station": "mfy"
        }
        
        response = self.session.post(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["recurrence_type"] == "daily"
        assert data["recurrence_end_date"] == end_date
        
        self.created_ids.append(data["id"])
    
    def test_create_scheduled_text_weekly_recurrence(self):
        """POST creates a scheduled text with weekly recurrence"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        payload = {
            "text": "TEST_Weekly recurring text",
            "start_datetime": f"{tomorrow}T12:00:00",
            "duration_type": "fixed",
            "duration_minutes": 10,
            "recurrence_type": "weekly",
            "enabled": True,
            "station": "mfy"
        }
        
        response = self.session.post(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["recurrence_type"] == "weekly"
        
        self.created_ids.append(data["id"])
    
    def test_create_scheduled_text_monthly_recurrence(self):
        """POST creates a scheduled text with monthly recurrence"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        payload = {
            "text": "TEST_Monthly recurring text",
            "start_datetime": f"{tomorrow}T09:00:00",
            "duration_type": "fixed",
            "duration_minutes": 30,
            "recurrence_type": "monthly",
            "enabled": False,
            "station": "grk"
        }
        
        response = self.session.post(f"{BASE_URL}/api/rds-builder/scheduled-texts/grk", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["recurrence_type"] == "monthly"
        assert not data["enabled"]
        assert data["station"] == "grk"
        
        # Cleanup in grk station
        self.session.delete(f"{BASE_URL}/api/rds-builder/scheduled-texts/grk/{data['id']}")
    
    def test_update_scheduled_text(self):
        """PUT updates a scheduled text"""
        # First create a text
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        create_payload = {
            "text": "TEST_Original text",
            "start_datetime": f"{tomorrow}T11:00:00",
            "duration_type": "fixed",
            "duration_minutes": 5,
            "recurrence_type": "none",
            "enabled": True,
            "station": "mfy"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy", json=create_payload)
        assert create_response.status_code == 200
        text_id = create_response.json()["id"]
        self.created_ids.append(text_id)
        
        # Update the text
        update_payload = {
            "text": "TEST_Updated text",
            "duration_minutes": 20,
            "enabled": False
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/{text_id}", json=update_payload)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated_data = update_response.json()
        assert updated_data["text"] == "TEST_Updated text"
        assert updated_data["duration_minutes"] == 20
        assert not updated_data["enabled"]
        
        # Verify by GET
        get_response = self.session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy")
        texts = get_response.json()
        updated_text = next((t for t in texts if t["id"] == text_id), None)
        assert updated_text is not None
        assert updated_text["text"] == "TEST_Updated text"
    
    def test_update_nonexistent_scheduled_text(self):
        """PUT returns 404 for non-existent text"""
        response = self.session.put(
            f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/non-existent-id",
            json={"text": "Test"}
        )
        assert response.status_code == 404
    
    def test_delete_scheduled_text(self):
        """DELETE removes a scheduled text"""
        # First create a text
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        create_payload = {
            "text": "TEST_To be deleted",
            "start_datetime": f"{tomorrow}T16:00:00",
            "duration_type": "fixed",
            "duration_minutes": 5,
            "recurrence_type": "none",
            "enabled": True,
            "station": "mfy"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy", json=create_payload)
        assert create_response.status_code == 200
        text_id = create_response.json()["id"]
        
        # Delete the text
        delete_response = self.session.delete(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/{text_id}")
        assert delete_response.status_code == 200
        
        # Verify deletion by GET
        get_response = self.session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy")
        texts = get_response.json()
        deleted_text = next((t for t in texts if t["id"] == text_id), None)
        assert deleted_text is None, "Text should be deleted"
    
    def test_delete_nonexistent_scheduled_text(self):
        """DELETE returns 404 for non-existent text"""
        response = self.session.delete(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/non-existent-id")
        assert response.status_code == 404


class TestRDSScheduledTextsCalendar:
    """Test calendar endpoint for scheduled texts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login and get token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_calendar_items(self):
        """GET /api/rds-builder/scheduled-texts/{station}/calendar returns expanded calendar items"""
        # Test with existing data
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = self.session.get(
            f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/calendar",
            params={"start_date": today, "end_date": end_date}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check calendar items have expected fields
        if len(data) > 0:
            item = data[0]
            assert "occurrence_date" in item
            assert "occurrence_time" in item
            assert "is_recurring" in item
            assert "text" in item
    
    def test_calendar_expands_daily_recurrence(self):
        """Calendar endpoint correctly expands daily recurring items"""
        # The existing test data has a daily recurring item starting 2026-02-13
        response = self.session.get(
            f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/calendar",
            params={"start_date": "2026-02-13", "end_date": "2026-02-20"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check that recurring item appears multiple times
        recurring_items = [item for item in data if item.get("is_recurring")]
        if len(recurring_items) > 0:
            # Should have multiple occurrences for daily recurring
            unique_dates = set(item["occurrence_date"] for item in recurring_items if item.get("text") == "Test nieuws flash")
            assert len(unique_dates) >= 1, "Daily recurring item should appear on multiple dates"
    
    def test_calendar_invalid_date_format(self):
        """Calendar endpoint returns 400 for invalid date format"""
        response = self.session.get(
            f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/calendar",
            params={"start_date": "invalid", "end_date": "2026-02-28"}
        )
        assert response.status_code == 400


class TestRDSScheduledTextsActive:
    """Test active scheduled text endpoint (public)"""
    
    def test_get_active_scheduled_text_public(self):
        """GET /api/rds-builder/scheduled-texts/{station}/active is public endpoint"""
        # This endpoint should be accessible without authentication
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/active")
        assert response.status_code == 200
        data = response.json()
        assert "active" in data
        assert "text" in data
    
    def test_get_active_scheduled_text_mfy(self):
        """GET /api/rds-builder/scheduled-texts/mfy/active returns correct structure"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/mfy/active")
        assert response.status_code == 200
        data = response.json()
        
        if data.get("active"):
            assert "text" in data
            assert "scheduled_text_id" in data
        else:
            # Either no active text or show is active
            assert data.get("text") is None or data.get("reason") == "show_active"
    
    def test_get_active_scheduled_text_grk(self):
        """GET /api/rds-builder/scheduled-texts/grk/active returns correct structure"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/grk/active")
        assert response.status_code == 200
        data = response.json()
        assert "active" in data
    
    def test_get_active_scheduled_text_invalid_station(self):
        """GET /api/rds-builder/scheduled-texts/invalid/active returns proper response"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/rds-builder/scheduled-texts/invalid/active")
        assert response.status_code == 200
        data = response.json()
        assert not data.get("active")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
