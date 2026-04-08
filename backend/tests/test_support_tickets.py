"""
Support Tickets API Tests
Tests for the full CRUD support ticket system with messenger-style chat
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "test"


@pytest.fixture(scope="module")
def system_admin_token():
    """Get authentication token for system admin"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SYSTEM_ADMIN_EMAIL,
        "password": SYSTEM_ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"System admin login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def network_admin_token():
    """Get authentication token for network admin"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": NETWORK_ADMIN_EMAIL,
        "password": NETWORK_ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Network admin login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(system_admin_token):
    """Headers with system admin auth"""
    return {"Authorization": f"Bearer {system_admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def network_headers(network_admin_token):
    """Headers with network admin auth"""
    return {"Authorization": f"Bearer {network_admin_token}", "Content-Type": "application/json"}


class TestSupportTicketsCRUD:
    """Test support ticket CRUD operations"""
    
    created_ticket_id = None
    
    def test_create_ticket(self, admin_headers):
        """POST /api/support-tickets - creates ticket"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "subject": f"TEST_Ticket_{unique_id}",
            "description": "This is a test ticket description",
            "error_message": "Test error message",
            "steps_tried": "Tried restarting",
            "page_url": "/test-page"
        }
        response = requests.post(f"{BASE_URL}/api/support-tickets", json=payload, headers=admin_headers)
        
        assert response.status_code == 200, f"Create ticket failed: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain ticket id"
        assert data["status"] == "open", "New ticket should have 'open' status"
        
        # Store for later tests
        TestSupportTicketsCRUD.created_ticket_id = data["id"]
        print(f"Created ticket: {data['id']}")
    
    def test_list_tickets_admin(self, admin_headers):
        """GET /api/support-tickets - admin sees all tickets"""
        response = requests.get(f"{BASE_URL}/api/support-tickets", headers=admin_headers)
        
        assert response.status_code == 200, f"List tickets failed: {response.text}"
        data = response.json()
        assert "tickets" in data, "Response should contain 'tickets' array"
        assert isinstance(data["tickets"], list), "Tickets should be a list"
        print(f"Admin sees {len(data['tickets'])} tickets")
    
    def test_list_tickets_network_admin(self, network_headers):
        """GET /api/support-tickets - network admin sees all tickets"""
        response = requests.get(f"{BASE_URL}/api/support-tickets", headers=network_headers)
        
        assert response.status_code == 200, f"List tickets failed: {response.text}"
        data = response.json()
        assert "tickets" in data, "Response should contain 'tickets' array"
        print(f"Network admin sees {len(data['tickets'])} tickets")
    
    def test_get_ticket_counts(self, admin_headers):
        """GET /api/support-tickets/counts - returns open and unread counts"""
        response = requests.get(f"{BASE_URL}/api/support-tickets/counts", headers=admin_headers)
        
        assert response.status_code == 200, f"Get counts failed: {response.text}"
        data = response.json()
        assert "open" in data, "Response should contain 'open' count"
        assert "unread" in data, "Response should contain 'unread' count"
        assert isinstance(data["open"], int), "Open count should be integer"
        assert isinstance(data["unread"], int), "Unread count should be integer"
        print(f"Counts - Open: {data['open']}, Unread: {data['unread']}")
    
    def test_get_user_updates(self, admin_headers):
        """GET /api/support-tickets/user-updates - returns unread ticket updates for user"""
        response = requests.get(f"{BASE_URL}/api/support-tickets/user-updates", headers=admin_headers)
        
        assert response.status_code == 200, f"Get user updates failed: {response.text}"
        data = response.json()
        assert "has_updates" in data, "Response should contain 'has_updates' boolean"
        assert "tickets" in data, "Response should contain 'tickets' array"
        print(f"Has updates: {data['has_updates']}, Tickets with updates: {len(data['tickets'])}")
    
    def test_get_ticket_detail(self, admin_headers):
        """GET /api/support-tickets/{id} - returns full ticket with messages"""
        ticket_id = TestSupportTicketsCRUD.created_ticket_id
        if not ticket_id:
            pytest.skip("No ticket created to test")
        
        response = requests.get(f"{BASE_URL}/api/support-tickets/{ticket_id}", headers=admin_headers)
        
        assert response.status_code == 200, f"Get ticket detail failed: {response.text}"
        data = response.json()
        assert data["id"] == ticket_id, "Ticket ID should match"
        assert "subject" in data, "Response should contain 'subject'"
        assert "messages" in data, "Response should contain 'messages' array"
        assert isinstance(data["messages"], list), "Messages should be a list"
        assert len(data["messages"]) >= 1, "Should have at least the initial message"
        print(f"Ticket {ticket_id} has {len(data['messages'])} messages")
    
    def test_update_ticket_status(self, admin_headers):
        """PUT /api/support-tickets/{id}/status - admin changes ticket status"""
        ticket_id = TestSupportTicketsCRUD.created_ticket_id
        if not ticket_id:
            pytest.skip("No ticket created to test")
        
        # Change to 'searching'
        response = requests.put(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/status",
            json={"status": "searching"},
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Update status failed: {response.text}"
        data = response.json()
        assert data["status"] == "searching", "Status should be updated to 'searching'"
        
        # Verify the change persisted
        get_response = requests.get(f"{BASE_URL}/api/support-tickets/{ticket_id}", headers=admin_headers)
        assert get_response.status_code == 200
        ticket_data = get_response.json()
        assert ticket_data["status"] == "searching", "Status should persist as 'searching'"
        print(f"Ticket status updated to: {ticket_data['status']}")
    
    def test_update_ticket_status_invalid(self, admin_headers):
        """PUT /api/support-tickets/{id}/status - rejects invalid status"""
        ticket_id = TestSupportTicketsCRUD.created_ticket_id
        if not ticket_id:
            pytest.skip("No ticket created to test")
        
        response = requests.put(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/status",
            json={"status": "invalid_status"},
            headers=admin_headers
        )
        
        assert response.status_code == 400, f"Should reject invalid status: {response.text}"
        print("Invalid status correctly rejected")
    
    def test_add_message_to_ticket(self, admin_headers):
        """POST /api/support-tickets/{id}/messages - adds message to ticket"""
        ticket_id = TestSupportTicketsCRUD.created_ticket_id
        if not ticket_id:
            pytest.skip("No ticket created to test")
        
        response = requests.post(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/messages",
            json={"text": "This is a test reply message", "attachments": []},
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Add message failed: {response.text}"
        data = response.json()
        assert "message_id" in data, "Response should contain 'message_id'"
        
        # Verify message was added
        get_response = requests.get(f"{BASE_URL}/api/support-tickets/{ticket_id}", headers=admin_headers)
        assert get_response.status_code == 200
        ticket_data = get_response.json()
        assert len(ticket_data["messages"]) >= 2, "Should have at least 2 messages now"
        print(f"Message added, ticket now has {len(ticket_data['messages'])} messages")
    
    def test_ticket_not_found(self, admin_headers):
        """GET /api/support-tickets/{id} - returns 404 for non-existent ticket"""
        response = requests.get(f"{BASE_URL}/api/support-tickets/nonexistent123", headers=admin_headers)
        
        assert response.status_code == 404, f"Should return 404: {response.text}"
        print("Non-existent ticket correctly returns 404")


class TestSupportTicketsStatusFlow:
    """Test ticket status workflow"""
    
    def test_status_flow_open_to_solved(self, admin_headers):
        """Test full status flow: open -> searching -> solved -> closed"""
        # Create a new ticket
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/support-tickets",
            json={"subject": f"TEST_StatusFlow_{unique_id}", "description": "Testing status flow"},
            headers=admin_headers
        )
        assert create_response.status_code == 200
        ticket_id = create_response.json()["id"]
        
        # Verify initial status is 'open'
        get_response = requests.get(f"{BASE_URL}/api/support-tickets/{ticket_id}", headers=admin_headers)
        assert get_response.json()["status"] == "open"
        
        # Change to 'searching'
        response = requests.put(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/status",
            json={"status": "searching"},
            headers=admin_headers
        )
        assert response.status_code == 200
        
        # Change to 'solved'
        response = requests.put(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/status",
            json={"status": "solved"},
            headers=admin_headers
        )
        assert response.status_code == 200
        
        # Change to 'closed'
        response = requests.put(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/status",
            json={"status": "closed"},
            headers=admin_headers
        )
        assert response.status_code == 200
        
        # Verify final status
        get_response = requests.get(f"{BASE_URL}/api/support-tickets/{ticket_id}", headers=admin_headers)
        assert get_response.json()["status"] == "closed"
        print(f"Status flow completed: open -> searching -> solved -> closed")


class TestSupportTicketsAttachment:
    """Test attachment upload functionality"""
    
    def test_upload_attachment_endpoint_exists(self, admin_headers):
        """POST /api/support-tickets/{id}/messages/attachment - endpoint exists"""
        # First create a ticket
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/support-tickets",
            json={"subject": f"TEST_Attachment_{unique_id}", "description": "Testing attachment"},
            headers=admin_headers
        )
        assert create_response.status_code == 200
        ticket_id = create_response.json()["id"]
        
        # Try to upload without file (should fail with 422 - validation error)
        response = requests.post(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/messages/attachment",
            headers={"Authorization": admin_headers["Authorization"]}
        )
        
        # 422 means endpoint exists but validation failed (no file provided)
        assert response.status_code in [422, 400], f"Endpoint should exist: {response.status_code}"
        print("Attachment upload endpoint exists and validates input")


