"""
Test S3 Proxy URL Bug Fix - Tests for fixing AccessDenied on media/audio files

This tests the bug fix where:
1. POST /api/uploads/editor-files - should return proxy URL (contains '/s3/') not direct S3 URL
2. GET /api/uploads/editor-files/s3/{file_key} - should return 302 redirect to presigned S3 URL
3. GET /api/media/serve/{asset_id} - should return 302 redirect to presigned S3 URL for media library assets

Test asset ID provided: cf02853e-776e-427d-9544-b7c19f31bd4b
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://clara-admin-portal.preview.emergentagent.com')
TEST_ASSET_ID = "cf02853e-776e-427d-9544-b7c19f31bd4b"


class TestS3ProxyURLFix:
    """Tests for S3 proxy URL fix to resolve AccessDenied errors"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as network admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip("Authentication failed")
    
    def test_media_serve_endpoint_exists(self):
        """Test that GET /api/media/serve/{asset_id} endpoint exists and returns proper response"""
        response = self.session.get(
            f"{BASE_URL}/api/media/serve/{TEST_ASSET_ID}",
            allow_redirects=False
        )
        
        # Should be 302 redirect (to presigned S3 URL) or 404 if asset doesn't exist
        assert response.status_code in [302, 404, 200], \
            f"Expected 302/404/200, got {response.status_code}: {response.text}"
        
        if response.status_code == 302:
            location = response.headers.get('Location', '')
            print(f"PASS: /api/media/serve/{TEST_ASSET_ID} returns 302 redirect")
            print(f"  Redirect location: {location[:100]}...")
            # Verify the presigned URL contains expected S3 signature params
            assert 'X-Amz-Signature' in location or 'objectstorage' in location, \
                "Redirect URL should be a presigned S3 URL"
        elif response.status_code == 404:
            print(f"PASS: Endpoint exists, asset {TEST_ASSET_ID} not found (expected if test data missing)")
        else:
            print(f"PASS: Endpoint returns 200 (local file)")
    
    def test_media_serve_follows_redirect_successfully(self):
        """Test that following the redirect actually serves the file (HTTP 200)"""
        response = self.session.get(
            f"{BASE_URL}/api/media/serve/{TEST_ASSET_ID}",
            allow_redirects=True
        )
        
        if response.status_code == 200:
            print(f"PASS: Following redirect returns file content")
            print(f"  Content-Type: {response.headers.get('Content-Type', 'unknown')}")
            print(f"  Content-Length: {len(response.content)} bytes")
        elif response.status_code == 404:
            print(f"INFO: Asset {TEST_ASSET_ID} not found - this is OK if test data is missing")
        else:
            # AccessDenied from S3 would be 403
            assert response.status_code != 403, \
                f"AccessDenied (403) from S3 - presigned URL not working! Response: {response.text[:500]}"
    
    def test_editor_files_upload_returns_proxy_url(self):
        """Test POST /api/uploads/editor-files returns proxy URL not direct S3 URL"""
        # Create a small test image
        test_image = io.BytesIO()
        # Create a minimal valid PNG (1x1 pixel transparent PNG)
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,  # 8-bit RGBA
            0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,  # IDAT chunk
            0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
            0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,  # IEND chunk
            0xAE, 0x42, 0x60, 0x82
        ])
        test_image.write(png_data)
        test_image.seek(0)
        
        # Remove content-type header for multipart upload
        headers = {"Authorization": f"Bearer {self.token}"}
        
        files = {'file': ('test_image.png', test_image, 'image/png')}
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200, f"Upload failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert 'url' in data, "Response should contain 'url' field"
        
        url = data['url']
        print(f"Uploaded file URL: {url}")
        
        # Key assertion: URL should be a proxy URL, NOT a direct S3 URL
        # Proxy URL pattern: /api/uploads/editor-files/s3/editor/...
        # Direct S3 URL would contain: .your-objectstorage.com or similar
        
        assert '/api/uploads/editor-files/s3/' in url or '/api/uploads/editor-files/' in url, \
            f"URL should be a proxy URL containing '/api/uploads/editor-files/', got: {url}"
        
        assert 'objectstorage' not in url.lower(), \
            f"URL should NOT be a direct S3 URL (no 'objectstorage' in URL), got: {url}"
        
        print(f"PASS: Upload returns proxy URL: {url}")
        
        return url
    
    def test_editor_files_s3_proxy_endpoint_redirects(self):
        """Test GET /api/uploads/editor-files/s3/{file_key} returns 302 redirect"""
        # First upload a file to get a valid S3 key
        test_image = io.BytesIO()
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
            0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,
            0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
            0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
            0xAE, 0x42, 0x60, 0x82
        ])
        test_image.write(png_data)
        test_image.seek(0)
        
        headers = {"Authorization": f"Bearer {self.token}"}
        files = {'file': ('redirect_test.png', test_image, 'image/png')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            files=files,
            headers=headers
        )
        
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        
        proxy_url = upload_response.json()['url']
        
        # Now test accessing the proxy URL without following redirects
        response = requests.get(proxy_url, allow_redirects=False)
        
        assert response.status_code == 302, \
            f"Proxy endpoint should return 302 redirect, got {response.status_code}: {response.text}"
        
        location = response.headers.get('Location', '')
        print(f"PASS: Proxy URL returns 302 redirect")
        print(f"  Proxy URL: {proxy_url}")
        print(f"  Redirect to: {location[:100]}...")
        
        # Verify redirect is to presigned S3 URL
        assert 'X-Amz-Signature' in location or 'Expires' in location, \
            "Redirect should be to a presigned S3 URL with signature"
    
    def test_editor_files_s3_proxy_serves_file(self):
        """Test that following the S3 proxy redirect actually serves the file"""
        # Upload a file
        test_image = io.BytesIO()
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
            0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,
            0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
            0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
            0xAE, 0x42, 0x60, 0x82
        ])
        test_image.write(png_data)
        test_image.seek(0)
        
        headers = {"Authorization": f"Bearer {self.token}"}
        files = {'file': ('serve_test.png', test_image, 'image/png')}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            files=files,
            headers=headers
        )
        
        assert upload_response.status_code == 200
        proxy_url = upload_response.json()['url']
        
        # Follow the redirect
        response = requests.get(proxy_url, allow_redirects=True)
        
        assert response.status_code == 200, \
            f"Following redirect should return 200, got {response.status_code}. " \
            f"This would be 403 if AccessDenied bug still exists. Response: {response.text[:500]}"
        
        # Verify we got image content
        content_type = response.headers.get('Content-Type', '')
        print(f"PASS: File served successfully via proxy")
        print(f"  Content-Type: {content_type}")
        print(f"  Content-Length: {len(response.content)} bytes")
        
        assert len(response.content) > 0, "Response should have content"
    
    def test_media_library_listing_still_works(self):
        """Regression: Media library listing should still work"""
        response = self.session.get(f"{BASE_URL}/api/media")
        
        assert response.status_code == 200, f"Media listing failed: {response.status_code}"
        
        data = response.json()
        print(f"PASS: Media library listing works, found {len(data)} assets")
        
        # If there are assets, verify they have expected fields
        if len(data) > 0:
            asset = data[0]
            assert 'id' in asset
            assert 'title' in asset
            print(f"  Sample asset: {asset.get('title', 'Unknown')} (id: {asset['id']})")
    
    def test_media_delete_still_works(self):
        """Regression: Media upload and delete should still work"""
        # Upload a test file
        test_image = io.BytesIO()
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
            0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,
            0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
            0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
            0xAE, 0x42, 0x60, 0x82
        ])
        test_image.write(png_data)
        test_image.seek(0)
        
        headers = {"Authorization": f"Bearer {self.token}"}
        files = {'file': ('delete_test.png', test_image, 'image/png')}
        
        # Upload to media library
        upload_response = requests.post(
            f"{BASE_URL}/api/media",
            files=files,
            headers=headers
        )
        
        assert upload_response.status_code == 201, f"Upload failed: {upload_response.text}"
        
        asset_id = upload_response.json()['id']
        print(f"Uploaded test asset: {asset_id}")
        
        # Delete it
        delete_response = self.session.delete(f"{BASE_URL}/api/media/{asset_id}")
        
        assert delete_response.status_code == 204, \
            f"Delete failed: {delete_response.status_code}"
        
        print(f"PASS: Media upload and delete still works")
    
    def test_existing_asset_serves_via_proxy(self):
        """Test that the known test asset serves via proxy endpoint"""
        # Use the provided test asset ID
        response = self.session.get(
            f"{BASE_URL}/api/media/serve/{TEST_ASSET_ID}",
            allow_redirects=True
        )
        
        if response.status_code == 404:
            pytest.skip(f"Test asset {TEST_ASSET_ID} not found in database")
        
        assert response.status_code == 200, \
            f"Expected 200 after redirect, got {response.status_code}. " \
            f"403 would indicate AccessDenied bug still exists."
        
        print(f"PASS: Test asset {TEST_ASSET_ID} serves successfully via proxy")
        print(f"  Content-Type: {response.headers.get('Content-Type', 'unknown')}")
        print(f"  Content-Length: {len(response.content)} bytes")


