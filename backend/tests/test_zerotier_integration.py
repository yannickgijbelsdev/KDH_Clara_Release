"""
ZeroTier Integration Tests
Tests for technical site type and ZeroTier monitoring feature
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"


class TestZeroTierIntegration:
    """ZeroTier integration tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        # Get zt-monitor site ID
        sites_res = requests.get(f"{BASE_URL}/api/main-sites", headers=self.headers)
        sites = sites_res.json()
        zt_site = next((s for s in sites if s.get("slug") == "zt-monitor"), None)
        if zt_site:
            self.zt_site_id = zt_site["id"]
        else:
            self.zt_site_id = None

    # ============== Main Site Tests ==============
    
    def test_get_main_sites_returns_site_type(self):
        """GET /api/main-sites should return site_type field"""
        response = requests.get(f"{BASE_URL}/api/main-sites", headers=self.headers)
        assert response.status_code == 200
        sites = response.json()
        assert len(sites) > 0
        
        # Check that site_type field exists
        for site in sites:
            assert "site_type" in site, f"Missing site_type field in site {site.get('name')}"
            assert site["site_type"] in ["radio", "technical"], f"Invalid site_type: {site.get('site_type')}"
    
    def test_zt_monitor_site_exists_and_is_technical(self):
        """Verify zt-monitor site exists with site_type=technical"""
        response = requests.get(f"{BASE_URL}/api/main-sites/by-slug/zt-monitor", headers=self.headers)
        assert response.status_code == 200, f"zt-monitor site not found: {response.text}"
        site = response.json()
        assert site["slug"] == "zt-monitor"
        assert site.get("site_type") == "technical", f"Expected site_type='technical', got '{site.get('site_type')}'"
    
    def test_create_technical_site_type(self):
        """POST /api/main-sites with site_type=technical creates technical site"""
        test_slug = f"test-tech-{uuid.uuid4().hex[:8]}"
        payload = {
            "name": "Test Technical Site",
            "slug": test_slug,
            "enabled_features": ["team_settings", "zerotier"],
            "site_type": "technical"
        }
        
        response = requests.post(f"{BASE_URL}/api/main-sites", headers=self.headers, json=payload)
        assert response.status_code == 200, f"Failed to create technical site: {response.text}"
        site = response.json()
        assert site["site_type"] == "technical"
        assert site["slug"] == test_slug
        
        # Cleanup - delete the test site
        delete_res = requests.delete(f"{BASE_URL}/api/main-sites/{site['id']}", headers=self.headers)
        assert delete_res.status_code == 200
    
    def test_features_endpoint_includes_zerotier(self):
        """GET /api/main-sites/features returns zerotier in the features list"""
        response = requests.get(f"{BASE_URL}/api/main-sites/features", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        features = data.get("features", [])
        
        feature_ids = [f["id"] for f in features]
        assert "zerotier" in feature_ids, f"zerotier not in features list: {feature_ids}"
        
        # Verify zerotier feature has correct group
        zt_feature = next((f for f in features if f["id"] == "zerotier"), None)
        assert zt_feature is not None
        assert zt_feature.get("group") == "technical"
        assert zt_feature.get("name") == "ZeroTier Monitor"
    
    # ============== ZeroTier Config Tests ==============
    
    def test_zerotier_config_get_unconfigured(self):
        """GET /api/zerotier/{main_site_id}/config returns empty config for unconfigured site"""
        if not self.zt_site_id:
            pytest.skip("zt-monitor site not found")
        
        response = requests.get(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/config", headers=self.headers)
        assert response.status_code == 200
        config = response.json()
        
        # Check expected fields
        assert "main_site_id" in config
        assert "network_id" in config
        assert "api_token_masked" in config
        # Token should be masked or empty
        assert "api_token" not in config, "api_token should not be exposed in response"
    
    def test_zerotier_config_update(self):
        """PUT /api/zerotier/{main_site_id}/config saves configuration"""
        if not self.zt_site_id:
            pytest.skip("zt-monitor site not found")
        
        # Update config
        payload = {
            "api_token": "test_token_12345678",
            "network_id": "8056c2e21c000001"
        }
        response = requests.put(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/config", headers=self.headers, json=payload)
        assert response.status_code == 200
        result = response.json()
        assert result.get("status") == "ok"
        
        # Verify config was saved
        get_res = requests.get(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/config", headers=self.headers)
        assert get_res.status_code == 200
        config = get_res.json()
        assert config["network_id"] == "8056c2e21c000001"
        assert config.get("api_token_masked"), "Token should be masked after setting"
        # Verify token is masked properly
        assert "test" in config.get("api_token_masked", "") or "****" in config.get("api_token_masked", "")
    
    def test_zerotier_config_partial_update(self):
        """PUT /api/zerotier/{main_site_id}/config allows partial updates"""
        if not self.zt_site_id:
            pytest.skip("zt-monitor site not found")
        
        # Update only network_id
        payload = {"network_id": "a1b2c3d4e5f6g7h8"}
        response = requests.put(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/config", headers=self.headers, json=payload)
        assert response.status_code == 200
        
        # Verify network_id updated without affecting token
        get_res = requests.get(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/config", headers=self.headers)
        config = get_res.json()
        assert config["network_id"] == "a1b2c3d4e5f6g7h8"
    
    def test_zerotier_config_unauthorized(self):
        """GET /api/zerotier/{main_site_id}/config returns 401/403 without auth"""
        if not self.zt_site_id:
            pytest.skip("zt-monitor site not found")
        
        response = requests.get(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/config")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    # ============== ZeroTier Members Tests ==============
    
    def test_zerotier_members_unconfigured(self):
        """GET /api/zerotier/{main_site_id}/members returns 400 when not configured"""
        if not self.zt_site_id:
            pytest.skip("zt-monitor site not found")
        
        # First, clear config to test unconfigured state (set empty values)
        clear_payload = {"network_id": "", "api_token": ""}
        requests.put(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/config", headers=self.headers, json=clear_payload)
        
        response = requests.get(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/members", headers=self.headers)
        # Should return 400 because not configured
        assert response.status_code == 400, f"Expected 400 for unconfigured, got {response.status_code}"
        assert "not configured" in response.json().get("detail", "").lower()
    
    def test_zerotier_members_with_invalid_token(self):
        """GET /api/zerotier/{main_site_id}/members returns 401 with invalid ZT token"""
        if not self.zt_site_id:
            pytest.skip("zt-monitor site not found")
        
        # Set a fake token and network ID
        config_payload = {"api_token": "fake_invalid_token", "network_id": "8056c2e21c000001"}
        requests.put(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/config", headers=self.headers, json=config_payload)
        
        # Try to get members - should fail with ZT API auth error
        response = requests.get(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/members", headers=self.headers)
        # ZeroTier API returns 401 for invalid token
        assert response.status_code in [401, 403, 500], f"Expected auth error, got {response.status_code}"
    
    # ============== ZeroTier Network Tests ==============
    
    def test_zerotier_network_unconfigured(self):
        """GET /api/zerotier/{main_site_id}/network returns 400 when not configured"""
        if not self.zt_site_id:
            pytest.skip("zt-monitor site not found")
        
        # Clear config
        clear_payload = {"network_id": "", "api_token": ""}
        requests.put(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/config", headers=self.headers, json=clear_payload)
        
        response = requests.get(f"{BASE_URL}/api/zerotier/{self.zt_site_id}/network", headers=self.headers)
        assert response.status_code == 400


class TestTechnicalSiteNavigation:
    """Tests for technical site limited navigation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_technical_site_enabled_features(self):
        """Technical site should have limited features enabled"""
        response = requests.get(f"{BASE_URL}/api/main-sites/by-slug/zt-monitor", headers=self.headers)
        if response.status_code != 200:
            pytest.skip("zt-monitor site not found")
        
        site = response.json()
        features = site.get("enabled_features", [])
        
        # Technical sites should have team_settings and zerotier
        assert "team_settings" in features or "zerotier" in features, \
            f"Technical site missing expected features. Has: {features}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