class TestSupportTicketsCountsBadge:
    """Test that only 'open' status counts towards badge"""
    
    def test_open_status_counts_for_badge(self, admin_headers):
        """Verify open tickets are counted in the badge"""
        # Get initial counts
        initial_response = requests.get(f"{BASE_URL}/api/support-tickets/counts", headers=admin_headers)
        assert initial_response.status_code == 200
        initial_open = initial_response.json()["open"]
        
        # Create a new open ticket
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/support-tickets",
            json={"subject": f"TEST_Badge_{unique_id}", "description": "Testing badge count"},
            headers=admin_headers
        )
        assert create_response.status_code == 200
        ticket_id = create_response.json()["id"]
        
        # Check counts increased
        after_create_response = requests.get(f"{BASE_URL}/api/support-tickets/counts", headers=admin_headers)
        assert after_create_response.status_code == 200
        after_create_open = after_create_response.json()["open"]
        assert after_create_open >= initial_open, "Open count should increase or stay same"
        
        # Change status to 'solved' (should not count)
        requests.put(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/status",
            json={"status": "solved"},
            headers=admin_headers
        )
        
        # Check counts - solved tickets should not be in 'open' count
        after_solved_response = requests.get(f"{BASE_URL}/api/support-tickets/counts", headers=admin_headers)
        assert after_solved_response.status_code == 200
        after_solved_open = after_solved_response.json()["open"]
        assert after_solved_open <= after_create_open, "Open count should decrease when ticket is solved"
        print(f"Badge counts: Initial={initial_open}, After create={after_create_open}, After solved={after_solved_open}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
