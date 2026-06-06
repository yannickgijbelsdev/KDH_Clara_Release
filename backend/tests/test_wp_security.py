"""
Test WP Security endpoints - 6-step wizard with Cloudflare WAF and Wordfence integration
Tests for the WordPress Security wizard page at /:mainSiteSlug/wp-security

Endpoints tested:
- GET /api/wp-security/config - returns config with masked API token
- PUT /api/wp-security/config - saves wordpress_url
- PUT /api/wp-security/cloudflare-config - saves cf_api_token and cf_zone_id
- GET /api/wp-security/cloudflare-test - tests Cloudflare credentials
- PUT /api/wp-security/waf-rules - saves WAF rules with cloudflare_sync
- POST /api/wp-security/blocklist - adds IP with cloudflare_sync
- DELETE /api/wp-security/blocklist/{ip} - removes IP with cloudflare_sync
- PUT /api/wp-security/login-protection - saves login protection with cloudflare_sync
- GET /api/wp-security/test-connection - WordPress URL reachability
- GET /api/wp-security/wordfence-status - Wordfence installation and vulnerability scan
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"
WP_SECURITY_SITE_ID = "5d407d27-d697-442e-b877-4772aaf88791"

# Test data
TEST_WP_URL = "https://test-wordpress-site.example.com"
TEST_IP = "192.168.99.99"
TEST_IP_NOTE = "Test blocked IP"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for system admin"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token") or data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token and main site ID"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "x-main-site-id": WP_SECURITY_SITE_ID
    }


class TestWpSecurityConfig:
    """Tests for GET/PUT /api/wp-security/config"""
    
    def test_get_config_requires_auth(self):
        """GET /api/wp-security/config requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/wp-security/config",
            headers={"x-main-site-id": WP_SECURITY_SITE_ID}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_get_config_requires_main_site_id(self, auth_headers):
        """GET /api/wp-security/config requires x-main-site-id header"""
        headers = {k: v for k, v in auth_headers.items() if k != "x-main-site-id"}
        response = requests.get(f"{BASE_URL}/api/wp-security/config", headers=headers)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "main site" in data.get("detail", "").lower()
    
    def test_get_config_success(self, auth_headers):
        """GET /api/wp-security/config returns config object with masked token fields"""
        response = requests.get(f"{BASE_URL}/api/wp-security/config", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Config should have cf_api_token_set and cf_api_token_preview fields
        assert isinstance(data, dict)
        assert "cf_api_token_set" in data, "Response should include cf_api_token_set boolean"
        assert isinstance(data["cf_api_token_set"], bool)
        # cf_api_token_preview should be string or None
        assert "cf_api_token_preview" in data
    
    def test_put_config_saves_wordpress_url(self, auth_headers):
        """PUT /api/wp-security/config saves wordpress_url"""
        response = requests.put(
            f"{BASE_URL}/api/wp-security/config",
            headers=auth_headers,
            json={"wordpress_url": TEST_WP_URL}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ok"
        
        # Verify persistence with GET
        get_response = requests.get(f"{BASE_URL}/api/wp-security/config", headers=auth_headers)
        assert get_response.status_code == 200
        config = get_response.json()
        assert config.get("wordpress_url") == TEST_WP_URL
    
    def test_put_config_requires_wordpress_url(self, auth_headers):
        """PUT /api/wp-security/config requires wordpress_url"""
        response = requests.put(
            f"{BASE_URL}/api/wp-security/config",
            headers=auth_headers,
            json={}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
    
    def test_put_config_strips_trailing_slash(self, auth_headers):
        """PUT /api/wp-security/config strips trailing slash from URL"""
        url_with_slash = "https://example.com/"
        response = requests.put(
            f"{BASE_URL}/api/wp-security/config",
            headers=auth_headers,
            json={"wordpress_url": url_with_slash}
        )
        assert response.status_code == 200
        
        # Verify trailing slash was stripped
        get_response = requests.get(f"{BASE_URL}/api/wp-security/config", headers=auth_headers)
        config = get_response.json()
        assert config.get("wordpress_url") == "https://example.com"


class TestWpSecurityCloudflareConfig:
    """Tests for PUT /api/wp-security/cloudflare-config and GET /api/wp-security/cloudflare-test"""
    
    def test_put_cloudflare_config_requires_auth(self):
        """PUT /api/wp-security/cloudflare-config requires authentication"""
        response = requests.put(
            f"{BASE_URL}/api/wp-security/cloudflare-config",
            headers={"x-main-site-id": WP_SECURITY_SITE_ID, "Content-Type": "application/json"},
            json={"cf_api_token": "test_token", "cf_zone_id": "test_zone"}
        )
        assert response.status_code in [401, 403]
    
    def test_put_cloudflare_config_saves_credentials(self, auth_headers):
        """PUT /api/wp-security/cloudflare-config saves cf_api_token and cf_zone_id"""
        response = requests.put(
            f"{BASE_URL}/api/wp-security/cloudflare-config",
            headers=auth_headers,
            json={"cf_api_token": "test_token_12345678", "cf_zone_id": "test_zone_id_abc123"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ok"
        
        # Verify persistence - token should be masked
        get_response = requests.get(f"{BASE_URL}/api/wp-security/config", headers=auth_headers)
        config = get_response.json()
        assert config.get("cf_api_token_set")
        assert config.get("cf_api_token_preview") == "...12345678"  # Last 8 chars
        assert config.get("cf_zone_id") == "test_zone_id_abc123"
    
    def test_put_cloudflare_config_requires_credentials(self, auth_headers):
        """PUT /api/wp-security/cloudflare-config requires at least one credential"""
        response = requests.put(
            f"{BASE_URL}/api/wp-security/cloudflare-config",
            headers=auth_headers,
            json={}
        )
        assert response.status_code == 400
    
    def test_cloudflare_test_requires_auth(self):
        """GET /api/wp-security/cloudflare-test requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/wp-security/cloudflare-test",
            headers={"x-main-site-id": WP_SECURITY_SITE_ID}
        )
        assert response.status_code in [401, 403]
    
    def test_cloudflare_test_returns_error_with_steps_when_not_configured(self, auth_headers):
        """GET /api/wp-security/cloudflare-test returns error with steps when credentials invalid"""
        # First clear credentials by setting invalid ones
        requests.put(
            f"{BASE_URL}/api/wp-security/cloudflare-config",
            headers=auth_headers,
            json={"cf_api_token": "invalid_token", "cf_zone_id": "invalid_zone"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/wp-security/cloudflare-test",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return error status with steps
        assert "status" in data
        assert data["status"] == "error"
        assert "message" in data
        assert "steps" in data
        assert isinstance(data["steps"], list)
        assert len(data["steps"]) > 0


class TestWpSecurityWafRules:
    """Tests for PUT /api/wp-security/waf-rules"""
    
    def test_put_waf_rules_requires_auth(self):
        """PUT /api/wp-security/waf-rules requires authentication"""
        response = requests.put(
            f"{BASE_URL}/api/wp-security/waf-rules",
            headers={"x-main-site-id": WP_SECURITY_SITE_ID, "Content-Type": "application/json"},
            json={"rules": []}
        )
        assert response.status_code in [401, 403]
    
    def test_put_waf_rules_saves_rules(self, auth_headers):
        """PUT /api/wp-security/waf-rules saves WAF rules array"""
        test_rules = [
            {"id": "block_xmlrpc", "name": "Block XML-RPC", "target": "/xmlrpc.php", "action": "block", "enabled": True},
            {"id": "protect_wp_login", "name": "Rate Limit wp-login.php", "target": "/wp-login.php", "action": "rate_limit", "enabled": False}
        ]
        response = requests.put(
            f"{BASE_URL}/api/wp-security/waf-rules",
            headers=auth_headers,
            json={"rules": test_rules}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ok"
        assert data.get("count") == 2
        assert data.get("active") == 1  # Only one rule is enabled
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/wp-security/config", headers=auth_headers)
        config = get_response.json()
        assert "waf_rules" in config
        assert len(config["waf_rules"]) == 2
        assert config["waf_rules"][0]["id"] == "block_xmlrpc"
    
    def test_put_waf_rules_returns_cloudflare_sync_result(self, auth_headers):
        """PUT /api/wp-security/waf-rules returns cloudflare_sync field"""
        test_rules = [
            {"id": "test_rule", "name": "Test Rule", "target": "/test", "action": "block", "enabled": True}
        ]
        response = requests.put(
            f"{BASE_URL}/api/wp-security/waf-rules",
            headers=auth_headers,
            json={"rules": test_rules}
        )
        assert response.status_code == 200
        data = response.json()
        
        # cloudflare_sync should be present (null if no CF credentials, or result object)
        assert "cloudflare_sync" in data


class TestWpSecurityBlocklist:
    """Tests for POST/DELETE /api/wp-security/blocklist"""
    
    def test_post_blocklist_requires_auth(self):
        """POST /api/wp-security/blocklist requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/wp-security/blocklist",
            headers={"x-main-site-id": WP_SECURITY_SITE_ID, "Content-Type": "application/json"},
            json={"ip": TEST_IP}
        )
        assert response.status_code in [401, 403]
    
    def test_post_blocklist_adds_ip(self, auth_headers):
        """POST /api/wp-security/blocklist adds IP to blocklist"""
        response = requests.post(
            f"{BASE_URL}/api/wp-security/blocklist",
            headers=auth_headers,
            json={"ip": TEST_IP, "note": TEST_IP_NOTE}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ok"
        assert data.get("ip") == TEST_IP
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/wp-security/config", headers=auth_headers)
        config = get_response.json()
        assert "ip_blocklist" in config
        blocked_ips = [entry["ip"] for entry in config["ip_blocklist"]]
        assert TEST_IP in blocked_ips
    
    def test_post_blocklist_returns_cloudflare_sync(self, auth_headers):
        """POST /api/wp-security/blocklist returns cloudflare_sync field"""
        response = requests.post(
            f"{BASE_URL}/api/wp-security/blocklist",
            headers=auth_headers,
            json={"ip": "10.0.0.1", "note": "Test sync"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "cloudflare_sync" in data
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/wp-security/blocklist/10.0.0.1", headers=auth_headers)
    
    def test_post_blocklist_requires_ip(self, auth_headers):
        """POST /api/wp-security/blocklist requires IP address"""
        response = requests.post(
            f"{BASE_URL}/api/wp-security/blocklist",
            headers=auth_headers,
            json={"note": "No IP provided"}
        )
        assert response.status_code == 400
    
    def test_delete_blocklist_removes_ip(self, auth_headers):
        """DELETE /api/wp-security/blocklist/{ip} removes IP from blocklist"""
        # First ensure IP is in blocklist
        requests.post(
            f"{BASE_URL}/api/wp-security/blocklist",
            headers=auth_headers,
            json={"ip": TEST_IP, "note": "To be deleted"}
        )
        
        # Delete the IP
        response = requests.delete(
            f"{BASE_URL}/api/wp-security/blocklist/{TEST_IP}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ok"
        assert data.get("ip") == TEST_IP
        assert "cloudflare_sync" in data
        
        # Verify removal
        get_response = requests.get(f"{BASE_URL}/api/wp-security/config", headers=auth_headers)
        config = get_response.json()
        blocked_ips = [entry["ip"] for entry in config.get("ip_blocklist", [])]
        assert TEST_IP not in blocked_ips


class TestWpSecurityLoginProtection:
    """Tests for PUT /api/wp-security/login-protection"""
    
    def test_put_login_protection_requires_auth(self):
        """PUT /api/wp-security/login-protection requires authentication"""
        response = requests.put(
            f"{BASE_URL}/api/wp-security/login-protection",
            headers={"x-main-site-id": WP_SECURITY_SITE_ID, "Content-Type": "application/json"},
            json={"enabled": True}
        )
        assert response.status_code in [401, 403]
    
    def test_put_login_protection_saves_settings(self, auth_headers):
        """PUT /api/wp-security/login-protection saves login protection settings"""
        settings = {
            "enabled": True,
            "block_xmlrpc": True,
            "limit_login_attempts": True,
            "max_attempts": 10
        }
        response = requests.put(
            f"{BASE_URL}/api/wp-security/login-protection",
            headers=auth_headers,
            json=settings
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ok"
        assert "cloudflare_sync" in data
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/wp-security/config", headers=auth_headers)
        config = get_response.json()
        assert "login_protection" in config
        lp = config["login_protection"]
        assert lp.get("enabled")
        assert lp.get("block_xmlrpc")
        assert lp.get("limit_login_attempts")
        assert lp.get("max_attempts") == 10


class TestWpSecurityTestConnection:
    """Tests for GET /api/wp-security/test-connection"""
    
    def test_test_connection_requires_auth(self):
        """GET /api/wp-security/test-connection requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/wp-security/test-connection",
            headers={"x-main-site-id": WP_SECURITY_SITE_ID}
        )
        assert response.status_code in [401, 403]
    
    def test_test_connection_returns_structured_response(self, auth_headers):
        """GET /api/wp-security/test-connection returns structured response"""
        # First set a WordPress URL
        requests.put(
            f"{BASE_URL}/api/wp-security/config",
            headers=auth_headers,
            json={"wordpress_url": "https://wordpress.org"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/wp-security/test-connection",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should have status and message
        assert "status" in data
        assert "message" in data
        assert data["status"] in ["ok", "warning", "error"]
    
    def test_test_connection_with_real_wordpress_site(self, auth_headers):
        """GET /api/wp-security/test-connection detects WordPress site with multi-check"""
        # Set a real WordPress site URL
        requests.put(
            f"{BASE_URL}/api/wp-security/config",
            headers=auth_headers,
            json={"wordpress_url": "https://wordpress.org"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/wp-security/test-connection",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # wordpress.org should be detected as WordPress with indicators
        if data["status"] == "ok":
            assert data.get("is_wordpress")
            assert "indicators" in data
            assert isinstance(data["indicators"], list)
    
    def test_test_connection_error_includes_steps(self, auth_headers):
        """GET /api/wp-security/test-connection error includes steps array"""
        # Set an unreachable URL
        requests.put(
            f"{BASE_URL}/api/wp-security/config",
            headers=auth_headers,
            json={"wordpress_url": "https://this-domain-does-not-exist-12345.com"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/wp-security/test-connection",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have error status with steps
        assert data["status"] == "error"
        assert "steps" in data
        assert isinstance(data["steps"], list)
        assert len(data["steps"]) > 0


class TestWpSecurityWordfence:
    """Tests for GET /api/wp-security/wordfence-status"""
    
    def test_wordfence_status_requires_auth(self):
        """GET /api/wp-security/wordfence-status requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/wp-security/wordfence-status",
            headers={"x-main-site-id": WP_SECURITY_SITE_ID}
        )
        assert response.status_code in [401, 403]
    
    def test_wordfence_status_returns_structured_response(self, auth_headers):
        """GET /api/wp-security/wordfence-status returns wordfence and vulnerability_scan"""
        # First set a WordPress URL
        requests.put(
            f"{BASE_URL}/api/wp-security/config",
            headers=auth_headers,
            json={"wordpress_url": "https://wordpress.org"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/wp-security/wordfence-status",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should have status, wordfence, and vulnerability_scan
        assert "status" in data
        assert "wordfence" in data
        assert "vulnerability_scan" in data
        
        # Wordfence object should have installed and message
        wf = data["wordfence"]
        assert "installed" in wf
        assert isinstance(wf["installed"], bool)
        assert "message" in wf
    
    def test_wordfence_status_vulnerability_scan_structure(self, auth_headers):
        """GET /api/wp-security/wordfence-status vulnerability_scan has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/wp-security/wordfence-status",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        vuln_scan = data.get("vulnerability_scan", {})
        # Should have these fields
        assert "status" in vuln_scan or "detected_software" in vuln_scan
        if "detected_software" in vuln_scan:
            assert isinstance(vuln_scan["detected_software"], list)
        if "vulnerabilities" in vuln_scan:
            assert isinstance(vuln_scan["vulnerabilities"], list)
    
    def test_wordfence_status_error_when_no_url(self, auth_headers):
        """GET /api/wp-security/wordfence-status returns error when no WordPress URL"""
        # Use a different site ID that has no config
        headers = auth_headers.copy()
        headers["x-main-site-id"] = "nonexistent-site-id-12345"
        
        response = requests.get(
            f"{BASE_URL}/api/wp-security/wordfence-status",
            headers=headers
        )
        # Should return 200 with error status or 400
        if response.status_code == 200:
            data = response.json()
            assert data.get("status") == "error"
            assert "message" in data


class TestWpSecurityCleanup:
    """Cleanup test data after tests"""
    
    def test_cleanup_restore_valid_url(self, auth_headers):
        """Restore a valid WordPress URL after tests"""
        response = requests.put(
            f"{BASE_URL}/api/wp-security/config",
            headers=auth_headers,
            json={"wordpress_url": "https://wordpress.org"}
        )
        assert response.status_code == 200
    
    def test_cleanup_remove_test_ips(self, auth_headers):
        """Remove any test IPs from blocklist"""
        # Remove test IPs
        for ip in [TEST_IP, "10.0.0.1"]:
            requests.delete(f"{BASE_URL}/api/wp-security/blocklist/{ip}", headers=auth_headers)
