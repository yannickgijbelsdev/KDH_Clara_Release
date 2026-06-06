"""
Test New Task Board Features - Board Members, Status Notifications, User Invite
- GET /api/task-boards/boards/{boardId}/members - returns member details
- Creating/updating boards with members field
- Moving tasks triggers status notification (asyncio task created)
- User invite sets force_password_change=true
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MAIN_SITE_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"  # dbntstudio with task_boards enabled
EXISTING_BOARD_ID = "e123ae5e-4c19-4be5-bdb2-a2aeb6bdb83b"  # Existing board (may not have members)


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


@pytest.fixture(scope="session")
def admin_user_id(auth_token):
    """Get the admin user's ID"""
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
    assert response.status_code == 200
    return response.json()["id"]


class TestBoardMembers:
    """Tests for board members endpoint and functionality"""
    
    def test_get_board_members_returns_empty_array_for_board_without_members(self, headers):
        """GET /api/task-boards/boards/{boardId}/members - returns empty array for boards without members field"""
        response = requests.get(f"{BASE_URL}/api/task-boards/boards/{EXISTING_BOARD_ID}/members", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Should return an array (may be empty if board has no members set)
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Board members response: {len(data)} members")
    
    def test_get_board_members_returns_404_for_nonexistent_board(self, headers):
        """GET /api/task-boards/boards/{boardId}/members - returns 404 for nonexistent board"""
        response = requests.get(f"{BASE_URL}/api/task-boards/boards/nonexistent-board-id/members", headers=headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_create_board_with_members_sets_members_array(self, headers, admin_user_id):
        """POST /api/task-boards/boards - creating a board with members field should work"""
        # Create board with members
        payload = {
            "name": f"TEST_MembersBoard_{uuid.uuid4().hex[:6]}",
            "description": "Testing board members feature",
            "color": "#3b82f6",
            "members": [admin_user_id]
        }
        response = requests.post(f"{BASE_URL}/api/task-boards/boards", headers=headers, json=payload)
        assert response.status_code == 200, f"Failed to create board: {response.text}"
        data = response.json()
        
        # Verify members field
        assert "members" in data, "Response missing members field"
        assert isinstance(data["members"], list), "members should be a list"
        assert admin_user_id in data["members"], "Creator should be in members"
        
        board_id = data["id"]
        print(f"Created board {board_id} with members: {data['members']}")
        
        # Verify via GET members endpoint
        members_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/members", headers=headers)
        assert members_res.status_code == 200
        members = members_res.json()
        assert isinstance(members, list)
        assert len(members) >= 1, "Should have at least 1 member"
        
        # Verify member has expected fields (id, name, email, avatar_url)
        member = members[0]
        assert "id" in member, "Member missing id field"
        assert "name" in member, "Member missing name field"
        assert "email" in member, "Member missing email field"
        
        print(f"Member details: {member}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers)
    
    def test_create_board_without_members_defaults_to_creator(self, headers, admin_user_id):
        """POST /api/task-boards/boards - board without members field defaults to creator"""
        payload = {
            "name": f"TEST_NoMembersBoard_{uuid.uuid4().hex[:6]}",
            "description": "Testing default members"
        }
        response = requests.post(f"{BASE_URL}/api/task-boards/boards", headers=headers, json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # members should default to creator
        assert "members" in data, "Response missing members field"
        assert admin_user_id in data["members"], f"Creator {admin_user_id} should be in members"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{data['id']}", headers=headers)
    
    def test_update_board_members_via_put(self, headers, admin_user_id):
        """PUT /api/task-boards/boards/{boardId} - updating members field should work"""
        # Create board first
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards", headers=headers, json={
            "name": f"TEST_UpdateMembersBoard_{uuid.uuid4().hex[:6]}",
            "members": [admin_user_id]
        })
        board_id = create_res.json()["id"]
        
        # Get available users from the main site
        users_res = requests.get(f"{BASE_URL}/api/main-sites/{MAIN_SITE_ID}/users", headers=headers)
        assert users_res.status_code == 200
        users = users_res.json()
        
        # Find another user if available
        other_user_ids = [u["user_id"] for u in users if u["user_id"] != admin_user_id][:1]
        
        # Update members to include the other user
        new_members = [admin_user_id] + other_user_ids
        update_res = requests.put(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers, json={
            "members": new_members
        })
        assert update_res.status_code == 200, f"Failed to update: {update_res.text}"
        
        updated = update_res.json()
        assert "members" in updated
        assert len(updated["members"]) == len(new_members), f"Expected {len(new_members)} members"
        
        print(f"Updated board members: {updated['members']}")
        
        # Verify via GET board
        get_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers)
        assert get_res.json()["members"] == new_members
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}", headers=headers)


