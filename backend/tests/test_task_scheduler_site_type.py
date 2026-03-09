"""
Test Task Scheduler Site Type - Tests for creating and managing task_scheduler sites.
This is the 4th site type (alongside standard/radio, technical, server).
Task scheduler sites have task_boards as a core feature (always enabled) and team_settings/firewall/activity_logs as optional.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
# Existing task_scheduler site for testing
TASK_SCHEDULER_SITE_ID = "90f0d458-977d-4bb7-a1c1-4c490f36c380"
TASK_SCHEDULER_SITE_SLUG = "project-manager"


@pytest.fixture(scope="session")
def auth_token():
    """Get authentication token for admin user (network_admin)"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admkoodh@koodh.com",
        "password": "KYLovie13monx"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="session")
def headers(auth_token):
    """Common headers for API requests"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestTaskSchedulerSiteCreation:
    """Tests for creating main sites with site_type='task_scheduler'"""
    
    def test_create_task_scheduler_site(self, headers):
        """POST /api/main-sites - should create a task_scheduler site"""
        unique_slug = f"test-task-scheduler-{uuid.uuid4().hex[:8]}"
        payload = {
            "name": f"TEST Task Scheduler {unique_slug}",
            "slug": unique_slug,
            "site_type": "task_scheduler",
            "enabled_features": ["task_boards", "team_settings", "firewall", "activity_logs"]
        }
        
        response = requests.post(f"{BASE_URL}/api/main-sites", headers=headers, json=payload)
        assert response.status_code == 200 or response.status_code == 201, f"Failed to create site: {response.text}"
        data = response.json()
        
        # Verify site_type is task_scheduler
        assert data["site_type"] == "task_scheduler", f"Expected site_type 'task_scheduler', got {data['site_type']}"
        assert data["name"] == payload["name"]
        assert data["slug"] == unique_slug
        assert "task_boards" in data["enabled_features"]
        
        site_id = data["id"]
        print(f"Created task_scheduler site: {site_id}")
        
        # Cleanup - delete the site
        delete_response = requests.delete(f"{BASE_URL}/api/main-sites/{site_id}", headers=headers)
        assert delete_response.status_code in [200, 204], f"Failed to delete site: {delete_response.text}"
        print(f"Cleaned up test site: {site_id}")
    
    def test_create_task_scheduler_minimal(self, headers):
        """POST /api/main-sites - should create task_scheduler with only task_boards (core feature)"""
        unique_slug = f"test-ts-minimal-{uuid.uuid4().hex[:8]}"
        payload = {
            "name": f"TEST Minimal Task Scheduler",
            "slug": unique_slug,
            "site_type": "task_scheduler",
            "enabled_features": ["task_boards"]  # Only core feature
        }
        
        response = requests.post(f"{BASE_URL}/api/main-sites", headers=headers, json=payload)
        assert response.status_code in [200, 201], f"Failed: {response.text}"
        data = response.json()
        
        assert data["site_type"] == "task_scheduler"
        assert "task_boards" in data["enabled_features"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/main-sites/{data['id']}", headers=headers)
    
    def test_get_existing_task_scheduler_site(self, headers):
        """GET /api/main-sites/{id} - should return task_scheduler site details"""
        response = requests.get(f"{BASE_URL}/api/main-sites/{TASK_SCHEDULER_SITE_ID}", headers=headers)
        assert response.status_code == 200, f"Failed to get site: {response.text}"
        data = response.json()
        
        assert data["site_type"] == "task_scheduler", f"Expected site_type 'task_scheduler', got {data.get('site_type')}"
        assert data["id"] == TASK_SCHEDULER_SITE_ID
        assert "task_boards" in data.get("enabled_features", [])
        print(f"Verified existing task_scheduler site: {data['name']} (slug: {data['slug']})")


class TestTaskBoardsOnTaskSchedulerSite:
    """Tests for task boards CRUD operations on a task_scheduler site"""
    
    @pytest.fixture
    def task_scheduler_headers(self, headers):
        """Headers with X-Main-Site-ID set to task_scheduler site"""
        return {
            **headers,
            "X-Main-Site-ID": TASK_SCHEDULER_SITE_ID
        }
    
    def test_list_boards_on_task_scheduler(self, task_scheduler_headers):
        """GET /api/task-boards/boards - should list boards for task_scheduler site"""
        response = requests.get(f"{BASE_URL}/api/task-boards/boards", headers=task_scheduler_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} boards on task_scheduler site")
    
    def test_create_board_on_task_scheduler(self, task_scheduler_headers):
        """POST /api/task-boards/boards - should create board on task_scheduler site"""
        payload = {
            "name": f"TEST_Board_TaskScheduler_{uuid.uuid4().hex[:6]}",
            "description": "Test board on task_scheduler site",
            "color": "#8b5cf6"  # Violet to match task_scheduler theme
        }
        
        response = requests.post(f"{BASE_URL}/api/task-boards/boards", headers=task_scheduler_headers, json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["name"] == payload["name"]
        assert data["main_site_id"] == TASK_SCHEDULER_SITE_ID
        
        board_id = data["id"]
        
        # Verify default columns were created
        cols_response = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=task_scheduler_headers)
        assert cols_response.status_code == 200
        columns = cols_response.json()
        assert len(columns) == 4, "Should have 4 default columns"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=task_scheduler_headers)
    
    def test_create_task_on_task_scheduler(self, task_scheduler_headers):
        """Create board, column, and task on task_scheduler site"""
        # Create board
        board_res = requests.post(f"{BASE_URL}/api/task-boards/boards", headers=task_scheduler_headers, json={
            "name": f"TEST_TaskBoard_{uuid.uuid4().hex[:6]}"
        })
        assert board_res.status_code == 200
        board_id = board_res.json()["id"]
        
        # Get first column
        cols_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=task_scheduler_headers)
        col_id = cols_res.json()[0]["id"]
        
        # Create task
        task_payload = {
            "title": f"TEST_Task_TS_{uuid.uuid4().hex[:6]}",
            "description": "Task created on task_scheduler site",
            "column_id": col_id,
            "priority": "high",
            "labels": ["testing", "task_scheduler"]
        }
        
        task_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=task_scheduler_headers, json=task_payload)
        assert task_res.status_code == 200
        task = task_res.json()
        
        assert task["title"] == task_payload["title"]
        assert task["priority"] == "high"
        assert task["main_site_id"] == TASK_SCHEDULER_SITE_ID
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=task_scheduler_headers)


class TestMainSitesListWithTaskScheduler:
    """Tests to verify task_scheduler sites appear correctly in main sites list"""
    
    def test_list_main_sites_includes_task_scheduler(self, headers):
        """GET /api/main-sites - should include task_scheduler sites with correct site_type"""
        response = requests.get(f"{BASE_URL}/api/main-sites", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Find task_scheduler sites
        ts_sites = [s for s in data if s.get("site_type") == "task_scheduler"]
        print(f"Found {len(ts_sites)} task_scheduler sites out of {len(data)} total")
        
        # Verify our known task_scheduler site is in the list
        known_site = next((s for s in data if s["id"] == TASK_SCHEDULER_SITE_ID), None)
        assert known_site is not None, f"Task scheduler site {TASK_SCHEDULER_SITE_ID} not found in list"
        assert known_site["site_type"] == "task_scheduler"
    
    def test_user_access_includes_task_scheduler(self, headers):
        """GET /api/main-sites/my/access - should include task_scheduler sites in user's access list"""
        response = requests.get(f"{BASE_URL}/api/main-sites/my/access", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        main_sites = data.get("main_sites", [])
        ts_sites = [s for s in main_sites if s.get("site_type") == "task_scheduler"]
        print(f"User has access to {len(ts_sites)} task_scheduler sites")


class TestSiteTypeValidation:
    """Tests to validate site_type values"""
    
    def test_valid_site_types(self, headers):
        """Verify all valid site_type values work"""
        valid_types = ["radio", "technical", "server", "task_scheduler"]
        
        for site_type in valid_types:
            # Replace underscore with hyphen for valid slug
            slug_type = site_type.replace("_", "-")
            unique_slug = f"test-{slug_type}-{uuid.uuid4().hex[:6]}"
            features = []
            
            if site_type == "technical":
                features = ["zerotier", "team_settings"]
            elif site_type == "server":
                features = ["xml_imports", "team_settings"]
            elif site_type == "task_scheduler":
                features = ["task_boards", "team_settings"]
            else:  # radio/standard
                features = ["shows", "calendar"]
            
            payload = {
                "name": f"TEST {site_type} site",
                "slug": unique_slug,
                "site_type": site_type,
                "enabled_features": features
            }
            
            response = requests.post(f"{BASE_URL}/api/main-sites", headers=headers, json=payload)
            # Site creation should succeed
            assert response.status_code in [200, 201], f"Failed to create {site_type} site: {response.text}"
            
            data = response.json()
            assert data["site_type"] == site_type
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/main-sites/{data['id']}", headers=headers)
            print(f"Validated site_type: {site_type}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
