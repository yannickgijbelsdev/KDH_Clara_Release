"""
Test suite for Chat functionality including:
- Chat threads (team, private, group)
- Message sending and retrieval
- Real-time polling (messages with 'after' parameter)
- Thread list with last_message preview
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestChatAuthentication:
    """Test authentication for chat endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@radio.com",
            "password": "password123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@radio.com",
            "password": "password123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data


class TestChatThreads:
    """Test chat thread operations"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@radio.com",
            "password": "password123"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    def test_get_team_members(self, auth_headers):
        """Test fetching team members for chat"""
        response = requests.get(f"{BASE_URL}/api/chat/members", headers=auth_headers)
        assert response.status_code == 200
        members = response.json()
        assert isinstance(members, list)
        # Should have at least one member (the logged in user)
        assert len(members) >= 1
        # Each member should have required fields
        for member in members:
            assert "id" in member
            assert "name" in member
    
    def test_get_chat_threads(self, auth_headers):
        """Test fetching chat threads"""
        response = requests.get(f"{BASE_URL}/api/chat/threads", headers=auth_headers)
        assert response.status_code == 200
        threads = response.json()
        assert isinstance(threads, list)
    
    def test_get_or_create_team_thread(self, auth_headers):
        """Test getting or creating team thread"""
        response = requests.get(f"{BASE_URL}/api/chat/threads/team", headers=auth_headers)
        assert response.status_code == 200
        thread = response.json()
        assert thread["type"] == "team"
        assert "id" in thread
        assert "members" in thread
    
    def test_thread_has_last_message_preview(self, auth_headers):
        """Test that threads include last_message preview for sidebar display"""
        # First get threads
        response = requests.get(f"{BASE_URL}/api/chat/threads", headers=auth_headers)
        assert response.status_code == 200
        threads = response.json()
        
        # Find a thread with messages
        for thread in threads:
            # last_message field should exist (may be None if no messages)
            # This is the field used for sidebar preview
            if "last_message" in thread and thread["last_message"]:
                # Verify it's a string (not ':::::' characters)
                assert isinstance(thread["last_message"], str)
                # Should not contain only colons (the bug symptom)
                assert thread["last_message"] != ":::::"
                assert not thread["last_message"].startswith(":::::")
                break


class TestChatMessages:
    """Test chat message operations"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@radio.com",
            "password": "password123"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def team_thread_id(self, auth_headers):
        """Get team thread ID"""
        response = requests.get(f"{BASE_URL}/api/chat/threads/team", headers=auth_headers)
        assert response.status_code == 200
        return response.json()["id"]
    
    def test_get_thread_messages(self, auth_headers, team_thread_id):
        """Test fetching messages from a thread"""
        response = requests.get(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages?limit=100",
            headers=auth_headers
        )
        assert response.status_code == 200
        messages = response.json()
        assert isinstance(messages, list)
        # Each message should have required fields
        for msg in messages:
            assert "id" in msg
            assert "body" in msg
            assert "user_id" in msg
            assert "created_at" in msg
    
    def test_send_message(self, auth_headers, team_thread_id):
        """Test sending a message"""
        test_message = f"TEST_chat_message_{int(time.time())}"
        response = requests.post(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages",
            headers=auth_headers,
            json={"body": test_message}
        )
        assert response.status_code == 201
        msg = response.json()
        assert msg["body"] == test_message
        assert "id" in msg
        assert "created_at" in msg
        return msg
    
    def test_message_appears_in_thread_list(self, auth_headers, team_thread_id):
        """Test that sent message appears in thread list as last_message"""
        # Send a unique message
        unique_msg = f"TEST_preview_{int(time.time())}"
        send_response = requests.post(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages",
            headers=auth_headers,
            json={"body": unique_msg}
        )
        assert send_response.status_code == 201
        
        # Get threads and verify last_message is updated
        threads_response = requests.get(f"{BASE_URL}/api/chat/threads", headers=auth_headers)
        assert threads_response.status_code == 200
        threads = threads_response.json()
        
        # Find the team thread
        team_thread = next((t for t in threads if t["id"] == team_thread_id), None)
        assert team_thread is not None
        
        # Verify last_message contains our message (may be truncated)
        assert "last_message" in team_thread
        assert team_thread["last_message"] is not None
        # The message should be visible in preview (not ':::::')
        assert unique_msg[:50] in team_thread["last_message"] or team_thread["last_message"] in unique_msg


