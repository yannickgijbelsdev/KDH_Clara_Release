"""
Test Clara Dashboard Features:
1. Grouped navigation menu
2. Personal Settings page with navigation display toggle
3. Admin user switching (impersonation)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo@radio.com"
ADMIN_PASSWORD = "password123"


class TestUserPreferences:
    """Test user preferences endpoints for grouped menu toggle"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.user = response.json()["user"]
    
    def test_get_auth_me_returns_preferences(self):
        """GET /api/auth/me should return preferences field"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "preferences" in data, "preferences field missing from /auth/me response"
        print(f"PASS: /auth/me returns preferences: {data.get('preferences')}")
    
    def test_update_preferences_grouped_menu_true(self):
        """PUT /api/users/me/preferences should save grouped_menu=true"""
        response = requests.put(
            f"{BASE_URL}/api/users/me/preferences",
            headers=self.headers,
            json={"grouped_menu": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("message") == "Preferences updated"
        assert data.get("preferences", {}).get("grouped_menu") == True
        print("PASS: grouped_menu=true saved successfully")
    
    def test_update_preferences_grouped_menu_false(self):
        """PUT /api/users/me/preferences should save grouped_menu=false"""
        response = requests.put(
            f"{BASE_URL}/api/users/me/preferences",
            headers=self.headers,
            json={"grouped_menu": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("message") == "Preferences updated"
        assert data.get("preferences", {}).get("grouped_menu") == False
        print("PASS: grouped_menu=false saved successfully")
    
    def test_preferences_persist_after_update(self):
        """Preferences should persist after update"""
        # Set preference
        requests.put(
            f"{BASE_URL}/api/users/me/preferences",
            headers=self.headers,
            json={"grouped_menu": True}
        )
        
        # Verify persistence
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("preferences", {}).get("grouped_menu") == True
        print("PASS: Preferences persist after update")
    
    def test_invalid_preference_key_rejected(self):
        """Invalid preference keys should be rejected"""
        response = requests.put(
            f"{BASE_URL}/api/users/me/preferences",
            headers=self.headers,
            json={"invalid_key": "value"}
        )
        assert response.status_code == 400
        print("PASS: Invalid preference key rejected with 400")
    
    def test_get_user_preferences_endpoint(self):
        """GET /api/users/me/preferences should return preferences"""
        response = requests.get(
            f"{BASE_URL}/api/users/me/preferences",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"PASS: GET /users/me/preferences returns: {data}")


class TestAdminUserSwitching:
    """Test admin user switching (impersonation) endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.admin_token = response.json()["token"]
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.admin_user = response.json()["user"]
        
        # Get team users to find a non-admin user
        users_response = requests.get(f"{BASE_URL}/api/users", headers=self.admin_headers)
        assert users_response.status_code == 200
        self.team_users = users_response.json()
        
        # Find a non-admin user to switch to
        self.target_user = None
        for user in self.team_users:
            if user["id"] != self.admin_user["id"]:
                self.target_user = user
                break
    
    def test_switch_user_returns_new_token(self):
        """POST /api/admin/switch-user/{user_id} should return new token"""
        if not self.target_user:
            pytest.skip("No other user in team to switch to")
        
        response = requests.post(
            f"{BASE_URL}/api/admin/switch-user/{self.target_user['id']}",
            headers=self.admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "token" in data, "token missing from response"
        assert "user" in data, "user missing from response"
        assert "original_user" in data, "original_user missing from response"
        
        # Verify target user info
        assert data["user"]["id"] == self.target_user["id"]
        assert data["user"]["email"] == self.target_user["email"]
        
        # Verify original user info
        assert data["original_user"]["id"] == self.admin_user["id"]
        assert data["original_user"]["email"] == self.admin_user["email"]
        
        print(f"PASS: Switch user returns token for {data['user']['name']}")
    
    def test_switched_token_authenticates_as_target_user(self):
        """Switched token should authenticate as target user"""
        if not self.target_user:
            pytest.skip("No other user in team to switch to")
        
        # Switch to target user
        switch_response = requests.post(
            f"{BASE_URL}/api/admin/switch-user/{self.target_user['id']}",
            headers=self.admin_headers
        )
        assert switch_response.status_code == 200
        new_token = switch_response.json()["token"]
        
        # Verify token authenticates as target user
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert me_response.status_code == 200
        me_data = me_response.json()
        
        assert me_data["id"] == self.target_user["id"]
        assert me_data["email"] == self.target_user["email"]
        print(f"PASS: Switched token authenticates as {me_data['name']}")
    
    def test_exit_impersonation_returns_admin_token(self):
        """POST /api/admin/exit-impersonation should return admin token"""
        if not self.target_user:
            pytest.skip("No other user in team to switch to")
        
        # Switch to target user
        switch_response = requests.post(
            f"{BASE_URL}/api/admin/switch-user/{self.target_user['id']}",
            headers=self.admin_headers
        )
        assert switch_response.status_code == 200
        switched_token = switch_response.json()["token"]
        
        # Exit impersonation
        exit_response = requests.post(
            f"{BASE_URL}/api/admin/exit-impersonation",
            headers={"Authorization": f"Bearer {switched_token}"}
        )
        assert exit_response.status_code == 200
        exit_data = exit_response.json()
        
        assert "token" in exit_data
        assert "user" in exit_data
        assert exit_data["user"]["role"] == "admin"
        print(f"PASS: Exit impersonation returns admin token for {exit_data['user']['name']}")
    
    def test_switch_to_nonexistent_user_returns_404(self):
        """Switching to non-existent user should return 404"""
        response = requests.post(
            f"{BASE_URL}/api/admin/switch-user/nonexistent-user-id",
            headers=self.admin_headers
        )
        assert response.status_code == 404
        print("PASS: Switch to non-existent user returns 404")
    
    def test_non_admin_cannot_switch_user(self):
        """Non-admin users should not be able to switch users"""
        if not self.target_user:
            pytest.skip("No other user in team to test with")
        
        # Get temp password for target user
        pw_response = requests.get(
            f"{BASE_URL}/api/users/invite/{self.target_user['id']}/password",
            headers=self.admin_headers
        )
        
        if pw_response.status_code != 200:
            pytest.skip("Cannot get temp password for target user")
        
        temp_password = pw_response.json().get("temp_password")
        if not temp_password:
            pytest.skip("No temp password available for target user")
        
        # Login as non-admin user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.target_user["email"],
            "password": temp_password
        })
        
        if login_response.status_code != 200:
            pytest.skip("Cannot login as target user")
        
        non_admin_token = login_response.json()["token"]
        
        # Try to switch user (should fail)
        switch_response = requests.post(
            f"{BASE_URL}/api/admin/switch-user/{self.admin_user['id']}",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        
        # Should return 403 Forbidden
        assert switch_response.status_code in [401, 403], f"Expected 401/403, got {switch_response.status_code}"
        print("PASS: Non-admin cannot switch users")


class TestTeamUsersEndpoint:
    """Test team users endpoint for user management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_team_users(self):
        """GET /api/users should return team users"""
        response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Verify user structure
        user = data[0]
        assert "id" in user
        assert "email" in user
        assert "name" in user
        assert "role" in user
        print(f"PASS: GET /users returns {len(data)} users")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
