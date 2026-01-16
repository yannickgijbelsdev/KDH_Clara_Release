"""
Test suite for Chat Delete Features:
1. Delete private chat conversation - either member can delete
2. Delete individual messages - only sender can delete their own messages
3. Delete group chat - only owner can delete
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDeletePrivateChat:
    """Test deleting private chat conversations"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers for demo user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@radio.com",
            "password": "password123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json()["token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def current_user_id(self, auth_headers):
        """Get current user ID"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        return response.json()["id"]
    
    @pytest.fixture(scope="class")
    def other_member_id(self, auth_headers, current_user_id):
        """Get another team member's ID for private chat"""
        response = requests.get(f"{BASE_URL}/api/chat/members", headers=auth_headers)
        assert response.status_code == 200
        members = response.json()
        
        # Find another member
        other_members = [m for m in members if m["id"] != current_user_id]
        if other_members:
            return other_members[0]["id"]
        pytest.skip("No other team members available for private chat test")
    
    def test_create_and_delete_private_chat(self, auth_headers, other_member_id):
        """Test creating a private chat and then deleting it"""
        # Create a private chat
        response = requests.post(
            f"{BASE_URL}/api/chat/threads",
            headers=auth_headers,
            json={
                "type": "private",
                "member_ids": [other_member_id]
            }
        )
        assert response.status_code == 201, f"Failed to create private chat: {response.text}"
        thread = response.json()
        thread_id = thread["id"]
        assert thread["type"] == "private"
        
        # Send a test message
        msg_response = requests.post(
            f"{BASE_URL}/api/chat/threads/{thread_id}/messages",
            headers=auth_headers,
            json={"body": f"TEST_delete_private_chat_{int(time.time())}"}
        )
        assert msg_response.status_code == 201
        
        # Delete the private chat
        delete_response = requests.delete(
            f"{BASE_URL}/api/chat/threads/{thread_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Failed to delete private chat: {delete_response.text}"
        delete_data = delete_response.json()
        assert delete_data["deleted"] == True
        
        # Verify thread is deleted - should return 404
        get_response = requests.get(
            f"{BASE_URL}/api/chat/threads/{thread_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 404, "Thread should be deleted"
    
    def test_cannot_delete_team_chat(self, auth_headers):
        """Test that team chat cannot be deleted"""
        # Get team thread
        response = requests.get(f"{BASE_URL}/api/chat/threads/team", headers=auth_headers)
        assert response.status_code == 200
        team_thread_id = response.json()["id"]
        
        # Try to delete team chat - should fail
        delete_response = requests.delete(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 400, "Should not be able to delete team chat"
        assert "Cannot delete the team chat" in delete_response.json().get("detail", "")


class TestDeleteIndividualMessages:
    """Test deleting individual messages"""
    
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
    
    def test_delete_own_message(self, auth_headers, team_thread_id):
        """Test that user can delete their own message"""
        # Send a message
        test_msg = f"TEST_delete_message_{int(time.time())}"
        send_response = requests.post(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages",
            headers=auth_headers,
            json={"body": test_msg}
        )
        assert send_response.status_code == 201
        message = send_response.json()
        message_id = message["id"]
        
        # Delete the message
        delete_response = requests.delete(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages/{message_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Failed to delete message: {delete_response.text}"
        delete_data = delete_response.json()
        assert delete_data["deleted"] == True
        assert delete_data["message_id"] == message_id
        
        # Verify message is deleted - should not appear in messages list
        messages_response = requests.get(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages?limit=100",
            headers=auth_headers
        )
        assert messages_response.status_code == 200
        messages = messages_response.json()
        message_ids = [m["id"] for m in messages]
        assert message_id not in message_ids, "Deleted message should not appear in messages list"
    
    def test_delete_nonexistent_message(self, auth_headers, team_thread_id):
        """Test deleting a message that doesn't exist"""
        fake_message_id = "nonexistent-message-id-12345"
        delete_response = requests.delete(
            f"{BASE_URL}/api/chat/threads/{team_thread_id}/messages/{fake_message_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 404, "Should return 404 for nonexistent message"


class TestDeleteGroupChat:
    """Test deleting group chats - only owner can delete"""
    
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
    def current_user_id(self, auth_headers):
        """Get current user ID"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        return response.json()["id"]
    
    @pytest.fixture(scope="class")
    def other_member_id(self, auth_headers, current_user_id):
        """Get another team member's ID"""
        response = requests.get(f"{BASE_URL}/api/chat/members", headers=auth_headers)
        assert response.status_code == 200
        members = response.json()
        other_members = [m for m in members if m["id"] != current_user_id]
        if other_members:
            return other_members[0]["id"]
        pytest.skip("No other team members available")
    
    def test_owner_can_delete_group(self, auth_headers, other_member_id):
        """Test that group owner can delete the group"""
        # Create a group chat (current user becomes owner)
        group_name = f"TEST_Delete_Group_{int(time.time())}"
        create_response = requests.post(
            f"{BASE_URL}/api/chat/threads",
            headers=auth_headers,
            json={
                "type": "group",
                "name": group_name,
                "member_ids": [other_member_id]
            }
        )
        assert create_response.status_code == 201
        group = create_response.json()
        group_id = group["id"]
        
        # Send a test message
        msg_response = requests.post(
            f"{BASE_URL}/api/chat/threads/{group_id}/messages",
            headers=auth_headers,
            json={"body": "Test message in group"}
        )
        assert msg_response.status_code == 201
        
        # Delete the group (as owner)
        delete_response = requests.delete(
            f"{BASE_URL}/api/chat/threads/{group_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Owner should be able to delete group: {delete_response.text}"
        assert delete_response.json()["deleted"] == True
        
        # Verify group is deleted
        get_response = requests.get(
            f"{BASE_URL}/api/chat/threads/{group_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 404, "Group should be deleted"


class TestMessageDeletionInPrivateChat:
    """Test message deletion within private chats"""
    
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
    def current_user_id(self, auth_headers):
        """Get current user ID"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        return response.json()["id"]
    
    @pytest.fixture(scope="class")
    def other_member_id(self, auth_headers, current_user_id):
        """Get another team member's ID"""
        response = requests.get(f"{BASE_URL}/api/chat/members", headers=auth_headers)
        assert response.status_code == 200
        members = response.json()
        other_members = [m for m in members if m["id"] != current_user_id]
        if other_members:
            return other_members[0]["id"]
        pytest.skip("No other team members available")
    
    def test_delete_message_in_private_chat(self, auth_headers, other_member_id):
        """Test deleting a message in a private chat"""
        # Create a private chat
        create_response = requests.post(
            f"{BASE_URL}/api/chat/threads",
            headers=auth_headers,
            json={
                "type": "private",
                "member_ids": [other_member_id]
            }
        )
        assert create_response.status_code == 201
        thread = create_response.json()
        thread_id = thread["id"]
        
        # Send a message
        test_msg = f"TEST_private_msg_delete_{int(time.time())}"
        msg_response = requests.post(
            f"{BASE_URL}/api/chat/threads/{thread_id}/messages",
            headers=auth_headers,
            json={"body": test_msg}
        )
        assert msg_response.status_code == 201
        message_id = msg_response.json()["id"]
        
        # Delete the message
        delete_response = requests.delete(
            f"{BASE_URL}/api/chat/threads/{thread_id}/messages/{message_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["deleted"] == True
        
        # Verify message is deleted
        messages_response = requests.get(
            f"{BASE_URL}/api/chat/threads/{thread_id}/messages?limit=100",
            headers=auth_headers
        )
        assert messages_response.status_code == 200
        messages = messages_response.json()
        message_ids = [m["id"] for m in messages]
        assert message_id not in message_ids
        
        # Clean up - delete the private chat
        requests.delete(f"{BASE_URL}/api/chat/threads/{thread_id}", headers=auth_headers)


class TestDeleteEndpointValidation:
    """Test validation and error handling for delete endpoints"""
    
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
    
    def test_delete_nonexistent_thread(self, auth_headers):
        """Test deleting a thread that doesn't exist"""
        fake_thread_id = "nonexistent-thread-id-12345"
        delete_response = requests.delete(
            f"{BASE_URL}/api/chat/threads/{fake_thread_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 404
    
    def test_delete_message_from_nonexistent_thread(self, auth_headers):
        """Test deleting a message from a thread that doesn't exist"""
        fake_thread_id = "nonexistent-thread-id-12345"
        fake_message_id = "nonexistent-message-id-12345"
        delete_response = requests.delete(
            f"{BASE_URL}/api/chat/threads/{fake_thread_id}/messages/{fake_message_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
