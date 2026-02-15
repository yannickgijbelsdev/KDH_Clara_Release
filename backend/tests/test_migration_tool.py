"""
Backend API tests for Migration Tool endpoints.
Tests: detect-site-info, status, and run (dry_run) endpoints.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "yannick.gijbels@koodh.com"
TEST_PASSWORD = "test"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for network admin user."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data
    assert data["user"]["is_network_admin"] is True, "User must be network admin"
    return data["token"]


@pytest.fixture
def auth_headers(auth_token):
    """Auth headers with bearer token."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestMigrationDetectSiteInfo:
    """Tests for /api/admin/migration/detect-site-info endpoint."""
    
    def test_detect_site_info_returns_200(self, auth_headers):
        """Test that detect-site-info endpoint returns 200."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/detect-site-info",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_detect_site_info_returns_suggested_name(self, auth_headers):
        """Test that detect-site-info returns suggested_name field."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/detect-site-info",
            headers=auth_headers
        )
        data = response.json()
        assert "suggested_name" in data
        assert data["suggested_name"] == "Radiogroep MFY/GRK", \
            f"Expected 'Radiogroep MFY/GRK', got '{data['suggested_name']}'"
    
    def test_detect_site_info_returns_suggested_slug(self, auth_headers):
        """Test that detect-site-info returns suggested_slug field."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/detect-site-info",
            headers=auth_headers
        )
        data = response.json()
        assert "suggested_slug" in data
        assert isinstance(data["suggested_slug"], str)
    
    def test_detect_site_info_returns_detected_from(self, auth_headers):
        """Test that detect-site-info returns detected_from field."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/detect-site-info",
            headers=auth_headers
        )
        data = response.json()
        assert "detected_from" in data
        assert data["detected_from"] in ["team_name", "rds_settings", None]
    
    def test_detect_site_info_returns_team_info(self, auth_headers):
        """Test that detect-site-info returns team information."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/detect-site-info",
            headers=auth_headers
        )
        data = response.json()
        assert "team_count" in data
        assert "team_name" in data
        assert data["team_count"] >= 1


class TestMigrationStatus:
    """Tests for /api/admin/migration/status endpoint."""
    
    def test_migration_status_returns_200(self, auth_headers):
        """Test that status endpoint returns 200."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/status",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_migration_status_returns_counts(self, auth_headers):
        """Test that status returns total_documents, needs_migration, already_migrated."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/status",
            headers=auth_headers
        )
        data = response.json()
        
        assert "total_documents" in data
        assert "needs_migration" in data
        assert "already_migrated" in data
        
        # Verify they are integers
        assert isinstance(data["total_documents"], int)
        assert isinstance(data["needs_migration"], int)
        assert isinstance(data["already_migrated"], int)
    
    def test_migration_status_counts_are_consistent(self, auth_headers):
        """Test that total = needs_migration + already_migrated."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/status",
            headers=auth_headers
        )
        data = response.json()
        
        # Total should equal migrated + pending
        expected_total = data["needs_migration"] + data["already_migrated"]
        assert data["total_documents"] == expected_total, \
            f"Total ({data['total_documents']}) should equal needs + migrated ({expected_total})"
    
    def test_migration_status_returns_main_sites(self, auth_headers):
        """Test that status returns main_sites list."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/status",
            headers=auth_headers
        )
        data = response.json()
        
        assert "main_sites" in data
        assert isinstance(data["main_sites"], list)
        assert len(data["main_sites"]) >= 1, "Should have at least 1 main site"
        
        # Verify main site structure
        main_site = data["main_sites"][0]
        assert "id" in main_site
        assert "name" in main_site
        assert "slug" in main_site
    
    def test_migration_status_returns_collections(self, auth_headers):
        """Test that status returns collections information."""
        response = requests.get(
            f"{BASE_URL}/api/admin/migration/status",
            headers=auth_headers
        )
        data = response.json()
        
        assert "collections" in data
        assert isinstance(data["collections"], dict)
        
        # Verify collection structure
        if data["collections"]:
            first_collection = list(data["collections"].values())[0]
            assert "description" in first_collection
            assert "total" in first_collection
            assert "has_main_site_id" in first_collection
            assert "needs_migration" in first_collection


class TestMigrationDryRun:
    """Tests for /api/admin/migration/run endpoint with dry_run=True."""
    
    def test_dry_run_returns_200(self, auth_headers):
        """Test that dry run endpoint returns 200."""
        response = requests.post(
            f"{BASE_URL}/api/admin/migration/run",
            headers=auth_headers,
            json={
                "main_site_name": "Radiogroep MFY/GRK",
                "main_site_slug": "radiogroep",
                "dry_run": True
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_dry_run_returns_success_true(self, auth_headers):
        """Test that dry run returns success=True."""
        response = requests.post(
            f"{BASE_URL}/api/admin/migration/run",
            headers=auth_headers,
            json={
                "main_site_name": "Radiogroep MFY/GRK",
                "main_site_slug": "radiogroep",
                "dry_run": True
            }
        )
        data = response.json()
        assert data["success"] is True, f"Expected success=True, got {data}"
    
    def test_dry_run_returns_dry_run_flag(self, auth_headers):
        """Test that dry run returns dry_run=True in response."""
        response = requests.post(
            f"{BASE_URL}/api/admin/migration/run",
            headers=auth_headers,
            json={
                "main_site_name": "Radiogroep MFY/GRK",
                "main_site_slug": "radiogroep",
                "dry_run": True
            }
        )
        data = response.json()
        assert data["dry_run"] is True, "Dry run flag should be True"
    
    def test_dry_run_returns_main_site_info(self, auth_headers):
        """Test that dry run returns main site information."""
        response = requests.post(
            f"{BASE_URL}/api/admin/migration/run",
            headers=auth_headers,
            json={
                "main_site_name": "Radiogroep MFY/GRK",
                "main_site_slug": "radiogroep",
                "dry_run": True
            }
        )
        data = response.json()
        
        assert "main_site_id" in data
        assert "main_site_name" in data
        assert "main_site_slug" in data
        assert data["main_site_name"] == "Radiogroep MFY/GRK"
        assert data["main_site_slug"] == "radiogroep"
    
    def test_dry_run_returns_stats(self, auth_headers):
        """Test that dry run returns migration stats."""
        response = requests.post(
            f"{BASE_URL}/api/admin/migration/run",
            headers=auth_headers,
            json={
                "main_site_name": "Radiogroep MFY/GRK",
                "main_site_slug": "radiogroep",
                "dry_run": True
            }
        )
        data = response.json()
        
        assert "stats" in data
        stats = data["stats"]
        assert "main_site_created" in stats
        assert "users_linked" in stats
        assert "collections_updated" in stats
    
    def test_dry_run_returns_collections_updated(self, auth_headers):
        """Test that dry run returns collections_updated with 'would_migrate' status."""
        response = requests.post(
            f"{BASE_URL}/api/admin/migration/run",
            headers=auth_headers,
            json={
                "main_site_name": "Radiogroep MFY/GRK",
                "main_site_slug": "radiogroep",
                "dry_run": True
            }
        )
        data = response.json()
        
        collections = data["stats"]["collections_updated"]
        assert isinstance(collections, dict)
        
        # Check that collections have proper status
        for name, info in collections.items():
            assert "status" in info
            assert info["status"] in ["would_migrate", "already_migrated"]
            assert "updated" in info
    
    def test_dry_run_success_message(self, auth_headers):
        """Test that dry run returns proper success message."""
        response = requests.post(
            f"{BASE_URL}/api/admin/migration/run",
            headers=auth_headers,
            json={
                "main_site_name": "Radiogroep MFY/GRK",
                "main_site_slug": "radiogroep",
                "dry_run": True
            }
        )
        data = response.json()
        
        assert "message" in data
        assert "Dry run completed" in data["message"]


class TestMigrationAccessControl:
    """Tests for migration endpoint access control."""
    
    def test_detect_site_info_requires_auth(self):
        """Test that detect-site-info requires authentication."""
        response = requests.get(f"{BASE_URL}/api/admin/migration/detect-site-info")
        assert response.status_code in [401, 403, 422], \
            f"Expected auth error, got {response.status_code}"
    
    def test_status_requires_auth(self):
        """Test that status requires authentication."""
        response = requests.get(f"{BASE_URL}/api/admin/migration/status")
        assert response.status_code in [401, 403, 422], \
            f"Expected auth error, got {response.status_code}"
    
    def test_run_requires_auth(self):
        """Test that run requires authentication."""
        response = requests.post(
            f"{BASE_URL}/api/admin/migration/run",
            json={"main_site_name": "Test", "main_site_slug": "test", "dry_run": True}
        )
        assert response.status_code in [401, 403, 422], \
            f"Expected auth error, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