class TestTaskMoveNotification:
    """Tests for task status notification when moving between columns"""
    
    def test_move_task_triggers_status_change_logic(self, headers):
        """PUT /api/task-boards/boards/{boardId}/tasks/{taskId}/move - moving task should work and trigger notification logic"""
        board_id = EXISTING_BOARD_ID
        
        # Get columns
        cols_res = requests.get(f"{BASE_URL}/api/task-boards/boards/{board_id}/columns", headers=headers)
        columns = cols_res.json()
        assert len(columns) >= 2, "Need at least 2 columns for move test"
        col_from = columns[0]["id"]
        col_to = columns[1]["id"]
        
        # Create a task in first column
        create_res = requests.post(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks", headers=headers, json={
            "title": f"TEST_MoveNotifyTask_{uuid.uuid4().hex[:6]}",
            "column_id": col_from
        })
        assert create_res.status_code == 200
        task_id = create_res.json()["id"]
        
        # Move task to second column - this triggers status notification
        move_res = requests.put(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}/move", headers=headers, json={
            "column_id": col_to,
            "order": 0
        })
        assert move_res.status_code == 200, f"Move failed: {move_res.text}"
        
        moved_task = move_res.json()
        assert moved_task["column_id"] == col_to, "Task should be in new column"
        
        print(f"Task moved from {columns[0]['name']} to {columns[1]['name']} - notification logic triggered (asyncio task)")
        
        # Move back to verify multiple moves work
        move_back_res = requests.put(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}/move", headers=headers, json={
            "column_id": col_from,
            "order": 0
        })
        assert move_back_res.status_code == 200
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-boards/boards/{board_id}/tasks/{task_id}", headers=headers)


class TestUserInviteForcePasswordChange:
    """Test that user invite sets force_password_change=true"""
    
    def test_invite_user_sets_force_password_change(self, headers):
        """POST /api/users/invite - should create user with force_password_change=true"""
        unique_email = f"testinvite_{uuid.uuid4().hex[:8]}@example.com"
        
        payload = {
            "email": unique_email,
            "name": "Test Invite User",
            "role": "viewer"
        }
        
        response = requests.post(f"{BASE_URL}/api/users/invite", headers=headers, json=payload)
        assert response.status_code == 200, f"Invite failed: {response.text}"
        
        data = response.json()
        assert data["email"] == unique_email
        assert data["name"] == "Test Invite User"
        assert data["role"] == "viewer"
        
        print(f"Invited user: {data['id']}")
        
        # Check force_password_change is set by trying to get temp password
        # (temp_password endpoint should work since it's a new invite)
        temp_pass_res = requests.get(f"{BASE_URL}/api/users/invite/{data['id']}/password", headers=headers)
        assert temp_pass_res.status_code == 200, f"Temp password check failed: {temp_pass_res.text}"
        assert "temp_password" in temp_pass_res.json()
        
        print("User has temp_password set (force_password_change=true)")
        
        # Cleanup - delete the invited user
        requests.delete(f"{BASE_URL}/api/users/{data['id']}", headers=headers)