class TestRealTimePolling:
    """Test real-time message polling functionality"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@radio.com",
            "password": "password123"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def team_thread_id(self, auth_headers):
        """Get team thread ID"""
        response = requests.get(f"{BASE_URL}/api/chat/threads/team", headers=auth_headers)
        assert response.status_code == 200
        return response.json()["id"]
    
    def test_polling_with_after_parameter(self, auth_headers, team_thread_id):
        """Test that polling with 'after' parameter returns only new messages"""
        # Get current messages to find the latest timestamp
        response = requests.get(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages?limit=10",
            headers=auth_headers
        )
        assert response.status_code == 200
        messages = response.json()
        
        if len(messages) > 0:
            # Get the last message timestamp
            last_timestamp = messages[-1]["created_at"]
            
            # Poll with 'after' parameter - should return empty if no new messages
            poll_response = requests.get(
                f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages?limit=100&after={last_timestamp}",
                headers=auth_headers
            )
            assert poll_response.status_code == 200
            new_messages = poll_response.json()
            assert isinstance(new_messages, list)
            # Should be empty since no new messages were sent
            assert len(new_messages) == 0
    
    def test_new_message_appears_in_poll(self, auth_headers, team_thread_id):
        """Test that new messages appear when polling with 'after' parameter"""
        # Get current messages
        response = requests.get(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages?limit=10",
            headers=auth_headers
        )
        assert response.status_code == 200
        messages = response.json()
        
        # Get timestamp for polling (use last message or empty string)
        last_timestamp = messages[-1]["created_at"] if messages else ""
        
        # Send a new message
        new_msg_body = f"TEST_poll_message_{int(time.time())}"
        send_response = requests.post(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages",
            headers=auth_headers,
            json={"body": new_msg_body}
        )
        assert send_response.status_code == 201
        sent_msg = send_response.json()
        
        # Poll for new messages
        if last_timestamp:
            poll_response = requests.get(
                f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages?limit=100&after={last_timestamp}",
                headers=auth_headers
            )
            assert poll_response.status_code == 200
            new_messages = poll_response.json()
            
            # Should contain our new message
            assert len(new_messages) >= 1
            found = any(m["id"] == sent_msg["id"] for m in new_messages)
            assert found, "New message not found in poll results"


class TestPrivateAndGroupChats:
    """Test private and group chat creation"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@radio.com",
            "password": "password123"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def other_member_id(self, auth_headers):
        """Get another team member's ID for private chat"""
        response = requests.get(f"{BASE_URL}/api/chat/members", headers=auth_headers)
        assert response.status_code == 200
        members = response.json()
        
        # Get current user
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        current_user_id = me_response.json()["id"]
        
        # Find another member
        other_members = [m for m in members if m["id"] != current_user_id]
        if other_members:
            return other_members[0]["id"]
        pytest.skip("No other team members available for private chat test")
    
    def test_create_private_chat(self, auth_headers, other_member_id):
        """Test creating a private chat"""
        response = requests.post(
            f"{BASE_URL}/api/chat/threads",
            headers=auth_headers,
            json={
                "type": "private",
                "member_ids": [other_member_id]
            }
        )
        assert response.status_code == 201
        thread = response.json()
        assert thread["type"] == "private"
        assert "id" in thread
        assert "members" in thread
    
    def test_create_group_chat(self, auth_headers, other_member_id):
        """Test creating a group chat"""
        group_name = f"TEST_Group_{int(time.time())}"
        response = requests.post(
            f"{BASE_URL}/api/chat/threads",
            headers=auth_headers,
            json={
                "type": "group",
                "name": group_name,
                "member_ids": [other_member_id]
            }
        )
        assert response.status_code == 201
        thread = response.json()
        assert thread["type"] == "group"
        assert thread["name"] == group_name
        assert "id" in thread
        assert "members" in thread
        return thread["id"]


class TestMessagePreviewContent:
    """Test that message preview shows actual content, not ':::::' characters"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@radio.com",
            "password": "password123"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    def test_last_message_is_actual_text(self, auth_headers):
        """Verify last_message field contains actual message text"""
        # Get team thread
        team_response = requests.get(f"{BASE_URL}/api/chat/threads/team", headers=auth_headers)
        assert team_response.status_code == 200
        thread_id = team_response.json()["id"]
        
        # Send a message with known content
        test_content = "Hello this is a test message for preview"
        send_response = requests.post(
            f"{BASE_URL}/api/chat/threads/{thread_id}/messages",
            headers=auth_headers,
            json={"body": test_content}
        )
        assert send_response.status_code == 201
        
        # Get threads and check last_message
        threads_response = requests.get(f"{BASE_URL}/api/chat/threads", headers=auth_headers)
        assert threads_response.status_code == 200
        threads = threads_response.json()
        
        # Find team thread
        team_thread = next((t for t in threads if t["id"] == thread_id), None)
        assert team_thread is not None
        
        # Verify last_message is the actual text
        assert "last_message" in team_thread
        last_msg = team_thread["last_message"]
        assert last_msg is not None
        assert isinstance(last_msg, str)
        
        # Critical: Should NOT be ':::::' characters (the bug symptom)
        assert last_msg != ":::::"
        assert ":::::" not in last_msg
        
        # Should contain our test content (or truncated version)
        assert test_content[:50] in last_msg or last_msg in test_content
    
    def test_emoji_message_preview(self, auth_headers):
        """Test that emoji messages display correctly in preview"""
        # Get team thread
        team_response = requests.get(f"{BASE_URL}/api/chat/threads/team", headers=auth_headers)
        assert team_response.status_code == 200
        thread_id = team_response.json()["id"]
        
        # Send a message with emoji
        emoji_content = "Hello 👋 testing emojis 🎉"
        send_response = requests.post(
            f"{BASE_URL}/api/chat/threads/{thread_id}/messages",
            headers=auth_headers,
            json={"body": emoji_content}
        )
        assert send_response.status_code == 201
        
        # Get threads and check last_message
        threads_response = requests.get(f"{BASE_URL}/api/chat/threads", headers=auth_headers)
        assert threads_response.status_code == 200
        threads = threads_response.json()
        
        team_thread = next((t for t in threads if t["id"] == thread_id), None)
        assert team_thread is not None
        
        # Verify emoji message is stored correctly
        last_msg = team_thread.get("last_message", "")
        assert "Hello" in last_msg  # Text part should be there
        # Emojis should be preserved (not converted to ':::::')
        assert ":::::" not in last_msg


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
