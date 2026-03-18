"""License Manager API Tests.

Tests for the License Manager feature including:
- GET /api/licenses/packages - returns 3 default packages
- POST /api/licenses/packages - create custom package
- PUT /api/licenses/packages/{id} - update package
- DELETE /api/licenses/packages/{id} - delete custom package, verify default cannot be deleted
- GET /api/licenses/overview - returns all sites with license status
- POST /api/licenses/assignments - assign license to site
- GET /api/licenses/check/{main_site_id} - check license status
- DELETE /api/licenses/assignments/{id} - remove assignment
- Feature sync - verify main site enabled_features synced after assignment
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
TEST_MAIN_SITE_ID = "db23c31a-7776-4805-a4a5-bd019dd7c2be"  # Radiogroep MFY/GRK


class TestLicensePackages:
    """Tests for license package CRUD operations."""
    
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
    
    def test_get_packages_returns_3_defaults(self):
        """GET /api/licenses/packages should return at least 3 default packages."""
        response = self.session.get(f"{BASE_URL}/api/licenses/packages")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        packages = response.json()
        assert isinstance(packages, list), "Response should be a list"
        
        # Filter for default packages
        default_packages = [p for p in packages if p.get('is_default')]
        assert len(default_packages) >= 3, f"Expected at least 3 default packages, got {len(default_packages)}"
        
        # Check for Standard, Technical, Server
        slugs = [p.get('slug') for p in default_packages]
        assert 'standard' in slugs, "Missing 'standard' package"
        assert 'technical' in slugs, "Missing 'technical' package"
        assert 'server' in slugs, "Missing 'server' package"
        
        # Verify package structure
        for pkg in default_packages:
            assert 'id' in pkg
            assert 'name' in pkg
            assert 'slug' in pkg
            assert 'features' in pkg
            assert isinstance(pkg['features'], list)
            assert 'monthly_price' in pkg
            assert 'yearly_price' in pkg
            assert 'currency' in pkg
        
        print(f"PASS: Found {len(default_packages)} default packages: {slugs}")
    
    def test_create_custom_package(self):
        """POST /api/licenses/packages should create a custom package."""
        package_data = {
            "name": "TEST Premium Package",
            "slug": "test_premium_pkg_001",
            "description": "Test package for pytest",
            "features": ["shows", "calendar", "team_chat"],
            "monthly_price": 49.99,
            "yearly_price": 499.99,
            "currency": "EUR",
            "is_active": True,
            "sort_order": 99
        }
        
        response = self.session.post(f"{BASE_URL}/api/licenses/packages", json=package_data)
        assert response.status_code == 200, f"Failed to create package: {response.text}"
        
        created = response.json()
        assert created.get('name') == package_data['name']
        assert created.get('slug') == package_data['slug']
        assert created.get('features') == package_data['features']
        assert created.get('monthly_price') == package_data['monthly_price']
        assert created.get('is_default') == False, "Custom package should not be default"
        
        # Cleanup - delete the test package
        pkg_id = created.get('id')
        delete_res = self.session.delete(f"{BASE_URL}/api/licenses/packages/{pkg_id}")
        assert delete_res.status_code == 200, f"Failed to cleanup test package: {delete_res.text}"
        
        print(f"PASS: Created and deleted custom package '{package_data['name']}'")
    
    def test_update_package(self):
        """PUT /api/licenses/packages/{id} should update package features and pricing."""
        # First create a test package
        create_data = {
            "name": "TEST Update Package",
            "slug": "test_update_pkg_001",
            "features": ["shows"],
            "monthly_price": 10.0,
            "yearly_price": 100.0,
            "currency": "EUR"
        }
        create_res = self.session.post(f"{BASE_URL}/api/licenses/packages", json=create_data)
        assert create_res.status_code == 200, f"Failed to create: {create_res.text}"
        pkg_id = create_res.json().get('id')
        
        # Update it
        update_data = {
            "name": "TEST Updated Package Name",
            "features": ["shows", "calendar", "content_library"],
            "monthly_price": 29.99,
            "yearly_price": 299.99
        }
        update_res = self.session.put(f"{BASE_URL}/api/licenses/packages/{pkg_id}", json=update_data)
        assert update_res.status_code == 200, f"Failed to update: {update_res.text}"
        
        updated = update_res.json()
        assert updated.get('name') == update_data['name']
        assert updated.get('features') == update_data['features']
        assert updated.get('monthly_price') == update_data['monthly_price']
        
        # Verify with GET
        get_res = self.session.get(f"{BASE_URL}/api/licenses/packages/{pkg_id}")
        assert get_res.status_code == 200
        fetched = get_res.json()
        assert fetched.get('name') == update_data['name']
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/licenses/packages/{pkg_id}")
        
        print(f"PASS: Updated package successfully")
    
    def test_delete_custom_package(self):
        """DELETE /api/licenses/packages/{id} should delete custom package."""
        # Create a test package
        create_data = {
            "name": "TEST Delete Package",
            "slug": "test_delete_pkg_001",
            "features": ["shows"],
            "monthly_price": 5.0,
            "yearly_price": 50.0,
            "currency": "EUR"
        }
        create_res = self.session.post(f"{BASE_URL}/api/licenses/packages", json=create_data)
        assert create_res.status_code == 200
        pkg_id = create_res.json().get('id')
        
        # Delete it
        delete_res = self.session.delete(f"{BASE_URL}/api/licenses/packages/{pkg_id}")
        assert delete_res.status_code == 200, f"Failed to delete: {delete_res.text}"
        
        # Verify it's gone
        get_res = self.session.get(f"{BASE_URL}/api/licenses/packages/{pkg_id}")
        assert get_res.status_code == 404, "Package should be deleted"
        
        print("PASS: Custom package deleted successfully")
    
    def test_cannot_delete_default_package(self):
        """DELETE /api/licenses/packages/{id} should return 400 for default packages."""
        # Get the default packages
        packages_res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        assert packages_res.status_code == 200
        
        packages = packages_res.json()
        default_pkg = next((p for p in packages if p.get('is_default')), None)
        assert default_pkg, "No default package found"
        
        # Try to delete it
        delete_res = self.session.delete(f"{BASE_URL}/api/licenses/packages/{default_pkg['id']}")
        assert delete_res.status_code == 400, f"Expected 400, got {delete_res.status_code}: {delete_res.text}"
        
        error = delete_res.json()
        assert 'default' in error.get('detail', '').lower(), "Error should mention default package"
        
        print(f"PASS: Cannot delete default package '{default_pkg['name']}'")


class TestLicenseOverview:
    """Tests for license overview endpoint."""
    
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
        self.session.headers.update({'Authorization': f'Bearer {token}'})
        yield
        self.session.close()
    
    def test_overview_returns_all_sites(self):
        """GET /api/licenses/overview should return all main sites with license status."""
        response = self.session.get(f"{BASE_URL}/api/licenses/overview")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        sites = response.json()
        assert isinstance(sites, list), "Response should be a list"
        assert len(sites) > 0, "Should have at least one site"
        
        # Check structure
        for site in sites:
            assert 'site_id' in site
            assert 'site_name' in site
            assert 'site_slug' in site
            assert 'has_license' in site
            assert isinstance(site['has_license'], bool)
            
        print(f"PASS: Overview returned {len(sites)} sites")


class TestLicenseAssignments:
    """Tests for license assignment operations."""
    
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
        self.session.headers.update({'Authorization': f'Bearer {token}'})
        yield
        self.session.close()
    
    def _cleanup_existing_assignment(self, main_site_id):
        """Helper to remove existing assignment if any."""
        # Get all assignments
        res = self.session.get(f"{BASE_URL}/api/licenses/assignments")
        if res.status_code == 200:
            assignments = res.json()
            for a in assignments:
                if a.get('main_site_id') == main_site_id:
                    self.session.delete(f"{BASE_URL}/api/licenses/assignments/{a['id']}")
    
    def test_assign_license_to_site(self):
        """POST /api/licenses/assignments should assign a license to a site."""
        # First cleanup any existing assignment
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
        
        # Get a package to assign
        packages_res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        assert packages_res.status_code == 200
        packages = packages_res.json()
        standard_pkg = next((p for p in packages if p.get('slug') == 'standard'), packages[0])
        
        # Assign license
        assign_data = {
            "main_site_id": TEST_MAIN_SITE_ID,
            "package_id": standard_pkg['id'],
            "billing_cycle": "monthly",
            "status": "active",
            "notes": "Test assignment"
        }
        response = self.session.post(f"{BASE_URL}/api/licenses/assignments", json=assign_data)
        assert response.status_code == 200, f"Failed to assign: {response.text}"
        
        assignment = response.json()
        assert assignment.get('main_site_id') == TEST_MAIN_SITE_ID
        assert assignment.get('package_id') == standard_pkg['id']
        assert assignment.get('billing_cycle') == 'monthly'
        assert assignment.get('is_lifetime') == False
        
        # Store assignment id for cleanup
        self.assignment_id = assignment.get('id')
        
        print(f"PASS: Assigned license to site")
        
        # Cleanup
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
    
    def test_assign_lifetime_license(self):
        """POST /api/licenses/assignments with billing_cycle='lifetime' should set is_lifetime=true."""
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
        
        # Get a package
        packages_res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        packages = packages_res.json()
        pkg = packages[0]
        
        # Assign lifetime license
        assign_data = {
            "main_site_id": TEST_MAIN_SITE_ID,
            "package_id": pkg['id'],
            "billing_cycle": "lifetime",
            "status": "active"
        }
        response = self.session.post(f"{BASE_URL}/api/licenses/assignments", json=assign_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        assignment = response.json()
        assert assignment.get('is_lifetime') == True, "Lifetime license should have is_lifetime=True"
        assert assignment.get('billing_cycle') == 'lifetime'
        
        print("PASS: Lifetime license assigned with is_lifetime=True")
        
        # Cleanup
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
    
    def test_duplicate_assignment_rejected(self):
        """POST /api/licenses/assignments should reject duplicate assignment (400)."""
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
        
        # Get a package
        packages_res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        packages = packages_res.json()
        pkg = packages[0]
        
        # First assignment
        assign_data = {
            "main_site_id": TEST_MAIN_SITE_ID,
            "package_id": pkg['id'],
            "billing_cycle": "monthly",
            "status": "active"
        }
        first_res = self.session.post(f"{BASE_URL}/api/licenses/assignments", json=assign_data)
        assert first_res.status_code == 200
        
        # Try duplicate
        second_res = self.session.post(f"{BASE_URL}/api/licenses/assignments", json=assign_data)
        assert second_res.status_code == 400, f"Expected 400 for duplicate, got {second_res.status_code}"
        
        error = second_res.json()
        assert 'already' in error.get('detail', '').lower(), "Error should mention existing license"
        
        print("PASS: Duplicate assignment correctly rejected with 400")
        
        # Cleanup
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
    
    def test_remove_license_assignment(self):
        """DELETE /api/licenses/assignments/{id} should remove a license."""
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
        
        # Create assignment
        packages_res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        packages = packages_res.json()
        
        assign_data = {
            "main_site_id": TEST_MAIN_SITE_ID,
            "package_id": packages[0]['id'],
            "billing_cycle": "yearly",
            "status": "active"
        }
        create_res = self.session.post(f"{BASE_URL}/api/licenses/assignments", json=assign_data)
        assert create_res.status_code == 200
        assignment_id = create_res.json().get('id')
        
        # Delete it
        delete_res = self.session.delete(f"{BASE_URL}/api/licenses/assignments/{assignment_id}")
        assert delete_res.status_code == 200, f"Failed to delete: {delete_res.text}"
        
        # Verify it's gone via check endpoint
        check_res = self.session.get(f"{BASE_URL}/api/licenses/check/{TEST_MAIN_SITE_ID}")
        assert check_res.status_code == 200
        check_data = check_res.json()
        assert check_data.get('has_license') == False, "License should be removed"
        
        print("PASS: License assignment removed successfully")


class TestLicenseCheck:
    """Tests for license check endpoint."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate as admin."""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        token = login_res.json().get('token')
        self.session.headers.update({'Authorization': f'Bearer {token}'})
        yield
        self.session.close()
    
    def _cleanup_existing_assignment(self, main_site_id):
        """Helper to remove existing assignment if any."""
        res = self.session.get(f"{BASE_URL}/api/licenses/assignments")
        if res.status_code == 200:
            assignments = res.json()
            for a in assignments:
                if a.get('main_site_id') == main_site_id:
                    self.session.delete(f"{BASE_URL}/api/licenses/assignments/{a['id']}")
    
    def test_check_unassigned_site_returns_false(self):
        """GET /api/licenses/check/{main_site_id} returns has_license=false for unassigned sites."""
        # Make sure no assignment exists
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
        
        response = self.session.get(f"{BASE_URL}/api/licenses/check/{TEST_MAIN_SITE_ID}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get('has_license') == False
        assert data.get('package') is None
        assert data.get('assignment') is None
        
        print("PASS: Unassigned site returns has_license=false")
    
    def test_check_assigned_site_returns_true(self):
        """GET /api/licenses/check/{main_site_id} returns has_license=true for assigned sites."""
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
        
        # Get a package and assign
        packages_res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        packages = packages_res.json()
        pkg = next((p for p in packages if p.get('slug') == 'standard'), packages[0])
        
        assign_data = {
            "main_site_id": TEST_MAIN_SITE_ID,
            "package_id": pkg['id'],
            "billing_cycle": "monthly",
            "status": "active"
        }
        self.session.post(f"{BASE_URL}/api/licenses/assignments", json=assign_data)
        
        # Check license
        response = self.session.get(f"{BASE_URL}/api/licenses/check/{TEST_MAIN_SITE_ID}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get('has_license') == True
        assert data.get('package') is not None
        assert data.get('assignment') is not None
        assert data['package'].get('id') == pkg['id']
        
        print("PASS: Assigned site returns has_license=true with package and assignment details")
        
        # Cleanup
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)


class TestFeatureSync:
    """Tests for feature sync when license is assigned."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate as admin."""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        token = login_res.json().get('token')
        self.session.headers.update({'Authorization': f'Bearer {token}'})
        yield
        self.session.close()
    
    def _cleanup_existing_assignment(self, main_site_id):
        """Helper to remove existing assignment if any."""
        res = self.session.get(f"{BASE_URL}/api/licenses/assignments")
        if res.status_code == 200:
            assignments = res.json()
            for a in assignments:
                if a.get('main_site_id') == main_site_id:
                    self.session.delete(f"{BASE_URL}/api/licenses/assignments/{a['id']}")
    
    def test_feature_sync_on_license_assignment(self):
        """After assigning a license, the main site's enabled_features should match the package features."""
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)
        
        # Get the Standard package (has specific features)
        packages_res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        packages = packages_res.json()
        standard_pkg = next((p for p in packages if p.get('slug') == 'standard'), None)
        assert standard_pkg, "Standard package not found"
        
        expected_features = standard_pkg.get('features', [])
        assert len(expected_features) > 0, "Standard package should have features"
        
        # Assign the license
        assign_data = {
            "main_site_id": TEST_MAIN_SITE_ID,
            "package_id": standard_pkg['id'],
            "billing_cycle": "monthly",
            "status": "active"
        }
        assign_res = self.session.post(f"{BASE_URL}/api/licenses/assignments", json=assign_data)
        assert assign_res.status_code == 200, f"Failed to assign: {assign_res.text}"
        
        # Get the main site and verify features were synced
        site_res = self.session.get(f"{BASE_URL}/api/main-sites/{TEST_MAIN_SITE_ID}")
        assert site_res.status_code == 200, f"Failed to get main site: {site_res.text}"
        
        site_data = site_res.json()
        site_features = site_data.get('enabled_features', [])
        
        # Verify features match
        assert sorted(site_features) == sorted(expected_features), \
            f"Features mismatch. Expected: {expected_features}, Got: {site_features}"
        
        print(f"PASS: Feature sync verified. Site features match package: {expected_features}")
        
        # Cleanup
        self._cleanup_existing_assignment(TEST_MAIN_SITE_ID)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
