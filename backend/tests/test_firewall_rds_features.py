"""
Test suite for Firewall Global Protect badges and RDS menu consolidation features.
Tests:
1. GET /api/firewall/status/bulk - Returns correct enabled status per site
2. RDS permission migration - Single 'rds' feature instead of rds_settings/rds_builder/rds_monitor
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"

# Known site IDs from the test context
RADIO_BALA_ID = "9a05843f-1c1e-41cb-b19e-9350902e050b"  # firewall enabled
MFY_GRK_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"    # firewall enabled
DBNT_STUDIO_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"  # firewall disabled


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API calls."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestFirewallStatusBulk:
    """Tests for GET /api/firewall/status/bulk endpoint."""
    
    def test_firewall_status_bulk_returns_200(self, auth_headers):
        """Test that the endpoint returns 200 OK."""
        response = requests.get(
            f"{BASE_URL}/api/firewall/status/bulk",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_firewall_status_bulk_structure(self, auth_headers):
        """Test that response has correct structure with status and rule_counts."""
        response = requests.get(
            f"{BASE_URL}/api/firewall/status/bulk",
            headers=auth_headers
        )
        data = response.json()
        
        assert "status" in data, "Response should have 'status' field"
        assert "rule_counts" in data, "Response should have 'rule_counts' field"
        assert isinstance(data["status"], dict), "'status' should be a dictionary"
        assert isinstance(data["rule_counts"], dict), "'rule_counts' should be a dictionary"
    
    def test_radio_bala_firewall_enabled(self, auth_headers):
        """Test that Radio Bala has firewall enabled=true."""
        response = requests.get(
            f"{BASE_URL}/api/firewall/status/bulk",
            headers=auth_headers
        )
        data = response.json()
        
        assert RADIO_BALA_ID in data["status"], f"Radio Bala ({RADIO_BALA_ID}) should be in status"
        assert data["status"][RADIO_BALA_ID] == True, "Radio Bala firewall should be enabled"
    
    def test_mfy_grk_firewall_enabled(self, auth_headers):
        """Test that MFY/GRK has firewall enabled=true."""
        response = requests.get(
            f"{BASE_URL}/api/firewall/status/bulk",
            headers=auth_headers
        )
        data = response.json()
        
        assert MFY_GRK_ID in data["status"], f"MFY/GRK ({MFY_GRK_ID}) should be in status"
        assert data["status"][MFY_GRK_ID] == True, "MFY/GRK firewall should be enabled"
    
    def test_dbnt_studio_firewall_disabled(self, auth_headers):
        """Test that DBNT Studio has firewall enabled=false."""
        response = requests.get(
            f"{BASE_URL}/api/firewall/status/bulk",
            headers=auth_headers
        )
        data = response.json()
        
        assert DBNT_STUDIO_ID in data["status"], f"DBNT Studio ({DBNT_STUDIO_ID}) should be in status"
        assert data["status"][DBNT_STUDIO_ID] == False, "DBNT Studio firewall should be disabled"
    
    def test_firewall_status_requires_auth(self):
        """Test that endpoint requires authentication."""
        response = requests.get(f"{BASE_URL}/api/firewall/status/bulk")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"


class TestRDSFeatureConsolidation:
    """Tests for RDS menu/permission consolidation."""
    
    def test_radio_bala_has_single_rds_feature(self, auth_headers):
        """Test that Radio Bala has single 'rds' feature, not old separate features."""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/{RADIO_BALA_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get Radio Bala: {response.text}"
        
        data = response.json()
        enabled_features = data.get("enabled_features", [])
        
        # Should have 'rds' feature
        assert "rds" in enabled_features, "Radio Bala should have 'rds' feature enabled"
        
        # Should NOT have old separate features
        old_features = ["rds_settings", "rds_builder", "rds_monitor"]
        for old_feat in old_features:
            assert old_feat not in enabled_features, f"Radio Bala should NOT have old '{old_feat}' feature"
    
    def test_mfy_grk_has_single_rds_feature(self, auth_headers):
        """Test that MFY/GRK has single 'rds' feature, not old separate features."""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/{MFY_GRK_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get MFY/GRK: {response.text}"
        
        data = response.json()
        enabled_features = data.get("enabled_features", [])
        
        # Should have 'rds' feature
        assert "rds" in enabled_features, "MFY/GRK should have 'rds' feature enabled"
        
        # Should NOT have old separate features
        old_features = ["rds_settings", "rds_builder", "rds_monitor"]
        for old_feat in old_features:
            assert old_feat not in enabled_features, f"MFY/GRK should NOT have old '{old_feat}' feature"


class TestRDSEndpoints:
    """Tests for RDS API endpoints."""
    
    def test_rds_endpoints_returns_200(self, auth_headers):
        """Test that RDS endpoints API returns 200."""
        response = requests.get(
            f"{BASE_URL}/api/rds/endpoints",
            headers={**auth_headers, "X-Main-Site-Id": RADIO_BALA_ID}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_rds_endpoints_returns_station_data(self, auth_headers):
        """Test that RDS endpoints returns station-specific data."""
        response = requests.get(
            f"{BASE_URL}/api/rds/endpoints",
            headers={**auth_headers, "X-Main-Site-Id": RADIO_BALA_ID}
        )
        data = response.json()
        
        # Should have endpoints array
        assert "endpoints" in data or isinstance(data, list), "Response should have endpoints data"


class TestCLIFeatureConfig:
    """Tests for CLI feature configuration (ALL_FEATURES and ALL_AVAILABLE_FEATURES)."""
    
    def test_cli_disconnect_configuration(self, auth_headers):
        """Test that CLI disconnect configuration returns features with single 'rds'."""
        response = requests.post(
            f"{BASE_URL}/api/cli/execute",
            headers=auth_headers,
            json={
                "main_site_id": RADIO_BALA_ID,
                "command": "/disconnect configuration"
            }
        )
        assert response.status_code == 200, f"CLI execute failed: {response.text}"
        
        data = response.json()
        
        # Check if response has feature_config type
        if data.get("type") == "feature_config":
            features = data.get("data", {}).get("features", [])
            feature_ids = [f["id"] for f in features]
            
            # Should have 'rds' feature
            assert "rds" in feature_ids, "CLI config should include 'rds' feature"
            
            # Should NOT have old separate features
            old_features = ["rds_settings", "rds_builder", "rds_monitor"]
            for old_feat in old_features:
                assert old_feat not in feature_ids, f"CLI config should NOT include old '{old_feat}' feature"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
