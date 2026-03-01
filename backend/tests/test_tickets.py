"""
Test suite for the Ticket/Support System API endpoints.
Tests: create ticket, list tickets, get ticket details, add messages, update status, notifications
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_SLUG = "radiogroep"


class TestTicketSystem:
    """Ticket system endpoint tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create a requests session"""
        return requests.Session()
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        """Login and get auth token"""
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def main_site_id(self, session, auth_token):
        """Get main site ID from slug"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = session.get(
            f"{BASE_URL}/api/main-sites/by-slug/{MAIN_SITE_SLUG}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get main site: {response.text}"
        data = response.json()
        return data.get("id")
    
    @pytest.fixture(scope="class")
    def headers(self, session, auth_token, main_site_id):
        """Get headers with auth and main site"""
        h = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
            "X-Main-Site-ID": main_site_id or ""
        }
        session.headers.update(h)
        return h
    
    # ===================
    # Ticket Creation Tests
    # ===================
    
    def test_create_ticket_success(self, session, headers):
        """Test creating a new support ticket"""
        test_id = str(uuid.uuid4())[:8]
        payload = {
            "title": f"TEST_Ticket_{test_id}",
            "description": "This is a test ticket description for automated testing",
            "page_url": "https://example.com/test-page",
            "page_name": "Test Page",
            "browser_info": "Chrome 120 | 1920x1080",
            "user_journey": [
                {"url": "/login", "name": "Login", "timestamp": "2026-01-15T10:00:00Z"},
                {"url": "/dashboard", "name": "Dashboard", "timestamp": "2026-01-15T10:01:00Z"},
                {"url": "/shows", "name": "Shows", "timestamp": "2026-01-15T10:02:00Z"}
            ],
            "priority": "normal"
        }
        
        response = session.post(
            f"{BASE_URL}/api/tickets",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Create ticket failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data, "Missing ticket ID"
        assert data["title"] == payload["title"], "Title mismatch"
        assert data["description"] == payload["description"], "Description mismatch"
        assert data["status"] == "open", "Initial status should be 'open'"
        assert data["priority"] == "normal", "Priority mismatch"
        assert data["page_url"] == payload["page_url"], "Page URL mismatch"
        assert data["page_name"] == payload["page_name"], "Page name mismatch"
        assert "user_journey" in data, "Missing user journey"
        assert len(data["user_journey"]) == 3, "User journey length mismatch"
        assert "created_at" in data, "Missing created_at"
        assert "created_by" in data, "Missing created_by"
        
        # Store for later tests
        self.__class__.created_ticket_id = data["id"]
        print(f"Created ticket: {data['id']}")
    
    def test_create_ticket_with_high_priority(self, session, headers):
        """Test creating a ticket with high priority"""
        test_id = str(uuid.uuid4())[:8]
        payload = {
            "title": f"TEST_HighPriority_{test_id}",
            "description": "Urgent issue requiring immediate attention",
            "page_url": "https://example.com/urgent",
            "page_name": "Urgent Page",
            "priority": "high"
        }
        
        response = session.post(
            f"{BASE_URL}/api/tickets",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Create high priority ticket failed: {response.text}"
        data = response.json()
        assert data["priority"] == "high", "Priority should be 'high'"
        
        self.__class__.high_priority_ticket_id = data["id"]
    
    def test_create_ticket_missing_required_fields(self, session, headers):
        """Test creating ticket without required fields fails validation"""
        payload = {
            "description": "Missing title"
        }
        
        response = session.post(
            f"{BASE_URL}/api/tickets",
            headers=headers,
            json=payload
        )
        
        # Should fail with 422 validation error
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
    
    # ===================
    # List Tickets Tests
    # ===================
    
    def test_list_tickets(self, session, headers):
        """Test listing all tickets"""
        response = session.get(
            f"{BASE_URL}/api/tickets",
            headers=headers
        )
        
        assert response.status_code == 200, f"List tickets failed: {response.text}"
        data = response.json()
        
        assert "tickets" in data, "Missing 'tickets' key"
        assert isinstance(data["tickets"], list), "Tickets should be a list"
        
        # Verify we have at least the tickets we created
        if len(data["tickets"]) > 0:
            ticket = data["tickets"][0]
            assert "id" in ticket, "Missing ID in ticket"
            assert "title" in ticket, "Missing title in ticket"
            assert "status" in ticket, "Missing status in ticket"
            assert "priority" in ticket, "Missing priority in ticket"
        
        print(f"Found {len(data['tickets'])} tickets")
    
    def test_list_tickets_with_status_filter(self, session, headers):
        """Test filtering tickets by status"""
        response = session.get(
            f"{BASE_URL}/api/tickets?status=open",
            headers=headers
        )
        
        assert response.status_code == 200, f"List tickets with filter failed: {response.text}"
        data = response.json()
        
        # All returned tickets should have 'open' status
        for ticket in data.get("tickets", []):
            assert ticket["status"] == "open", f"Expected 'open' status, got '{ticket['status']}'"
    
    # ===================
    # Get Single Ticket Tests
    # ===================
    
    def test_get_ticket_details(self, session, headers):
        """Test getting a single ticket with messages"""
        ticket_id = getattr(self.__class__, 'created_ticket_id', None)
        if not ticket_id:
            pytest.skip("No ticket created to test")
        
        response = session.get(
            f"{BASE_URL}/api/tickets/{ticket_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Get ticket failed: {response.text}"
        data = response.json()
        
        # Verify ticket data
        assert data["id"] == ticket_id, "Ticket ID mismatch"
        assert "title" in data, "Missing title"
        assert "description" in data, "Missing description"
        assert "status" in data, "Missing status"
        assert "messages" in data, "Missing messages array"
        assert "user_journey" in data, "Missing user_journey"
        assert isinstance(data["messages"], list), "Messages should be a list"
    
    def test_get_ticket_not_found(self, session, headers):
        """Test getting non-existent ticket returns 404"""
        fake_id = str(uuid.uuid4())
        response = session.get(
            f"{BASE_URL}/api/tickets/{fake_id}",
            headers=headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    # ===================
    # Ticket Messages Tests
    # ===================
    
    def test_add_message_to_ticket(self, session, headers):
        """Test adding a message to a ticket conversation"""
        ticket_id = getattr(self.__class__, 'created_ticket_id', None)
        if not ticket_id:
            pytest.skip("No ticket created to test")
        
        payload = {
            "message": "This is a test reply from automated testing"
        }
        
        response = session.post(
            f"{BASE_URL}/api/tickets/{ticket_id}/messages",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Add message failed: {response.text}"
        data = response.json()
        
        assert "id" in data, "Missing message ID"
        assert data["message"] == payload["message"], "Message content mismatch"
        assert "user_name" in data, "Missing user_name"
        assert "created_at" in data, "Missing created_at"
        assert "is_admin" in data, "Missing is_admin flag"
        
        # Verify message is added by fetching ticket again
        get_response = session.get(
            f"{BASE_URL}/api/tickets/{ticket_id}",
            headers=headers
        )
        assert get_response.status_code == 200
        ticket_data = get_response.json()
        assert len(ticket_data["messages"]) > 0, "Message should be in ticket"
    
    def test_add_message_to_nonexistent_ticket(self, session, headers):
        """Test adding message to non-existent ticket fails"""
        fake_id = str(uuid.uuid4())
        payload = {"message": "Test message"}
        
        response = session.post(
            f"{BASE_URL}/api/tickets/{fake_id}/messages",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    # ===================
    # Status Update Tests
    # ===================
    
    def test_update_ticket_status_to_in_progress(self, session, headers):
        """Test updating ticket status to in_progress"""
        ticket_id = getattr(self.__class__, 'created_ticket_id', None)
        if not ticket_id:
            pytest.skip("No ticket created to test")
        
        payload = {"status": "in_progress"}
        
        response = session.put(
            f"{BASE_URL}/api/tickets/{ticket_id}/status",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Update status failed: {response.text}"
        data = response.json()
        assert data["status"] == "in_progress", "Status should be 'in_progress'"
        
        # Verify via GET
        get_response = session.get(
            f"{BASE_URL}/api/tickets/{ticket_id}",
            headers=headers
        )
        assert get_response.status_code == 200
        assert get_response.json()["status"] == "in_progress"
    
    def test_update_ticket_status_to_resolved(self, session, headers):
        """Test updating ticket status to resolved"""
        ticket_id = getattr(self.__class__, 'created_ticket_id', None)
        if not ticket_id:
            pytest.skip("No ticket created to test")
        
        payload = {"status": "resolved"}
        
        response = session.put(
            f"{BASE_URL}/api/tickets/{ticket_id}/status",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Update status failed: {response.text}"
        assert response.json()["status"] == "resolved"
    
    def test_update_ticket_invalid_status(self, session, headers):
        """Test updating ticket with invalid status fails"""
        ticket_id = getattr(self.__class__, 'created_ticket_id', None)
        if not ticket_id:
            pytest.skip("No ticket created to test")
        
        payload = {"status": "invalid_status"}
        
        response = session.put(
            f"{BASE_URL}/api/tickets/{ticket_id}/status",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
    
    def test_update_status_nonexistent_ticket(self, session, headers):
        """Test updating status of non-existent ticket fails"""
        fake_id = str(uuid.uuid4())
        payload = {"status": "open"}
        
        response = session.put(
            f"{BASE_URL}/api/tickets/{fake_id}/status",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    # ===================
    # Notifications Tests
    # ===================
    
    def test_get_notifications(self, session, headers):
        """Test getting notification count"""
        response = session.get(
            f"{BASE_URL}/api/tickets/notifications",
            headers=headers
        )
        
        assert response.status_code == 200, f"Get notifications failed: {response.text}"
        data = response.json()
        
        assert "unread_count" in data, "Missing unread_count"
        assert isinstance(data["unread_count"], int), "unread_count should be integer"
        print(f"Unread notifications: {data['unread_count']}")
    
    def test_mark_notifications_read(self, session, headers):
        """Test marking notifications as read"""
        response = session.post(
            f"{BASE_URL}/api/tickets/notifications/read",
            headers=headers
        )
        
        assert response.status_code == 200, f"Mark notifications read failed: {response.text}"
        data = response.json()
        assert data.get("status") == "ok", "Expected status 'ok'"
    
    # ===================
    # Priority Filter Tests  
    # ===================
    
    def test_list_tickets_sorted_by_date(self, session, headers):
        """Test that tickets are sorted by created_at descending"""
        response = session.get(
            f"{BASE_URL}/api/tickets",
            headers=headers
        )
        
        assert response.status_code == 200
        tickets = response.json().get("tickets", [])
        
        if len(tickets) >= 2:
            # Verify descending order by created_at
            for i in range(len(tickets) - 1):
                date1 = tickets[i].get("created_at", "")
                date2 = tickets[i + 1].get("created_at", "")
                assert date1 >= date2, "Tickets should be sorted by date descending"
    
    # ===================
    # Cleanup
    # ===================
    
    def test_update_test_ticket_to_closed(self, session, headers):
        """Clean up: close the test ticket"""
        ticket_id = getattr(self.__class__, 'created_ticket_id', None)
        if not ticket_id:
            pytest.skip("No ticket to clean up")
        
        payload = {"status": "closed"}
        response = session.put(
            f"{BASE_URL}/api/tickets/{ticket_id}/status",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200
        print(f"Closed test ticket: {ticket_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
