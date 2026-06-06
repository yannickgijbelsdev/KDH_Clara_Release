"""License Manager Demo Mode API Tests.

Tests for the Demo Mode feature in License Manager including:
- PUT /api/main-sites/{id} with is_demo=true - should update the site's is_demo field
- GET /api/licenses/check/{main_site_id} - should return is_demo field for demo sites
- GET /api/licenses/overview - should return is_demo field for each site
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"

# Test sites
RADIOGROEP_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"  # Radiogroep MFY/GRK (is_demo=true)
DBNT_STUDIO_SITE_ID = "fc37cb22-b93e-4fc8-9d77-818b3af45d35"  # DBNT Studio (is_demo=false, no license)


class TestDemoModeAPI:
    """Tests for Demo Mode API operations."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate as admin."""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json().get('token')
        assert token, "No token in login response"
        self.session.headers.update({'Authorization': f'Bearer {token}'})
        self.token = token
        yield
        self.session.close()
    
    def test_update_site_is_demo_true(self):
        """PUT /api/main-sites/{id} with is_demo=true should update the site's is_demo field."""
        # First get current state
        get_res = self.session.get(f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}")
        assert get_res.status_code == 200, f"Failed to get site: {get_res.text}"
        get_res.json().get('is_demo', False)
        
        # Update to is_demo=true
        update_res = self.session.put(
            f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}",
            json={"is_demo": True}
        )
        assert update_res.status_code == 200, f"Failed to update: {update_res.text}"
        
        updated = update_res.json()
        assert updated.get('is_demo'), f"Expected is_demo=True, got {updated.get('is_demo')}"
        
        # Verify with GET
        verify_res = self.session.get(f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}")
        assert verify_res.status_code == 200
        assert verify_res.json().get('is_demo'), "is_demo not persisted"
        
        print("PASS: Updated site is_demo=True successfully")
    
    def test_update_site_is_demo_false(self):
        """PUT /api/main-sites/{id} with is_demo=false should update the site's is_demo field."""
        # Update to is_demo=false
        update_res = self.session.put(
            f"{BASE_URL}/api/main-sites/{DBNT_STUDIO_SITE_ID}",
            json={"is_demo": False}
        )
        assert update_res.status_code == 200, f"Failed to update: {update_res.text}"
        
        updated = update_res.json()
        assert not updated.get('is_demo'), f"Expected is_demo=False, got {updated.get('is_demo')}"
        
        # Verify with GET
        verify_res = self.session.get(f"{BASE_URL}/api/main-sites/{DBNT_STUDIO_SITE_ID}")
        assert verify_res.status_code == 200
        assert not verify_res.json().get('is_demo'), "is_demo not persisted"
        
        print("PASS: Updated site is_demo=False successfully")
    
    def test_toggle_demo_mode(self):
        """PUT /api/main-sites/{id} should be able to toggle is_demo on and off."""
        # Get current state
        get_res = self.session.get(f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}")
        assert get_res.status_code == 200
        current_state = get_res.json().get('is_demo', False)
        
        # Toggle to opposite
        toggle_res = self.session.put(
            f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}",
            json={"is_demo": not current_state}
        )
        assert toggle_res.status_code == 200, f"Failed to toggle: {toggle_res.text}"
        assert toggle_res.json().get('is_demo') == (not current_state)
        
        # Toggle back
        restore_res = self.session.put(
            f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}",
            json={"is_demo": current_state}
        )
        assert restore_res.status_code == 200
        assert restore_res.json().get('is_demo') == current_state
        
        print("PASS: Demo mode toggled successfully")


