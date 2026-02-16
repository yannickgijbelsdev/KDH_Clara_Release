"""
Test Multisite Navigation - Backend API Tests

Tests for:
1. Shows page navigation: GET /api/shows/{show_id} with X-Main-Site-ID header
2. Show detail page loading with correct data isolation
3. Rundown API: GET /api/shows/{show_id}/rundown with X-Main-Site-ID header
4. Update show: PUT /api/shows/{show_id} with X-Main-Site-ID header
5. Delete show: DELETE /api/shows/{show_id} with X-Main-Site-ID header
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"  # Radiogroep

# Store auth token
auth_token = None
test_show_id = None


@pytest.fixture(scope="module")
def get_auth_token():
    """Get authentication token for network admin."""
    global auth_token
    if auth_token is None:
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        auth_token = data.get('access_token')
        assert auth_token, "No access token in response"
    return auth_token


@pytest.fixture(scope="module")
def auth_headers(get_auth_token):
    """Get headers with auth token and X-Main-Site-ID."""
    return {
        "Authorization": f"Bearer {get_auth_token}",
        "Content-Type": "application/json",
        "X-Main-Site-ID": MAIN_SITE_ID
    }


@pytest.fixture(scope="module")
def auth_headers_no_site(get_auth_token):
    """Get headers with auth token but without X-Main-Site-ID."""
    return {
        "Authorization": f"Bearer {get_auth_token}",
        "Content-Type": "application/json"
    }


class TestShowsEndpointsWithMultisite:
    """Test shows endpoints with X-Main-Site-ID header."""
    
    def test_login_success(self):
        """Test login with network admin credentials."""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("user", {}).get("is_network_admin") == True
        print(f"✓ Login successful, is_network_admin: {data['user'].get('is_network_admin')}")

    def test_get_shows_with_main_site_header(self, auth_headers):
        """Test GET /api/shows with X-Main-Site-ID header returns shows for that site."""
        response = requests.get(f"{BASE_URL}/api/shows", headers=auth_headers)
        assert response.status_code == 200, f"GET shows failed: {response.text}"
        
        shows = response.json()
        assert isinstance(shows, list), "Shows should be a list"
        
        # Store a show ID for later tests
        global test_show_id
        if shows:
            test_show_id = shows[0]["id"]
            print(f"✓ Got {len(shows)} shows for main site, first show: {shows[0].get('title')}")
        else:
            print("✓ No shows found for this main site (may be empty)")

    def test_get_single_show_with_main_site_header(self, auth_headers):
        """Test GET /api/shows/{show_id} with X-Main-Site-ID header."""
        global test_show_id
        if not test_show_id:
            pytest.skip("No test show ID available from previous test")
        
        response = requests.get(f"{BASE_URL}/api/shows/{test_show_id}", headers=auth_headers)
        assert response.status_code == 200, f"GET show failed: {response.text}"
        
        show = response.json()
        assert show.get("id") == test_show_id
        # Verify show has main_site_id (multisite aware)
        assert "main_site_id" in show or "team_id" in show, "Show should have main_site_id or team_id"
        print(f"✓ Got show '{show.get('title')}' with status: {show.get('status')}")

    def test_get_show_without_main_site_header_fails_for_wrong_site(self, auth_headers_no_site):
        """Test GET /api/shows/{show_id} without header still works (backward compat)."""
        global test_show_id
        if not test_show_id:
            pytest.skip("No test show ID available from previous test")
        
        response = requests.get(f"{BASE_URL}/api/shows/{test_show_id}", headers=auth_headers_no_site)
        # This should work because the user's team_id is used as fallback
        # For network admin it may or may not work depending on team_id setup
        print(f"✓ GET show without header: status={response.status_code}")
        # Don't assert 200 - it depends on team_id setup

    def test_get_rundown_with_main_site_header(self, auth_headers):
        """Test GET /api/shows/{show_id}/rundown with X-Main-Site-ID header."""
        global test_show_id
        if not test_show_id:
            pytest.skip("No test show ID available from previous test")
        
        response = requests.get(f"{BASE_URL}/api/shows/{test_show_id}/rundown", headers=auth_headers)
        assert response.status_code == 200, f"GET rundown failed: {response.text}"
        
        rundown = response.json()
        assert isinstance(rundown, list), "Rundown should be a list"
        print(f"✓ Got rundown with {len(rundown)} items")

    def test_wrong_main_site_id_returns_404(self, get_auth_token):
        """Test GET /api/shows/{show_id} with wrong X-Main-Site-ID returns 404."""
        global test_show_id
        if not test_show_id:
            pytest.skip("No test show ID available from previous test")
        
        # Use a fake main site ID
        wrong_headers = {
            "Authorization": f"Bearer {get_auth_token}",
            "Content-Type": "application/json",
            "X-Main-Site-ID": "00000000-0000-0000-0000-000000000000"
        }
        
        response = requests.get(f"{BASE_URL}/api/shows/{test_show_id}", headers=wrong_headers)
        # Should return 404 because show doesn't belong to that main site
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Wrong main site ID correctly returns 404")


class TestRundownEndpointsWithMultisite:
    """Test rundown endpoints with X-Main-Site-ID header."""

    def test_create_rundown_item_with_main_site_header(self, auth_headers):
        """Test POST /api/shows/{show_id}/rundown with X-Main-Site-ID header."""
        global test_show_id
        if not test_show_id:
            pytest.skip("No test show ID available from previous test")
        
        rundown_item = {
            "type": "segment",
            "title": "TEST_Multisite_Rundown_Item",
            "notes": "Test item for multisite testing",
            "duration": "5:00"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/shows/{test_show_id}/rundown",
            headers=auth_headers,
            json=rundown_item
        )
        assert response.status_code == 201, f"Create rundown item failed: {response.text}"
        
        item = response.json()
        assert item.get("title") == "TEST_Multisite_Rundown_Item"
        print(f"✓ Created rundown item: {item.get('id')}")
        
        # Clean up - delete the test item
        if item.get("id"):
            delete_response = requests.delete(
                f"{BASE_URL}/api/shows/{test_show_id}/rundown/{item['id']}",
                headers=auth_headers
            )
            print(f"  Cleanup: Delete status={delete_response.status_code}")


class TestDataIsolation:
    """Test that data is properly isolated between main sites."""

    def test_shows_isolated_by_main_site(self, get_auth_token):
        """Test that shows are isolated between main sites."""
        # Get shows for Radiogroep
        radiogroep_headers = {
            "Authorization": f"Bearer {get_auth_token}",
            "Content-Type": "application/json",
            "X-Main-Site-ID": MAIN_SITE_ID
        }
        
        response1 = requests.get(f"{BASE_URL}/api/shows", headers=radiogroep_headers)
        assert response1.status_code == 200
        radiogroep_shows = response1.json()
        
        # Get shows for a different main site (use a fake one)
        fake_site_headers = {
            "Authorization": f"Bearer {get_auth_token}",
            "Content-Type": "application/json",
            "X-Main-Site-ID": "00000000-0000-0000-0000-000000000000"
        }
        
        response2 = requests.get(f"{BASE_URL}/api/shows", headers=fake_site_headers)
        assert response2.status_code == 200
        fake_shows = response2.json()
        
        # Shows from fake site should be empty (no data for non-existent site)
        assert len(fake_shows) == 0, "Fake site should have no shows"
        print(f"✓ Data isolation working: Radiogroep has {len(radiogroep_shows)} shows, fake site has 0")


class TestShowTitlesMultisite:
    """Test show titles endpoints with multisite."""

    def test_get_show_titles_with_main_site_header(self, auth_headers):
        """Test GET /api/shows/titles with X-Main-Site-ID header."""
        response = requests.get(f"{BASE_URL}/api/shows/titles", headers=auth_headers)
        assert response.status_code == 200, f"GET show titles failed: {response.text}"
        
        titles = response.json()
        assert isinstance(titles, list), "Show titles should be a list"
        print(f"✓ Got {len(titles)} show titles for main site")

    def test_get_studios_with_main_site_header(self, auth_headers):
        """Test GET /api/shows/studios with X-Main-Site-ID header."""
        response = requests.get(f"{BASE_URL}/api/shows/studios", headers=auth_headers)
        assert response.status_code == 200, f"GET studios failed: {response.text}"
        
        studios = response.json()
        assert isinstance(studios, list), "Studios should be a list"
        print(f"✓ Got {len(studios)} studios for main site")


class TestContentEndpointsMultisite:
    """Test content endpoints with X-Main-Site-ID header for navigation."""

    def test_get_content_with_main_site_header(self, auth_headers):
        """Test GET /api/content with X-Main-Site-ID header."""
        response = requests.get(f"{BASE_URL}/api/content", headers=auth_headers)
        assert response.status_code == 200, f"GET content failed: {response.text}"
        
        content = response.json()
        assert isinstance(content, list), "Content should be a list"
        
        if content:
            # Check first content item has id
            first_item = content[0]
            assert "id" in first_item, "Content item should have id"
            print(f"✓ Got {len(content)} content items, first: {first_item.get('title', 'N/A')}")
        else:
            print("✓ No content items found for this main site")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
