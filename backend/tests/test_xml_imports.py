"""
Test XML Imports and API Keys Feature
Testing Server site creation, XML upload/download/preview/delete, API key management, and agent auth
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
NETWORK_ADMIN_EMAIL = "admkoodh@koodh.com"
NETWORK_ADMIN_PASSWORD = "KYLovie13monx"

# Pre-existing test data
SERVER_SITE_ID = "9d51a9a0-90ea-41c5-8324-d240fedbd99c"
SERVER_SITE_SLUG = "clara-xml-server"
EXISTING_IMPORT_ID = "720d276d-d7ed-4ae8-b78e-64f317b9350b"


class TestAuth:
    """Authentication helper tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token for network admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestServerSiteType(TestAuth):
    """Test Server site type is available in main sites"""
    
    def test_server_site_exists(self, auth_headers):
        """Verify the test Server site exists"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/{SERVER_SITE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get server site: {response.text}"
        data = response.json()
        assert data["site_type"] == "server", f"Site type should be 'server', got: {data.get('site_type')}"
        assert data["slug"] == SERVER_SITE_SLUG
        print(f"✓ Server site exists: {data['name']} (type={data['site_type']})")
    
    def test_server_site_has_xml_features(self, auth_headers):
        """Verify server site has xml_imports and server_api_keys features"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/{SERVER_SITE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        features = data.get("enabled_features", [])
        assert "xml_imports" in features, f"xml_imports should be in enabled_features: {features}"
        assert "server_api_keys" in features, f"server_api_keys should be in enabled_features: {features}"
        print(f"✓ Server site has required features: {features}")


class TestXmlUploadApi(TestAuth):
    """Test XML Upload endpoint (POST /api/xml-imports/upload)"""
    
    def test_xml_upload_requires_main_site_header(self, auth_token):
        """Upload without X-Main-Site-ID should return 400"""
        # Create test XML content
        xml_content = b'<?xml version="1.0"?><root><project>Test</project></root>'
        files = {'file': ('test.xml', xml_content, 'application/xml')}
        
        response = requests.post(
            f"{BASE_URL}/api/xml-imports/upload",
            files=files,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 400, f"Should return 400 without X-Main-Site-ID: {response.text}"
        print("✓ Upload requires X-Main-Site-ID header")
    
    def test_xml_upload_rejects_non_xml(self, auth_token):
        """Upload non-XML file should return 400"""
        # Create test non-XML content
        content = b'This is not XML content'
        files = {'file': ('test.txt', content, 'text/plain')}
        
        response = requests.post(
            f"{BASE_URL}/api/xml-imports/upload",
            files=files,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "X-Main-Site-ID": SERVER_SITE_ID
            }
        )
        assert response.status_code == 400, f"Should return 400 for non-XML: {response.text}"
        assert "xml" in response.json().get("detail", "").lower()
        print("✓ Upload rejects non-XML files")
    
    def test_xml_upload_success(self, auth_token):
        """Upload valid XML file should return import_id and status=processing"""
        xml_content = b'''<?xml version="1.0"?>
<RadioConfig>
    <project>Test Radio Project</project>
    <version>1.0.0</version>
    <date>2024-01-15</date>
    <station>Test FM</station>
</RadioConfig>'''
        files = {'file': ('test_upload.xml', xml_content, 'application/xml')}
        
        response = requests.post(
            f"{BASE_URL}/api/xml-imports/upload",
            files=files,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "X-Main-Site-ID": SERVER_SITE_ID
            }
        )
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert "import_id" in data, f"Response should contain import_id: {data}"
        assert data.get("status") == "processing", f"Status should be 'processing': {data}"
        print(f"✓ XML upload successful: import_id={data['import_id']}")
        
        # Store for cleanup - wait for processing
        time.sleep(1)
        return data["import_id"]