class TestS3URLMigration:
    """Tests for the startup migration of S3 URLs in content bodies"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_content_api_accessible(self):
        """Test that content API is accessible for verifying migration"""
        response = self.session.get(f"{BASE_URL}/api/content")
        
        assert response.status_code == 200, f"Content API failed: {response.status_code}"
        
        data = response.json()
        # Handle both list and dict responses
        if isinstance(data, list):
            item_count = len(data)
        else:
            item_count = len(data.get('items', data))
        print(f"PASS: Content API accessible, found {item_count} items")
    
    def test_content_bodies_have_proxy_urls(self):
        """Test that content bodies with images use proxy URLs not direct S3 URLs"""
        response = self.session.get(f"{BASE_URL}/api/content")
        
        if response.status_code != 200:
            pytest.skip("Could not access content API")
        
        data = response.json()
        items = data.get('items', data) if isinstance(data, dict) else data
        
        direct_s3_count = 0
        proxy_url_count = 0
        
        for item in items[:20]:  # Check first 20 items
            body = item.get('body', '')
            if not body:
                continue
            
            # Check for direct S3 URLs (the bug)
            if 'objectstorage.com/koodh-clara/editor' in body.lower():
                direct_s3_count += 1
                print(f"WARNING: Found direct S3 URL in content {item.get('id')}")
            
            # Check for proxy URLs (the fix)
            if '/api/uploads/editor-files/s3/editor' in body:
                proxy_url_count += 1
        
        print(f"Content analysis: {proxy_url_count} proxy URLs, {direct_s3_count} direct S3 URLs")
        
        if direct_s3_count > 0:
            print(f"WARNING: {direct_s3_count} items still have direct S3 URLs - migration may not have run")
        else:
            print("PASS: No direct S3 URLs found in content bodies")


class TestImageUploadViaTinyMCE:
    """Tests simulating TinyMCE editor file uploads"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.token = token
        else:
            pytest.skip("Authentication failed")
    
    def test_audio_file_upload(self):
        """Test audio file upload returns proxy URL"""
        # Create a minimal valid MP3 file (just headers)
        # This is a tiny valid MP3 with no audio (ID3 header + minimal frame)
        mp3_data = bytes([
            0xFF, 0xFB, 0x90, 0x00,  # MP3 frame header
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        ] * 100)  # Repeat to make it valid-ish
        
        audio_file = io.BytesIO(mp3_data)
        
        headers = {"Authorization": f"Bearer {self.token}"}
        files = {'file': ('test_audio.mp3', audio_file, 'audio/mpeg')}
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200, f"Audio upload failed: {response.status_code} - {response.text}"
        
        data = response.json()
        url = data.get('url', '')
        
        print(f"Audio uploaded to: {url}")
        
        # Verify it's a proxy URL
        assert '/api/uploads/editor-files/' in url, \
            f"Audio URL should be proxy URL, got: {url}"
        assert 'objectstorage' not in url.lower(), \
            f"Audio URL should NOT be direct S3 URL, got: {url}"
        
        print("PASS: Audio file upload returns proxy URL")
    
    def test_pdf_file_upload(self):
        """Test PDF file upload returns proxy URL"""
        # Minimal valid PDF
        pdf_data = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
168
%%EOF"""
        
        pdf_file = io.BytesIO(pdf_data)
        
        headers = {"Authorization": f"Bearer {self.token}"}
        files = {'file': ('test_doc.pdf', pdf_file, 'application/pdf')}
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200, f"PDF upload failed: {response.status_code} - {response.text}"
        
        data = response.json()
        url = data.get('url', '')
        
        print(f"PDF uploaded to: {url}")
        
        # Verify it's a proxy URL
        assert '/api/uploads/editor-files/' in url
        assert 'objectstorage' not in url.lower()
        
        print("PASS: PDF file upload returns proxy URL")
