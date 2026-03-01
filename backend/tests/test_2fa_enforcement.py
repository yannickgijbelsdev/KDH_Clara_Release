"""
Test 2FA Enforcement Feature
- POST /api/auth/2fa/skip increments skip count
- After 3 skips, returns 400 error
- Login response includes totp_skip_count
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"


class Test2FAEnforcement:
    """Test 2FA skip enforcement feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        self.initial_skip_count = data.get("totp_skip_count", 0)
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        print(f"Login successful - initial skip count: {self.initial_skip_count}")
        
    def test_login_returns_totp_skip_count(self):
        """Test that login response includes totp_skip_count field"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "totp_skip_count" in data, "Login response should include totp_skip_count"
        assert isinstance(data["totp_skip_count"], int), "totp_skip_count should be an integer"
        print(f"PASS: Login returns totp_skip_count = {data['totp_skip_count']}")
        
    def test_user_me_returns_totp_skip_count(self):
        """Test that /api/auth/me returns totp_skip_count"""
        response = self.session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert "totp_skip_count" in data, "User response should include totp_skip_count"
        assert isinstance(data["totp_skip_count"], int)
        print(f"PASS: /api/auth/me returns totp_skip_count = {data['totp_skip_count']}")
        
    def test_skip_increments_count(self):
        """Test that POST /api/auth/2fa/skip increments the skip count"""
        # First get current count
        me_response = self.session.get(f"{BASE_URL}/api/auth/me")
        initial_count = me_response.json().get("totp_skip_count", 0)
        
        # Skip once
        response = self.session.post(f"{BASE_URL}/api/auth/2fa/skip")
        assert response.status_code == 200, f"Skip failed: {response.text}"
        data = response.json()
        
        assert "totp_skip_count" in data, "Skip response should include totp_skip_count"
        assert "skips_remaining" in data, "Skip response should include skips_remaining"
        assert data["totp_skip_count"] == initial_count + 1, "Skip count should increment by 1"
        assert data["skips_remaining"] == 3 - data["totp_skip_count"], "Remaining skips should be 3 - skip_count"
        print(f"PASS: Skip incremented count from {initial_count} to {data['totp_skip_count']}")
        
    def test_skip_returns_remaining_count(self):
        """Test that skip response returns correct remaining skips"""
        response = self.session.post(f"{BASE_URL}/api/auth/2fa/skip")
        assert response.status_code == 200
        data = response.json()
        
        expected_remaining = 3 - data["totp_skip_count"]
        assert data["skips_remaining"] == expected_remaining
        print(f"PASS: Skip returns skips_remaining = {data['skips_remaining']}")


class Test2FAMaxSkips:
    """Test max skips enforcement - run after resetting skip count"""
    
    def test_max_skips_returns_400(self):
        """Test that after 3 skips, the 4th skip returns 400"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_resp.status_code == 200
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get current skip count
        me_resp = session.get(f"{BASE_URL}/api/auth/me")
        current_count = me_resp.json().get("totp_skip_count", 0)
        print(f"Current skip count: {current_count}")
        
        # Skip until we reach max (3)
        skips_needed = 3 - current_count
        for i in range(skips_needed):
            resp = session.post(f"{BASE_URL}/api/auth/2fa/skip")
            assert resp.status_code == 200, f"Skip {i+1} failed: {resp.text}"
            data = resp.json()
            print(f"Skip {current_count + i + 1}: remaining = {data['skips_remaining']}")
            
        # Now try 4th skip - should fail with 400
        final_resp = session.post(f"{BASE_URL}/api/auth/2fa/skip")
        assert final_resp.status_code == 400, f"Expected 400 after max skips, got {final_resp.status_code}"
        error_data = final_resp.json()
        assert "detail" in error_data, "Error response should have detail"
        assert "required" in error_data["detail"].lower() or "maximum" in error_data["detail"].lower()
        print(f"PASS: 4th skip returns 400 with message: {error_data['detail']}")


class Test2FAStatus:
    """Test 2FA status endpoint"""
    
    def test_2fa_status_endpoint(self):
        """Test GET /api/auth/2fa/status returns correct data"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_resp.status_code == 200
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get 2FA status
        status_resp = session.get(f"{BASE_URL}/api/auth/2fa/status")
        assert status_resp.status_code == 200
        data = status_resp.json()
        
        assert "enabled" in data, "Status should include 'enabled' field"
        assert isinstance(data["enabled"], bool)
        print(f"PASS: 2FA status - enabled: {data['enabled']}")
