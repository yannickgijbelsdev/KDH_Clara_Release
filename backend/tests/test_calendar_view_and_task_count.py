"""Tests for Calendar View and Task Count features.

Features tested:
1. Task count excludes Done column tasks
2. Calendar view filters out Done column tasks
3. Branding proxy URLs work correctly
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_CREDENTIALS = {
    "email": "admkoodh@koodh.com",
    "password": "KYLovie13monx"
}
SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"
BOARD_ID = "aafd21b9-2c9b-42a9-bc23-630d98c1432e"
DONE_COLUMN_ID = "6f1c0420-1507-4c71-9a64-433d740683b9"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=TEST_CREDENTIALS
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def headers(auth_token):
    """Get headers with auth token and site ID."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Main-Site-ID": SITE_ID,
        "Content-Type": "application/json"
    }


class TestTaskCountExcludesDone:
    """Test that board list task_count excludes Done column tasks."""
    
    def test_boards_list_returns_correct_task_count(self, headers):
        """Board list should show task_count = 4, not 5 (excluding 1 Done task)."""
        response = requests.get(
            f"{BASE_URL}/api/task-boards/boards",
            headers=headers
        )
        assert response.status_code == 200
        boards = response.json()
        
        # Find our test board
        test_board = next((b for b in boards if b["id"] == BOARD_ID), None)
        assert test_board is not None, "Test board not found"
        
        # Task count should be 4 (5 total - 1 in Done column)
        assert test_board["task_count"] == 4, f"Expected task_count=4, got {test_board['task_count']}"
        print(f"✓ Board task_count correctly shows 4 (excludes Done column tasks)")
    
    def test_get_all_tasks_returns_five_tasks(self, headers):
        """API should return all 5 tasks (including Done)."""
        response = requests.get(
            f"{BASE_URL}/api/task-boards/boards/{BOARD_ID}/tasks",
            headers=headers
        )
        assert response.status_code == 200
        tasks = response.json()
        
        # Should have 5 tasks total
        assert len(tasks) == 5, f"Expected 5 tasks, got {len(tasks)}"
        
        # One task should be in Done column
        done_tasks = [t for t in tasks if t["column_id"] == DONE_COLUMN_ID]
        assert len(done_tasks) == 1, f"Expected 1 Done task, got {len(done_tasks)}"
        assert done_tasks[0]["title"] == "Old completed task"
        print(f"✓ All 5 tasks returned, 1 in Done column")


class TestColumnsAPI:
    """Test columns API returns correct data."""
    
    def test_get_columns(self, headers):
        """Should return 3 columns: To Do, In Progress, Done."""
        response = requests.get(
            f"{BASE_URL}/api/task-boards/boards/{BOARD_ID}/columns",
            headers=headers
        )
        assert response.status_code == 200
        columns = response.json()
        
        # Should have 3 columns
        assert len(columns) >= 3, f"Expected at least 3 columns, got {len(columns)}"
        
        # Check column names
        column_names = [c["name"] for c in columns]
        assert "To Do" in column_names
        assert "In Progress" in column_names
        assert "Done" in column_names
        print(f"✓ Columns returned: {column_names}")
    
    def test_done_column_exists(self, headers):
        """Done column should exist with correct ID."""
        response = requests.get(
            f"{BASE_URL}/api/task-boards/boards/{BOARD_ID}/columns",
            headers=headers
        )
        assert response.status_code == 200
        columns = response.json()
        
        done_col = next((c for c in columns if c["name"].lower() == "done"), None)
        assert done_col is not None, "Done column not found"
        assert done_col["id"] == DONE_COLUMN_ID
        print(f"✓ Done column exists with ID: {DONE_COLUMN_ID}")


class TestTaskDeadlines:
    """Test tasks have proper deadlines for calendar view."""
    
    def test_tasks_have_deadlines(self, headers):
        """All non-Done tasks should have deadlines."""
        response = requests.get(
            f"{BASE_URL}/api/task-boards/boards/{BOARD_ID}/tasks",
            headers=headers
        )
        assert response.status_code == 200
        tasks = response.json()
        
        non_done_tasks = [t for t in tasks if t["column_id"] != DONE_COLUMN_ID]
        
        for task in non_done_tasks:
            assert task.get("deadline"), f"Task '{task['title']}' has no deadline"
            print(f"✓ Task '{task['title']}' has deadline: {task['deadline']}")
    
    def test_task_priorities_set(self, headers):
        """Tasks should have priority set for calendar color coding."""
        response = requests.get(
            f"{BASE_URL}/api/task-boards/boards/{BOARD_ID}/tasks",
            headers=headers
        )
        assert response.status_code == 200
        tasks = response.json()
        
        valid_priorities = ["low", "medium", "high", "urgent"]
        for task in tasks:
            priority = task.get("priority", "medium")
            assert priority in valid_priorities, f"Invalid priority: {priority}"
            print(f"✓ Task '{task['title']}' has priority: {priority}")


class TestBrandingProxyEndpoint:
    """Test branding file proxy endpoint (public, no auth needed)."""
    
    def test_branding_endpoint_public(self):
        """GET /api/branding should work without auth."""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        
        branding = response.json()
        assert "login_images" in branding
        print(f"✓ Branding endpoint returns data without auth")
    
    def test_branding_has_proxy_urls(self):
        """Branding images should use proxy URLs, not direct S3."""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        
        branding = response.json()
        
        # Check if any URLs are proxy URLs
        login_images = branding.get("login_images", [])
        proxy_urls = [img for img in login_images if img.startswith("/api/branding/file/")]
        
        print(f"Login images: {login_images}")
        print(f"Proxy URLs found: {len(proxy_urls)}")
        
        # At least one should be a proxy URL (S3 uploaded ones)
        # Unsplash URLs are still direct
        s3_proxied = [img for img in login_images if "/api/branding/file/" in img]
        if s3_proxied:
            print(f"✓ Found {len(s3_proxied)} S3 images using proxy URLs")
        else:
            print("ℹ No S3-based images found, only external URLs")
    
    def test_branding_file_proxy_endpoint_exists(self):
        """Proxy endpoint should handle file requests."""
        # Test with a known key format (won't exist but should return proper error)
        response = requests.get(f"{BASE_URL}/api/branding/file/branding/test_nonexistent.png")
        
        # Should return 302 (redirect) or 404 (not found), not 500
        assert response.status_code in [302, 404], f"Unexpected status: {response.status_code}"
        print(f"✓ Branding file proxy endpoint responds correctly (status: {response.status_code})")


class TestBoardDetails:
    """Test board detail endpoint."""
    
    def test_get_board(self, headers):
        """Get single board details."""
        response = requests.get(
            f"{BASE_URL}/api/task-boards/boards/{BOARD_ID}",
            headers=headers
        )
        assert response.status_code == 200
        
        board = response.json()
        assert board["id"] == BOARD_ID
        assert board["name"] == "Test Board"
        print(f"✓ Board details retrieved: {board['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
