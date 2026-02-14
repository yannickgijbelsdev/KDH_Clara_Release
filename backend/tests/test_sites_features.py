"""
Tests for Sites features: S3 uploads, dynamic titles, header images
Tests: logo upload, header image upload, audio upload, public page data
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(auth_token):
    """Create authenticated session."""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestSitesEndpoints:
    """Tests for sites API endpoints."""
    
    def test_get_sites(self, authenticated_client):
        """Test getting list of sites."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        assert isinstance(sites, list)
        print(f"✓ Found {len(sites)} sites")
        
        if sites:
            # Check site structure
            site = sites[0]
            assert "id" in site
            assert "name" in site
            assert "slug" in site
            print(f"✓ First site: {site.get('name')} (slug: {site.get('slug')})")
    
    def test_get_single_site(self, authenticated_client):
        """Test getting single site details."""
        # First get list of sites
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        
        if not sites:
            pytest.skip("No sites available for testing")
        
        site_id = sites[0]["id"]
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{site_id}")
        assert response.status_code == 200
        
        site = response.json()
        assert site["id"] == site_id
        assert "name" in site
        assert "logo_url" in site
        assert "header_image_url" in site
        assert "audio_enabled" in site
        assert "video_enabled" in site
        print(f"✓ Site details retrieved: {site.get('name')}")
        print(f"  Logo URL: {site.get('logo_url', 'None')}")
        print(f"  Header Image URL: {site.get('header_image_url', 'None')}")


class TestPublicSiteEndpoints:
    """Tests for public site endpoints."""
    
    def test_get_public_site(self, authenticated_client):
        """Test getting public site by slug."""
        # First get sites to find a slug
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        
        if not sites:
            pytest.skip("No sites available for testing")
        
        slug = sites[0]["slug"]
        
        # Now get public site (no auth needed)
        response = requests.get(f"{BASE_URL}/api/sites/public/{slug}")
        assert response.status_code == 200
        
        public_site = response.json()
        assert "name" in public_site
        assert "logo_url" in public_site
        assert "header_image_url" in public_site
        assert "audio_enabled" in public_site
        assert "video_enabled" in public_site
        # Should not include sensitive fields
        assert "password_hash" not in public_site
        assert "team_id" not in public_site
        print(f"✓ Public site data for '{slug}': {public_site.get('name')}")
        print(f"  Has logo: {'Yes' if public_site.get('logo_url') else 'No'}")
        print(f"  Has header image: {'Yes' if public_site.get('header_image_url') else 'No'}")
    
    def test_nonexistent_public_site(self):
        """Test 404 for nonexistent public site."""
        response = requests.get(f"{BASE_URL}/api/sites/public/nonexistent-slug-12345")
        assert response.status_code == 404
        print("✓ 404 returned for nonexistent site slug")


class TestSiteUploadEndpoints:
    """Tests for site upload endpoints (logo, header, audio)."""
    
    def test_logo_upload_endpoint_exists(self, authenticated_client):
        """Verify logo upload endpoint exists and rejects invalid requests."""
        # First get a site ID
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        
        if not sites:
            pytest.skip("No sites available for testing")
        
        site_id = sites[0]["id"]
        
        # Test POST to logo endpoint without file (should fail with 422)
        # Remove content-type for multipart
        headers = {"Authorization": authenticated_client.headers["Authorization"]}
        response = requests.post(
            f"{BASE_URL}/api/sites/{site_id}/logo",
            headers=headers
        )
        # Should fail because no file provided
        assert response.status_code in [400, 422]
        print(f"✓ Logo upload endpoint exists and validates input")
    
    def test_header_upload_endpoint_exists(self, authenticated_client):
        """Verify header image upload endpoint exists."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        
        if not sites:
            pytest.skip("No sites available for testing")
        
        site_id = sites[0]["id"]
        
        headers = {"Authorization": authenticated_client.headers["Authorization"]}
        response = requests.post(
            f"{BASE_URL}/api/sites/{site_id}/header",
            headers=headers
        )
        assert response.status_code in [400, 422]
        print(f"✓ Header image upload endpoint exists and validates input")
    
    def test_audio_upload_endpoint_exists(self, authenticated_client):
        """Verify audio upload endpoint exists."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        
        if not sites:
            pytest.skip("No sites available for testing")
        
        site_id = sites[0]["id"]
        
        headers = {"Authorization": authenticated_client.headers["Authorization"]}
        response = requests.post(
            f"{BASE_URL}/api/sites/{site_id}/audio",
            headers=headers
        )
        assert response.status_code in [400, 422]
        print(f"✓ Audio upload endpoint exists and validates input")


class TestSiteUpdate:
    """Tests for site update functionality."""
    
    def test_update_site(self, authenticated_client):
        """Test updating site settings."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        
        if not sites:
            pytest.skip("No sites available for testing")
        
        site_id = sites[0]["id"]
        original_name = sites[0]["name"]
        
        # Update site (minor change that won't affect other tests)
        update_data = {"name": original_name}  # Same name, just testing endpoint
        response = authenticated_client.put(
            f"{BASE_URL}/api/sites/{site_id}",
            json=update_data
        )
        assert response.status_code == 200
        
        updated_site = response.json()
        assert updated_site["name"] == original_name
        print(f"✓ Site update endpoint working")


class TestSiteSubmissions:
    """Tests for site form submissions."""
    
    def test_get_submissions(self, authenticated_client):
        """Test getting form submissions for a site."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        
        if not sites:
            pytest.skip("No sites available for testing")
        
        site_id = sites[0]["id"]
        
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{site_id}/submissions")
        assert response.status_code == 200
        submissions = response.json()
        assert isinstance(submissions, list)
        print(f"✓ Found {len(submissions)} submissions for site")
    
    def test_public_form_submit(self, authenticated_client):
        """Test submitting form on public site."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        
        if not sites:
            pytest.skip("No sites available for testing")
        
        # Find a site with form enabled
        site_with_form = None
        for site in sites:
            site_detail = authenticated_client.get(f"{BASE_URL}/api/sites/{site['id']}").json()
            if site_detail.get("form_enabled"):
                site_with_form = site_detail
                break
        
        if not site_with_form:
            pytest.skip("No site with form enabled")
        
        slug = site_with_form["slug"]
        
        # Submit form
        submission_data = {
            "name": "TEST_Integration Test",
            "phone": "1234567890",
            "message": "This is a test submission from automated tests",
            "custom_fields": {}
        }
        
        response = requests.post(
            f"{BASE_URL}/api/sites/public/{slug}/submit",
            json=submission_data
        )
        assert response.status_code == 200
        result = response.json()
        assert "id" in result
        print(f"✓ Form submission successful, ID: {result['id']}")


class TestSiteUsers:
    """Tests for site user access management."""
    
    def test_get_site_users(self, authenticated_client):
        """Test getting users with access to a site."""
        response = authenticated_client.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        
        if not sites:
            pytest.skip("No sites available for testing")
        
        site_id = sites[0]["id"]
        
        response = authenticated_client.get(f"{BASE_URL}/api/sites/{site_id}/users")
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        print(f"✓ Found {len(users)} users with site access")
