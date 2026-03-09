"""
Test Task Boards feature - Kanban board system with CRUD for boards, columns, tasks, comments, and attachments.
Requires 'task_boards' feature enabled on the main site.
"""
import pytest
import requests
import os
import io
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MAIN_SITE_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"  # dbntstudio with task_boards enabled


@pytest.fixture(scope="session")
def auth_token():
    """Get authentication token for admin user"""
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
        "X-Main-Site-ID": MAIN_SITE_ID,
        "Content-Type": "application/json"
    }


class TestBoardsCRUD:
    """Tests for Board CRUD operations"""
    
    def test_list_boards(self, headers):
        """GET /api/task-boards/boards - should return list of boards"""
        response = requests.get(f"{BASE_URL}/api/task-boards/boards", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} boards")
    
    def test_create_board(self, headers):
        """POST /api/task-boards/boards - should create a new board with default columns"""
        payload = {
            "name": f"TEST_Board_{uuid.uuid4().hex[:6]}",
            "description": "Test board created by pytest",
            "color": "#ef4444"
        }
        response = requests.post(f"{BASE_URL}/api/task-boards/boards", headers=headers, json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify board fields
        assert "id" in data
        assert data["name"] == payload["name"]
        assert data["description"] == payload["description"]
        assert data["color"] == payload["color"]
        assert data["task_count"] == 0
        assert "created_at" in data
        assert "slug" in data
        
        board_id = data["id"]
        print(f"Created board: {board_id}")
        
        # Verify default columns were created (4 columns: To Do, In Progress, Review, Done)
        cols_response = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers)
        assert cols_response.status_code == 200
        columns = cols_response.json()
        assert len(columns) == 4, f"Expected 4 default columns, got {len(columns)}"
        column_names = [c["name"] for c in columns]
        assert "To Do" in column_names
        assert "In Progress" in column_names
        assert "Review" in column_names
        assert "Done" in column_names
        print(f"Verified 4 default columns created")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers)
    
    def test_get_board(self, headers):
        """GET /api/task-boards/boards/{board_id} - should return board details"""
        # Use existing test board
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        response = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == board_id
        assert "name" in data
        assert "description" in data
        assert "color" in data
    
    def test_get_nonexistent_board(self, headers):
        """GET /api/task-boards/boards/{board_id} - should return 404 for nonexistent board"""
        response = requests.get(f"{BASE_URL}/api/task-boards/boards/nonexistent-id", headers=headers)
        assert response.status_code == 404
    
    def test_update_board(self, headers):
        """PUT /api/task-boards/boards/{board_id} - should update board"""
        # Create a board first
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards", headers=headers, json={
            "name": f"TEST_UpdateBoard_{uuid.uuid4().hex[:6]}",
            "description": "To be updated"
        })
        board_id = create_res.json()["id"]
        
        # Update the board
        update_payload = {"name": "Updated Name", "description": "Updated description"}
        response = requests.put(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers, json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"
        
        # Verify via GET
        get_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers)
        assert get_res.json()["name"] == "Updated Name"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers)
    
    def test_delete_board(self, headers):
        """DELETE /api/task-boards/boards/{board_id} - should delete board and associated data"""
        # Create a board
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards", headers=headers, json={
            "name": f"TEST_DeleteBoard_{uuid.uuid4().hex[:6]}"
        })
        board_id = create_res.json()["id"]
        
        # Delete the board
        response = requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
        
        # Verify deletion
        get_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers)
        assert get_res.status_code == 404


