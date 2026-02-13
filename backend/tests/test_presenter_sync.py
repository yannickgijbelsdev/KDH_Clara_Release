"""
Test presenter sync functionality - when default_presenter_ids are updated on a show title,
all shows with that title should have their presenter_ids updated automatically.
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPresenterSync:
    """Test presenter sync from show titles to shows"""
    
    token = None
    user_info = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        if not TestPresenterSync.token:
            login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "test@test.com",
                "password": "test"
            })
            assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
            data = login_resp.json()
            TestPresenterSync.token = data["token"]
            TestPresenterSync.user_info = data["user"]
        
        self.headers = {
            "Authorization": f"Bearer {TestPresenterSync.token}",
            "Content-Type": "application/json"
        }
    
    def test_01_get_show_titles(self):
        """Test fetching show titles with their default presenters"""
        response = requests.get(f"{BASE_URL}/api/shows/titles", headers=self.headers)
        assert response.status_code == 200, f"Failed to get show titles: {response.text}"
        
        titles = response.json()
        print(f"Found {len(titles)} show titles")
        
        # Find Backstage Radio title
        backstage_title = next((t for t in titles if t['name'] == 'Backstage Radio'), None)
        if backstage_title:
            print(f"Backstage Radio title found:")
            print(f"  - ID: {backstage_title['id']}")
            print(f"  - Default presenter IDs: {backstage_title.get('default_presenter_ids', [])}")
            if backstage_title.get('default_presenters'):
                print(f"  - Default presenters: {[p['name'] for p in backstage_title['default_presenters']]}")
    
    def test_02_get_team_users(self):
        """Get team users to find presenter IDs"""
        response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        
        users = response.json()
        print(f"Found {len(users)} team users:")
        for user in users:
            print(f"  - {user['name']} (ID: {user['id']}, Role: {user.get('role', 'N/A')})")
        
        # Store user IDs for later tests
        TestPresenterSync.users = users
    
    def test_03_get_backstage_radio_shows(self):
        """Get all shows with title 'Backstage Radio' and verify presenters"""
        response = requests.get(f"{BASE_URL}/api/shows", headers=self.headers)
        assert response.status_code == 200, f"Failed to get shows: {response.text}"
        
        shows = response.json()
        backstage_shows = [s for s in shows if s['title'] == 'Backstage Radio']
        
        print(f"Found {len(backstage_shows)} Backstage Radio shows:")
        for show in backstage_shows[:5]:  # Show first 5
            presenters = show.get('presenters', [])
            presenter_ids = show.get('presenter_ids', [])
            print(f"  - Date: {show['date']}")
            print(f"    Presenter IDs: {presenter_ids}")
            print(f"    Presenter names: {[p['name'] for p in presenters]}")
        
        # Verify all Backstage Radio shows have presenters synced
        shows_with_presenters = [s for s in backstage_shows if s.get('presenter_ids')]
        print(f"\n{len(shows_with_presenters)} of {len(backstage_shows)} Backstage Radio shows have presenter_ids set")
    
    def test_04_get_specific_show_detail(self):
        """Get a specific Backstage Radio show and verify presenter details"""
        # First get all shows
        response = requests.get(f"{BASE_URL}/api/shows", headers=self.headers)
        assert response.status_code == 200
        
        shows = response.json()
        backstage_shows = [s for s in shows if s['title'] == 'Backstage Radio']
        
        if not backstage_shows:
            pytest.skip("No Backstage Radio shows found")
        
        # Get detail of first Backstage Radio show
        show_id = backstage_shows[0]['id']
        detail_response = requests.get(f"{BASE_URL}/api/shows/{show_id}", headers=self.headers)
        assert detail_response.status_code == 200, f"Failed to get show detail: {detail_response.text}"
        
        show = detail_response.json()
        print(f"Show detail for '{show['title']}' on {show['date']}:")
        print(f"  - ID: {show['id']}")
        print(f"  - Presenter IDs: {show.get('presenter_ids', [])}")
        print(f"  - Presenters: {[p['name'] for p in show.get('presenters', [])]}")
        
        # ASSERT: Backstage Radio should have 2 presenters
        assert len(show.get('presenters', [])) >= 2, \
            f"Expected at least 2 presenters for Backstage Radio, got {len(show.get('presenters', []))}"
    
    def test_05_update_show_title_presenters_syncs_to_shows(self):
        """Test that updating default_presenter_ids on a show title syncs to all shows"""
        # Get show titles
        titles_resp = requests.get(f"{BASE_URL}/api/shows/titles", headers=self.headers)
        titles = titles_resp.json()
        
        # Find Backstage Radio title
        backstage_title = next((t for t in titles if t['name'] == 'Backstage Radio'), None)
        if not backstage_title:
            pytest.skip("Backstage Radio title not found")
        
        title_id = backstage_title['id']
        current_presenter_ids = backstage_title.get('default_presenter_ids', [])
        print(f"Current presenter IDs for Backstage Radio title: {current_presenter_ids}")
        
        # Get users to find presenter IDs
        users_resp = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        users = users_resp.json()
        
        if len(users) < 2:
            pytest.skip("Need at least 2 users for this test")
        
        # Use first 2 users as new presenters
        new_presenter_ids = [users[0]['id'], users[1]['id']]
        print(f"Updating to new presenter IDs: {new_presenter_ids}")
        print(f"New presenters: {[users[0]['name'], users[1]['name']]}")
        
        # Update the show title with new presenters
        update_resp = requests.put(
            f"{BASE_URL}/api/shows/titles/{title_id}",
            headers=self.headers,
            json={"default_presenter_ids": new_presenter_ids}
        )
        assert update_resp.status_code == 200, f"Failed to update show title: {update_resp.text}"
        
        updated_title = update_resp.json()
        print(f"Updated title presenter IDs: {updated_title.get('default_presenter_ids', [])}")
        
        # Verify the update was applied to the title
        assert updated_title.get('default_presenter_ids') == new_presenter_ids, \
            f"Expected presenter IDs {new_presenter_ids}, got {updated_title.get('default_presenter_ids')}"
        
        # Now verify all Backstage Radio shows have updated presenter_ids
        shows_resp = requests.get(f"{BASE_URL}/api/shows", headers=self.headers)
        shows = shows_resp.json()
        backstage_shows = [s for s in shows if s['title'] == 'Backstage Radio']
        
        print(f"\nVerifying {len(backstage_shows)} Backstage Radio shows were updated:")
        synced_count = 0
        for show in backstage_shows:
            if show.get('presenter_ids') == new_presenter_ids:
                synced_count += 1
            else:
                print(f"  - Show {show['date']} NOT synced: {show.get('presenter_ids')}")
        
        print(f"{synced_count} of {len(backstage_shows)} shows synced correctly")
        
        # All shows should be synced
        assert synced_count == len(backstage_shows), \
            f"Expected all {len(backstage_shows)} shows to be synced, but only {synced_count} were"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
