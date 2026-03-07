"""
Tests for Email Notification System - English Translations, Log, and Daily Digest
- SMTP providers return English help_text
- Categories return English descriptions  
- Notification log endpoint works
- Daily digest manual trigger works
- Login events create notification log entries
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"


class TestEnglishTranslations:
    """Verify all notification text is in English (not Dutch)"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def test_smtp_providers_help_text_is_english(self):
        """GET /api/notifications/smtp-providers returns English help_text"""
        response = self.session.get(f"{BASE_URL}/api/notifications/smtp-providers")
        assert response.status_code == 200
        providers = response.json()
        
        # Check each provider has English help_text (not Dutch)
        for provider in providers:
            help_text = provider.get("help_text", "")
            assert help_text, f"Missing help_text for {provider['id']}"
            # Verify it's English, not Dutch
            dutch_words = ["gebruik", "uw", "wachtwoord", "invoeren", "mailserver"]
            for dutch_word in dutch_words:
                assert dutch_word not in help_text.lower(), \
                    f"Found Dutch word '{dutch_word}' in help_text for {provider['id']}: {help_text}"
            # Verify contains English words
            assert any(eng in help_text.lower() for eng in ["use", "your", "password", "email", "enter"]), \
                f"help_text doesn't appear to be English for {provider['id']}: {help_text}"

    def test_microsoft365_provider_english(self):
        """Microsoft 365 provider has specific English help_text"""
        response = self.session.get(f"{BASE_URL}/api/notifications/smtp-providers")
        assert response.status_code == 200
        providers = {p["id"]: p for p in response.json()}
        
        ms365 = providers.get("microsoft365")
        assert ms365, "Missing Microsoft 365 provider"
        assert "App Password" in ms365.get("help_text", ""), "Expected 'App Password' in MS365 help_text"
        assert "Security" in ms365.get("help_text", ""), "Expected 'Security' in MS365 help_text"

    def test_google_provider_english(self):
        """Google provider has specific English help_text"""
        response = self.session.get(f"{BASE_URL}/api/notifications/smtp-providers")
        assert response.status_code == 200
        providers = {p["id"]: p for p in response.json()}
        
        google = providers.get("google")
        assert google, "Missing Google provider"
        assert "Gmail" in google.get("help_text", ""), "Expected 'Gmail' in Google help_text"
        assert "App Password" in google.get("help_text", ""), "Expected 'App Password' in Google help_text"

    def test_notification_categories_descriptions_english(self):
        """GET /api/notifications/categories returns English descriptions"""
        response = self.session.get(f"{BASE_URL}/api/notifications/categories")
        assert response.status_code == 200
        categories = response.json()
        
        # Check each category has English description (not Dutch)
        for cat in categories:
            desc = cat.get("description", "")
            assert desc, f"Missing description for {cat['id']}"
            # Verify no Dutch
            dutch_words = ["mislukte", "inloggen", "aanmaken", "verwijderen", "publiceren", "wachtwoord", "wijzigen"]
            for dutch_word in dutch_words:
                assert dutch_word not in desc.lower(), \
                    f"Found Dutch word '{dutch_word}' in description for {cat['id']}: {desc}"

    def test_security_category_english(self):
        """Security category has English description"""
        response = self.session.get(f"{BASE_URL}/api/notifications/categories")
        assert response.status_code == 200
        categories = {c["id"]: c for c in response.json()}
        
        security = categories.get("security")
        assert security, "Missing security category"
        desc = security.get("description", "")
        # Should contain English security terms
        assert any(word in desc.lower() for word in ["failed", "logins", "brute", "force", "sessions"]), \
            f"Security description doesn't look English: {desc}"

    def test_firewall_category_english(self):
        """Firewall category has English description"""
        response = self.session.get(f"{BASE_URL}/api/notifications/categories")
        assert response.status_code == 200
        categories = {c["id"]: c for c in response.json()}
        
        firewall = categories.get("firewall")
        assert firewall, "Missing firewall category"
        desc = firewall.get("description", "")
        # Should contain English firewall terms
        assert any(word in desc.lower() for word in ["blocked", "ips", "suspicious", "activity"]), \
            f"Firewall description doesn't look English: {desc}"


