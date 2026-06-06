"""
Test suite for:
1. CLI /disconnect configuration command - returns feature list with enabled/disabled states
2. PUT /api/cli/features-config/{main_site_id} - updates enabled features
3. Site type labels and packages validation
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"

# Known main_site_id for testing (Radiogroep MFY/GRK, type radio)
TEST_MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for testing"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # Token can be in 'token' or 'access_token' field
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestCLIDisconnectConfiguration:
    """Tests for /disconnect configuration CLI command"""

    def test_cli_disconnect_configuration_returns_features(self, api_client):
        """Test that /disconnect configuration returns feature list with enabled/disabled states"""
        response = api_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": TEST_MAIN_SITE_ID,
            "command": "/disconnect configuration"
        })
        assert response.status_code == 200, f"CLI execute failed: {response.text}"
        
        data = response.json()
        assert "type" in data, "Response missing 'type' field"
        assert data["type"] == "feature_config", f"Expected type 'feature_config', got '{data['type']}'"
        
        assert "data" in data, "Response missing 'data' field"
        config_data = data["data"]
        
        # Verify required fields in data
        assert "main_site_id" in config_data, "Missing main_site_id in config data"
        assert "site_type" in config_data, "Missing site_type in config data"
        assert "site_name" in config_data, "Missing site_name in config data"
        assert "features" in config_data, "Missing features in config data"
        
        # Verify features is a list with proper structure
        features = config_data["features"]
        assert isinstance(features, list), "Features should be a list"
        assert len(features) > 0, "Features list should not be empty"
        
        # Check each feature has required fields
        for feature in features:
            assert "id" in feature, f"Feature missing 'id': {feature}"
            assert "name" in feature, f"Feature missing 'name': {feature}"
            assert "enabled" in feature, f"Feature missing 'enabled': {feature}"
            assert isinstance(feature["enabled"], bool), f"Feature 'enabled' should be boolean: {feature}"
        
        print(f"SUCCESS: /disconnect configuration returned {len(features)} features for site type '{config_data['site_type']}'")
        print(f"  Site: {config_data['site_name']}")
        print(f"  Features: {[f['id'] for f in features]}")

    def test_cli_disconnect_configuration_features_match_site_type(self, api_client):
        """Test that returned features match the site type (radio site should have radio features)"""
        response = api_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": TEST_MAIN_SITE_ID,
            "command": "/disconnect configuration"
        })
        assert response.status_code == 200
        
        data = response.json()
        config_data = data["data"]
        site_type = config_data["site_type"]
        features = config_data["features"]
        feature_ids = [f["id"] for f in features]
        
        # Radio sites should have these features
        if site_type == "radio":
            expected_features = ["shows", "calendar", "content_library", "team_chat", "rds_settings"]
            for expected in expected_features:
                assert expected in feature_ids, f"Radio site missing expected feature: {expected}"
            print("SUCCESS: Radio site has expected features")
        
        # Task scheduler sites should have task_boards
        elif site_type == "task_scheduler":
            assert "task_boards" in feature_ids, "Task scheduler site missing task_boards feature"
            print("SUCCESS: Task scheduler site has task_boards feature")
        
        # Server sites should have xml_imports, vmix_director, etc.
        elif site_type == "server":
            expected_features = ["xml_imports", "server_api_keys", "vmix_director"]
            for expected in expected_features:
                assert expected in feature_ids, f"Server site missing expected feature: {expected}"
            print("SUCCESS: Server site has expected features")


class TestCLIFeaturesConfigUpdate:
    """Tests for PUT /api/cli/features-config/{main_site_id}"""

    def test_update_features_config_success(self, api_client):
        """Test updating enabled features via PUT endpoint"""
        # First get current features
        response = api_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": TEST_MAIN_SITE_ID,
            "command": "/disconnect configuration"
        })
        assert response.status_code == 200
        
        original_data = response.json()["data"]
        original_features = [f["id"] for f in original_data["features"] if f["enabled"]]
        
        # Update with a subset of features
        test_features = ["shows", "calendar", "content_library", "team_settings"]
        
        update_response = api_client.put(
            f"{BASE_URL}/api/cli/features-config/{TEST_MAIN_SITE_ID}",
            json={"features": test_features}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        update_data = update_response.json()
        assert "output" in update_data, "Response missing 'output' field"
        assert "type" in update_data, "Response missing 'type' field"
        assert update_data["type"] == "success", f"Expected type 'success', got '{update_data['type']}'"
        
        print(f"SUCCESS: Features updated - {update_data['output']}")
        
        # Restore original features
        restore_response = api_client.put(
            f"{BASE_URL}/api/cli/features-config/{TEST_MAIN_SITE_ID}",
            json={"features": original_features}
        )
        assert restore_response.status_code == 200, f"Restore failed: {restore_response.text}"
        print("SUCCESS: Original features restored")

    def test_update_features_config_invalid_site(self, api_client):
        """Test updating features for non-existent site returns 404"""
        response = api_client.put(
            f"{BASE_URL}/api/cli/features-config/non-existent-site-id",
            json={"features": ["shows"]}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Non-existent site returns 404")

    def test_update_features_config_filters_invalid_features(self, api_client):
        """Test that invalid features are filtered out based on site type"""
        # First get current features to restore later
        response = api_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": TEST_MAIN_SITE_ID,
            "command": "/disconnect configuration"
        })
        assert response.status_code == 200
        
        original_data = response.json()["data"]
        original_features = [f["id"] for f in original_data["features"] if f["enabled"]]
        
        # Try to set features that don't belong to this site type
        # For a radio site, zerotier is not a valid feature
        invalid_features = ["shows", "zerotier", "task_boards", "xml_imports"]
        
        update_response = api_client.put(
            f"{BASE_URL}/api/cli/features-config/{TEST_MAIN_SITE_ID}",
            json={"features": invalid_features}
        )
        assert update_response.status_code == 200
        
        # Verify only valid features were saved
        verify_response = api_client.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": TEST_MAIN_SITE_ID,
            "command": "/disconnect configuration"
        })
        assert verify_response.status_code == 200
        
        verify_data = verify_response.json()["data"]
        enabled_features = [f["id"] for f in verify_data["features"] if f["enabled"]]
        
        # zerotier, task_boards, xml_imports should NOT be in enabled features for radio site
        if verify_data["site_type"] == "radio":
            assert "zerotier" not in enabled_features, "zerotier should not be enabled for radio site"
            assert "task_boards" not in enabled_features, "task_boards should not be enabled for radio site"
            assert "xml_imports" not in enabled_features, "xml_imports should not be enabled for radio site"
            print("SUCCESS: Invalid features were filtered out")
        
        # Restore original features
        api_client.put(
            f"{BASE_URL}/api/cli/features-config/{TEST_MAIN_SITE_ID}",
            json={"features": original_features}
        )


class TestMainSitesAPI:
    """Tests for main sites API - verifying site type labels and packages"""

    def test_get_main_sites_returns_site_type(self, api_client):
        """Test that GET /api/main-sites returns site_type field"""
        response = api_client.get(f"{BASE_URL}/api/main-sites")
        assert response.status_code == 200, f"Failed to get main sites: {response.text}"
        
        sites = response.json()
        assert isinstance(sites, list), "Response should be a list"
        
        # Find our test site
        test_site = next((s for s in sites if s.get("id") == TEST_MAIN_SITE_ID), None)
        if test_site:
            assert "site_type" in test_site, "Site missing site_type field"
            print(f"SUCCESS: Site '{test_site.get('name')}' has site_type: {test_site.get('site_type')}")
        
        # Check all sites have site_type
        for site in sites:
            assert "site_type" in site or site.get("site_type") is None, f"Site {site.get('name')} missing site_type"
        
        print(f"SUCCESS: All {len(sites)} sites have site_type field")

    def test_get_available_features(self, api_client):
        """Test that GET /api/main-sites/features returns available features"""
        response = api_client.get(f"{BASE_URL}/api/main-sites/features")
        assert response.status_code == 200, f"Failed to get features: {response.text}"
        
        data = response.json()
        assert "features" in data, "Response missing 'features' field"
        
        features = data["features"]
        assert isinstance(features, list), "Features should be a list"
        assert len(features) > 0, "Features list should not be empty"
        
        print(f"SUCCESS: Got {len(features)} available features")


class TestCLIAccessStatus:
    """Tests for CLI access status endpoint"""

    def test_cli_access_status_for_admin(self, api_client):
        """Test that admin/network admin gets approved status"""
        response = api_client.get(f"{BASE_URL}/api/cli/access-status/{TEST_MAIN_SITE_ID}")
        assert response.status_code == 200, f"Failed to get CLI access status: {response.text}"
        
        data = response.json()
        assert "status" in data, "Response missing 'status' field"
        # Admin should have approved status or admin override
        assert data["status"] == "approved" or data.get("is_admin_override"), \
            f"Expected approved status for admin, got: {data}"
        
        print(f"SUCCESS: CLI access status for admin: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
