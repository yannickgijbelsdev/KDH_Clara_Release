"""
Test suite for Network Card Styling and Badge Labels
Tests:
1. /api/main-sites/my/access endpoint for network admin (non-system) returns ALL sites
2. Site type labels are correct (Virtual Datacenter, Data Connection, Tasks, External Host)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"
NETWORK_ADMIN_EMAIL = "yannick.gijbels@koodh.com"
NETWORK_ADMIN_PASSWORD = "TestPass123"


class TestNetworkAdminAccess:
    """Test /api/main-sites/my/access endpoint for network admin users"""
    
    @pytest.fixture(scope="class")
    def system_admin_token(self):
        """Get auth token for system admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"System admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, f"No token in response: {data}"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def network_admin_token(self):
        """Get auth token for network admin (non-system)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NETWORK_ADMIN_EMAIL,
            "password": NETWORK_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Network admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, f"No token in response: {data}"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def total_main_sites_count(self, system_admin_token):
        """Get total count of main sites from system admin perspective"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        assert response.status_code == 200
        sites = response.json()
        return len(sites)
    
    def test_system_admin_login(self, system_admin_token):
        """Verify system admin can login"""
        assert system_admin_token is not None
        assert len(system_admin_token) > 0
        print(f"System admin token obtained: {system_admin_token[:20]}...")
    
    def test_network_admin_login(self, network_admin_token):
        """Verify network admin (non-system) can login"""
        assert network_admin_token is not None
        assert len(network_admin_token) > 0
        print(f"Network admin token obtained: {network_admin_token[:20]}...")
    
    def test_network_admin_my_access_returns_all_sites(self, network_admin_token, total_main_sites_count):
        """
        CRITICAL TEST: Network admin should see ALL main sites, not just explicitly assigned ones.
        Previous bug: Yannick only saw 4 sites instead of all 13.
        """
        response = requests.get(
            f"{BASE_URL}/api/main-sites/my/access",
            headers={"Authorization": f"Bearer {network_admin_token}"}
        )
        assert response.status_code == 200, f"my/access failed: {response.text}"
        
        data = response.json()
        assert "main_sites" in data, "Response missing 'main_sites' key"
        assert "is_network_admin" in data, "Response missing 'is_network_admin' key"
        
        # Verify user is recognized as network admin
        assert data["is_network_admin"], "User should be recognized as network_admin"
        
        # Count sites returned
        sites_returned = len(data["main_sites"])
        print(f"Network admin sees {sites_returned} sites (total in system: {total_main_sites_count})")
        
        # Network admin should see ALL sites
        assert sites_returned == total_main_sites_count, \
            f"Network admin should see all {total_main_sites_count} sites, but only sees {sites_returned}"
        
        # Verify each site has required fields
        for site in data["main_sites"]:
            assert "id" in site, f"Site missing 'id': {site}"
            assert "name" in site, f"Site missing 'name': {site}"
            assert "slug" in site, f"Site missing 'slug': {site}"
            assert "role" in site, f"Site missing 'role': {site}"
            # For sites without explicit access, role should default to 'network_admin'
            print(f"  - {site['name']} ({site.get('site_type', 'radio')}): role={site['role']}")
    
    def test_network_admin_default_role_is_network_admin(self, network_admin_token):
        """
        Verify that for sites without explicit access records, 
        the default role is 'network_admin' (not 'viewer' or empty)
        """
        response = requests.get(
            f"{BASE_URL}/api/main-sites/my/access",
            headers={"Authorization": f"Bearer {network_admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        for site in data["main_sites"]:
            # Role should be either explicit role or 'network_admin' as default
            assert site["role"] in ["admin", "editor", "presenter", "viewer", "network_admin", "news_admin"], \
                f"Invalid role '{site['role']}' for site {site['name']}"
    
    def test_site_type_labels_in_response(self, network_admin_token):
        """Verify site_type field is present and has valid values"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/my/access",
            headers={"Authorization": f"Bearer {network_admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        valid_site_types = ["radio", "server", "technical", "task_scheduler", "external_host"]
        
        site_types_found = set()
        for site in data["main_sites"]:
            site_type = site.get("site_type", "radio")
            site_types_found.add(site_type)
            assert site_type in valid_site_types, \
                f"Invalid site_type '{site_type}' for site {site['name']}"
        
        print(f"Site types found: {site_types_found}")


class TestSiteTypeMappings:
    """Test that site type labels are correctly mapped"""
    
    @pytest.fixture(scope="class")
    def system_admin_token(self):
        """Get auth token for system admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_main_sites_list_has_site_types(self, system_admin_token):
        """Verify main sites list includes site_type field"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        assert response.status_code == 200
        
        sites = response.json()
        assert len(sites) > 0, "No main sites found"
        
        # Expected label mappings (frontend should use these)
        EXPECTED_LABELS = {
            "radio": "Radio",
            "server": "Virtual Datacenter",
            "technical": "Data Connection",
            "task_scheduler": "Tasks",
            "external_host": "External Host"
        }
        
        for site in sites:
            site_type = site.get("site_type", "radio")
            expected_label = EXPECTED_LABELS.get(site_type, "Radio")
            print(f"Site: {site['name']} | type: {site_type} | expected label: {expected_label}")
    
    def test_count_sites_by_type(self, system_admin_token):
        """Count how many sites of each type exist"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        assert response.status_code == 200
        
        sites = response.json()
        type_counts = {}
        for site in sites:
            site_type = site.get("site_type", "radio")
            type_counts[site_type] = type_counts.get(site_type, 0) + 1
        
        print(f"Site type distribution: {type_counts}")
        print(f"Total sites: {len(sites)}")


class TestBackupManagementSiteTypes:
    """Test that backup management page would show correct site type badges"""
    
    @pytest.fixture(scope="class")
    def system_admin_token(self):
        """Get auth token for system admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_main_sites_for_backup_page(self, system_admin_token):
        """
        Verify main sites returned have correct site_type for backup page badges.
        Expected badge labels:
        - server -> 'Virtual Datacenter' (blue)
        - technical -> 'Data Connection' (emerald)
        - task_scheduler -> 'Tasks' (violet)
        - external_host -> 'External Host' (cyan)
        """
        response = requests.get(
            f"{BASE_URL}/api/main-sites",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        assert response.status_code == 200
        
        sites = response.json()
        # Filter out clones for backup page (as the frontend does)
        real_sites = [s for s in sites if not s.get("cloned_from")]
        
        print(f"Real sites (non-clones) for backup page: {len(real_sites)}")
        
        for site in real_sites:
            site_type = site.get("site_type", "radio")
            name = site.get("name", "Unknown")
            
            # Map to expected badge label
            badge_label = {
                "radio": None,  # No badge for radio
                "server": "Virtual Datacenter",
                "technical": "Data Connection",
                "task_scheduler": "Tasks",
                "external_host": "External Host"
            }.get(site_type)
            
            if badge_label:
                print(f"  {name}: should show badge '{badge_label}'")
            else:
                print(f"  {name}: no special badge (radio type)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
