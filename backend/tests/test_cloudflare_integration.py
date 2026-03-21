"""
Cloudflare Integration Tests for Domain Manager

Tests the Cloudflare API integration endpoints:
- GET /api/domains/cloudflare/config - Get Cloudflare config (masked token)
- PUT /api/domains/cloudflare/config - Save API token, zone ID, base domain
- POST /api/domains/cloudflare/verify-token - Verify token (returns 400 if not configured)
- POST /api/domains/cloudflare/sync - Sync DNS records (returns 400 if not configured)
- GET /api/domains/cloudflare/dns-records - List DNS records (returns 400 if not configured)

NOTE: No real Cloudflare API token is available for testing.
Tests verify proper error handling when CF is not configured.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def system_admin_token():
    """Get authentication token for system admin."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SYSTEM_ADMIN_EMAIL, "password": SYSTEM_ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token")
    pytest.skip(f"System admin login failed: {response.status_code} - {response.text}")


class TestCloudflareConfigEndpoints:
    """Tests for Cloudflare configuration endpoints."""

    def test_get_cloudflare_config_unauthenticated(self):
        """GET /api/domains/cloudflare/config without auth should return 401 or 403."""
        response = requests.get(f"{BASE_URL}/api/domains/cloudflare/config")
        # App returns 403 for unauthenticated requests (acceptable behavior)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASSED: Unauthenticated request returns {response.status_code}")

    def test_get_cloudflare_config_authenticated(self, system_admin_token):
        """GET /api/domains/cloudflare/config with system admin should return config."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/domains/cloudflare/config", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "configured" in data, "Response should have 'configured' field"
        assert "api_token_set" in data, "Response should have 'api_token_set' field"
        assert "base_domain" in data, "Response should have 'base_domain' field"
        
        # If token is set, verify it's masked
        if data.get("api_token_set"):
            assert "api_token_preview" in data, "Should have masked token preview"
            assert data["api_token_preview"].startswith("..."), "Token should be masked with ..."
        
        print(f"PASSED: GET cloudflare config - configured={data['configured']}, base_domain={data.get('base_domain')}")

    def test_put_cloudflare_config_unauthenticated(self):
        """PUT /api/domains/cloudflare/config without auth should return 401 or 403."""
        response = requests.put(
            f"{BASE_URL}/api/domains/cloudflare/config",
            json={"api_token": "test-token", "zone_id": "test-zone", "base_domain": "test.com"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASSED: Unauthenticated PUT returns {response.status_code}")

    def test_put_cloudflare_config_save_dummy_token(self, system_admin_token):
        """PUT /api/domains/cloudflare/config should save config successfully."""
        headers = {"Authorization": f"Bearer {system_admin_token}", "Content-Type": "application/json"}
        
        # Save a dummy config
        test_config = {
            "api_token": "TEST_dummy_cloudflare_token_12345678",
            "zone_id": "TEST_zone_id_abcdef123456",
            "base_domain": "koodh.com"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/domains/cloudflare/config",
            headers=headers,
            json=test_config
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "ok", "Response should have status=ok"
        print("PASSED: PUT cloudflare config saved successfully")

    def test_get_cloudflare_config_after_save(self, system_admin_token):
        """GET /api/domains/cloudflare/config should return configured=true after save."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/domains/cloudflare/config", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("configured") == True, "Should be configured after saving token"
        assert data.get("api_token_set") == True, "api_token_set should be True"
        assert data.get("api_token_preview") is not None, "Should have masked token preview"
        assert data["api_token_preview"].endswith("12345678"), "Token preview should show last 8 chars"
        assert data.get("zone_id") == "TEST_zone_id_abcdef123456", "Zone ID should match"
        
        print(f"PASSED: Config shows configured=true, token_preview={data.get('api_token_preview')}")


class TestCloudflareVerifyToken:
    """Tests for Cloudflare token verification endpoint."""

    def test_verify_token_unauthenticated(self):
        """POST /api/domains/cloudflare/verify-token without auth should return 401 or 403."""
        response = requests.post(f"{BASE_URL}/api/domains/cloudflare/verify-token")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASSED: Unauthenticated verify-token returns {response.status_code}")

    def test_verify_token_with_dummy_token(self, system_admin_token):
        """POST /api/domains/cloudflare/verify-token with dummy token should fail gracefully."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.post(f"{BASE_URL}/api/domains/cloudflare/verify-token", headers=headers)
        
        # With a dummy token, Cloudflare API will reject it
        # We expect 400 (not configured), 401/403 from CF, or 502 (bad gateway)
        assert response.status_code in [400, 401, 403, 502], f"Expected error status, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Should have error detail
        assert "detail" in data or "valid" in data, "Response should have error detail or valid field"
        
        print(f"PASSED: verify-token with dummy token returns {response.status_code} - {data.get('detail', data)}")


class TestCloudflareSync:
    """Tests for Cloudflare DNS sync endpoint."""

    def test_sync_unauthenticated(self):
        """POST /api/domains/cloudflare/sync without auth should return 401 or 403."""
        response = requests.post(f"{BASE_URL}/api/domains/cloudflare/sync")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASSED: Unauthenticated sync returns {response.status_code}")

    def test_sync_with_dummy_token(self, system_admin_token):
        """POST /api/domains/cloudflare/sync with dummy token should fail gracefully."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.post(f"{BASE_URL}/api/domains/cloudflare/sync", headers=headers)
        
        # With a dummy token, Cloudflare API will reject it
        # 400 = not configured, 401/403/404 = CF rejection, 502 = bad gateway
        assert response.status_code in [400, 401, 403, 404, 502], f"Expected error status, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should have error detail"
        
        print(f"PASSED: sync with dummy token returns {response.status_code} - {data.get('detail')}")


