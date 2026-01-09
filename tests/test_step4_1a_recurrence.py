"""
Test Suite for Step 4.1a - Enhanced Recurrence Pattern for ShowSeries
Tests the new recurrence fields: start_date, end_date, interval_weeks, days_of_week
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
def cleanup_series_ids():
    """Track series IDs for cleanup"""
    ids = []
    yield ids
    # Cleanup happens in test_cleanup_test_series


class TestAuthAndBasicEndpoints:
    """Basic authentication and endpoint tests"""
    
    def test_login_success(self, api_client):
        """Test login with valid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"PASS: Login successful for {TEST_EMAIL}")
    
    def test_get_series_list(self, authenticated_client):
        """Test GET /api/series returns list"""
        response = authenticated_client.get(f"{BASE_URL}/api/series")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/series returned {len(data)} series")


class TestSeriesCreateWithNewFields:
    """Test creating series with new recurrence fields"""
    
    def test_create_series_with_days_of_week(self, authenticated_client, cleanup_series_ids):
        """Create series with Mon/Thu selected (days_of_week: [0, 3])"""
        today = datetime.now().strftime('%Y-%m-%d')
        payload = {
            "title": "TEST_MonThu_Series",
            "description": "Test series for Mon/Thu",
            "default_start_time": "09:00",
            "default_end_time": "10:00",
            "is_active": True,
            "recurrence_type": "weekly",
            "start_date": today,
            "end_date": None,
            "interval_weeks": 1,
            "days_of_week": [0, 3]  # Monday and Thursday
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/series", json=payload)
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["title"] == "TEST_MonThu_Series"
        assert data["days_of_week"] == [0, 3]
        assert data["interval_weeks"] == 1
        assert data["start_date"] == today
        assert data["recurrence_type"] == "weekly"
        
        cleanup_series_ids.append(data["id"])
        print(f"PASS: Created series with days_of_week=[0,3] (Mon/Thu)")
        return data["id"]
    
    def test_create_series_with_interval_2_weeks(self, authenticated_client, cleanup_series_ids):
        """Create series with interval_weeks=2 (every 2 weeks)"""
        today = datetime.now().strftime('%Y-%m-%d')
        payload = {
            "title": "TEST_BiWeekly_Series",
            "description": "Test series every 2 weeks",
            "default_start_time": "14:00",
            "default_end_time": "15:00",
            "is_active": True,
            "recurrence_type": "weekly",
            "start_date": today,
            "end_date": None,
            "interval_weeks": 2,
            "days_of_week": [2]  # Wednesday only
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/series", json=payload)
        assert response.status_code == 201
        
        data = response.json()
        assert data["interval_weeks"] == 2
        assert data["days_of_week"] == [2]
        
        cleanup_series_ids.append(data["id"])
        print(f"PASS: Created series with interval_weeks=2")
        return data["id"]
    
    def test_create_series_with_end_date(self, authenticated_client, cleanup_series_ids):
        """Create series with end_date set"""
        today = datetime.now()
        start_date = today.strftime('%Y-%m-%d')
        end_date = (today + timedelta(weeks=4)).strftime('%Y-%m-%d')
        
        payload = {
            "title": "TEST_EndDate_Series",
            "description": "Test series with end date",
            "default_start_time": "10:00",
            "default_end_time": "11:00",
            "is_active": True,
            "recurrence_type": "weekly",
            "start_date": start_date,
            "end_date": end_date,
            "interval_weeks": 1,
            "days_of_week": [4]  # Friday only
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/series", json=payload)
        assert response.status_code == 201
        
        data = response.json()
        assert data["end_date"] == end_date
        assert data["start_date"] == start_date
        
        cleanup_series_ids.append(data["id"])
        print(f"PASS: Created series with end_date={end_date}")
        return data["id"]
    
    def test_create_series_one_off(self, authenticated_client, cleanup_series_ids):
        """Create one-off series (recurrence_type='none')"""
        today = datetime.now().strftime('%Y-%m-%d')
        payload = {
            "title": "TEST_OneOff_Series",
            "description": "One-off show",
            "default_start_time": "18:00",
            "default_end_time": "19:00",
            "is_active": True,
            "recurrence_type": "none",
            "start_date": today,
            "end_date": None,
            "interval_weeks": 1,
            "days_of_week": []
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/series", json=payload)
        assert response.status_code == 201
        
        data = response.json()
        assert data["recurrence_type"] == "none"
        
        cleanup_series_ids.append(data["id"])
        print(f"PASS: Created one-off series")
        return data["id"]


class TestGenerateOccurrencesWithNewFields:
    """Test occurrence generation with new recurrence fields"""
    
    def test_generate_occurrences_mon_thu(self, authenticated_client, cleanup_series_ids):
        """Generate occurrences for Mon/Thu series - verify only Mon/Thu dates"""
        today = datetime.now()
        start_date = today.strftime('%Y-%m-%d')
        
        # Create series with Mon/Thu
        payload = {
            "title": "TEST_Generate_MonThu",
            "description": "Test generation Mon/Thu",
            "default_start_time": "09:00",
            "default_end_time": "10:00",
            "is_active": True,
            "recurrence_type": "weekly",
            "start_date": start_date,
            "end_date": None,
            "interval_weeks": 1,
            "days_of_week": [0, 3]  # Monday=0, Thursday=3
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/series", json=payload)
        assert create_response.status_code == 201
        series_id = create_response.json()["id"]
        cleanup_series_ids.append(series_id)
        
        # Generate occurrences for 4 weeks
        gen_response = authenticated_client.post(
            f"{BASE_URL}/api/series/{series_id}/generate",
            json={"weeks_ahead": 4}
        )
        assert gen_response.status_code == 200
        
        occurrences = gen_response.json()
        assert len(occurrences) > 0, "Expected at least one occurrence"
        
        # Verify all occurrences are on Monday (0) or Thursday (3)
        for occ in occurrences:
            occ_date = datetime.strptime(occ["date"], '%Y-%m-%d')
            weekday = occ_date.weekday()
            assert weekday in [0, 3], f"Occurrence on {occ['date']} is weekday {weekday}, expected 0 (Mon) or 3 (Thu)"
        
        print(f"PASS: Generated {len(occurrences)} occurrences, all on Mon/Thu")
    
    def test_generate_occurrences_interval_2_weeks(self, authenticated_client, cleanup_series_ids):
        """Generate occurrences with interval_weeks=2 - verify alternate weeks skipped"""
        today = datetime.now()
        # Start from next Monday to have predictable dates
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        start_date = (today + timedelta(days=days_until_monday)).strftime('%Y-%m-%d')
        
        # Create series with every 2 weeks on Monday
        payload = {
            "title": "TEST_Generate_BiWeekly",
            "description": "Test bi-weekly generation",
            "default_start_time": "14:00",
            "default_end_time": "15:00",
            "is_active": True,
            "recurrence_type": "weekly",
            "start_date": start_date,
            "end_date": None,
            "interval_weeks": 2,
            "days_of_week": [0]  # Monday only
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/series", json=payload)
        assert create_response.status_code == 201
        series_id = create_response.json()["id"]
        cleanup_series_ids.append(series_id)
        
        # Generate occurrences for 8 weeks
        gen_response = authenticated_client.post(
            f"{BASE_URL}/api/series/{series_id}/generate",
            json={"weeks_ahead": 8}
        )
        assert gen_response.status_code == 200
        
        occurrences = gen_response.json()
        
        # With 8 weeks and interval=2, we expect ~4 occurrences
        # (could be 3-5 depending on start date alignment)
        assert len(occurrences) >= 2, f"Expected at least 2 occurrences for 8 weeks with interval=2, got {len(occurrences)}"
        assert len(occurrences) <= 5, f"Expected at most 5 occurrences for 8 weeks with interval=2, got {len(occurrences)}"
        
        # Verify dates are 2 weeks apart
        if len(occurrences) >= 2:
            dates = sorted([datetime.strptime(occ["date"], '%Y-%m-%d') for occ in occurrences])
            for i in range(1, len(dates)):
                diff = (dates[i] - dates[i-1]).days
                assert diff == 14, f"Expected 14 days between occurrences, got {diff}"
        
        print(f"PASS: Generated {len(occurrences)} occurrences with 2-week interval")
    
    def test_generate_occurrences_with_end_date(self, authenticated_client, cleanup_series_ids):
        """Generate occurrences with end_date - verify no occurrences after end date"""
        today = datetime.now()
        start_date = today.strftime('%Y-%m-%d')
        end_date = (today + timedelta(weeks=2)).strftime('%Y-%m-%d')
        
        # Create series with end date
        payload = {
            "title": "TEST_Generate_EndDate",
            "description": "Test generation with end date",
            "default_start_time": "10:00",
            "default_end_time": "11:00",
            "is_active": True,
            "recurrence_type": "weekly",
            "start_date": start_date,
            "end_date": end_date,
            "interval_weeks": 1,
            "days_of_week": [0, 1, 2, 3, 4]  # Mon-Fri
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/series", json=payload)
        assert create_response.status_code == 201
        series_id = create_response.json()["id"]
        cleanup_series_ids.append(series_id)
        
        # Generate occurrences for 8 weeks (but should stop at end_date)
        gen_response = authenticated_client.post(
            f"{BASE_URL}/api/series/{series_id}/generate",
            json={"weeks_ahead": 8}
        )
        assert gen_response.status_code == 200
        
        occurrences = gen_response.json()
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Verify no occurrences after end_date
        for occ in occurrences:
            occ_date = datetime.strptime(occ["date"], '%Y-%m-%d')
            assert occ_date <= end_date_obj, f"Occurrence {occ['date']} is after end_date {end_date}"
        
        print(f"PASS: Generated {len(occurrences)} occurrences, all before end_date {end_date}")
    
    def test_generate_occurrences_one_off(self, authenticated_client, cleanup_series_ids):
        """Generate occurrences for one-off series - should return only start date"""
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create one-off series
        payload = {
            "title": "TEST_Generate_OneOff",
            "description": "One-off show generation",
            "default_start_time": "18:00",
            "default_end_time": "19:00",
            "is_active": True,
            "recurrence_type": "none",
            "start_date": today,
            "end_date": None,
            "interval_weeks": 1,
            "days_of_week": []
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/series", json=payload)
        assert create_response.status_code == 201
        series_id = create_response.json()["id"]
        cleanup_series_ids.append(series_id)
        
        # Generate occurrences
        gen_response = authenticated_client.post(
            f"{BASE_URL}/api/series/{series_id}/generate",
            json={"weeks_ahead": 4}
        )
        assert gen_response.status_code == 200
        
        occurrences = gen_response.json()
        assert len(occurrences) == 1, f"Expected 1 occurrence for one-off, got {len(occurrences)}"
        assert occurrences[0]["date"] == today
        
        print(f"PASS: One-off series generated exactly 1 occurrence on {today}")


class TestBackwardCompatibility:
    """Test that legacy series without new fields still work"""
    
    def test_legacy_series_with_rrule(self, authenticated_client, cleanup_series_ids):
        """Create series with legacy recurrence_rule (RRULE) - should still work"""
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create series with legacy RRULE format
        payload = {
            "title": "TEST_Legacy_RRULE",
            "description": "Legacy RRULE series",
            "default_start_time": "08:00",
            "default_end_time": "09:00",
            "is_active": True,
            "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO,WE,FR"
            # No new fields - should fall back to RRULE parsing
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/series", json=payload)
        assert create_response.status_code == 201
        series_id = create_response.json()["id"]
        cleanup_series_ids.append(series_id)
        
        # Generate occurrences - should use legacy RRULE parsing
        gen_response = authenticated_client.post(
            f"{BASE_URL}/api/series/{series_id}/generate",
            json={"weeks_ahead": 2}
        )
        assert gen_response.status_code == 200
        
        occurrences = gen_response.json()
        assert len(occurrences) > 0, "Expected occurrences from legacy RRULE"
        
        # Verify occurrences are on Mon(0), Wed(2), Fri(4)
        for occ in occurrences:
            occ_date = datetime.strptime(occ["date"], '%Y-%m-%d')
            weekday = occ_date.weekday()
            assert weekday in [0, 2, 4], f"Legacy RRULE occurrence on {occ['date']} is weekday {weekday}"
        
        print(f"PASS: Legacy RRULE series generated {len(occurrences)} occurrences")


class TestSeriesUpdateWithNewFields:
    """Test updating series with new recurrence fields"""
    
    def test_update_series_days_of_week(self, authenticated_client, cleanup_series_ids):
        """Update series days_of_week"""
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create series
        create_payload = {
            "title": "TEST_Update_Days",
            "description": "Test update days",
            "default_start_time": "09:00",
            "default_end_time": "10:00",
            "is_active": True,
            "recurrence_type": "weekly",
            "start_date": today,
            "interval_weeks": 1,
            "days_of_week": [0]  # Monday only
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/series", json=create_payload)
        assert create_response.status_code == 201
        series_id = create_response.json()["id"]
        cleanup_series_ids.append(series_id)
        
        # Update to Mon/Wed/Fri
        update_payload = {
            "days_of_week": [0, 2, 4]
        }
        
        update_response = authenticated_client.put(
            f"{BASE_URL}/api/series/{series_id}",
            json=update_payload
        )
        assert update_response.status_code == 200
        
        data = update_response.json()
        assert data["days_of_week"] == [0, 2, 4]
        
        print(f"PASS: Updated series days_of_week to [0, 2, 4]")
    
    def test_update_series_interval(self, authenticated_client, cleanup_series_ids):
        """Update series interval_weeks"""
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create series
        create_payload = {
            "title": "TEST_Update_Interval",
            "description": "Test update interval",
            "default_start_time": "09:00",
            "default_end_time": "10:00",
            "is_active": True,
            "recurrence_type": "weekly",
            "start_date": today,
            "interval_weeks": 1,
            "days_of_week": [0]
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/series", json=create_payload)
        assert create_response.status_code == 201
        series_id = create_response.json()["id"]
        cleanup_series_ids.append(series_id)
        
        # Update interval to 3 weeks
        update_payload = {
            "interval_weeks": 3
        }
        
        update_response = authenticated_client.put(
            f"{BASE_URL}/api/series/{series_id}",
            json=update_payload
        )
        assert update_response.status_code == 200
        
        data = update_response.json()
        assert data["interval_weeks"] == 3
        
        print(f"PASS: Updated series interval_weeks to 3")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_series(self, authenticated_client, cleanup_series_ids):
        """Delete all TEST_ prefixed series created during tests"""
        # Get all series
        response = authenticated_client.get(f"{BASE_URL}/api/series")
        assert response.status_code == 200
        
        all_series = response.json()
        deleted_count = 0
        
        for s in all_series:
            if s["title"].startswith("TEST_"):
                del_response = authenticated_client.delete(f"{BASE_URL}/api/series/{s['id']}")
                if del_response.status_code == 204:
                    deleted_count += 1
        
        # Also delete any tracked IDs
        for series_id in cleanup_series_ids:
            try:
                authenticated_client.delete(f"{BASE_URL}/api/series/{series_id}")
            except:
                pass
        
        print(f"PASS: Cleaned up {deleted_count} test series")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