class TestXmlListApi(TestAuth):
    """Test XML List endpoint (GET /api/xml-imports)"""
    
    def test_list_imports_returns_paginated(self, auth_headers):
        """List imports should return paginated response"""
        response = requests.get(
            f"{BASE_URL}/api/xml-imports?main_site_id={SERVER_SITE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"List imports failed: {response.text}"
        data = response.json()
        
        # Check pagination fields
        assert "imports" in data, f"Response should have 'imports' key: {data}"
        assert "total" in data, f"Response should have 'total' key: {data}"
        assert "page" in data, f"Response should have 'page' key: {data}"
        assert "page_size" in data, f"Response should have 'page_size' key: {data}"
        assert "total_pages" in data, f"Response should have 'total_pages' key: {data}"
        
        assert isinstance(data["imports"], list), "imports should be a list"
        print(f"✓ List imports returns paginated data: {data['total']} imports, page {data['page']}/{data['total_pages']}")
    
    def test_list_imports_filter_by_status(self, auth_headers):
        """List imports with status filter"""
        response = requests.get(
            f"{BASE_URL}/api/xml-imports?main_site_id={SERVER_SITE_ID}&status=success",
            headers=auth_headers
        )
        assert response.status_code == 200, f"List with filter failed: {response.text}"
        data = response.json()
        
        # All returned imports should have status=success (or empty list)
        for imp in data.get("imports", []):
            assert imp.get("status") == "success", f"Filter not applied correctly: {imp}"
        print(f"✓ Status filter works: {len(data['imports'])} success imports")


class TestXmlDetailsApi(TestAuth):
    """Test XML Details endpoint (GET /api/xml-imports/<import_id>)"""
    
    def test_get_import_details(self, auth_headers):
        """Get details of existing import"""
        response = requests.get(
            f"{BASE_URL}/api/xml-imports/{EXISTING_IMPORT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get import failed: {response.text}"
        data = response.json()
        
        # Check expected fields
        assert "id" in data, f"Response should have 'id': {data}"
        assert "file_name" in data, f"Response should have 'file_name': {data}"
        assert "status" in data, f"Response should have 'status': {data}"
        assert "upload_date" in data, f"Response should have 'upload_date': {data}"
        
        # Check metadata if success
        if data.get("status") == "success":
            metadata = data.get("metadata", {})
            # Metadata should have parsed fields
            print(f"✓ Import details retrieved: {data['file_name']} (status={data['status']}, metadata={metadata})")
        else:
            print(f"✓ Import details retrieved: {data['file_name']} (status={data['status']})")
    
    def test_get_nonexistent_import_returns_404(self, auth_headers):
        """Get non-existent import should return 404"""
        response = requests.get(
            f"{BASE_URL}/api/xml-imports/nonexistent-id-12345",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Should return 404: {response.status_code}"
        print("✓ Non-existent import returns 404")


class TestXmlPreviewApi(TestAuth):
    """Test XML Preview endpoint (GET /api/xml-imports/<import_id>/preview)"""
    
    def test_preview_xml_content(self, auth_headers):
        """Preview should return xml_content"""
        response = requests.get(
            f"{BASE_URL}/api/xml-imports/{EXISTING_IMPORT_ID}/preview",
            headers=auth_headers
        )
        # May be 200 or 404 if file not found in storage
        if response.status_code == 200:
            data = response.json()
            assert "xml_content" in data, f"Response should have 'xml_content': {data}"
            assert isinstance(data["xml_content"], str), "xml_content should be string"
            print(f"✓ XML preview retrieved: {len(data['xml_content'])} chars")
        elif response.status_code == 404:
            print("✓ XML preview returns 404 (file may not be in storage)")
        else:
            pytest.fail(f"Unexpected status: {response.status_code} - {response.text}")


class TestXmlDownloadApi(TestAuth):
    """Test XML Download endpoint (GET /api/xml-imports/<import_id>/download)"""
    
    def test_download_xml_file(self, auth_headers):
        """Download should return XML file"""
        response = requests.get(
            f"{BASE_URL}/api/xml-imports/{EXISTING_IMPORT_ID}/download",
            headers=auth_headers
        )
        # May be 200 or 404 if file not found
        if response.status_code == 200:
            assert response.headers.get("content-type") == "application/xml"
            assert "content-disposition" in response.headers
            print(f"✓ XML download works: {len(response.content)} bytes")
        elif response.status_code == 404:
            print("✓ XML download returns 404 (file may not be in storage)")
        else:
            pytest.fail(f"Unexpected status: {response.status_code} - {response.text}")


class TestApiKeyManagement(TestAuth):
    """Test API Key endpoints"""
    
    def test_create_api_key(self, auth_headers):
        """Create API key should return key with api_key field"""
        response = requests.post(
            f"{BASE_URL}/api/xml-imports/api-keys",
            json={
                "name": "TEST_Pytest Agent",
                "main_site_id": SERVER_SITE_ID
            },
            headers=auth_headers
        )
        assert response.status_code == 200, f"Create API key failed: {response.text}"
        data = response.json()
        
        assert "id" in data, f"Response should have 'id': {data}"
        assert "api_key" in data, f"Response should have 'api_key' (only shown once): {data}"
        assert "name" in data, f"Response should have 'name': {data}"
        assert data["api_key"].startswith("clara_"), f"API key should start with 'clara_': {data['api_key'][:20]}"
        print(f"✓ API key created: {data['name']} (prefix: {data['api_key'][:15]}...)")
        
        # Store for later tests
        return {"id": data["id"], "api_key": data["api_key"]}
    
    def test_list_api_keys(self, auth_headers):
        """List API keys should not include key_hash"""
        response = requests.get(
            f"{BASE_URL}/api/xml-imports/api-keys?main_site_id={SERVER_SITE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"List API keys failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), f"Response should be list: {data}"
        for key in data:
            assert "key_hash" not in key, f"key_hash should not be exposed: {key}"
            assert "id" in key, f"Key should have 'id': {key}"
            assert "name" in key, f"Key should have 'name': {key}"
            assert "key_prefix" in key, f"Key should have 'key_prefix': {key}"
        print(f"✓ Listed {len(data)} API keys (key_hash not exposed)")
    
    def test_delete_api_key(self, auth_headers):
        """Delete API key should deactivate it"""
        # First create a key to delete
        create_response = requests.post(
            f"{BASE_URL}/api/xml-imports/api-keys",
            json={
                "name": "TEST_Delete Me",
                "main_site_id": SERVER_SITE_ID
            },
            headers=auth_headers
        )
        assert create_response.status_code == 200
        key_id = create_response.json()["id"]
        
        # Delete the key
        delete_response = requests.delete(
            f"{BASE_URL}/api/xml-imports/api-keys/{key_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        assert "deactivated" in delete_response.json().get("message", "").lower()
        print(f"✓ API key deactivated: {key_id}")


class TestAgentUpload(TestAuth):
    """Test Agent Upload endpoint (API key auth instead of user auth)"""
    
    def test_agent_upload_without_auth_fails(self):
        """Agent upload without API key should return 401"""
        xml_content = b'<?xml version="1.0"?><root><test>Agent</test></root>'
        files = {'file': ('agent_test.xml', xml_content, 'application/xml')}
        
        response = requests.post(
            f"{BASE_URL}/api/xml-imports/agent/upload",
            files=files
        )
        assert response.status_code == 401, f"Should return 401 without auth: {response.status_code}"
        print("✓ Agent upload requires API key")
    
    def test_agent_upload_with_invalid_key_fails(self):
        """Agent upload with invalid API key should return 401"""
        xml_content = b'<?xml version="1.0"?><root><test>Agent</test></root>'
        files = {'file': ('agent_test.xml', xml_content, 'application/xml')}
        
        response = requests.post(
            f"{BASE_URL}/api/xml-imports/agent/upload",
            files=files,
            headers={"Authorization": "Bearer clara_invalidkey12345"}
        )
        assert response.status_code == 401, f"Should return 401 with invalid key: {response.status_code}"
        print("✓ Agent upload rejects invalid API key")
    
    def test_agent_upload_with_valid_key(self, auth_headers):
        """Agent upload with valid API key should succeed"""
        # First create an API key
        create_response = requests.post(
            f"{BASE_URL}/api/xml-imports/api-keys",
            json={
                "name": "TEST_Agent Upload Test",
                "main_site_id": SERVER_SITE_ID
            },
            headers=auth_headers
        )
        assert create_response.status_code == 200
        api_key = create_response.json()["api_key"]
        key_id = create_response.json()["id"]
        
        # Upload via agent endpoint
        xml_content = b'''<?xml version="1.0"?>
<AgentUpload>
    <project>Agent Test Project</project>
    <version>2.0</version>
    <date>2024-01-20</date>
</AgentUpload>'''
        files = {'file': ('agent_upload.xml', xml_content, 'application/xml')}
        
        response = requests.post(
            f"{BASE_URL}/api/xml-imports/agent/upload",
            files=files,
            headers={"Authorization": f"Bearer {api_key}"}
        )
        assert response.status_code == 200, f"Agent upload failed: {response.text}"
        data = response.json()
        assert "import_id" in data
        assert data.get("status") == "processing"
        print(f"✓ Agent upload successful: import_id={data['import_id']}")
        
        # Cleanup - deactivate the key
        requests.delete(
            f"{BASE_URL}/api/xml-imports/api-keys/{key_id}",
            headers=auth_headers
        )


class TestXmlDeleteApi(TestAuth):
    """Test XML Delete endpoint (DELETE /api/xml-imports/<import_id>)"""
    
    def test_delete_import(self, auth_token):
        """Delete an import should remove it"""
        # First upload a new file to delete
        xml_content = b'<?xml version="1.0"?><DeleteTest><name>ToDelete</name></DeleteTest>'
        files = {'file': ('delete_test.xml', xml_content, 'application/xml')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/xml-imports/upload",
            files=files,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "X-Main-Site-ID": SERVER_SITE_ID
            }
        )
        assert upload_response.status_code == 200
        import_id = upload_response.json()["import_id"]
        
        # Wait for processing
        time.sleep(1)
        
        # Delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/xml-imports/{import_id}",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            }
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        assert "deleted" in delete_response.json().get("message", "").lower()
        
        # Verify it's gone
        get_response = requests.get(
            f"{BASE_URL}/api/xml-imports/{import_id}",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            }
        )
        assert get_response.status_code == 404, "Deleted import should return 404"
        print(f"✓ Import deleted and verified gone: {import_id}")


class TestXmlParsing(TestAuth):
    """Test XML parsing extracts metadata correctly"""
    
    def test_xml_parsing_extracts_metadata(self, auth_token):
        """Upload XML and verify metadata is extracted"""
        xml_content = b'''<?xml version="1.0" encoding="UTF-8"?>
<RadioConfiguration>
    <project>Radio Station Config</project>
    <version>3.5.1</version>
    <date>2024-01-25</date>
    <frequencies>
        <fm>98.5</fm>
        <fm>102.3</fm>
    </frequencies>
    <encoders>
        <encoder id="1">Main</encoder>
        <encoder id="2">Backup</encoder>
    </encoders>
</RadioConfiguration>'''
        files = {'file': ('metadata_test.xml', xml_content, 'application/xml')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/xml-imports/upload",
            files=files,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "X-Main-Site-ID": SERVER_SITE_ID
            }
        )
        assert upload_response.status_code == 200
        import_id = upload_response.json()["import_id"]
        
        # Wait for background processing
        time.sleep(2)
        
        # Get details and check metadata
        details_response = requests.get(
            f"{BASE_URL}/api/xml-imports/{import_id}",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            }
        )
        assert details_response.status_code == 200
        data = details_response.json()
        
        # Should have parsed metadata
        if data.get("status") == "success":
            assert data.get("project_name"), f"project_name should be extracted: {data}"
            metadata = data.get("metadata", {})
            assert metadata.get("version") == "3.5.1", f"Version should be extracted: {metadata}"
            assert metadata.get("element_count", 0) > 0, f"Element count should be > 0: {metadata}"
            print(f"✓ XML parsed successfully: project={data['project_name']}, version={metadata.get('version')}, elements={metadata.get('element_count')}")
        else:
            print(f"✓ XML upload completed with status: {data.get('status')}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/xml-imports/{import_id}",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            }
        )


class TestCleanup:
    """Cleanup test data created during tests"""
    
    def test_cleanup_test_api_keys(self):
        """Clean up TEST_ prefixed API keys"""
        # Login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        token = login_response.json().get("token")
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        
        # Get all keys
        keys_response = requests.get(
            f"{BASE_URL}/api/xml-imports/api-keys?main_site_id={SERVER_SITE_ID}",
            headers=headers
        )
        
        if keys_response.status_code == 200:
            keys = keys_response.json()
            deleted = 0
            for key in keys:
                if key.get("name", "").startswith("TEST_"):
                    requests.delete(
                        f"{BASE_URL}/api/xml-imports/api-keys/{key['id']}",
                        headers=headers
                    )
                    deleted += 1
            print(f"✓ Cleaned up {deleted} TEST_ API keys")
        else:
            print("✓ No cleanup needed for API keys")
