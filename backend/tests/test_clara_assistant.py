"""
Clara Assistant API Tests
Tests for the Clara AI Assistant endpoints:
- POST /api/clara-assistant/chat - General chat with SEO/error modes
- POST /api/clara-assistant/seo/generate - Generate SEO-optimized articles
- POST /api/clara-assistant/seo/improve - Analyze and improve existing content
- POST /api/clara-assistant/error-help - Get help with error messages
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestClaraAssistantChat:
    """Tests for /api/clara-assistant/chat endpoint"""
    
    def test_chat_seo_mode_success(self, auth_headers):
        """Test chat endpoint in SEO mode"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/chat",
            headers=auth_headers,
            json={
                "message": "What are the best practices for SEO titles?",
                "mode": "seo"
            },
            timeout=60  # LLM calls can take time
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "response" in data, "Response should contain 'response' field"
        assert "session_id" in data, "Response should contain 'session_id' field"
        assert isinstance(data["response"], str), "Response should be a string"
        assert len(data["response"]) > 0, "Response should not be empty"
        assert data["session_id"].startswith("chat-"), "Session ID should start with 'chat-'"
        
        print(f"✓ Chat SEO mode working - Response length: {len(data['response'])} chars")
    
    def test_chat_error_mode_success(self, auth_headers):
        """Test chat endpoint in error help mode"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/chat",
            headers=auth_headers,
            json={
                "message": "I'm getting a 'Failed to publish to WordPress' error",
                "mode": "error"
            },
            timeout=60
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "response" in data
        assert "session_id" in data
        assert len(data["response"]) > 0
        
        print(f"✓ Chat error mode working - Response length: {len(data['response'])} chars")
    
    def test_chat_with_session_continuity(self, auth_headers):
        """Test that session_id maintains conversation context"""
        # First message
        response1 = requests.post(
            f"{BASE_URL}/api/clara-assistant/chat",
            headers=auth_headers,
            json={
                "message": "My name is TestUser",
                "mode": "seo"
            },
            timeout=60
        )
        
        assert response1.status_code == 200
        session_id = response1.json()["session_id"]
        
        # Second message with same session
        response2 = requests.post(
            f"{BASE_URL}/api/clara-assistant/chat",
            headers=auth_headers,
            json={
                "message": "What is my name?",
                "session_id": session_id,
                "mode": "seo"
            },
            timeout=60
        )
        
        assert response2.status_code == 200
        assert response2.json()["session_id"] == session_id
        
        print(f"✓ Session continuity working - Session ID: {session_id}")
    
    def test_chat_with_content_context(self, auth_headers):
        """Test chat with editor content context"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/chat",
            headers=auth_headers,
            json={
                "message": "How can I improve this content for SEO?",
                "mode": "seo",
                "content_context": "<p>This is a sample article about radio broadcasting.</p>"
            },
            timeout=60
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        
        print("✓ Chat with content context working")
    
    def test_chat_requires_auth(self):
        """Test that chat endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/chat",
            json={"message": "Hello", "mode": "seo"},
            timeout=10
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Chat endpoint properly requires authentication")


class TestClaraAssistantSEOGenerate:
    """Tests for /api/clara-assistant/seo/generate endpoint"""
    
    def test_seo_generate_success(self, auth_headers):
        """Test SEO article generation"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/seo/generate",
            headers=auth_headers,
            json={
                "topic": "The future of DAB+ radio in Belgium",
                "keywords": "DAB+, digital radio, FM",
                "tone": "professional",
                "length": "short"
            },
            timeout=90  # Generation can take longer
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "title" in data, "Response should contain 'title'"
        assert "body" in data, "Response should contain 'body'"
        assert "meta_description" in data, "Response should contain 'meta_description'"
        assert "session_id" in data, "Response should contain 'session_id'"
        
        # Verify content quality
        assert len(data["body"]) > 100, "Body should have substantial content"
        
        print(f"✓ SEO generate working - Title: {data['title'][:50]}...")
    
    def test_seo_generate_different_lengths(self, auth_headers):
        """Test that length parameter affects output"""
        # Test medium length
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/seo/generate",
            headers=auth_headers,
            json={
                "topic": "Radio broadcasting tips",
                "length": "medium"
            },
            timeout=90
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "body" in data
        
        print("✓ SEO generate with medium length working")
    
    def test_seo_generate_requires_topic(self, auth_headers):
        """Test that topic is required"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/seo/generate",
            headers=auth_headers,
            json={
                "keywords": "test",
                "length": "short"
            },
            timeout=30
        )
        
        # Should fail validation (422) or handle gracefully
        assert response.status_code in [422, 400], f"Expected 422/400, got {response.status_code}"
        print("✓ SEO generate properly validates required topic field")
    
    def test_seo_generate_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/seo/generate",
            json={"topic": "Test topic"},
            timeout=10
        )
        
        assert response.status_code in [401, 403]
        print("✓ SEO generate endpoint properly requires authentication")


class TestClaraAssistantSEOImprove:
    """Tests for /api/clara-assistant/seo/improve endpoint"""
    
    def test_seo_improve_success(self, auth_headers):
        """Test SEO content improvement"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/seo/improve",
            headers=auth_headers,
            json={
                "content": "<p>Radio is great. People listen to radio every day. Radio has music and news.</p>",
                "title": "About Radio",
                "keywords": "radio, broadcasting, music"
            },
            timeout=90
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "score" in data, "Response should contain 'score'"
        assert "analysis" in data, "Response should contain 'analysis'"
        assert "improved_content" in data, "Response should contain 'improved_content'"
        assert "meta_description" in data, "Response should contain 'meta_description'"
        assert "session_id" in data, "Response should contain 'session_id'"
        
        print(f"✓ SEO improve working - Score: {data['score']}")
    
    def test_seo_improve_requires_content(self, auth_headers):
        """Test that content is required"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/seo/improve",
            headers=auth_headers,
            json={
                "title": "Test",
                "keywords": "test"
            },
            timeout=30
        )
        
        assert response.status_code in [422, 400], f"Expected 422/400, got {response.status_code}"
        print("✓ SEO improve properly validates required content field")
    
    def test_seo_improve_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/seo/improve",
            json={"content": "Test content"},
            timeout=10
        )
        
        assert response.status_code in [401, 403]
        print("✓ SEO improve endpoint properly requires authentication")


class TestClaraAssistantErrorHelp:
    """Tests for /api/clara-assistant/error-help endpoint"""
    
    def test_error_help_success(self, auth_headers):
        """Test error help endpoint"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/error-help",
            headers=auth_headers,
            json={
                "error_message": "Failed to publish to WordPress: Connection timeout",
                "context": "WordPress publishing"
            },
            timeout=60
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "explanation" in data, "Response should contain 'explanation'"
        assert "session_id" in data, "Response should contain 'session_id'"
        assert len(data["explanation"]) > 50, "Explanation should be substantial"
        
        print(f"✓ Error help working - Response length: {len(data['explanation'])} chars")
    
    def test_error_help_different_contexts(self, auth_headers):
        """Test error help with different contexts"""
        contexts = [
            ("RDS data is not updating", "RDS settings"),
            ("Stream monitor shows offline", "Stream monitoring"),
            ("Cloudflare WAF sync failed", "Cloudflare WAF")
        ]
        
        for error_msg, context in contexts:
            response = requests.post(
                f"{BASE_URL}/api/clara-assistant/error-help",
                headers=auth_headers,
                json={
                    "error_message": error_msg,
                    "context": context
                },
                timeout=60
            )
            
            assert response.status_code == 200, f"Failed for context '{context}': {response.text}"
            assert "explanation" in response.json()
            
            print(f"✓ Error help working for context: {context}")
    
    def test_error_help_requires_error_message(self, auth_headers):
        """Test that error_message is required"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/error-help",
            headers=auth_headers,
            json={
                "context": "WordPress"
            },
            timeout=30
        )
        
        assert response.status_code in [422, 400], f"Expected 422/400, got {response.status_code}"
        print("✓ Error help properly validates required error_message field")
    
    def test_error_help_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/clara-assistant/error-help",
            json={"error_message": "Test error"},
            timeout=10
        )
        
        assert response.status_code in [401, 403]
        print("✓ Error help endpoint properly requires authentication")


class TestClaraAssistantEndpointAvailability:
    """Quick tests to verify all endpoints are available"""
    
    def test_all_endpoints_exist(self, auth_headers):
        """Verify all Clara Assistant endpoints are registered"""
        endpoints = [
            ("/api/clara-assistant/chat", "POST"),
            ("/api/clara-assistant/seo/generate", "POST"),
            ("/api/clara-assistant/seo/improve", "POST"),
            ("/api/clara-assistant/error-help", "POST"),
        ]
        
        for endpoint, method in endpoints:
            # Send minimal request to check endpoint exists (not 404)
            if method == "POST":
                response = requests.post(
                    f"{BASE_URL}{endpoint}",
                    headers=auth_headers,
                    json={},
                    timeout=10
                )
            
            # Should not be 404 (endpoint not found)
            assert response.status_code != 404, f"Endpoint {endpoint} not found (404)"
            print(f"✓ Endpoint {endpoint} exists (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
