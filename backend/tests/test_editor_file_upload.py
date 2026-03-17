"""
Tests for TinyMCE Editor File Upload (POST /api/uploads/editor-files)
Tests audio, video, and image uploads via the editor endpoint.
Bug fix: Audio upload was showing no status and kept loading. 
Fix includes: 100MB limit for audio/video, improved error handling.
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')


class TestEditorFileUpload:
    """Tests for /api/uploads/editor-files endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admkoodh@koodh.com", "password": "KYLovie13monx"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_upload_audio_mp3_returns_url(self):
        """Test uploading an MP3 audio file returns a URL in response"""
        # Create a small MP3 file (ID3 header + minimal data)
        mp3_content = b'ID3' + b'\x04\x00\x00\x00\x00\x00\x00' + b'\xff\xfb\x90\x00' * 100
        
        files = {
            'file': ('test_audio.mp3', io.BytesIO(mp3_content), 'audio/mpeg')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        # Verify response contains url field
        assert "url" in data, "Response missing 'url' field"
        assert data["url"].startswith("http"), f"URL not valid: {data['url']}"
        assert "filename" in data, "Response missing 'filename' field"
        assert "size" in data, "Response missing 'size' field"
        print(f"✓ Audio MP3 upload success: URL={data['url'][:80]}...")
    
    def test_upload_audio_wav_returns_url(self):
        """Test uploading a WAV audio file returns a URL"""
        # Create minimal WAV file header
        wav_content = b'RIFF' + b'\x24\x00\x00\x00' + b'WAVEfmt ' + b'\x10\x00\x00\x00'
        wav_content += b'\x01\x00\x01\x00\x44\xAC\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00'
        wav_content += b'data' + b'\x00\x00\x00\x00'
        
        files = {
            'file': ('test_audio.wav', io.BytesIO(wav_content), 'audio/wav')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 200, f"WAV upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response missing 'url' field"
        print(f"✓ Audio WAV upload success: URL={data['url'][:80]}...")
    
    def test_upload_audio_m4a_returns_url(self):
        """Test uploading an M4A audio file returns a URL"""
        # Create minimal M4A/MP4 container (ftyp atom)
        m4a_content = b'\x00\x00\x00\x14ftypM4A ' + b'\x00\x00\x00\x00' + b'M4A mp42'
        m4a_content += b'\x00\x00\x00\x08mdat' + b'\x00' * 100
        
        files = {
            'file': ('test_audio.m4a', io.BytesIO(m4a_content), 'audio/x-m4a')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 200, f"M4A upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response missing 'url' field"
        print(f"✓ Audio M4A upload success: URL={data['url'][:80]}...")
    
    def test_upload_video_mp4_returns_url(self):
        """Test uploading an MP4 video file returns a URL"""
        # Create minimal MP4 file (ftyp + mdat atoms)
        mp4_content = b'\x00\x00\x00\x14ftypisom' + b'\x00\x00\x00\x00' + b'isomavc1'
        mp4_content += b'\x00\x00\x00\x10mdat' + b'\x00' * 200
        
        files = {
            'file': ('test_video.mp4', io.BytesIO(mp4_content), 'video/mp4')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 200, f"MP4 upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response missing 'url' field"
        print(f"✓ Video MP4 upload success: URL={data['url'][:80]}...")
    
    def test_upload_video_webm_returns_url(self):
        """Test uploading a WebM video file returns a URL"""
        # Create minimal WebM file header
        webm_content = b'\x1a\x45\xdf\xa3' + b'\x9f' + b'\x00' * 100  # EBML header
        
        files = {
            'file': ('test_video.webm', io.BytesIO(webm_content), 'video/webm')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 200, f"WebM upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response missing 'url' field"
        print(f"✓ Video WebM upload success: URL={data['url'][:80]}...")
    
    def test_upload_image_jpeg_returns_url(self):
        """Test uploading a JPEG image file returns a URL"""
        # Create minimal JPEG file
        jpeg_content = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        jpeg_content += b'\xff\xdb\x00C\x00' + b'\x08' * 64  # Quantization table
        jpeg_content += b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00'
        jpeg_content += b'\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
        jpeg_content += b'\xff\xd9'
        
        files = {
            'file': ('test_image.jpg', io.BytesIO(jpeg_content), 'image/jpeg')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 200, f"JPEG upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response missing 'url' field"
        print(f"✓ Image JPEG upload success: URL={data['url'][:80]}...")
    
    def test_upload_image_png_returns_url(self):
        """Test uploading a PNG image file returns a URL"""
        # Create minimal PNG file
        png_content = b'\x89PNG\r\n\x1a\n'  # PNG signature
        png_content += b'\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
        png_content += b'\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N'
        png_content += b'\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {
            'file': ('test_image.png', io.BytesIO(png_content), 'image/png')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 200, f"PNG upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response missing 'url' field"
        print(f"✓ Image PNG upload success: URL={data['url'][:80]}...")
    
    def test_reject_unsupported_file_type(self):
        """Test that unsupported file types are rejected with 400 error"""
        # Create a fake executable file
        exe_content = b'MZ' + b'\x00' * 100
        
        files = {
            'file': ('malware.exe', io.BytesIO(exe_content), 'application/x-msdownload')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 400, f"Expected 400 for unsupported type, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Error response missing 'detail' field"
        print(f"✓ Unsupported file type correctly rejected: {data['detail'][:60]}...")
    
    def test_large_audio_file_allowed_up_to_100mb(self):
        """Test that audio files up to 100MB are allowed (bug fix verification)"""
        # Create a 15MB MP3 file to test the increased limit
        mp3_header = b'ID3' + b'\x04\x00\x00\x00\x00\x00\x00' + b'\xff\xfb\x90\x00'
        large_mp3 = mp3_header + (b'\x00' * (15 * 1024 * 1024))  # 15MB
        
        files = {
            'file': ('large_audio.mp3', io.BytesIO(large_mp3), 'audio/mpeg')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=300  # 5 minutes for large file
        )
        
        assert response.status_code == 200, f"Large audio upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response missing 'url' field"
        assert data["size"] > 10 * 1024 * 1024, f"File size too small: {data['size']}"
        print(f"✓ Large audio (15MB) upload success: size={data['size']} bytes")
    
    def test_large_video_file_allowed_up_to_100mb(self):
        """Test that video files up to 100MB are allowed"""
        # Create a 20MB MP4 file to test the increased limit
        mp4_header = b'\x00\x00\x00\x14ftypisom' + b'\x00\x00\x00\x00' + b'isomavc1'
        large_mp4 = mp4_header + (b'\x00' * (20 * 1024 * 1024))  # 20MB
        
        files = {
            'file': ('large_video.mp4', io.BytesIO(large_mp4), 'video/mp4')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=300  # 5 minutes for large file
        )
        
        assert response.status_code == 200, f"Large video upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response missing 'url' field"
        print(f"✓ Large video (20MB) upload success: size={data['size']} bytes")
    
    def test_image_size_limit_is_10mb(self):
        """Test that images over 10MB are rejected"""
        # Create an 11MB JPEG file (should be rejected)
        jpeg_header = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        large_jpeg = jpeg_header + (b'\x00' * (11 * 1024 * 1024))  # 11MB
        
        files = {
            'file': ('huge_image.jpg', io.BytesIO(large_jpeg), 'image/jpeg')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 400, f"Expected 400 for oversized image, got {response.status_code}"
        data = response.json()
        assert "too large" in data.get("detail", "").lower() or "maximum" in data.get("detail", "").lower()
        print(f"✓ Oversized image correctly rejected: {data['detail']}")
    
    def test_upload_without_auth_fails(self):
        """Test that upload without authentication fails"""
        mp3_content = b'ID3' + b'\x04\x00\x00\x00\x00\x00\x00' + b'\xff\xfb\x90\x00' * 10
        
        files = {
            'file': ('test.mp3', io.BytesIO(mp3_content), 'audio/mpeg')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/editor-files",
            files=files,
            timeout=60
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Unauthenticated upload correctly rejected: {response.status_code}")


class TestMediaLibraryUpload:
    """Tests for /api/media endpoint (Media Library upload)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admkoodh@koodh.com", "password": "KYLovie13monx"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_media_library_upload_audio_returns_s3_url(self):
        """Test Media Library audio upload returns asset with s3_url"""
        mp3_content = b'ID3' + b'\x04\x00\x00\x00\x00\x00\x00' + b'\xff\xfb\x90\x00' * 200
        
        files = {
            'file': ('media_test_audio.mp3', io.BytesIO(mp3_content), 'audio/mpeg')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/media",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 201, f"Media upload failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data, "Response missing 'id' field"
        assert "s3_url" in data, "Response missing 's3_url' field"
        assert data["kind"] == "audio", f"Expected kind='audio', got '{data.get('kind')}'"
        assert data.get("s3_url") is not None or data.get("file_storage_key") is not None
        print(f"✓ Media Library audio upload success: id={data['id']}, kind={data['kind']}")
        
        # Cleanup - delete the test asset
        delete_response = requests.delete(
            f"{BASE_URL}/api/media/{data['id']}",
            headers=self.headers
        )
        if delete_response.status_code == 204:
            print(f"  ✓ Cleanup: deleted test asset {data['id']}")
    
    def test_media_library_upload_video_returns_s3_url(self):
        """Test Media Library video upload returns asset with s3_url"""
        mp4_content = b'\x00\x00\x00\x14ftypisom' + b'\x00\x00\x00\x00' + b'isomavc1'
        mp4_content += b'\x00\x00\x00\x10mdat' + b'\x00' * 300
        
        files = {
            'file': ('media_test_video.mp4', io.BytesIO(mp4_content), 'video/mp4')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/media",
            headers=self.headers,
            files=files,
            timeout=120
        )
        
        assert response.status_code == 201, f"Media upload failed: {response.text}"
        data = response.json()
        
        assert "id" in data, "Response missing 'id' field"
        assert data["kind"] == "video", f"Expected kind='video', got '{data.get('kind')}'"
        print(f"✓ Media Library video upload success: id={data['id']}, kind={data['kind']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/media/{data['id']}", headers=self.headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
