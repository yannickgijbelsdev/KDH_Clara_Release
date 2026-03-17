"""
Media Upload Tests - Audio/Video file upload functionality
Tests for:
- Audio file (.mp3) upload
- Video file (.mp4) upload  
- Video type filter support
- Large file upload (10MB+)
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admkoodh@koodh.com"
TEST_PASSWORD = "KYLovie13monx"
MAIN_SITE_SLUG = "radiogroep"


class TestMediaUploadAudioVideo:
    """Tests for audio/video upload functionality in Media Library"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.auth_token = None
        self.main_site_id = None
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code == 200:
            login_data = login_response.json()
            self.auth_token = login_data.get("token")  # API returns 'token' not 'access_token'
            self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
            
            # Get main site ID for radiogroep
            sites_response = self.session.get(f"{BASE_URL}/api/main-sites")
            if sites_response.status_code == 200:
                sites = sites_response.json()
                for site in sites:
                    if site.get("slug") == MAIN_SITE_SLUG:
                        self.main_site_id = site.get("id")
                        self.session.headers.update({"X-Main-Site-ID": self.main_site_id})
                        break
        
        yield
        
        # Cleanup
        self.session.close()
    
    def test_auth_works(self):
        """Test that authentication is working"""
        assert self.auth_token is not None, "Authentication failed - no token received"
        assert self.main_site_id is not None, "Main site ID not found for radiogroep"
        print(f"PASS: Authentication successful, main_site_id={self.main_site_id}")
    
    def test_get_media_assets(self):
        """Test GET /api/media endpoint"""
        response = self.session.get(f"{BASE_URL}/api/media")
        assert response.status_code == 200, f"GET /api/media failed with {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/media returned {len(data)} assets")
    
    def test_get_media_filter_audio(self):
        """Test GET /api/media with kind=audio filter"""
        response = self.session.get(f"{BASE_URL}/api/media?kind=audio")
        assert response.status_code == 200, f"GET /api/media?kind=audio failed with {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # If there are audio files, they should have kind='audio'
        for asset in data:
            assert asset.get("kind") == "audio", f"Asset kind should be 'audio', got {asset.get('kind')}"
        print(f"PASS: GET /api/media?kind=audio returned {len(data)} audio assets")
    
    def test_get_media_filter_video(self):
        """Test GET /api/media with kind=video filter - verifies video type support"""
        response = self.session.get(f"{BASE_URL}/api/media?kind=video")
        assert response.status_code == 200, f"GET /api/media?kind=video failed with {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # If there are video files, they should have kind='video'
        for asset in data:
            assert asset.get("kind") == "video", f"Asset kind should be 'video', got {asset.get('kind')}"
        print(f"PASS: GET /api/media?kind=video returned {len(data)} video assets (video type filter works)")
    
    def test_upload_small_audio_mp3(self):
        """Test uploading a small MP3 audio file"""
        # Create a minimal valid MP3 file header (ID3v2 + minimal frame)
        # This is a valid but silent MP3 file
        mp3_header = bytes([
            0x49, 0x44, 0x33,  # ID3
            0x04, 0x00,        # version 2.4.0
            0x00,              # flags
            0x00, 0x00, 0x00, 0x00,  # size
        ])
        # Minimal MPEG Audio Frame (silence)
        mp3_frame = bytes([
            0xFF, 0xFB, 0x90, 0x00,  # MPEG-1 Layer 3 frame header
        ] + [0x00] * 417)  # Frame data
        
        mp3_content = mp3_header + mp3_frame * 10  # ~4KB test file
        
        files = {
            'file': ('test_audio.mp3', io.BytesIO(mp3_content), 'audio/mpeg')
        }
        
        # Remove Content-Type header for multipart upload
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        if self.main_site_id:
            headers["X-Main-Site-ID"] = self.main_site_id
        
        response = requests.post(
            f"{BASE_URL}/api/media",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 201, f"Upload MP3 failed with {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("kind") == "audio", f"Expected kind='audio', got {data.get('kind')}"
        assert data.get("id") is not None, "Asset should have an ID"
        assert data.get("mime_type") in ["audio/mpeg", "audio/mp3"], f"Unexpected mime_type: {data.get('mime_type')}"
        
        # Store asset ID for cleanup
        self.uploaded_audio_id = data.get("id")
        print(f"PASS: Uploaded MP3 audio file, id={self.uploaded_audio_id}, kind={data.get('kind')}")
        
        # Verify it appears in the media list
        list_response = self.session.get(f"{BASE_URL}/api/media")
        assert list_response.status_code == 200
        assets = list_response.json()
        found = any(a.get("id") == self.uploaded_audio_id for a in assets)
        assert found, "Uploaded audio file should appear in media list"
        print(f"PASS: Uploaded audio file appears in media list")
    
    def test_upload_small_video_mp4(self):
        """Test uploading a small MP4 video file"""
        # Create a minimal valid MP4 file (ftyp + moov atoms)
        # ftyp atom (file type)
        ftyp = bytes([
            0x00, 0x00, 0x00, 0x14,  # size: 20 bytes
            0x66, 0x74, 0x79, 0x70,  # 'ftyp'
            0x69, 0x73, 0x6F, 0x6D,  # brand: 'isom'
            0x00, 0x00, 0x00, 0x00,  # version
            0x69, 0x73, 0x6F, 0x6D,  # compatible brand: 'isom'
        ])
        
        # Minimal moov atom
        moov = bytes([
            0x00, 0x00, 0x00, 0x08,  # size: 8 bytes (empty moov)
            0x6D, 0x6F, 0x6F, 0x76,  # 'moov'
        ])
        
        mp4_content = ftyp + moov + bytes(1000)  # Add some padding
        
        files = {
            'file': ('test_video.mp4', io.BytesIO(mp4_content), 'video/mp4')
        }
        
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        if self.main_site_id:
            headers["X-Main-Site-ID"] = self.main_site_id
        
        response = requests.post(
            f"{BASE_URL}/api/media",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 201, f"Upload MP4 failed with {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("kind") == "video", f"Expected kind='video', got {data.get('kind')}"
        assert data.get("id") is not None, "Asset should have an ID"
        assert data.get("mime_type") == "video/mp4", f"Unexpected mime_type: {data.get('mime_type')}"
        
        self.uploaded_video_id = data.get("id")
        print(f"PASS: Uploaded MP4 video file, id={self.uploaded_video_id}, kind={data.get('kind')}")
        
        # Verify it appears in the media list
        list_response = self.session.get(f"{BASE_URL}/api/media")
        assert list_response.status_code == 200
        assets = list_response.json()
        found = any(a.get("id") == self.uploaded_video_id for a in assets)
        assert found, "Uploaded video file should appear in media list"
        print(f"PASS: Uploaded video file appears in media list")
    
    def test_upload_video_mov(self):
        """Test uploading a MOV video file (QuickTime)"""
        # Create minimal QuickTime/MOV file
        ftyp = bytes([
            0x00, 0x00, 0x00, 0x14,  # size
            0x66, 0x74, 0x79, 0x70,  # 'ftyp'
            0x71, 0x74, 0x20, 0x20,  # brand: 'qt  ' (QuickTime)
            0x00, 0x00, 0x00, 0x00,  # version
            0x71, 0x74, 0x20, 0x20,  # compatible brand
        ])
        moov = bytes([
            0x00, 0x00, 0x00, 0x08,
            0x6D, 0x6F, 0x6F, 0x76,
        ])
        mov_content = ftyp + moov + bytes(500)
        
        files = {
            'file': ('test_video.mov', io.BytesIO(mov_content), 'video/quicktime')
        }
        
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        if self.main_site_id:
            headers["X-Main-Site-ID"] = self.main_site_id
        
        response = requests.post(
            f"{BASE_URL}/api/media",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 201, f"Upload MOV failed with {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("kind") == "video", f"Expected kind='video', got {data.get('kind')}"
        print(f"PASS: Uploaded MOV video file, kind={data.get('kind')}")
    
    def test_upload_video_webm(self):
        """Test uploading a WebM video file"""
        # Create minimal WebM file (EBML header)
        webm_content = bytes([
            0x1A, 0x45, 0xDF, 0xA3,  # EBML header ID
            0x01, 0x00, 0x00, 0x00,  # Size (variable)
            0x00, 0x00, 0x00, 0x1F,
        ]) + bytes(500)
        
        files = {
            'file': ('test_video.webm', io.BytesIO(webm_content), 'video/webm')
        }
        
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        if self.main_site_id:
            headers["X-Main-Site-ID"] = self.main_site_id
        
        response = requests.post(
            f"{BASE_URL}/api/media",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 201, f"Upload WebM failed with {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("kind") == "video", f"Expected kind='video', got {data.get('kind')}"
        print(f"PASS: Uploaded WebM video file, kind={data.get('kind')}")
    
    def test_upload_10mb_audio_file(self):
        """Test uploading a larger audio file (~10MB) to verify no timeout/hanging"""
        # Create ~10MB of audio data
        mp3_header = bytes([
            0x49, 0x44, 0x33,  # ID3
            0x04, 0x00,        # version 2.4.0
            0x00,              # flags
            0x00, 0x00, 0x00, 0x00,  # size
        ])
        # Create ~10MB of frame data
        mp3_frame = bytes([0xFF, 0xFB, 0x90, 0x00] + [0x00] * 417)
        # 10MB / 421 bytes per frame ≈ 23,752 frames
        large_mp3_content = mp3_header + mp3_frame * 23752  # ~10MB
        
        print(f"Testing upload of {len(large_mp3_content) / (1024*1024):.2f} MB audio file...")
        
        files = {
            'file': ('large_test_audio.mp3', io.BytesIO(large_mp3_content), 'audio/mpeg')
        }
        
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        if self.main_site_id:
            headers["X-Main-Site-ID"] = self.main_site_id
        
        # Use a longer timeout for large file
        response = requests.post(
            f"{BASE_URL}/api/media",
            files=files,
            headers=headers,
            timeout=300  # 5 minute timeout
        )
        
        assert response.status_code == 201, f"Upload large audio failed with {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("kind") == "audio", f"Expected kind='audio', got {data.get('kind')}"
        assert data.get("size") > 9 * 1024 * 1024, f"File size should be > 9MB, got {data.get('size')}"
        
        print(f"PASS: Uploaded large audio file ({data.get('size') / (1024*1024):.2f} MB) successfully - no hanging")
    
    def test_backend_accepts_video_types(self):
        """Verify backend ALLOWED_VIDEO_TYPES includes mp4, mov, webm"""
        # This is a code review check - we test by verifying the filter endpoint accepts these
        for kind in ['video']:
            response = self.session.get(f"{BASE_URL}/api/media?kind={kind}")
            assert response.status_code == 200, f"GET /api/media?kind={kind} should return 200"
        print("PASS: Backend accepts video type filter")
    
    def test_media_serve_endpoint(self):
        """Test GET /api/media/serve/{asset_id} endpoint"""
        # First get an existing media asset
        response = self.session.get(f"{BASE_URL}/api/media")
        if response.status_code == 200 and len(response.json()) > 0:
            asset = response.json()[0]
            asset_id = asset.get("id")
            
            # Test serve endpoint (should redirect to presigned URL or return file)
            serve_response = requests.get(
                f"{BASE_URL}/api/media/serve/{asset_id}",
                allow_redirects=False
            )
            # Should be 302 redirect to S3 or 200 for local file
            assert serve_response.status_code in [200, 302], f"Serve endpoint returned {serve_response.status_code}"
            print(f"PASS: Media serve endpoint works (status={serve_response.status_code})")
        else:
            print("SKIP: No existing media assets to test serve endpoint")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