class TestColumnsCRUD:
    """Tests for Column CRUD operations"""
    
    def test_list_columns(self, headers):
        """GET /api/task-boards/boards/{board_id}/columns - should return columns in order"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        response = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers)
        assert response.status_code == 200
        columns = response.json()
        assert isinstance(columns, list)
        assert len(columns) >= 4  # Default columns
        
        # Verify columns are ordered
        orders = [c["order"] for c in columns]
        assert orders == sorted(orders), "Columns should be sorted by order"
    
    def test_create_column(self, headers):
        """POST /api/task-boards/boards/{board_id}/columns - should create column"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        payload = {"name": f"TEST_Column_{uuid.uuid4().hex[:6]}", "color": "#8b5cf6"}
        
        response = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers, json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["name"] == payload["name"]
        assert data["color"] == payload["color"]
        assert data["board_id"] == board_id
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns/{data['id']}", headers=headers)
    
    def test_update_column(self, headers):
        """PUT /api/task-boards/boards/{board_id}/columns/{column_id} - should update column"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        # Create a column
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers, json={
            "name": f"TEST_UpdateCol_{uuid.uuid4().hex[:6]}"
        })
        col_id = create_res.json()["id"]
        
        # Update the column
        response = requests.put(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns/{col_id}", headers=headers, json={
            "name": "Renamed Column",
            "color": "#ec4899"
        })
        assert response.status_code == 200
        assert response.json()["name"] == "Renamed Column"
        assert response.json()["color"] == "#ec4899"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns/{col_id}", headers=headers)
    
    def test_delete_column(self, headers):
        """DELETE /api/task-boards/boards/{board_id}/columns/{column_id} - should delete column"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        # Create a column
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers, json={
            "name": f"TEST_DeleteCol_{uuid.uuid4().hex[:6]}"
        })
        col_id = create_res.json()["id"]
        
        # Delete the column
        response = requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns/{col_id}", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
    
    def test_reorder_columns(self, headers):
        """PUT /api/task-boards/boards/{board_id}/columns/reorder - should reorder columns"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        # Get current columns
        cols_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers)
        columns = cols_res.json()
        col_ids = [c["id"] for c in columns]
        
        # Reverse the order
        reversed_ids = col_ids[::-1]
        
        response = requests.put(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns/reorder", headers=headers, json={
            "column_ids": reversed_ids
        })
        assert response.status_code == 200
        assert response.json()["status"] == "reordered"
        
        # Restore original order
        requests.put(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns/reorder", headers=headers, json={
            "column_ids": col_ids
        })


class TestTasksCRUD:
    """Tests for Task CRUD operations"""
    
    @pytest.fixture
    def test_column_id(self, headers):
        """Get the first column ID for the test board"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        response = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers)
        columns = response.json()
        return columns[0]["id"]  # To Do column
    
    def test_list_tasks(self, headers):
        """GET /api/task-boards/boards/{board_id}/tasks - should return tasks"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        response = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        assert isinstance(tasks, list)
    
    def test_create_task(self, headers, test_column_id):
        """POST /api/task-boards/boards/{board_id}/tasks - should create task"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        payload = {
            "title": f"TEST_Task_{uuid.uuid4().hex[:6]}",
            "description": "A test task",
            "column_id": test_column_id,
            "priority": "high",
            "deadline": "2026-12-31",
            "labels": ["feature", "test"],
            "checklist": [
                {"id": "1", "text": "Step 1", "done": False},
                {"id": "2", "text": "Step 2", "done": True}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers, json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert data["title"] == payload["title"]
        assert data["description"] == payload["description"]
        assert data["priority"] == "high"
        assert data["deadline"] == "2026-12-31"
        assert data["labels"] == ["feature", "test"]
        assert len(data["checklist"]) == 2
        assert data["attachments"] == []
        assert data["comments"] == []
        assert "created_by_name" in data
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{data['id']}", headers=headers)
    
    def test_update_task(self, headers, test_column_id):
        """PUT /api/task-boards/boards/{board_id}/tasks/{task_id} - should update task"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        # Create a task
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers, json={
            "title": f"TEST_UpdateTask_{uuid.uuid4().hex[:6]}",
            "column_id": test_column_id
        })
        task_id = create_res.json()["id"]
        
        # Update the task
        response = requests.put(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}", headers=headers, json={
            "title": "Updated Title",
            "description": "Updated description",
            "priority": "urgent"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["description"] == "Updated description"
        assert data["priority"] == "urgent"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}", headers=headers)
    
    def test_delete_task(self, headers, test_column_id):
        """DELETE /api/task-boards/boards/{board_id}/tasks/{task_id} - should delete task"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        # Create a task
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers, json={
            "title": f"TEST_DeleteTask_{uuid.uuid4().hex[:6]}",
            "column_id": test_column_id
        })
        task_id = create_res.json()["id"]
        
        # Delete the task
        response = requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
    
    def test_move_task(self, headers):
        """PUT /api/task-boards/boards/{board_id}/tasks/{task_id}/move - should move task between columns"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        # Get columns
        cols_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers)
        columns = cols_res.json()
        col_todo = columns[0]["id"]
        col_in_progress = columns[1]["id"]
        
        # Create a task in To Do
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers, json={
            "title": f"TEST_MoveTask_{uuid.uuid4().hex[:6]}",
            "column_id": col_todo
        })
        task_id = create_res.json()["id"]
        
        # Move to In Progress
        response = requests.put(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}/move", headers=headers, json={
            "column_id": col_in_progress,
            "order": 0
        })
        assert response.status_code == 200
        data = response.json()
        assert data["column_id"] == col_in_progress
        assert data["order"] == 0
        
        # Verify via GET tasks
        tasks_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers)
        task = next((t for t in tasks_res.json() if t["id"] == task_id), None)
        assert task is not None
        assert task["column_id"] == col_in_progress
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}", headers=headers)


class TestComments:
    """Tests for Task Comments"""
    
    @pytest.fixture
    def test_task(self, headers):
        """Create a test task and return its ID, cleanup after test"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        cols_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers)
        col_id = cols_res.json()[0]["id"]
        
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers, json={
            "title": f"TEST_CommentTask_{uuid.uuid4().hex[:6]}",
            "column_id": col_id
        })
        task_id = create_res.json()["id"]
        
        yield task_id
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}", headers=headers)
    
    def test_add_comment(self, headers, test_task):
        """POST /api/task-boards/boards/{board_id}/tasks/{task_id}/comments - should add comment"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        response = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{test_task}/comments", headers=headers, json={
            "text": "This is a test comment"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["comments"]) >= 1
        comment = data["comments"][-1]  # Last comment
        assert comment["text"] == "This is a test comment"
        assert "author_id" in comment
        assert "author_name" in comment
        assert "created_at" in comment
        assert "id" in comment
    
    def test_delete_comment(self, headers, test_task):
        """DELETE /api/task-boards/boards/{board_id}/tasks/{task_id}/comments/{comment_id} - should delete comment"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        # Add a comment first
        add_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{test_task}/comments", headers=headers, json={
            "text": "Comment to delete"
        })
        comment_id = add_res.json()["comments"][-1]["id"]
        
        # Delete the comment
        response = requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{test_task}/comments/{comment_id}", headers=headers)
        assert response.status_code == 200
        
        # Verify comment is removed
        comments = response.json()["comments"]
        assert all(c["id"] != comment_id for c in comments)