class TestCloudflareDnsRecords:
    """Tests for Cloudflare DNS records listing endpoint."""

    def test_dns_records_unauthenticated(self):
        """GET /api/domains/cloudflare/dns-records without auth should return 401 or 403."""
        response = requests.get(f"{BASE_URL}/api/domains/cloudflare/dns-records")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASSED: Unauthenticated dns-records returns {response.status_code}")

    def test_dns_records_with_dummy_token(self, system_admin_token):
        """GET /api/domains/cloudflare/dns-records with dummy token should fail gracefully."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/domains/cloudflare/dns-records", headers=headers)
        
        # With a dummy token, Cloudflare API will reject it
        # 400 = not configured, 401/403/404 = CF rejection, 502 = bad gateway
        assert response.status_code in [400, 401, 403, 404, 502], f"Expected error status, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should have error detail"
        
        print(f"PASSED: dns-records with dummy token returns {response.status_code} - {data.get('detail')}")


class TestCloudflareDeleteRecord:
    """Tests for Cloudflare DNS record deletion endpoint."""

    def test_delete_record_unauthenticated(self):
        """DELETE /api/domains/cloudflare/dns-records/{id} without auth should return 401 or 403."""
        response = requests.delete(f"{BASE_URL}/api/domains/cloudflare/dns-records/fake-record-id")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASSED: Unauthenticated delete-record returns {response.status_code}")

    def test_delete_record_with_dummy_token(self, system_admin_token):
        """DELETE /api/domains/cloudflare/dns-records/{id} with dummy token should fail gracefully."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.delete(
            f"{BASE_URL}/api/domains/cloudflare/dns-records/fake-record-id",
            headers=headers
        )
        
        # With a dummy token, Cloudflare API will reject it
        # 400 = not configured, 401/403/404 = CF rejection, 502 = bad gateway
        assert response.status_code in [400, 401, 403, 404, 502], f"Expected error status, got {response.status_code}"
        
        print(f"PASSED: delete-record with dummy token returns {response.status_code}")


class TestCloudflareNotConfiguredScenarios:
    """Tests for endpoints when Cloudflare is NOT configured."""

    def test_clear_cloudflare_config(self, system_admin_token):
        """Clear Cloudflare config to test 'not configured' scenarios."""
        headers = {"Authorization": f"Bearer {system_admin_token}", "Content-Type": "application/json"}
        
        # Set empty values to simulate unconfigured state
        response = requests.put(
            f"{BASE_URL}/api/domains/cloudflare/config",
            headers=headers,
            json={"api_token": "", "zone_id": "", "base_domain": "koodh.com"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASSED: Cleared config - {response.status_code}")

    def test_verify_config_is_cleared(self, system_admin_token):
        """Verify config shows as not configured after clearing."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/domains/cloudflare/config", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("configured") == False, "Should show configured=false after clearing"
        print(f"PASSED: Config shows configured={data.get('configured')}")

    def test_verify_token_not_configured(self, system_admin_token):
        """POST /api/domains/cloudflare/verify-token should return 400 if not configured."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.post(f"{BASE_URL}/api/domains/cloudflare/verify-token", headers=headers)
        
        assert response.status_code == 400, f"Expected 400 when not configured, got {response.status_code}"
        data = response.json()
        assert "niet geconfigureerd" in data.get("detail", "").lower() or "not configured" in data.get("detail", "").lower(), \
            f"Error should mention not configured, got: {data.get('detail')}"
        print(f"PASSED: verify-token returns 400 when not configured - {data.get('detail')}")

    def test_sync_not_configured(self, system_admin_token):
        """POST /api/domains/cloudflare/sync should return 400 if not configured."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.post(f"{BASE_URL}/api/domains/cloudflare/sync", headers=headers)
        
        assert response.status_code == 400, f"Expected 400 when not configured, got {response.status_code}"
        data = response.json()
        assert "niet geconfigureerd" in data.get("detail", "").lower() or "not configured" in data.get("detail", "").lower(), \
            f"Error should mention not configured, got: {data.get('detail')}"
        print(f"PASSED: sync returns 400 when not configured - {data.get('detail')}")

    def test_dns_records_not_configured(self, system_admin_token):
        """GET /api/domains/cloudflare/dns-records should return 400 if not configured."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/domains/cloudflare/dns-records", headers=headers)
        
        assert response.status_code == 400, f"Expected 400 when not configured, got {response.status_code}"
        data = response.json()
        assert "niet geconfigureerd" in data.get("detail", "").lower() or "not configured" in data.get("detail", "").lower(), \
            f"Error should mention not configured, got: {data.get('detail')}"
        print(f"PASSED: dns-records returns 400 when not configured - {data.get('detail')}")


class TestDomainsOverview:
    """Tests for domains overview endpoint (includes CF status)."""

    def test_domains_overview(self, system_admin_token):
        """GET /api/domains/overview should include cloudflare_configured status."""
        headers = {"Authorization": f"Bearer {system_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/domains/overview", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "cloudflare_configured" in data, "Overview should include cloudflare_configured"
        assert "base_domain" in data, "Overview should include base_domain"
        
        print(f"PASSED: Overview shows cloudflare_configured={data.get('cloudflare_configured')}, base_domain={data.get('base_domain')}")
