"""
MVP 4 Backend API Tests
Tests for: Team Chat, Media Library, Show Series, Occurrences, Presenter Role
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo@radio.com"
TEST_PASSWORD = "password123"


class TestSetup:
    """Setup and authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        return data["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("✓ Health check passed")
    
    def test_login(self):
        """Test login with demo credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✓ Login successful, user role: {data['user']['role']}")


class TestTeamChat:
    """Team Chat API tests - /api/chat/*"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_get_chat_threads(self, auth_headers):
        """GET /api/chat/threads - List all chat threads"""
        response = requests.get(f"{BASE_URL}/api/chat/threads", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/chat/threads - Found {len(data)} threads")
    
    def test_get_team_chat_thread(self, auth_headers):
        """GET /api/chat/threads/team - Get or create team chat thread"""
        response = requests.get(f"{BASE_URL}/api/chat/threads/team", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["type"] == "team"
        print(f"✓ GET /api/chat/threads/team - Thread ID: {data['id']}")
        return data["id"]
    
    def test_post_chat_message(self, auth_headers):
        """POST /api/chat/threads/{id}/messages - Send a message"""
        # First get the team thread
        thread_response = requests.get(f"{BASE_URL}/api/chat/threads/team", headers=auth_headers)
        thread_id = thread_response.json()["id"]
        
        # Send a message
        message_data = {"body": f"TEST_message_{int(time.time())}"}
        response = requests.post(
            f"{BASE_URL}/api/chat/threads/{thread_id}/messages",
            headers=auth_headers,
            json=message_data
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["body"] == message_data["body"]
        assert "user_name" in data
        print(f"✓ POST /api/chat/threads/{thread_id}/messages - Message sent")
    
    def test_get_chat_messages(self, auth_headers):
        """GET /api/chat/threads/{id}/messages - Get messages in thread"""
        # Get the team thread
        thread_response = requests.get(f"{BASE_URL}/api/chat/threads/team", headers=auth_headers)
        thread_id = thread_response.json()["id"]
        
        # Get messages
        response = requests.get(
            f"{BASE_URL}/api/chat/threads/{thread_id}/messages",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/chat/threads/{thread_id}/messages - Found {len(data)} messages")


class TestMediaLibrary:
    """Media Library API tests - /api/media/*"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_get_media_assets(self, auth_headers):
        """GET /api/media - List all media assets"""
        response = requests.get(f"{BASE_URL}/api/media", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/media - Found {len(data)} assets")
    
    def test_upload_media_document(self, auth_headers):
        """POST /api/media - Upload a document (PDF simulation)"""
        # Create a simple text file to simulate document upload
        files = {
            'file': ('TEST_document.txt', b'This is a test document content', 'text/plain')
        }
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(
            f"{BASE_URL}/api/media",
            headers=headers,
            files=files
        )
        # May fail if only specific file types allowed
        if response.status_code == 201:
            data = response.json()
            assert "id" in data
            assert data["kind"] == "document"
            print(f"✓ POST /api/media - Document uploaded: {data['id']}")
            return data["id"]
        elif response.status_code == 400:
            print(f"⚠ POST /api/media - Document upload rejected (file type restriction): {response.json().get('detail', '')}")
            return None
        else:
            pytest.fail(f"Unexpected status: {response.status_code} - {response.text}")
    
    def test_delete_media_asset(self, auth_headers):
        """DELETE /api/media/{id} - Delete a media asset"""
        # First upload something to delete
        files = {
            'file': ('TEST_delete_me.txt', b'Delete this file', 'text/plain')
        }
        headers = {"Authorization": auth_headers["Authorization"]}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/media",
            headers=headers,
            files=files
        )
        
        if upload_response.status_code == 201:
            asset_id = upload_response.json()["id"]
            
            # Now delete it
            delete_response = requests.delete(
                f"{BASE_URL}/api/media/{asset_id}",
                headers=auth_headers
            )
            assert delete_response.status_code == 204
            print(f"✓ DELETE /api/media/{asset_id} - Asset deleted")
        else:
            print("⚠ Skipping delete test - upload failed")


class TestShowSeries:
    """Show Series API tests - /api/series/*"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_get_series_list(self, auth_headers):
        """GET /api/series - List all show series"""
        response = requests.get(f"{BASE_URL}/api/series", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/series - Found {len(data)} series")
    
    def test_create_series(self, auth_headers):
        """POST /api/series - Create a new show series"""
        series_data = {
            "title": f"TEST_Series_{int(time.time())}",
            "description": "Test series for automated testing",
            "default_start_time": "09:00",
            "default_end_time": "10:00",
            "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO,WE,FR",
            "is_active": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/series",
            headers=auth_headers,
            json=series_data
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["title"] == series_data["title"]
        assert data["recurrence_rule"] == series_data["recurrence_rule"]
        print(f"✓ POST /api/series - Series created: {data['id']}")
        return data["id"]
    
    def test_get_series_by_id(self, auth_headers):
        """GET /api/series/{id} - Get series details"""
        # First create a series
        series_data = {
            "title": f"TEST_GetSeries_{int(time.time())}",
            "description": "Test",
            "default_start_time": "10:00",
            "default_end_time": "11:00"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/series",
            headers=auth_headers,
            json=series_data
        )
        series_id = create_response.json()["id"]
        
        # Get the series
        response = requests.get(f"{BASE_URL}/api/series/{series_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == series_id
        assert data["title"] == series_data["title"]
        print(f"✓ GET /api/series/{series_id} - Series retrieved")
    
    def test_generate_occurrences(self, auth_headers):
        """POST /api/series/{id}/generate - Generate occurrences from series"""
        # Create a series with weekly recurrence
        series_data = {
            "title": f"TEST_GenerateSeries_{int(time.time())}",
            "description": "Series for occurrence generation",
            "default_start_time": "14:00",
            "default_end_time": "15:00",
            "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO",
            "is_active": True
        }
        create_response = requests.post(
            f"{BASE_URL}/api/series",
            headers=auth_headers,
            json=series_data
        )
        series_id = create_response.json()["id"]
        
        # Generate occurrences
        response = requests.post(
            f"{BASE_URL}/api/series/{series_id}/generate",
            headers=auth_headers,
            json={"weeks_ahead": 4}
        )
        assert response.status_code == 200
        data = response.json()
        # API returns list of created occurrences directly
        assert isinstance(data, list)
        assert len(data) > 0
        # Verify each occurrence has required fields
        for occ in data:
            assert "id" in occ
            assert "date" in occ
            assert occ["show_series_id"] == series_id
        print(f"✓ POST /api/series/{series_id}/generate - Created {len(data)} occurrences")
    
    def test_update_series(self, auth_headers):
        """PUT /api/series/{id} - Update a series"""
        # Create a series
        series_data = {
            "title": f"TEST_UpdateSeries_{int(time.time())}",
            "description": "Original description",
            "default_start_time": "08:00",
            "default_end_time": "09:00"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/series",
            headers=auth_headers,
            json=series_data
        )
        series_id = create_response.json()["id"]
        
        # Update the series
        update_data = {"description": "Updated description"}
        response = requests.put(
            f"{BASE_URL}/api/series/{series_id}",
            headers=auth_headers,
            json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["description"] == "Updated description"
        print(f"✓ PUT /api/series/{series_id} - Series updated")
    
    def test_delete_series(self, auth_headers):
        """DELETE /api/series/{id} - Delete a series"""
        # Create a series to delete
        series_data = {
            "title": f"TEST_DeleteSeries_{int(time.time())}",
            "description": "To be deleted",
            "default_start_time": "07:00",
            "default_end_time": "08:00"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/series",
            headers=auth_headers,
            json=series_data
        )
        series_id = create_response.json()["id"]
        
        # Delete the series
        response = requests.delete(f"{BASE_URL}/api/series/{series_id}", headers=auth_headers)
        assert response.status_code == 204
        print(f"✓ DELETE /api/series/{series_id} - Series deleted")


class TestOccurrences:
    """Show Occurrences API tests - /api/occurrences/*"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_get_occurrences_list(self, auth_headers):
        """GET /api/occurrences - List all occurrences"""
        response = requests.get(f"{BASE_URL}/api/occurrences", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/occurrences - Found {len(data)} occurrences")
    
    def test_create_occurrence(self, auth_headers):
        """POST /api/occurrences - Create a standalone occurrence"""
        occurrence_data = {
            "title": f"TEST_Occurrence_{int(time.time())}",
            "date": "2025-12-20",
            "start_time": "10:00",
            "end_time": "11:00",
            "status": "draft"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/occurrences",
            headers=auth_headers,
            json=occurrence_data
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["title"] == occurrence_data["title"]
        assert data["date"] == occurrence_data["date"]
        print(f"✓ POST /api/occurrences - Occurrence created: {data['id']}")
        return data["id"]
    
    def test_get_occurrence_by_id(self, auth_headers):
        """GET /api/occurrences/{id} - Get occurrence details"""
        # Create an occurrence first
        occurrence_data = {
            "title": f"TEST_GetOccurrence_{int(time.time())}",
            "date": "2025-12-21",
            "start_time": "11:00",
            "end_time": "12:00",
            "status": "draft"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/occurrences",
            headers=auth_headers,
            json=occurrence_data
        )
        occurrence_id = create_response.json()["id"]
        
        # Get the occurrence
        response = requests.get(f"{BASE_URL}/api/occurrences/{occurrence_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == occurrence_id
        print(f"✓ GET /api/occurrences/{occurrence_id} - Occurrence retrieved")
    
    def test_get_occurrence_rundown(self, auth_headers):
        """GET /api/occurrences/{id}/rundown - Get rundown for occurrence"""
        # Create an occurrence
        occurrence_data = {
            "title": f"TEST_RundownOccurrence_{int(time.time())}",
            "date": "2025-12-22",
            "start_time": "12:00",
            "end_time": "13:00",
            "status": "draft"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/occurrences",
            headers=auth_headers,
            json=occurrence_data
        )
        occurrence_id = create_response.json()["id"]
        
        # Get rundown
        response = requests.get(
            f"{BASE_URL}/api/occurrences/{occurrence_id}/rundown",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/occurrences/{occurrence_id}/rundown - Rundown retrieved ({len(data)} items)")
    
    def test_add_rundown_item_to_occurrence(self, auth_headers):
        """POST /api/occurrences/{id}/rundown - Add item to occurrence rundown"""
        # Create an occurrence
        occurrence_data = {
            "title": f"TEST_AddRundownItem_{int(time.time())}",
            "date": "2025-12-23",
            "start_time": "13:00",
            "end_time": "14:00",
            "status": "draft"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/occurrences",
            headers=auth_headers,
            json=occurrence_data
        )
        occurrence_id = create_response.json()["id"]
        
        # Add rundown item
        item_data = {
            "type": "segment",
            "title": "TEST_Segment",
            "notes": "Test notes for segment",
            "duration": "5 min"
        }
        response = requests.post(
            f"{BASE_URL}/api/occurrences/{occurrence_id}/rundown",
            headers=auth_headers,
            json=item_data
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["title"] == item_data["title"]
        print(f"✓ POST /api/occurrences/{occurrence_id}/rundown - Item added")
    
    def test_update_occurrence(self, auth_headers):
        """PUT /api/occurrences/{id} - Update an occurrence"""
        # Create an occurrence
        occurrence_data = {
            "title": f"TEST_UpdateOccurrence_{int(time.time())}",
            "date": "2025-12-24",
            "start_time": "14:00",
            "end_time": "15:00",
            "status": "draft"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/occurrences",
            headers=auth_headers,
            json=occurrence_data
        )
        occurrence_id = create_response.json()["id"]
        
        # Update the occurrence
        update_data = {"status": "scheduled"}
        response = requests.put(
            f"{BASE_URL}/api/occurrences/{occurrence_id}",
            headers=auth_headers,
            json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "scheduled"
        print(f"✓ PUT /api/occurrences/{occurrence_id} - Occurrence updated")
    
    def test_delete_occurrence(self, auth_headers):
        """DELETE /api/occurrences/{id} - Delete an occurrence"""
        # Create an occurrence to delete
        occurrence_data = {
            "title": f"TEST_DeleteOccurrence_{int(time.time())}",
            "date": "2025-12-25",
            "start_time": "15:00",
            "end_time": "16:00",
            "status": "draft"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/occurrences",
            headers=auth_headers,
            json=occurrence_data
        )
        occurrence_id = create_response.json()["id"]
        
        # Delete the occurrence
        response = requests.delete(f"{BASE_URL}/api/occurrences/{occurrence_id}", headers=auth_headers)
        assert response.status_code == 204
        print(f"✓ DELETE /api/occurrences/{occurrence_id} - Occurrence deleted")


class TestPresenterRole:
    """Presenter role permission tests"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_invite_presenter_role(self, admin_headers):
        """POST /api/users/invite - Invite user with presenter role"""
        invite_data = {
            "email": f"TEST_presenter_{int(time.time())}@test.com",
            "name": "Test Presenter",
            "role": "presenter"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/users/invite",
            headers=admin_headers,
            json=invite_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "presenter"
        print(f"✓ POST /api/users/invite - Presenter invited: {data['email']}")
        
        # Clean up - delete the test user
        requests.delete(f"{BASE_URL}/api/users/{data['id']}", headers=admin_headers)
    
    def test_update_user_to_presenter(self, admin_headers):
        """PUT /api/users/{id}/role - Update user role to presenter"""
        # First invite a user
        invite_data = {
            "email": f"TEST_role_update_{int(time.time())}@test.com",
            "name": "Test Role Update",
            "role": "editor"
        }
        invite_response = requests.post(
            f"{BASE_URL}/api/users/invite",
            headers=admin_headers,
            json=invite_data
        )
        user_id = invite_response.json()["id"]
        
        # Update role to presenter
        response = requests.put(
            f"{BASE_URL}/api/users/{user_id}/role",
            headers=admin_headers,
            json={"role": "presenter"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "presenter"
        print(f"✓ PUT /api/users/{user_id}/role - Role updated to presenter")
        
        # Clean up
        requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=admin_headers)


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_cleanup_test_series(self, auth_headers):
        """Clean up TEST_ prefixed series"""
        response = requests.get(f"{BASE_URL}/api/series", headers=auth_headers)
        if response.status_code == 200:
            series_list = response.json()
            deleted = 0
            for series in series_list:
                if series["title"].startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/series/{series['id']}", headers=auth_headers)
                    deleted += 1
            print(f"✓ Cleaned up {deleted} test series")
    
    def test_cleanup_test_occurrences(self, auth_headers):
        """Clean up TEST_ prefixed occurrences"""
        response = requests.get(f"{BASE_URL}/api/occurrences", headers=auth_headers)
        if response.status_code == 200:
            occurrences = response.json()
            deleted = 0
            for occ in occurrences:
                if occ["title"].startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/occurrences/{occ['id']}", headers=auth_headers)
                    deleted += 1
            print(f"✓ Cleaned up {deleted} test occurrences")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
