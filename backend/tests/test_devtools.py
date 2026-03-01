"""DevTools API Tests - Clone sites, DevTools panel, source code viewer"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
NETWORK_ADMIN = {
    "email": "admkoodh@koodh.com",
    "password": "KYLovie13monx"
}

# Clone site info
CLONE_SLUG = "clone-radiogroep-e4bb83"
CLONE_MAIN_SITE_ID = "b815d88f-0f09-4053-9103-1de53879e572"
ORIGINAL_MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for network admin"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=NETWORK_ADMIN,
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data.get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestCloneSiteBasics:
    """Test clone site configuration and API responses"""

    def test_clone_site_exists_in_main_sites_list(self, auth_headers):
        """Clone site should appear in main sites list with [CLONE] badge info"""
        response = requests.get(f"{BASE_URL}/api/main-sites", headers=auth_headers)
        assert response.status_code == 200
        
        sites = response.json()
        clone_site = next((s for s in sites if s.get("slug") == CLONE_SLUG), None)
        
        assert clone_site is not None, f"Clone site {CLONE_SLUG} not found"
        assert clone_site.get("cloned_from") == ORIGINAL_MAIN_SITE_ID, "cloned_from field should reference original site"
        assert "[TEST]" in clone_site.get("name", ""), "Clone name should have [TEST] prefix"
        print(f"✓ Clone site found with cloned_from={clone_site.get('cloned_from')}")

    def test_clone_site_by_slug_endpoint(self, auth_headers):
        """GET /api/main-sites/by-slug/{slug} returns clone with cloned_from"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/by-slug/{CLONE_SLUG}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        site = response.json()
        assert site.get("id") == CLONE_MAIN_SITE_ID
        assert site.get("cloned_from") == ORIGINAL_MAIN_SITE_ID
        assert site.get("slug") == CLONE_SLUG
        print(f"✓ Clone site returned with cloned_from field: {site.get('cloned_from')}")

    def test_main_site_response_includes_cloned_from_field(self, auth_headers):
        """MainSiteResponse model should include cloned_from field"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/by-slug/{CLONE_SLUG}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        site = response.json()
        # Verify all expected fields are present
        expected_fields = ["id", "name", "slug", "enabled_features", "cloned_from"]
        for field in expected_fields:
            assert field in site, f"Field '{field}' missing from MainSiteResponse"
        print(f"✓ MainSiteResponse includes cloned_from field")

    def test_original_site_has_no_cloned_from(self, auth_headers):
        """Original site should have cloned_from as null"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/by-slug/radiogroep",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        site = response.json()
        assert site.get("cloned_from") is None, "Original site should not have cloned_from"
        print(f"✓ Original site has cloned_from=null")


class TestDevToolsSourceEndpoint:
    """Test GET /api/devtools/source endpoint for code viewing"""

    def test_valid_source_file_returns_content(self, auth_headers):
        """Valid source file path returns content"""
        response = requests.get(
            f"{BASE_URL}/api/devtools/source?file=src/pages/ShowsPage.js",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "content" in data
        assert "lines" in data
        assert "size" in data
        assert data.get("file") == "src/pages/ShowsPage.js"
        assert len(data.get("content", "")) > 0
        print(f"✓ Source code returned: {data.get('lines')} lines, {data.get('size')} bytes")

    def test_valid_component_file(self, auth_headers):
        """Component file paths are allowed"""
        response = requests.get(
            f"{BASE_URL}/api/devtools/source?file=src/components/MainSiteDashboardLayout.js",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "content" in data
        print(f"✓ Component file accessible")

    def test_valid_context_file(self, auth_headers):
        """Context file paths are allowed"""
        response = requests.get(
            f"{BASE_URL}/api/devtools/source?file=src/context/DevToolsContext.js",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "content" in data
        print(f"✓ Context file accessible")

    def test_invalid_path_with_directory_traversal(self, auth_headers):
        """Path with '..' should return 400"""
        response = requests.get(
            f"{BASE_URL}/api/devtools/source?file=../../../etc/passwd",
            headers=auth_headers
        )
        assert response.status_code == 400
        assert "Invalid path" in response.json().get("detail", "")
        print(f"✓ Directory traversal blocked with 400")

    def test_path_outside_allowed_prefixes(self, auth_headers):
        """Path not in allowed prefixes should return 403"""
        response = requests.get(
            f"{BASE_URL}/api/devtools/source?file=package.json",
            headers=auth_headers
        )
        assert response.status_code == 403
        assert "not allowed" in response.json().get("detail", "")
        print(f"✓ Unauthorized path blocked with 403")

    def test_nonexistent_file_returns_404(self, auth_headers):
        """Non-existent file should return 404"""
        response = requests.get(
            f"{BASE_URL}/api/devtools/source?file=src/pages/NonExistentPage.js",
            headers=auth_headers
        )
        assert response.status_code == 404
        assert "not found" in response.json().get("detail", "").lower()
        print(f"✓ Non-existent file returns 404")

    def test_unauthenticated_request_returns_401(self):
        """Unauthenticated requests should be rejected"""
        response = requests.get(
            f"{BASE_URL}/api/devtools/source?file=src/pages/ShowsPage.js"
        )
        # Could be 401 or 403 depending on auth middleware
        assert response.status_code in [401, 403]
        print(f"✓ Unauthenticated request rejected with {response.status_code}")


class TestCloneSiteNavigation:
    """Test clone site routes and navigation"""

    def test_clone_shows_endpoint(self, auth_headers):
        """Shows endpoint works for clone site"""
        # First get the team_id for the clone site
        response = requests.get(
            f"{BASE_URL}/api/main-sites/by-slug/{CLONE_SLUG}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Then fetch shows - the backend should use the clone's context
        response = requests.get(
            f"{BASE_URL}/api/shows",
            headers=auth_headers
        )
        # Shows endpoint should work
        assert response.status_code == 200
        print(f"✓ Shows endpoint accessible")

    def test_clone_site_enabled_features(self, auth_headers):
        """Clone site should have same features as original"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/by-slug/{CLONE_SLUG}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        clone = response.json()
        features = clone.get("enabled_features", [])
        
        assert "shows" in features, "Clone should have shows feature"
        assert "calendar" in features, "Clone should have calendar feature"
        print(f"✓ Clone has {len(features)} enabled features")


class TestBackupsAndSnapshotsForClone:
    """Test backup/snapshot endpoints for clone sites"""

    def test_list_backups_for_clone_site(self, auth_headers):
        """GET /api/backups/{clone_id} returns backups for clone"""
        response = requests.get(
            f"{BASE_URL}/api/backups/{CLONE_MAIN_SITE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "backups" in data
        print(f"✓ Clone site has {len(data.get('backups', []))} backups/snapshots")

    def test_create_snapshot_for_clone(self, auth_headers):
        """POST /api/backups/{clone_id} creates a snapshot"""
        response = requests.post(
            f"{BASE_URL}/api/backups/{CLONE_MAIN_SITE_ID}",
            headers=auth_headers
        )
        # Should succeed or already have recent backup
        assert response.status_code in [200, 201]
        
        if response.status_code in [200, 201]:
            data = response.json()
            assert data.get("status") == "completed"
            print(f"✓ Snapshot created with {data.get('document_count')} documents")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
