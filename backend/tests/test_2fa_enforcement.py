"""
2FA Enforcement Tests
Tests for strict 2FA (TOTP) enforcement rules upon user login.
- 2FA becomes mandatory if user is Network Admin or main_site has require_2fa=True
- 'Do it later' option with max 3 permanent skips
- Backup codes download/email functionality
- require_2fa toggle in main site settings
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "test"


class TestAuthLogin2FA:
    """Test login endpoint 2FA enforcement fields"""
    
    def test_login_returns_force_2fa_for_admin_with_2fa_enabled(self):
        """Admin with 2FA already enabled should have force_2fa=false"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Admin has 2FA enabled, so force_2fa should be false
        assert "force_2fa" in data, "Response should contain force_2fa field"
        assert not data["force_2fa"], "Admin with 2FA enabled should have force_2fa=false"
        assert data.get("requires_2fa") or data.get("token") is not None, "Should either require 2FA code or return token"
    
    def test_login_response_contains_totp_skip_count(self):
        """Login response should contain totp_skip_count field"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Check for totp_skip_count in response
        assert "totp_skip_count" in data or data.get("requires_2fa"), \
            "Response should contain totp_skip_count or require 2FA"


class TestAuthMe2FA:
    """Test /api/auth/me endpoint 2FA fields"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token (may require 2FA)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("Admin requires 2FA code - cannot test without TOTP")
            return data.get("token")
        pytest.skip(f"Login failed: {response.text}")
    
    def test_get_me_returns_force_2fa_field(self, admin_token):
        """GET /api/auth/me should return force_2fa field"""
        if not admin_token:
            pytest.skip("No token available")
        
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200, f"Failed to get user: {response.text}"
        data = response.json()
        
        assert "force_2fa" in data, "Response should contain force_2fa field"
        assert "totp_enabled" in data, "Response should contain totp_enabled field"
        assert "totp_skip_count" in data, "Response should contain totp_skip_count field"


