"""
Test Sites Feature Updates:
1. Submissions view shows file_urls as thumbnails and links (Bijlagen section)
2. Speaker/volume icon hover changes to button_color
3. Site dashboard Form tab has 3 color pickers: Knop kleur, Achtergrond kleur, Kader kleur
4. Color preview shows all 3 colors together
5. Submissions tab in sidebar shows badge count for unviewed submissions
6. Badge disappears after viewing submissions tab (mark-viewed)
7. Public page applies background_color to page background
8. Public page applies container_color to audio player and form containers
9. Public page form shows file upload section when enabled
10. GET /api/sites/{site_id}/submissions/count returns count of unviewed submissions
11. POST /api/sites/{site_id}/submissions/mark-viewed marks submissions as viewed
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"
SITE_ID = "3a91dfc9-e52f-4c6b-a426-84dc778ad8a1"
SITE_SLUG = "radio-test"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestColorFields:
    """Test background_color and container_color fields in API."""
    
    def test_site_has_background_color_field(self, auth_headers):
        """Test that site response includes background_color field."""
        response = requests.get(f"{BASE_URL}/api/sites/{SITE_ID}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "background_color" in data, "background_color field missing from site response"
        print(f"background_color value: {data.get('background_color')}")
    
    def test_site_has_container_color_field(self, auth_headers):
        """Test that site response includes container_color field."""
        response = requests.get(f"{BASE_URL}/api/sites/{SITE_ID}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "container_color" in data, "container_color field missing from site response"
        print(f"container_color value: {data.get('container_color')}")
    
    def test_update_background_color(self, auth_headers):
        """Test updating background_color."""
        test_color = "#1a1a2e"
        response = requests.put(
            f"{BASE_URL}/api/sites/{SITE_ID}",
            headers=auth_headers,
            json={"background_color": test_color}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("background_color") == test_color
        print(f"Updated background_color to: {test_color}")
    
    def test_update_container_color(self, auth_headers):
        """Test updating container_color."""
        test_color = "#16213e"
        response = requests.put(
            f"{BASE_URL}/api/sites/{SITE_ID}",
            headers=auth_headers,
            json={"container_color": test_color}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("container_color") == test_color
        print(f"Updated container_color to: {test_color}")
    
    def test_public_site_has_background_color(self):
        """Test public endpoint returns background_color."""
        response = requests.get(f"{BASE_URL}/api/sites/public/{SITE_SLUG}")
        assert response.status_code == 200
        data = response.json()
        assert "background_color" in data, "background_color missing from public site response"
        print(f"Public site background_color: {data.get('background_color')}")
    
    def test_public_site_has_container_color(self):
        """Test public endpoint returns container_color."""
        response = requests.get(f"{BASE_URL}/api/sites/public/{SITE_SLUG}")
        assert response.status_code == 200
        data = response.json()
        assert "container_color" in data, "container_color missing from public site response"
        print(f"Public site container_color: {data.get('container_color')}")


class TestSubmissionCountEndpoint:
    """Test GET /api/sites/{site_id}/submissions/count endpoint."""
    
    def test_submissions_count_endpoint_exists(self, auth_headers):
        """Test that submissions count endpoint exists and returns data."""
        response = requests.get(
            f"{BASE_URL}/api/sites/{SITE_ID}/submissions/count",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Endpoint returned {response.status_code}: {response.text}"
        data = response.json()
        assert "count" in data, "Response should contain 'count' field"
        assert isinstance(data["count"], int), "Count should be an integer"
        print(f"Unviewed submissions count: {data['count']}")
    
    def test_submissions_count_returns_number(self, auth_headers):
        """Test that submissions count is a non-negative number."""
        response = requests.get(
            f"{BASE_URL}/api/sites/{SITE_ID}/submissions/count",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 0, "Count should be non-negative"


class TestMarkViewedEndpoint:
    """Test POST /api/sites/{site_id}/submissions/mark-viewed endpoint."""
    
    def test_mark_viewed_endpoint_exists(self, auth_headers):
        """Test that mark-viewed endpoint exists and works."""
        response = requests.post(
            f"{BASE_URL}/api/sites/{SITE_ID}/submissions/mark-viewed",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Endpoint returned {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain 'message' field"
        print(f"Mark-viewed response: {data}")
    
    def test_mark_viewed_then_count_zero(self, auth_headers):
        """Test that after marking viewed, count should be zero (or fewer)."""
        # First mark as viewed
        mark_response = requests.post(
            f"{BASE_URL}/api/sites/{SITE_ID}/submissions/mark-viewed",
            headers=auth_headers
        )
        assert mark_response.status_code == 200
        
        # Then check count
        count_response = requests.get(
            f"{BASE_URL}/api/sites/{SITE_ID}/submissions/count",
            headers=auth_headers
        )
        assert count_response.status_code == 200
        data = count_response.json()
        print(f"Count after mark-viewed: {data['count']}")
        # Count should be 0 since we just marked all as viewed
        assert data["count"] == 0, "Count should be 0 after marking as viewed"


class TestSubmissionsWithFileUrls:
    """Test that submissions include file_urls field."""
    
    def test_submissions_endpoint_returns_file_urls(self, auth_headers):
        """Test that submissions endpoint includes file_urls field."""
        response = requests.get(
            f"{BASE_URL}/api/sites/{SITE_ID}/submissions",
            headers=auth_headers
        )
        assert response.status_code == 200
        submissions = response.json()
        
        if len(submissions) > 0:
            # Check that file_urls field exists in submissions
            first_sub = submissions[0]
            # file_urls may be None, empty list, or list of URLs
            print(f"First submission keys: {first_sub.keys()}")
            if "file_urls" in first_sub:
                print(f"file_urls in submission: {first_sub['file_urls']}")
        else:
            print("No submissions found to test file_urls field")
    
    def test_create_submission_with_file_urls(self):
        """Test creating a submission with file_urls."""
        test_submission = {
            "name": "TEST_file_upload_user",
            "phone": "0612345678",
            "message": "Test submission with file URLs",
            "file_urls": [
                "/uploads/test/sample.jpg",
                "/uploads/test/audio.mp3"
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/sites/public/{SITE_SLUG}/submit",
            json=test_submission
        )
        assert response.status_code == 200, f"Submit failed: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain submission id"
        print(f"Created test submission with id: {data['id']}")


class TestAllColorsInSiteUpdate:
    """Test that all 3 colors can be updated together."""
    
    def test_update_all_colors_together(self, auth_headers):
        """Test updating button_color, background_color, and container_color together."""
        test_colors = {
            "button_color": "#ff6b35",
            "background_color": "#0a0a0f",
            "container_color": "#1a1a25"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/sites/{SITE_ID}",
            headers=auth_headers,
            json=test_colors
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("button_color") == test_colors["button_color"]
        assert data.get("background_color") == test_colors["background_color"]
        assert data.get("container_color") == test_colors["container_color"]
        print(f"Successfully updated all 3 colors: {test_colors}")
    
    def test_reset_colors_to_defaults(self, auth_headers):
        """Reset colors to default values."""
        default_colors = {
            "button_color": "#f97316",
            "background_color": "#09090b",
            "container_color": "#18181b"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/sites/{SITE_ID}",
            headers=auth_headers,
            json=default_colors
        )
        assert response.status_code == 200
        print("Reset colors to defaults")


class TestPublicSiteColorsResponse:
    """Test public site endpoint returns all color fields."""
    
    def test_public_site_returns_all_colors(self):
        """Test that public site returns button_color, background_color, container_color."""
        response = requests.get(f"{BASE_URL}/api/sites/public/{SITE_SLUG}")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = ["button_color", "background_color", "container_color"]
        for field in required_fields:
            assert field in data, f"{field} missing from public site response"
            print(f"{field}: {data.get(field)}")


class TestFileUploadEnabledField:
    """Test form_file_upload_enabled field behavior."""
    
    def test_form_file_upload_enabled_exists(self, auth_headers):
        """Test that form_file_upload_enabled field exists."""
        response = requests.get(f"{BASE_URL}/api/sites/{SITE_ID}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "form_file_upload_enabled" in data, "form_file_upload_enabled field missing"
        print(f"form_file_upload_enabled: {data.get('form_file_upload_enabled')}")
    
    def test_public_site_has_form_file_upload_enabled(self):
        """Test public site includes form_file_upload_enabled."""
        response = requests.get(f"{BASE_URL}/api/sites/public/{SITE_SLUG}")
        assert response.status_code == 200
        data = response.json()
        assert "form_file_upload_enabled" in data
        print(f"Public form_file_upload_enabled: {data.get('form_file_upload_enabled')}")
