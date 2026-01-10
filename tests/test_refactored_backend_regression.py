"""
Regression tests for Radio Show Planner API after refactoring from monolithic server.py to modular structure.
Tests all major API endpoints to ensure they work correctly after the refactoring.

Modules tested:
- Auth: Login, register, me endpoints
- Shows: CRUD operations for shows and rundown items
- Series: CRUD operations for show series
- Occurrences: CRUD operations for show occurrences
- Chat: Team chat threads and messages
- Media: Media asset management
- Content: Content library management
- Health: Health check endpoint
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo@radio.com"
TEST_PASSWORD = "password123"


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_returns_healthy(self):
        """GET /api/health should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """POST /api/auth/login should return token and user info"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify token exists
        assert "token" in data
        assert isinstance(data["token"], str)
        assert len(data["token"]) > 0
        
        # Verify user info
        assert "user" in data
        user = data["user"]
        assert user["email"] == TEST_EMAIL
        assert "id" in user
        assert "name" in user
        assert "role" in user
        assert "team_id" in user
        assert "team_name" in user
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login with wrong password should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": "wrongpassword"}
        )
        assert response.status_code == 401
    
    def test_login_nonexistent_user(self):
        """POST /api/auth/login with nonexistent email should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "nonexistent@test.com", "password": "anypassword"}
        )
        assert response.status_code == 401
    
    def test_me_endpoint_with_valid_token(self, auth_token):
        """GET /api/auth/me should return current user info"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_EMAIL
        assert "id" in data
        assert "name" in data
        assert "role" in data
        assert "team_id" in data
    
    def test_me_endpoint_without_token(self):
        """GET /api/auth/me without token should return 403"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 403


class TestShowsEndpoints:
    """Shows API endpoint tests"""
    
    def test_get_shows_list(self, auth_token):
        """GET /api/shows should return list of shows"""
        response = requests.get(
            f"{BASE_URL}/api/shows",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_shows_without_auth(self):
        """GET /api/shows without auth should return 403"""
        response = requests.get(f"{BASE_URL}/api/shows")
        assert response.status_code == 403
    
    def test_create_and_delete_show(self, auth_token):
        """POST /api/shows should create a show, then DELETE should remove it"""
        # Create show
        show_data = {
            "title": "TEST_Regression Test Show",
            "description": "Test show for regression testing",
            "date": "2025-12-31",
            "start_time": "10:00",
            "end_time": "12:00",
            "status": "draft"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/shows",
            json=show_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert create_response.status_code == 201
        created_show = create_response.json()
        assert created_show["title"] == show_data["title"]
        assert "id" in created_show
        
        show_id = created_show["id"]
        
        # Verify show exists via GET
        get_response = requests.get(
            f"{BASE_URL}/api/shows/{show_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert get_response.status_code == 200
        
        # Delete show
        delete_response = requests.delete(
            f"{BASE_URL}/api/shows/{show_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert delete_response.status_code == 204
        
        # Verify show is deleted
        verify_response = requests.get(
            f"{BASE_URL}/api/shows/{show_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert verify_response.status_code == 404


class TestSeriesEndpoints:
    """Series API endpoint tests"""
    
    def test_get_series_list(self, auth_token):
        """GET /api/series should return list of show series"""
        response = requests.get(
            f"{BASE_URL}/api/series",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_series_without_auth(self):
        """GET /api/series without auth should return 403"""
        response = requests.get(f"{BASE_URL}/api/series")
        assert response.status_code == 403


class TestOccurrencesEndpoints:
    """Occurrences API endpoint tests"""
    
    def test_get_occurrences_list(self, auth_token):
        """GET /api/occurrences should return list of occurrences"""
        response = requests.get(
            f"{BASE_URL}/api/occurrences",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_occurrences_without_auth(self):
        """GET /api/occurrences without auth should return 403"""
        response = requests.get(f"{BASE_URL}/api/occurrences")
        assert response.status_code == 403
    
    def test_get_occurrences_with_filters(self, auth_token):
        """GET /api/occurrences with date filters should work"""
        response = requests.get(
            f"{BASE_URL}/api/occurrences",
            params={"date_from": "2025-01-01", "date_to": "2025-12-31"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestChatEndpoints:
    """Chat API endpoint tests"""
    
    def test_get_or_create_team_thread(self, auth_token):
        """GET /api/chat/threads/team should return or create team thread"""
        response = requests.get(
            f"{BASE_URL}/api/chat/threads/team",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["type"] == "team"
        assert "team_id" in data
    
    def test_get_chat_threads(self, auth_token):
        """GET /api/chat/threads should return list of threads"""
        response = requests.get(
            f"{BASE_URL}/api/chat/threads",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_chat_without_auth(self):
        """GET /api/chat/threads without auth should return 403"""
        response = requests.get(f"{BASE_URL}/api/chat/threads")
        assert response.status_code == 403


class TestMediaEndpoints:
    """Media API endpoint tests"""
    
    def test_get_media_list(self, auth_token):
        """GET /api/media should return list of media assets"""
        response = requests.get(
            f"{BASE_URL}/api/media",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_media_with_filters(self, auth_token):
        """GET /api/media with kind filter should work"""
        response = requests.get(
            f"{BASE_URL}/api/media",
            params={"kind": "audio"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_media_without_auth(self):
        """GET /api/media without auth should return 403"""
        response = requests.get(f"{BASE_URL}/api/media")
        assert response.status_code == 403


class TestContentEndpoints:
    """Content API endpoint tests"""
    
    def test_get_content_list(self, auth_token):
        """GET /api/content should return list of content items"""
        response = requests.get(
            f"{BASE_URL}/api/content",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_content_with_filters(self, auth_token):
        """GET /api/content with type filter should work"""
        response = requests.get(
            f"{BASE_URL}/api/content",
            params={"type": "text"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_content_without_auth(self):
        """GET /api/content without auth should return 403"""
        response = requests.get(f"{BASE_URL}/api/content")
        assert response.status_code == 403
    
    def test_create_and_delete_content(self, auth_token):
        """POST /api/content should create content, DELETE should remove it"""
        # Create content
        content_data = {
            "title": "TEST_Regression Test Content",
            "type": "article",
            "body": "Test content body for regression testing",
            "status": "draft"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/content",
            json=content_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert create_response.status_code == 201
        created_content = create_response.json()
        assert created_content["title"] == content_data["title"]
        assert "id" in created_content
        
        content_id = created_content["id"]
        
        # Verify content exists via GET
        get_response = requests.get(
            f"{BASE_URL}/api/content/{content_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert get_response.status_code == 200
        
        # Delete content
        delete_response = requests.delete(
            f"{BASE_URL}/api/content/{content_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert delete_response.status_code == 204
        
        # Verify content is deleted
        verify_response = requests.get(
            f"{BASE_URL}/api/content/{content_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert verify_response.status_code == 404


class TestRootEndpoint:
    """Root API endpoint test"""
    
    def test_root_endpoint(self):
        """GET /api/ should return API info"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "status" in data
        assert data["status"] == "running"


# Fixtures
@pytest.fixture
def auth_token():
    """Get authentication token for test user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