class TestAttachments:
    """Tests for Task Attachments"""
    
    @pytest.fixture
    def test_task(self, headers):
        """Create a test task and return its ID, cleanup after test"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        cols_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers)
        col_id = cols_res.json()[0]["id"]
        
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers, json={
            "title": f"TEST_AttachTask_{uuid.uuid4().hex[:6]}",
            "column_id": col_id
        })
        task_id = create_res.json()["id"]
        
        yield task_id
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}", headers=headers)
    
    def test_upload_attachment(self, headers, test_task):
        """POST /api/task-boards/boards/{board_id}/tasks/{task_id}/attachments - should upload file"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        # Create a simple text file
        file_content = b"This is a test file content"
        files = {
            'file': ('test_file.txt', io.BytesIO(file_content), 'text/plain')
        }
        
        # Remove Content-Type header for multipart
        upload_headers = {k: v for k, v in headers.items() if k != 'Content-Type'}
        
        response = requests.post(
            f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{test_task}/attachments",
            headers=upload_headers,
            files=files
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["attachments"]) >= 1
        attachment = data["attachments"][-1]
        assert attachment["name"] == "test_file.txt"
        assert "url" in attachment
        assert "size" in attachment
        assert "id" in attachment
    
    def test_delete_attachment(self, headers, test_task):
        """DELETE /api/task-boards/boards/{board_id}/tasks/{task_id}/attachments/{attachment_id} - should delete attachment"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        
        # Upload a file first
        file_content = b"File to delete"
        files = {'file': ('delete_me.txt', io.BytesIO(file_content), 'text/plain')}
        upload_headers = {k: v for k, v in headers.items() if k != 'Content-Type'}
        
        upload_res = requests.post(
            f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{test_task}/attachments",
            headers=upload_headers,
            files=files
        )
        attachment_id = upload_res.json()["attachments"][-1]["id"]
        
        # Delete the attachment
        response = requests.delete(
            f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{test_task}/attachments/{attachment_id}",
            headers=headers
        )
        assert response.status_code == 200
        
        # Verify attachment is removed
        attachments = response.json()["attachments"]
        assert all(a["id"] != attachment_id for a in attachments)


class TestAuthorizationAndValidation:
    """Tests for authorization and input validation"""
    
    def test_missing_auth_header(self):
        """Should return 401 or 403 without Authorization header"""
        response = requests.get(f"{BASE_URL}/api/task-boards/boards", headers={
            "X-Main-Site-ID": MAIN_SITE_ID
        })
        assert response.status_code in [401, 403]  # Either is acceptable
    
    def test_missing_main_site_header(self, headers):
        """Should handle missing X-Main-Site-ID header (may return empty list or error)"""
        no_site_headers = {k: v for k, v in headers.items() if k != 'X-Main-Site-ID'}
        response = requests.get(f"{BASE_URL}/api/task-boards/boards", headers=no_site_headers)
        # Without main_site_id, returns empty list (no boards for null site) or error
        assert response.status_code in [200, 400, 422, 500]
    
    def test_create_board_without_name(self, headers):
        """Should return 422 for missing required field"""
        response = requests.post(f"{BASE_URL}/api/task-boards/boards", headers=headers, json={
            "description": "No name provided"
        })
        assert response.status_code == 422  # Validation error
    
    def test_create_task_without_column_id(self, headers):
        """Should return 422 for missing column_id"""
        board_id = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"
        response = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers, json={
            "title": "Task without column"
        })
        assert response.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
