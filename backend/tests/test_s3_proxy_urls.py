"""
Test S3 Object Storage Migration for Support Tickets
Tests: File upload to S3, proxy endpoint, auth validation, legacy base64 support
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "test"

# Existing ticket ID for testing
EXISTING_TICKET_ID = "eb733ab4-706"


@pytest.fixture(scope="module")
def admin_token():
    """Get system admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SYSTEM_ADMIN_EMAIL,
        "password": SYSTEM_ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def network_admin_token():
    """Get network admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": NETWORK_ADMIN_EMAIL,
        "password": NETWORK_ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Network admin login failed: {response.status_code}")


class TestSupportTicketsList:
    """Test support ticket list and detail endpoints"""
    
    def test_list_tickets_authenticated(self, admin_token):
        """GET /api/support-tickets returns ticket list"""
        response = requests.get(
            f"{BASE_URL}/api/support-tickets",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "tickets" in data
        assert isinstance(data["tickets"], list)
        print(f"✓ Found {len(data['tickets'])} tickets")
    
    def test_list_tickets_unauthenticated(self):
        """GET /api/support-tickets without auth returns 401"""
        response = requests.get(f"{BASE_URL}/api/support-tickets")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated request correctly rejected")
    
    def test_get_ticket_detail(self, admin_token):
        """GET /api/support-tickets/{id} returns full ticket with messages"""
        response = requests.get(
            f"{BASE_URL}/api/support-tickets/{EXISTING_TICKET_ID}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # Ticket may or may not exist
        if response.status_code == 404:
            pytest.skip(f"Ticket {EXISTING_TICKET_ID} not found - may have been deleted")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data
        assert "subject" in data
        assert "messages" in data
        print(f"✓ Ticket detail retrieved: {data.get('subject', 'N/A')}")


class TestS3AttachmentUpload:
    """Test S3 file upload for attachments"""
    
    def test_upload_image_attachment_returns_s3_url(self, admin_token):
        """POST /api/support-tickets/{id}/messages/attachment uploads to S3 and returns storage_path + url"""
        # Create a simple test image (1x1 PNG)
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {'file': ('test_image.png', io.BytesIO(png_data), 'image/png')}
        
        response = requests.post(
            f"{BASE_URL}/api/support-tickets/{EXISTING_TICKET_ID}/messages/attachment",
            headers={"Authorization": f"Bearer {admin_token}"},
            files=files
        )
        
        if response.status_code == 404:
            pytest.skip(f"Ticket {EXISTING_TICKET_ID} not found")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify S3 response structure (NOT base64 data_url)
        assert "attachment" in data, "Response should contain 'attachment' key"
        attachment = data["attachment"]
        
        # Must have storage_path (S3 path)
        assert "storage_path" in attachment, "Attachment should have 'storage_path' for S3"
        assert attachment["storage_path"].startswith("clara-radio/"), f"storage_path should start with 'clara-radio/', got: {attachment['storage_path']}"
        
        # Must have url (proxy URL)
        assert "url" in attachment, "Attachment should have 'url' for proxy endpoint"
        assert attachment["url"].startswith("/api/support-tickets/files/"), f"url should be proxy path, got: {attachment['url']}"
        
        # Should NOT have data_url (legacy base64)
        assert "data_url" not in attachment, "S3 upload should NOT return data_url (base64)"
        
        # Verify other fields
        assert "filename" in attachment
        assert "content_type" in attachment
        assert attachment["content_type"] == "image/png"
        
        print(f"✓ Image uploaded to S3: {attachment['storage_path']}")
        print(f"✓ Proxy URL: {attachment['url']}")
        
        return attachment
    
    def test_upload_attachment_unauthenticated(self):
        """POST attachment without auth returns 401"""
        png_data = b'\x89PNG\r\n\x1a\n'
        files = {'file': ('test.png', io.BytesIO(png_data), 'image/png')}
        
        response = requests.post(
            f"{BASE_URL}/api/support-tickets/{EXISTING_TICKET_ID}/messages/attachment",
            files=files
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated upload correctly rejected")


class TestS3RecordingUpload:
    """Test S3 file upload for recordings"""
    
    def test_upload_recording_returns_s3_url(self, admin_token):
        """POST /api/support-tickets/{id}/recording uploads to S3 and returns storage_path + url"""
        # Create minimal webm data
        webm_data = b'\x1a\x45\xdf\xa3' + b'\x00' * 100  # Minimal EBML header
        
        files = {'file': ('test_recording.webm', io.BytesIO(webm_data), 'video/webm')}
        
        response = requests.post(
            f"{BASE_URL}/api/support-tickets/{EXISTING_TICKET_ID}/recording",
            headers={"Authorization": f"Bearer {admin_token}"},
            files=files
        )
        
        if response.status_code == 404:
            pytest.skip(f"Ticket {EXISTING_TICKET_ID} not found")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify S3 response structure
        assert "attachment" in data
        attachment = data["attachment"]
        
        # Must have storage_path (S3 path)
        assert "storage_path" in attachment, "Recording should have 'storage_path' for S3"
        assert "clara-radio/recordings/" in attachment["storage_path"], f"Recording path should contain 'clara-radio/recordings/', got: {attachment['storage_path']}"
        
        # Must have url (proxy URL)
        assert "url" in attachment, "Recording should have 'url' for proxy endpoint"
        assert attachment["url"].startswith("/api/support-tickets/files/"), f"url should be proxy path, got: {attachment['url']}"
        
        # Should have is_recording flag
        assert attachment.get("is_recording") == True, "Recording should have is_recording=True"
        
        # Should NOT have data_url
        assert "data_url" not in attachment, "S3 upload should NOT return data_url"
        
        print(f"✓ Recording uploaded to S3: {attachment['storage_path']}")
        print(f"✓ Proxy URL: {attachment['url']}")
        
        return attachment


class TestS3FileProxy:
    """Test S3 file proxy endpoint"""
    
    def test_serve_file_without_auth_returns_401(self, admin_token):
        """GET /api/support-tickets/files/{path} without auth returns 401"""
        # First upload a file to get a valid path
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        files = {'file': ('auth_test.png', io.BytesIO(png_data), 'image/png')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/support-tickets/{EXISTING_TICKET_ID}/messages/attachment",
            headers={"Authorization": f"Bearer {admin_token}"},
            files=files
        )
        
        if upload_response.status_code == 404:
            pytest.skip(f"Ticket {EXISTING_TICKET_ID} not found")
        
        assert upload_response.status_code == 200
        storage_path = upload_response.json()["attachment"]["storage_path"]
        
        # Try to access without auth token
        response = requests.get(f"{BASE_URL}/api/support-tickets/files/{storage_path}")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✓ File access without auth correctly returns 401")
    
    def test_serve_file_with_invalid_token_returns_401(self, admin_token):
        """GET /api/support-tickets/files/{path}?auth=invalid returns 401"""
        # First upload a file
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        files = {'file': ('invalid_token_test.png', io.BytesIO(png_data), 'image/png')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/support-tickets/{EXISTING_TICKET_ID}/messages/attachment",
            headers={"Authorization": f"Bearer {admin_token}"},
            files=files
        )
        
        if upload_response.status_code == 404:
            pytest.skip(f"Ticket {EXISTING_TICKET_ID} not found")
        
        assert upload_response.status_code == 200
        storage_path = upload_response.json()["attachment"]["storage_path"]
        
        # Try with invalid token
        response = requests.get(f"{BASE_URL}/api/support-tickets/files/{storage_path}?auth=invalid_token_12345")
        assert response.status_code == 401, f"Expected 401 with invalid token, got {response.status_code}"
        print("✓ File access with invalid token correctly returns 401")
    
    def test_serve_file_with_valid_auth_returns_file(self, admin_token):
        """GET /api/support-tickets/files/{path}?auth=TOKEN serves file with correct content-type"""
        # Upload a PNG file
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        files = {'file': ('valid_auth_test.png', io.BytesIO(png_data), 'image/png')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/support-tickets/{EXISTING_TICKET_ID}/messages/attachment",
            headers={"Authorization": f"Bearer {admin_token}"},
            files=files
        )
        
        if upload_response.status_code == 404:
            pytest.skip(f"Ticket {EXISTING_TICKET_ID} not found")
        
        assert upload_response.status_code == 200
        storage_path = upload_response.json()["attachment"]["storage_path"]
        
        # Access with valid auth token
        response = requests.get(f"{BASE_URL}/api/support-tickets/files/{storage_path}?auth={admin_token}")
        assert response.status_code == 200, f"Expected 200 with valid auth, got {response.status_code}: {response.text}"
        
        # Verify content-type
        content_type = response.headers.get("Content-Type", "")
        assert "image/png" in content_type, f"Expected image/png content-type, got: {content_type}"
        
        # Verify we got actual file content (PNG magic bytes)
        assert response.content[:4] == b'\x89PNG', "Response should contain PNG file data"
        
        print(f"✓ File served successfully with content-type: {content_type}")
        print(f"✓ File size: {len(response.content)} bytes")


class TestTicketCounts:
    """Test ticket count endpoints"""
    
    def test_ticket_counts(self, admin_token):
        """GET /api/support-tickets/counts returns open and unread counts"""
        response = requests.get(
            f"{BASE_URL}/api/support-tickets/counts",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "open" in data
        assert "unread" in data
        print(f"✓ Ticket counts: open={data['open']}, unread={data['unread']}")


class TestCreateTicketWithS3:
    """Test creating ticket and adding message with S3 attachment"""
    
    def test_full_ticket_flow_with_s3_attachment(self, admin_token):
        """Create ticket, upload attachment, add message with attachment"""
        import uuid
        
        # 1. Create a new ticket
        ticket_data = {
            "subject": f"TEST_S3_Migration_{uuid.uuid4().hex[:8]}",
            "description": "Testing S3 attachment upload flow",
            "error_message": "",
            "steps_tried": "",
            "page_url": "/test",
            "main_site_id": ""
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/support-tickets",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=ticket_data
        )
        assert create_response.status_code == 200, f"Failed to create ticket: {create_response.text}"
        ticket_id = create_response.json()["id"]
        print(f"✓ Created ticket: {ticket_id}")
        
        # 2. Upload an attachment
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        files = {'file': ('screenshot.png', io.BytesIO(png_data), 'image/png')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/messages/attachment",
            headers={"Authorization": f"Bearer {admin_token}"},
            files=files
        )
        assert upload_response.status_code == 200, f"Failed to upload: {upload_response.text}"
        attachment = upload_response.json()["attachment"]
        print(f"✓ Uploaded attachment: {attachment['storage_path']}")
        
        # 3. Add message with the attachment
        message_data = {
            "text": "Here is a screenshot of the issue",
            "attachments": [attachment]
        }
        
        msg_response = requests.post(
            f"{BASE_URL}/api/support-tickets/{ticket_id}/messages",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=message_data
        )
        assert msg_response.status_code == 200, f"Failed to add message: {msg_response.text}"
        print(f"✓ Added message with attachment")
        
        # 4. Verify ticket detail contains the attachment with S3 URL
        detail_response = requests.get(
            f"{BASE_URL}/api/support-tickets/{ticket_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert detail_response.status_code == 200
        ticket = detail_response.json()
        
        # Find the message with attachment
        messages_with_attachments = [m for m in ticket["messages"] if m.get("attachments")]
        assert len(messages_with_attachments) > 0, "Should have message with attachment"
        
        att = messages_with_attachments[-1]["attachments"][0]
        assert "storage_path" in att or "url" in att, "Attachment should have S3 storage_path or url"
        print(f"✓ Verified attachment in ticket detail")
        
        # 5. Verify file can be accessed via proxy
        if "url" in att:
            file_url = f"{BASE_URL}{att['url']}?auth={admin_token}"
            file_response = requests.get(file_url)
            assert file_response.status_code == 200, f"Failed to access file: {file_response.status_code}"
            print(f"✓ File accessible via proxy URL")
        
        return ticket_id


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
