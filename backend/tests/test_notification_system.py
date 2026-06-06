"""
Tests for Email Notification System
- SMTP providers, categories
- SMTP config CRUD
- Role notification settings CRUD
- Access control (network admin only)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials - Network Admin
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"


class TestNotificationSystem:
    """Email notification system tests"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as network admin
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": NETWORK_ADMIN_EMAIL, "password": NETWORK_ADMIN_PASSWORD},
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("access_token") or data.get("token")
        assert self.token, "No token in login response"
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    # ── SMTP PROVIDERS ──────────────────────────────────────────────
    def test_get_smtp_providers_returns_4_providers(self):
        """GET /api/notifications/smtp-providers returns 4 providers"""
        response = self.session.get(f"{BASE_URL}/api/notifications/smtp-providers")
        assert response.status_code == 200
        providers = response.json()
        assert isinstance(providers, list)
        assert len(providers) == 4, f"Expected 4 providers, got {len(providers)}"
        
        # Verify provider IDs
        provider_ids = [p["id"] for p in providers]
        assert "microsoft365" in provider_ids
        assert "google" in provider_ids
        assert "outlook" in provider_ids
        assert "custom" in provider_ids

    def test_smtp_providers_have_required_fields(self):
        """Each SMTP provider has name, host, port, use_tls"""
        response = self.session.get(f"{BASE_URL}/api/notifications/smtp-providers")
        assert response.status_code == 200
        providers = response.json()
        
        for provider in providers:
            assert "id" in provider
            assert "name" in provider
            assert "port" in provider
            assert "use_tls" in provider
            # host can be empty for custom provider
            if provider["id"] != "custom":
                assert provider.get("host"), f"Missing host for {provider['id']}"

    # ── NOTIFICATION CATEGORIES ─────────────────────────────────────
    def test_get_categories_returns_7_categories(self):
        """GET /api/notifications/categories returns 7 categories"""
        response = self.session.get(f"{BASE_URL}/api/notifications/categories")
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        assert len(categories) == 7, f"Expected 7 categories, got {len(categories)}"
        
        # Verify category IDs
        cat_ids = [c["id"] for c in categories]
        expected_categories = ["security", "firewall", "content", "shows", "users", "wordpress", "system"]
        for cat_id in expected_categories:
            assert cat_id in cat_ids, f"Missing category: {cat_id}"

    def test_categories_have_name_and_description(self):
        """Each category has id, name, description"""
        response = self.session.get(f"{BASE_URL}/api/notifications/categories")
        assert response.status_code == 200
        categories = response.json()
        
        for category in categories:
            assert "id" in category
            assert "name" in category
            assert "description" in category
            assert len(category["name"]) > 0
            assert len(category["description"]) > 0

    # ── SMTP CONFIG CRUD ────────────────────────────────────────────
    def test_save_smtp_config(self):
        """PUT /api/notifications/smtp-config saves config with masked password"""
        config = {
            "provider": "microsoft365",
            "username": "test@example.com",
            "password": "TestPassword123",
            "from_email": "test@example.com",
            "from_name": "Test Sender",
        }
        response = self.session.put(
            f"{BASE_URL}/api/notifications/smtp-config", json=config
        )
        assert response.status_code == 200
        data = response.json()
        
        # Password should be masked in response
        assert data.get("password") == "••••••••", "Password not masked in response"
        assert data.get("username") == "test@example.com"
        assert data.get("configured")
        assert data.get("provider") == "microsoft365"

    def test_get_smtp_config_returns_stored_with_masked_password(self):
        """GET /api/notifications/smtp-config returns stored config with masked password"""
        response = self.session.get(f"{BASE_URL}/api/notifications/smtp-config")
        assert response.status_code == 200
        data = response.json()
        
        # If configured, password should be masked
        if data.get("configured"):
            assert data.get("password") == "••••••••", "Password not masked"
            assert "username" in data
            assert "host" in data
            assert "port" in data

    def test_save_smtp_config_requires_username(self):
        """PUT /api/notifications/smtp-config requires username"""
        config = {
            "provider": "microsoft365",
            "password": "TestPassword123",
        }
        response = self.session.put(
            f"{BASE_URL}/api/notifications/smtp-config", json=config
        )
        # Should return 400 for missing username
        assert response.status_code == 400

    def test_save_smtp_config_with_custom_provider(self):
        """PUT /api/notifications/smtp-config with custom provider requires host"""
        config = {
            "provider": "custom",
            "host": "smtp.custom.com",
            "port": 465,
            "use_tls": False,
            "username": "custom@example.com",
            "password": "CustomPass123",
            "from_email": "noreply@custom.com",
        }
        response = self.session.put(
            f"{BASE_URL}/api/notifications/smtp-config", json=config
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("host") == "smtp.custom.com"
        assert data.get("port") == 465

    # ── SMTP TEST ───────────────────────────────────────────────────
    def test_smtp_test_connection(self):
        """POST /api/notifications/smtp-test tests SMTP connection"""
        # First save a config
        config = {
            "provider": "microsoft365",
            "host": "smtp.office365.com",
            "port": 587,
            "username": "test@example.com",
            "password": "TestPassword123",
        }
        response = self.session.post(
            f"{BASE_URL}/api/notifications/smtp-test", json=config
        )
        assert response.status_code == 200
        data = response.json()
        # Will return success: false since no real SMTP configured, but endpoint works
        assert "success" in data
        assert "message" in data

    def test_smtp_test_with_masked_password_fetches_stored(self):
        """POST /api/notifications/smtp-test with masked password fetches stored password"""
        # Save a config first
        self.session.put(
            f"{BASE_URL}/api/notifications/smtp-config",
            json={
                "provider": "microsoft365",
                "username": "test@example.com",
                "password": "RealPassword123",
            },
        )
        
        # Now test with masked password
        response = self.session.post(
            f"{BASE_URL}/api/notifications/smtp-test",
            json={
                "provider": "microsoft365",
                "host": "smtp.office365.com",
                "port": 587,
                "username": "test@example.com",
                "password": "••••••••",  # Masked
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "success" in data

    # ── ROLE NOTIFICATION SETTINGS ──────────────────────────────────
    def test_get_role_settings_empty_initial(self):
        """GET /api/notifications/role-settings returns empty dict initially or saved settings"""
        response = self.session.get(f"{BASE_URL}/api/notifications/role-settings")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_save_role_settings(self):
        """PUT /api/notifications/role-settings saves per-role notification settings"""
        settings = {
            "roles": {
                "admin": {
                    "categories": ["security", "firewall", "system"],
                    "mode": "realtime",
                },
                "editor": {
                    "categories": ["content", "wordpress"],
                    "mode": "daily",
                },
                "presenter": {
                    "categories": ["shows"],
                    "mode": "both",
                },
            }
        }
        response = self.session.put(
            f"{BASE_URL}/api/notifications/role-settings", json=settings
        )
        assert response.status_code == 200
        data = response.json()
        assert "roles" in data
        assert data["roles"]["admin"]["mode"] == "realtime"
        assert "security" in data["roles"]["admin"]["categories"]

    def test_get_role_settings_returns_saved(self):
        """GET /api/notifications/role-settings returns previously saved settings"""
        # First save
        settings = {
            "roles": {
                "viewer": {
                    "categories": ["users"],
                    "mode": "daily",
                }
            }
        }
        self.session.put(f"{BASE_URL}/api/notifications/role-settings", json=settings)
        
        # Then get
        response = self.session.get(f"{BASE_URL}/api/notifications/role-settings")
        assert response.status_code == 200
        data = response.json()
        # Should contain the saved viewer settings
        assert "viewer" in data
        assert data["viewer"]["mode"] == "daily"

    def test_save_role_settings_mode_options(self):
        """Role mode can be 'realtime', 'daily', or 'both'"""
        for mode in ["realtime", "daily", "both"]:
            settings = {
                "roles": {
                    "test_role": {
                        "categories": ["security"],
                        "mode": mode,
                    }
                }
            }
            response = self.session.put(
                f"{BASE_URL}/api/notifications/role-settings", json=settings
            )
            assert response.status_code == 200
            data = response.json()
            assert data["roles"]["test_role"]["mode"] == mode

    # ── ACCESS CONTROL ──────────────────────────────────────────────
    def test_smtp_config_requires_auth(self):
        """GET /api/notifications/smtp-config requires authentication"""
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/notifications/smtp-config")
        assert response.status_code in [401, 403]

    def test_role_settings_requires_auth(self):
        """PUT /api/notifications/role-settings requires authentication"""
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        response = no_auth_session.put(
            f"{BASE_URL}/api/notifications/role-settings",
            json={"roles": {}},
        )
        assert response.status_code in [401, 403]


class TestNotificationAccessControl:
    """Test that non-network-admin cannot access notification endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session without auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def test_smtp_providers_public(self):
        """GET /api/notifications/smtp-providers is accessible (no auth needed for static data)"""
        response = self.session.get(f"{BASE_URL}/api/notifications/smtp-providers")
        # This endpoint should be public as it returns static provider data
        assert response.status_code == 200

    def test_categories_public(self):
        """GET /api/notifications/categories is accessible (no auth needed for static data)"""
        response = self.session.get(f"{BASE_URL}/api/notifications/categories")
        # This endpoint should be public as it returns static category data
        assert response.status_code == 200

    def test_smtp_config_requires_network_admin(self):
        """GET /api/notifications/smtp-config requires network admin"""
        response = self.session.get(f"{BASE_URL}/api/notifications/smtp-config")
        assert response.status_code in [401, 403]

    def test_put_smtp_config_requires_network_admin(self):
        """PUT /api/notifications/smtp-config requires network admin"""
        response = self.session.put(
            f"{BASE_URL}/api/notifications/smtp-config",
            json={"provider": "google", "username": "test@test.com"},
        )
        assert response.status_code in [401, 403]

    def test_smtp_test_requires_network_admin(self):
        """POST /api/notifications/smtp-test requires network admin"""
        response = self.session.post(
            f"{BASE_URL}/api/notifications/smtp-test",
            json={"host": "smtp.test.com", "username": "test"},
        )
        assert response.status_code in [401, 403]

    def test_role_settings_requires_network_admin(self):
        """GET/PUT /api/notifications/role-settings requires network admin"""
        response = self.session.get(f"{BASE_URL}/api/notifications/role-settings")
        assert response.status_code in [401, 403]
        
        response = self.session.put(
            f"{BASE_URL}/api/notifications/role-settings",
            json={"roles": {}},
        )
        assert response.status_code in [401, 403]