class TestNotificationLog:
    """Test notification log endpoint"""

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

    def test_get_notification_log(self):
        """GET /api/notifications/log returns recent events"""
        response = self.session.get(f"{BASE_URL}/api/notifications/log?limit=50")
        assert response.status_code == 200
        logs = response.json()
        assert isinstance(logs, list), "Expected list of log entries"

    def test_notification_log_entry_structure(self):
        """Each log entry has required fields"""
        response = self.session.get(f"{BASE_URL}/api/notifications/log?limit=10")
        assert response.status_code == 200
        logs = response.json()
        
        if logs:  # Only test if there are logs
            entry = logs[0]
            # Check required fields
            assert "category" in entry, "Missing category field"
            assert "event_type" in entry, "Missing event_type field"
            assert "timestamp" in entry, "Missing timestamp field"

    def test_notification_log_limit_parameter(self):
        """Limit parameter works correctly"""
        # Get 5 entries
        response = self.session.get(f"{BASE_URL}/api/notifications/log?limit=5")
        assert response.status_code == 200
        logs = response.json()
        assert len(logs) <= 5, f"Expected max 5 entries, got {len(logs)}"

    def test_notification_log_requires_auth(self):
        """GET /api/notifications/log requires authentication"""
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/notifications/log")
        assert response.status_code in [401, 403]


class TestDailyDigestTrigger:
    """Test manual daily digest trigger endpoint"""

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

    def test_trigger_daily_digest(self):
        """POST /api/notifications/send-daily-digest triggers digest"""
        response = self.session.post(f"{BASE_URL}/api/notifications/send-daily-digest")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data, "Expected message in response"
        assert "digest" in data["message"].lower() or "sent" in data["message"].lower(), \
            f"Unexpected message: {data['message']}"

    def test_daily_digest_creates_log_entry(self):
        """Triggering daily digest creates a log entry"""
        # Trigger digest
        response = self.session.post(f"{BASE_URL}/api/notifications/send-daily-digest")
        assert response.status_code == 200
        
        # Check log for digest entry
        response = self.session.get(f"{BASE_URL}/api/notifications/log?limit=10")
        assert response.status_code == 200
        logs = response.json()
        
        # Look for daily_digest_sent entry
        digest_entries = [l for l in logs if l.get("event_type") == "daily_digest_sent"]
        assert len(digest_entries) > 0, "No daily_digest_sent entry found in recent logs"

    def test_daily_digest_requires_auth(self):
        """POST /api/notifications/send-daily-digest requires authentication"""
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        response = no_auth_session.post(f"{BASE_URL}/api/notifications/send-daily-digest")
        assert response.status_code in [401, 403]


class TestLoginNotificationTrigger:
    """Test that login events create notification log entries"""

    def test_login_creates_notification_log_entry(self):
        """Login should trigger notification logging"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Perform login
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": NETWORK_ADMIN_EMAIL, "password": NETWORK_ADMIN_PASSWORD},
        )
        assert response.status_code == 200
        data = response.json()
        token = data.get("access_token") or data.get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Check notification log for login events
        response = session.get(f"{BASE_URL}/api/notifications/log?limit=20")
        assert response.status_code == 200
        logs = response.json()
        
        # Find any login-related entries (Login, successful_login, etc.)
        login_entries = [
            l for l in logs 
            if "login" in l.get("event_type", "").lower() or 
               l.get("category") == "security"
        ]
        assert len(login_entries) > 0, "No login-related entries found in notification log"

    def test_security_events_in_log(self):
        """Security category events should appear in log"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": NETWORK_ADMIN_EMAIL, "password": NETWORK_ADMIN_PASSWORD},
        )
        assert response.status_code == 200
        data = response.json()
        token = data.get("access_token") or data.get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Check for security category entries
        response = session.get(f"{BASE_URL}/api/notifications/log?limit=30")
        assert response.status_code == 200
        logs = response.json()
        
        security_entries = [l for l in logs if l.get("category") == "security"]
        # Should have at least one security event (from our login)
        assert len(security_entries) > 0, "No security category entries in log"


class TestNotificationLogEmailsSent:
    """Test emails_sent field in notification log"""

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
        assert response.status_code == 200
        data = response.json()
        self.token = data.get("access_token") or data.get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    def test_log_entries_have_emails_sent_field(self):
        """Log entries should have emails_sent field (may be empty list)"""
        response = self.session.get(f"{BASE_URL}/api/notifications/log?limit=10")
        assert response.status_code == 200
        logs = response.json()
        
        if logs:
            entry = logs[0]
            # emails_sent field should exist (can be empty list)
            assert "emails_sent" in entry, "Missing emails_sent field in log entry"
            assert isinstance(entry["emails_sent"], list), "emails_sent should be a list"