class TestLicenseCheckWithDemo:
    """Tests for GET /api/licenses/check/{main_site_id} with is_demo field."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate as admin."""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json().get('token')
        self.session.headers.update({'Authorization': f'Bearer {token}'})
        yield
        self.session.close()
    
    def test_license_check_returns_is_demo_for_demo_site(self):
        """GET /api/licenses/check/{main_site_id} should return is_demo=true for demo sites."""
        # Ensure Radiogroep is demo
        self.session.put(
            f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}",
            json={"is_demo": True}
        )
        
        response = self.session.get(f"{BASE_URL}/api/licenses/check/{RADIOGROEP_SITE_ID}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert 'is_demo' in data, f"Response should contain is_demo field: {data}"
        assert data.get('is_demo'), f"Expected is_demo=True for demo site, got {data.get('is_demo')}"
        
        print("PASS: License check returns is_demo=True for demo site")
    
    def test_license_check_returns_is_demo_false_for_non_demo_site(self):
        """GET /api/licenses/check/{main_site_id} should return is_demo=false for non-demo sites."""
        # Ensure DBNT Studio is not demo
        self.session.put(
            f"{BASE_URL}/api/main-sites/{DBNT_STUDIO_SITE_ID}",
            json={"is_demo": False}
        )
        
        response = self.session.get(f"{BASE_URL}/api/licenses/check/{DBNT_STUDIO_SITE_ID}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert 'is_demo' in data, f"Response should contain is_demo field: {data}"
        assert not data.get('is_demo'), f"Expected is_demo=False for non-demo site, got {data.get('is_demo')}"
        
        print("PASS: License check returns is_demo=False for non-demo site")
    
    def test_license_check_demo_site_without_license(self):
        """GET /api/licenses/check for demo site without license returns has_license=false, is_demo=true."""
        # Ensure Radiogroep is demo and remove any license
        self.session.put(
            f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}",
            json={"is_demo": True}
        )
        
        # Remove any existing assignment
        assign_res = self.session.get(f"{BASE_URL}/api/licenses/assignments")
        if assign_res.status_code == 200:
            for a in assign_res.json():
                if a.get('main_site_id') == RADIOGROEP_SITE_ID:
                    self.session.delete(f"{BASE_URL}/api/licenses/assignments/{a['id']}")
        
        response = self.session.get(f"{BASE_URL}/api/licenses/check/{RADIOGROEP_SITE_ID}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert not data.get('has_license'), f"Expected has_license=False, got {data.get('has_license')}"
        assert data.get('is_demo'), f"Expected is_demo=True, got {data.get('is_demo')}"
        
        print("PASS: Demo site without license returns has_license=false, is_demo=true")


class TestLicenseOverviewWithDemo:
    """Tests for GET /api/licenses/overview with is_demo field."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate as admin."""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json().get('token')
        self.session.headers.update({'Authorization': f'Bearer {token}'})
        yield
        self.session.close()
    
    def test_overview_returns_is_demo_field(self):
        """GET /api/licenses/overview should return is_demo field for each site."""
        response = self.session.get(f"{BASE_URL}/api/licenses/overview")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        sites = response.json()
        assert isinstance(sites, list), "Response should be a list"
        assert len(sites) > 0, "Should have at least one site"
        
        # Check that every site has is_demo field
        for site in sites:
            assert 'is_demo' in site, f"Site {site.get('site_name')} missing is_demo field: {site}"
            assert isinstance(site['is_demo'], bool), f"is_demo should be boolean for {site.get('site_name')}"
        
        print(f"PASS: Overview returns is_demo field for all {len(sites)} sites")
    
    def test_overview_shows_correct_demo_status(self):
        """GET /api/licenses/overview should show correct is_demo status for known sites."""
        # Setup: Radiogroep is demo, DBNT is not
        self.session.put(f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}", json={"is_demo": True})
        self.session.put(f"{BASE_URL}/api/main-sites/{DBNT_STUDIO_SITE_ID}", json={"is_demo": False})
        
        response = self.session.get(f"{BASE_URL}/api/licenses/overview")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        sites = response.json()
        
        # Find our test sites
        radiogroep = next((s for s in sites if s.get('site_id') == RADIOGROEP_SITE_ID), None)
        dbnt = next((s for s in sites if s.get('site_id') == DBNT_STUDIO_SITE_ID), None)
        
        assert radiogroep, "Radiogroep site not found in overview"
        assert radiogroep.get('is_demo'), f"Radiogroep should be demo, got {radiogroep.get('is_demo')}"
        
        assert dbnt, "DBNT Studio site not found in overview"
        assert not dbnt.get('is_demo'), f"DBNT Studio should not be demo, got {dbnt.get('is_demo')}"
        
        print(f"PASS: Overview shows correct demo status - Radiogroep: demo={radiogroep.get('is_demo')}, DBNT: demo={dbnt.get('is_demo')}")


class TestMainSiteResponseModel:
    """Tests for MainSite response model is_demo field."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate as admin."""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json().get('token')
        self.session.headers.update({'Authorization': f'Bearer {token}'})
        yield
        self.session.close()
    
    def test_get_main_site_returns_is_demo(self):
        """GET /api/main-sites/{id} should return is_demo field."""
        response = self.session.get(f"{BASE_URL}/api/main-sites/{RADIOGROEP_SITE_ID}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert 'is_demo' in data, f"Response should contain is_demo field: {data.keys()}"
        assert isinstance(data['is_demo'], bool), f"is_demo should be boolean, got {type(data['is_demo'])}"
        
        print(f"PASS: GET main site returns is_demo field = {data['is_demo']}")
    
    def test_list_main_sites_returns_is_demo(self):
        """GET /api/main-sites should return is_demo field for each site."""
        response = self.session.get(f"{BASE_URL}/api/main-sites")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        sites = response.json()
        assert isinstance(sites, list), "Response should be a list"
        assert len(sites) > 0, "Should have at least one site"
        
        for site in sites:
            assert 'is_demo' in site, f"Site {site.get('name')} missing is_demo field"
            assert isinstance(site['is_demo'], bool), f"is_demo should be boolean for {site.get('name')}"
        
        print(f"PASS: List main sites returns is_demo field for all {len(sites)} sites")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