class Test2FAEnforcementStatus:
    """Test /api/auth/2fa/enforcement-status endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("Admin requires 2FA code")
            return data.get("token")
        pytest.skip(f"Login failed: {response.text}")
    
    def test_enforcement_status_endpoint_exists(self, admin_token):
        """GET /api/auth/2fa/enforcement-status should return enforcement info"""
        if not admin_token:
            pytest.skip("No token available")
        
        response = requests.get(f"{BASE_URL}/api/auth/2fa/enforcement-status", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200, f"Endpoint failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "force_2fa" in data, "Response should contain force_2fa"
        assert "totp_enabled" in data, "Response should contain totp_enabled"
        assert "totp_skip_count" in data, "Response should contain totp_skip_count"
        assert "skips_remaining" in data, "Response should contain skips_remaining"
        
        # Verify skips_remaining calculation
        skip_count = data.get("totp_skip_count", 0)
        skips_remaining = data.get("skips_remaining", 0)
        assert skips_remaining == max(0, 3 - skip_count), \
            f"skips_remaining should be max(0, 3 - skip_count), got {skips_remaining}"


class Test2FASkip:
    """Test /api/auth/2fa/skip endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("Admin requires 2FA code")
            return data.get("token")
        pytest.skip(f"Login failed: {response.text}")
    
    def test_skip_endpoint_exists(self, admin_token):
        """POST /api/auth/2fa/skip should exist and return proper response"""
        if not admin_token:
            pytest.skip("No token available")
        
        response = requests.post(f"{BASE_URL}/api/auth/2fa/skip", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        
        # Should return 200 with skip count or 400 if max skips reached
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        data = response.json()
        
        if response.status_code == 200:
            assert "totp_skip_count" in data, "Response should contain totp_skip_count"
            assert "skips_remaining" in data, "Response should contain skips_remaining"
        else:
            # Max skips reached
            assert "detail" in data, "Error response should contain detail"
            assert "maximum" in data["detail"].lower() or "required" in data["detail"].lower(), \
                "Error should mention max skips reached"


class Test2FAEmailBackupCodes:
    """Test /api/auth/2fa/email-backup-codes endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("Admin requires 2FA code")
            return data.get("token")
        pytest.skip(f"Login failed: {response.text}")
    
    def test_email_backup_codes_endpoint_exists(self, admin_token):
        """POST /api/auth/2fa/email-backup-codes should exist"""
        if not admin_token:
            pytest.skip("No token available")
        
        # Test with sample backup codes
        response = requests.post(f"{BASE_URL}/api/auth/2fa/email-backup-codes", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"codes": ["ABC123", "DEF456", "GHI789"]}
        )
        
        # Should return 200 (success), 400 (no codes), 500 (SMTP error), or 503 (not configured)
        assert response.status_code in [200, 400, 500, 503], \
            f"Unexpected status: {response.status_code}, body: {response.text}"
        
        if response.status_code == 503:
            data = response.json()
            assert "not configured" in data.get("detail", "").lower(), \
                "503 should indicate email service not configured"
    
    def test_email_backup_codes_requires_codes(self, admin_token):
        """POST /api/auth/2fa/email-backup-codes should require codes"""
        if not admin_token:
            pytest.skip("No token available")
        
        response = requests.post(f"{BASE_URL}/api/auth/2fa/email-backup-codes", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"codes": []}
        )
        
        assert response.status_code == 400, f"Empty codes should return 400, got {response.status_code}"


class TestMainSiteRequire2FA:
    """Test main site require_2fa field in CRUD operations"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("Admin requires 2FA code")
            return data.get("token")
        pytest.skip(f"Login failed: {response.text}")
    
    def test_get_main_sites_returns_require_2fa(self, admin_token):
        """GET /api/main-sites should return require_2fa field"""
        if not admin_token:
            pytest.skip("No token available")
        
        response = requests.get(f"{BASE_URL}/api/main-sites", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200, f"Failed to get main sites: {response.text}"
        sites = response.json()
        
        assert len(sites) > 0, "Should have at least one main site"
        
        # Check first site has require_2fa field
        first_site = sites[0]
        assert "require_2fa" in first_site, "Main site should have require_2fa field"
        assert isinstance(first_site["require_2fa"], bool), "require_2fa should be boolean"
    
    def test_get_single_main_site_returns_require_2fa(self, admin_token):
        """GET /api/main-sites/{id} should return require_2fa field"""
        if not admin_token:
            pytest.skip("No token available")
        
        # First get list to find a site ID
        response = requests.get(f"{BASE_URL}/api/main-sites", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        sites = response.json()
        if not sites:
            pytest.skip("No main sites available")
        
        site_id = sites[0]["id"]
        
        # Get single site
        response = requests.get(f"{BASE_URL}/api/main-sites/{site_id}", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200, f"Failed to get site: {response.text}"
        site = response.json()
        
        assert "require_2fa" in site, "Single site response should have require_2fa field"
    
    def test_update_main_site_require_2fa(self, admin_token):
        """PUT /api/main-sites/{id} should accept require_2fa field"""
        if not admin_token:
            pytest.skip("No token available")
        
        # Get a site to update
        response = requests.get(f"{BASE_URL}/api/main-sites", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        sites = response.json()
        if not sites:
            pytest.skip("No main sites available")
        
        site = sites[0]
        site_id = site["id"]
        original_require_2fa = site.get("require_2fa", False)
        
        # Toggle require_2fa
        new_value = not original_require_2fa
        response = requests.put(f"{BASE_URL}/api/main-sites/{site_id}", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"require_2fa": new_value}
        )
        assert response.status_code == 200, f"Failed to update site: {response.text}"
        updated_site = response.json()
        
        assert updated_site.get("require_2fa") == new_value, \
            f"require_2fa should be {new_value}, got {updated_site.get('require_2fa')}"
        
        # Restore original value
        requests.put(f"{BASE_URL}/api/main-sites/{site_id}", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"require_2fa": original_require_2fa}
        )


class TestCheck2FAEnforcementLogic:
    """Test the check_user_requires_2fa logic"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("Admin requires 2FA code")
            return data.get("token")
        pytest.skip(f"Login failed: {response.text}")
    
    def test_network_admin_with_2fa_enabled_not_forced(self, admin_token):
        """Network admin with 2FA already enabled should not be forced"""
        if not admin_token:
            pytest.skip("No token available")
        
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        user = response.json()
        
        # If user has 2FA enabled, force_2fa should be false
        if user.get("totp_enabled"):
            assert not user.get("force_2fa"), \
                "User with 2FA enabled should have force_2fa=false"
    
    def test_enforcement_status_matches_me_endpoint(self, admin_token):
        """Enforcement status should match /me endpoint"""
        if not admin_token:
            pytest.skip("No token available")
        
        # Get /me
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert me_response.status_code == 200
        me_data = me_response.json()
        
        # Get enforcement status
        status_response = requests.get(f"{BASE_URL}/api/auth/2fa/enforcement-status", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert status_response.status_code == 200
        status_data = status_response.json()
        
        # Compare fields
        assert me_data.get("force_2fa") == status_data.get("force_2fa"), \
            "force_2fa should match between /me and /enforcement-status"
        assert me_data.get("totp_enabled") == status_data.get("totp_enabled"), \
            "totp_enabled should match between /me and /enforcement-status"


class Test2FASetupEndpoints:
    """Test 2FA setup related endpoints exist and work"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("Admin requires 2FA code")
            return data.get("token")
        pytest.skip(f"Login failed: {response.text}")
    
    def test_2fa_status_endpoint(self, admin_token):
        """GET /api/auth/2fa/status should return status"""
        if not admin_token:
            pytest.skip("No token available")
        
        response = requests.get(f"{BASE_URL}/api/auth/2fa/status", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "enabled" in data, "Should have enabled field"
        assert "backup_codes_remaining" in data, "Should have backup_codes_remaining field"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
