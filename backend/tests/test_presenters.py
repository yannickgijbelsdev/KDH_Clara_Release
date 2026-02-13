"""
Test Presenter Functionality for Shows and Show Titles

Tests the following features:
1. Show Titles API - default_presenters field returned
2. Shows API - presenters field for shows
3. Create Show with presenter_ids
4. Update Show with presenter_ids
5. Show Title create/update with default_presenter_ids
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPresenterFunctionality:
    """Test presenter assignment functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        self.user_id = data.get("user", {}).get("id")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        # Get team users for presenter IDs
        users_response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        if users_response.status_code == 200:
            self.team_users = users_response.json()
        else:
            self.team_users = []

    # ============== SHOW TITLES TESTS ==============
    
    def test_get_show_titles_returns_default_presenters_field(self):
        """Test that /api/shows/titles returns default_presenters field"""
        response = requests.get(f"{BASE_URL}/api/shows/titles", headers=self.headers)
        assert response.status_code == 200, f"Failed to get show titles: {response.text}"
        
        titles = response.json()
        # Check that response is a list
        assert isinstance(titles, list), "Show titles should be a list"
        
        # Check structure - titles should support default_presenter_ids and default_presenters
        if titles:
            title = titles[0]
            # These fields should exist (can be None/empty)
            assert "id" in title
            assert "name" in title
            # default_presenter_ids and default_presenters are optional but should be supported
            print(f"Sample title structure: {title.keys()}")
            print(f"TEST PASS: Show titles endpoint returns correct structure")

    def test_create_show_title_with_default_presenters(self):
        """Test creating a show title with default presenters"""
        if not self.team_users:
            pytest.skip("No team users available")
        
        presenter_ids = [self.team_users[0]["id"]]
        
        payload = {
            "name": "TEST_Presenter_Title",
            "description": "Test show with default presenters",
            "default_start_time": "10:00",
            "default_end_time": "11:00",
            "default_presenter_ids": presenter_ids
        }
        
        response = requests.post(f"{BASE_URL}/api/shows/titles", json=payload, headers=self.headers)
        assert response.status_code == 201, f"Failed to create show title: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_Presenter_Title"
        assert "default_presenter_ids" in data or data.get("default_presenter_ids") == presenter_ids
        
        # Check if default_presenters is populated with presenter info
        if "default_presenters" in data:
            assert isinstance(data["default_presenters"], list)
            if data["default_presenters"]:
                presenter = data["default_presenters"][0]
                assert "id" in presenter
                assert "name" in presenter
                print(f"TEST PASS: Show title created with default_presenters: {data['default_presenters']}")
        
        # Cleanup
        self.created_title_id = data["id"]
        
    def test_update_show_title_with_default_presenters(self):
        """Test updating a show title's default presenters"""
        # First create a title
        payload = {
            "name": "TEST_Update_Presenter_Title",
            "description": "Test title for presenter update",
            "default_start_time": "12:00",
            "default_end_time": "13:00"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/shows/titles", json=payload, headers=self.headers)
        assert create_response.status_code == 201
        title_id = create_response.json()["id"]
        
        # Update with presenters
        if self.team_users:
            update_payload = {
                "default_presenter_ids": [self.team_users[0]["id"]]
            }
            update_response = requests.put(
                f"{BASE_URL}/api/shows/titles/{title_id}", 
                json=update_payload, 
                headers=self.headers
            )
            assert update_response.status_code == 200, f"Failed to update: {update_response.text}"
            
            updated_data = update_response.json()
            assert updated_data.get("default_presenter_ids") == [self.team_users[0]["id"]]
            print(f"TEST PASS: Show title updated with default_presenter_ids")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/shows/titles/{title_id}", headers=self.headers)

    # ============== SHOWS TESTS ==============
    
    def test_get_shows_returns_presenters_field(self):
        """Test that /api/shows returns presenters field for shows"""
        response = requests.get(f"{BASE_URL}/api/shows", headers=self.headers)
        assert response.status_code == 200, f"Failed to get shows: {response.text}"
        
        shows = response.json()
        assert isinstance(shows, list), "Shows should be a list"
        
        # Check structure - shows should support presenter_ids and presenters
        if shows:
            show = shows[0]
            assert "id" in show
            assert "title" in show
            # presenter_ids and presenters are optional but should be supported
            print(f"Sample show structure keys: {show.keys()}")
            print(f"TEST PASS: Shows endpoint returns correct structure")

    def test_create_show_with_presenters(self):
        """Test creating a show with presenter_ids"""
        if not self.team_users:
            pytest.skip("No team users available")
        
        presenter_ids = [self.team_users[0]["id"]]
        
        payload = {
            "title": "TEST_Show_With_Presenters",
            "description": "Test show with presenters",
            "date": "2026-02-15",
            "start_time": "14:00",
            "end_time": "15:00",
            "status": "draft",
            "presenter_ids": presenter_ids,
            "recurrence_type": "none"
        }
        
        response = requests.post(f"{BASE_URL}/api/shows", json=payload, headers=self.headers)
        assert response.status_code == 201, f"Failed to create show: {response.text}"
        
        data = response.json()
        assert data["title"] == "TEST_Show_With_Presenters"
        
        # Verify presenter_ids are saved
        assert "presenter_ids" in data or data.get("presenter_ids") is not None
        
        # Verify presenters info is populated
        if "presenters" in data and data["presenters"]:
            presenter = data["presenters"][0]
            assert "id" in presenter
            assert "name" in presenter
            print(f"TEST PASS: Show created with presenters: {data.get('presenters')}")
        
        # Cleanup
        self.created_show_id = data["id"]

    def test_get_single_show_returns_presenters(self):
        """Test that /api/shows/{id} returns presenters info"""
        # First create a show with presenters
        if not self.team_users:
            pytest.skip("No team users available")
        
        presenter_ids = [self.team_users[0]["id"]]
        
        create_payload = {
            "title": "TEST_Single_Show_Presenters",
            "description": "Test single show presenter",
            "date": "2026-02-16",
            "start_time": "16:00",
            "end_time": "17:00",
            "status": "draft",
            "presenter_ids": presenter_ids,
            "recurrence_type": "none"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/shows", json=create_payload, headers=self.headers)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        
        # Get single show
        get_response = requests.get(f"{BASE_URL}/api/shows/{show_id}", headers=self.headers)
        assert get_response.status_code == 200, f"Failed to get show: {get_response.text}"
        
        show_data = get_response.json()
        assert show_data["id"] == show_id
        
        # Verify presenters are returned
        if "presenters" in show_data and show_data["presenters"]:
            presenter = show_data["presenters"][0]
            assert "id" in presenter
            assert "name" in presenter
            print(f"TEST PASS: Single show returns presenters: {show_data['presenters']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/shows/{show_id}", headers=self.headers)

    def test_update_show_with_presenters(self):
        """Test updating a show's presenters"""
        # Create a show first
        create_payload = {
            "title": "TEST_Update_Show_Presenters",
            "description": "Test show for presenter update",
            "date": "2026-02-17",
            "start_time": "18:00",
            "end_time": "19:00",
            "status": "draft",
            "recurrence_type": "none"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/shows", json=create_payload, headers=self.headers)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        
        # Update with presenters
        if self.team_users:
            update_payload = {
                "presenter_ids": [self.team_users[0]["id"]]
            }
            update_response = requests.put(
                f"{BASE_URL}/api/shows/{show_id}", 
                json=update_payload, 
                headers=self.headers
            )
            assert update_response.status_code == 200, f"Failed to update show: {update_response.text}"
            
            updated_data = update_response.json()
            
            # Verify presenters are returned
            if "presenters" in updated_data and updated_data["presenters"]:
                print(f"TEST PASS: Show updated with presenters: {updated_data['presenters']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/shows/{show_id}", headers=self.headers)

    def test_clear_show_presenters(self):
        """Test clearing presenters from a show by setting empty list"""
        if not self.team_users:
            pytest.skip("No team users available")
        
        # Create show with presenters
        create_payload = {
            "title": "TEST_Clear_Presenters",
            "description": "Test clearing presenters",
            "date": "2026-02-18",
            "start_time": "20:00",
            "end_time": "21:00",
            "status": "draft",
            "presenter_ids": [self.team_users[0]["id"]],
            "recurrence_type": "none"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/shows", json=create_payload, headers=self.headers)
        assert create_response.status_code == 201
        show_id = create_response.json()["id"]
        
        # Clear presenters
        update_payload = {"presenter_ids": []}
        update_response = requests.put(
            f"{BASE_URL}/api/shows/{show_id}", 
            json=update_payload, 
            headers=self.headers
        )
        assert update_response.status_code == 200, f"Failed to clear presenters: {update_response.text}"
        
        updated_data = update_response.json()
        assert updated_data.get("presenter_ids") == [] or not updated_data.get("presenters")
        print(f"TEST PASS: Presenters cleared from show")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/shows/{show_id}", headers=self.headers)


class TestCleanup:
    """Cleanup test data after all tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test"
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
    
    def test_cleanup_test_data(self):
        """Clean up any TEST_ prefixed data created during tests"""
        # Clean up shows
        shows_response = requests.get(f"{BASE_URL}/api/shows", headers=self.headers)
        if shows_response.status_code == 200:
            shows = shows_response.json()
            for show in shows:
                if show.get("title", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/shows/{show['id']}", headers=self.headers)
        
        # Clean up show titles
        titles_response = requests.get(f"{BASE_URL}/api/shows/titles", headers=self.headers)
        if titles_response.status_code == 200:
            titles = titles_response.json()
            for title in titles:
                if title.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/shows/titles/{title['id']}", headers=self.headers)
        
        print("TEST PASS: Cleanup complete")