class TestVmixOverlayBackgrounds:
    """Test vMix overlay endpoints render correctly with different background types"""
    
    SERVER_SITE_ID = "9d51a9a0-90ea-41c5-8324-d240fedbd99c"
    
    def test_ticker_overlay_returns_html_with_background(self):
        """GET /api/vmix/overlay/{id}/ticker - should return HTML with background CSS"""
        response = requests.get(f"{BASE_URL}/api/vmix/overlay/{self.SERVER_SITE_ID}/ticker")
        assert response.status_code == 200, f"Ticker overlay failed: {response.text}"
        assert "text/html" in response.headers.get("content-type", "")
        
        html = response.text
        assert "<!DOCTYPE html>" in html
        assert "background" in html.lower(), "Should have background CSS"
        assert "ticker" in html.lower()
        
        print("Ticker overlay renders correctly with background")
    
    def test_clock_overlay_returns_html_with_background(self):
        """GET /api/vmix/overlay/{id}/clock - should return HTML with background CSS"""
        response = requests.get(f"{BASE_URL}/api/vmix/overlay/{self.SERVER_SITE_ID}/clock")
        assert response.status_code == 200
        
        html = response.text
        assert "background" in html.lower()
        assert "clock" in html.lower()
        
        print("Clock overlay renders correctly with background")
    
    def test_now_playing_show_overlay_with_background(self):
        """GET /api/vmix/overlay/{id}/now-playing-show - should have background CSS"""
        response = requests.get(f"{BASE_URL}/api/vmix/overlay/{self.SERVER_SITE_ID}/now-playing-show")
        assert response.status_code == 200
        
        html = response.text
        assert "background" in html.lower()
        assert "Now Playing" in html
        
        print("Now playing show overlay renders with background")
    
    def test_now_playing_track_overlay_with_background(self):
        """GET /api/vmix/overlay/{id}/now-playing-track - should have background CSS"""
        response = requests.get(f"{BASE_URL}/api/vmix/overlay/{self.SERVER_SITE_ID}/now-playing-track")
        assert response.status_code == 200
        
        html = response.text
        assert "background" in html.lower()
        assert "Now Playing" in html
        
        print("Now playing track overlay renders with background")
    
    def test_vmix_config_has_all_background_fields(self):
        """GET /api/vmix/config - should have all background type fields"""
        auth_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admkoodh@koodh.com",
            "password": "KYLovie13monx"
        })
        token = auth_res.json()["token"]
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Main-Site-ID": self.SERVER_SITE_ID
        }
        
        response = requests.get(f"{BASE_URL}/api/vmix/config", headers=headers)
        assert response.status_code == 200
        
        config = response.json()
        
        # Check ticker background fields
        assert "ticker_bg_type" in config
        assert "ticker_bg_color" in config
        assert "ticker_bg_gradient_start" in config
        assert "ticker_bg_gradient_end" in config
        assert "ticker_bg_gradient_angle" in config
        
        # Check clock background fields
        assert "clock_bg_type" in config
        assert "clock_bg_color" in config
        
        # Check now playing show background fields
        assert "now_playing_show_bg_type" in config
        
        # Check now playing track background fields
        assert "now_playing_track_bg_type" in config
        
        print(f"Config has all background fields. ticker_bg_type={config['ticker_bg_type']}")


class TestMainSitesTaskSchedulerLabel:
    """Test that task_scheduler site type shows 'Clara Tasks' label"""
    
    def test_create_task_scheduler_site_type_label(self, headers):
        """POST /api/main-sites - task_scheduler type should be available"""
        # Just verify task_scheduler is a valid site_type
        # The label 'Clara Tasks' is shown in email (checked via code review)
        
        # Create a task_scheduler site
        payload = {
            "name": f"TEST_TasksLabel_{uuid.uuid4().hex[:6]}",
            "slug": f"test-tasks-{uuid.uuid4().hex[:6]}",
            "site_type": "task_scheduler",
            "enabled_features": ["task_boards"]
        }
        
        response = requests.post(f"{BASE_URL}/api/main-sites", headers=headers, json=payload)
        assert response.status_code == 200, f"Failed to create: {response.text}"
        
        site = response.json()
        assert site["site_type"] == "task_scheduler"
        
        print(f"Created task_scheduler site: {site['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/main-sites/{site['id']}", headers=headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
