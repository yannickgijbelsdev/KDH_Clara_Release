"""
Test License Manager CLI Fix - Verifies field name compatibility between CLI and REST API

Bug: CLI functions used 'site_id' instead of 'main_site_id', 'type' instead of 'billing_cycle',
and didn't set 'status: active'. This caused data from CLI to be invisible to License Manager UI.

Fix: Updated all CLI license functions to use correct field names matching licenses.py
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"


class TestLicenseCLIFix:
    """Test CLI license commands and cross-compatibility with REST API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token, find a test site"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        data = login_res.json()
        self.token = data.get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get a main site to test with
        sites_res = self.session.get(f"{BASE_URL}/api/main-sites")
        assert sites_res.status_code == 200, f"Failed to get main sites: {sites_res.text}"
        sites = sites_res.json()
        assert len(sites) > 0, "No main sites found for testing"
        self.test_site = sites[0]
        self.test_site_id = self.test_site["id"]
        self.test_site_name = self.test_site["name"]
        print(f"Using test site: {self.test_site_name} ({self.test_site_id})")
        
        yield
        
        # Cleanup: Remove any test licenses we created
        # (handled in individual tests)
    
    # ==================== CLI TESTS ====================
    
    def test_cli_license_packages_lists_3_packages(self):
        """CLI /license packages should list 3 default packages (Standard, Technical, Server)"""
        res = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license packages"
        })
        assert res.status_code == 200, f"CLI execute failed: {res.text}"
        data = res.json()
        output = data.get("output", "")
        
        # Should list all 3 default packages
        assert "Standard" in output, f"Standard package not found in output: {output}"
        assert "Technical" in output, f"Technical package not found in output: {output}"
        assert "Server" in output, f"Server package not found in output: {output}"
        print(f"CLI /license packages output:\n{output}")
    
    def test_cli_license_info_shows_license_or_no_license(self):
        """CLI /license info should show license info or 'No license assigned'"""
        res = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license info"
        })
        assert res.status_code == 200, f"CLI execute failed: {res.text}"
        data = res.json()
        output = data.get("output", "")
        
        # Should either show license info or "No license assigned"
        has_license_info = "License Information" in output or "Package:" in output
        has_no_license = "No license assigned" in output
        assert has_license_info or has_no_license, f"Unexpected output: {output}"
        print(f"CLI /license info output:\n{output}")
    
    def test_cli_license_assign_creates_with_correct_fields(self):
        """CLI /license assign should create license with main_site_id, billing_cycle, status=active"""
        # First remove any existing license
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
        
        # Assign a license via CLI
        res = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license assign Standard monthly"
        })
        assert res.status_code == 200, f"CLI execute failed: {res.text}"
        data = res.json()
        output = data.get("output", "")
        assert "assigned" in output.lower() or "License" in output, f"Assignment failed: {output}"
        print(f"CLI /license assign output:\n{output}")
        
        # Verify the license was created with correct fields via REST API
        overview_res = self.session.get(f"{BASE_URL}/api/licenses/overview")
        assert overview_res.status_code == 200, f"Overview failed: {overview_res.text}"
        overview = overview_res.json()
        
        # Find our site in the overview
        site_entry = next((s for s in overview if s.get("site_id") == self.test_site_id), None)
        assert site_entry is not None, f"Site {self.test_site_id} not found in overview"
        
        # Verify the license is visible (has_license should be True)
        assert site_entry.get("has_license") == True, f"License not visible in overview: {site_entry}"
        assert site_entry.get("billing_cycle") == "monthly", f"Wrong billing_cycle: {site_entry}"
        assert site_entry.get("license_status") == "active", f"Wrong status: {site_entry}"
        print(f"License visible in overview: {site_entry}")
        
        # Cleanup
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
    
    def test_cli_license_assign_yearly(self):
        """CLI /license assign with yearly billing cycle"""
        # First remove any existing license
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
        
        # Assign yearly license
        res = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license assign Technical yearly"
        })
        assert res.status_code == 200, f"CLI execute failed: {res.text}"
        data = res.json()
        output = data.get("output", "")
        assert "assigned" in output.lower() or "License" in output, f"Assignment failed: {output}"
        
        # Verify via REST API
        overview_res = self.session.get(f"{BASE_URL}/api/licenses/overview")
        overview = overview_res.json()
        site_entry = next((s for s in overview if s.get("site_id") == self.test_site_id), None)
        assert site_entry is not None, f"Site not found in overview"
        assert site_entry.get("has_license") == True, f"License not visible"
        assert site_entry.get("billing_cycle") == "yearly", f"Wrong billing_cycle: {site_entry.get('billing_cycle')}"
        print(f"Yearly license verified: {site_entry}")
        
        # Cleanup
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
    
    def test_cli_license_assign_lifetime(self):
        """CLI /license assign with lifetime billing cycle"""
        # First remove any existing license
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
        
        # Assign lifetime license
        res = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license assign Server lifetime"
        })
        assert res.status_code == 200, f"CLI execute failed: {res.text}"
        data = res.json()
        output = data.get("output", "")
        assert "assigned" in output.lower() or "License" in output, f"Assignment failed: {output}"
        
        # Verify via REST API
        overview_res = self.session.get(f"{BASE_URL}/api/licenses/overview")
        overview = overview_res.json()
        site_entry = next((s for s in overview if s.get("site_id") == self.test_site_id), None)
        assert site_entry is not None, f"Site not found in overview"
        assert site_entry.get("has_license") == True, f"License not visible"
        assert site_entry.get("is_lifetime") == True, f"Not marked as lifetime: {site_entry}"
        print(f"Lifetime license verified: {site_entry}")
        
        # Cleanup
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
    
    def test_cli_license_remove_works(self):
        """CLI /license remove should remove the license"""
        # First assign a license
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license assign Standard monthly"
        })
        
        # Remove it
        res = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
        assert res.status_code == 200, f"CLI execute failed: {res.text}"
        data = res.json()
        output = data.get("output", "")
        assert "removed" in output.lower() or "No license" in output, f"Remove failed: {output}"
        print(f"CLI /license remove output:\n{output}")
        
        # Verify via REST API
        overview_res = self.session.get(f"{BASE_URL}/api/licenses/overview")
        overview = overview_res.json()
        site_entry = next((s for s in overview if s.get("site_id") == self.test_site_id), None)
        assert site_entry is not None, f"Site not found in overview"
        assert site_entry.get("has_license") == False, f"License still visible after remove: {site_entry}"
        print(f"License removed verified: {site_entry}")
    
    # ==================== REST API TESTS ====================
    
    def test_rest_api_licenses_overview(self):
        """GET /api/licenses/overview should return all sites with license status"""
        res = self.session.get(f"{BASE_URL}/api/licenses/overview")
        assert res.status_code == 200, f"Overview failed: {res.text}"
        data = res.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Overview returned {len(data)} sites")
        
        # Each entry should have required fields
        if len(data) > 0:
            entry = data[0]
            assert "site_id" in entry, f"Missing site_id: {entry}"
            assert "site_name" in entry, f"Missing site_name: {entry}"
            assert "has_license" in entry, f"Missing has_license: {entry}"
    
    def test_rest_api_licenses_assignments(self):
        """GET /api/licenses/assignments should list all assignments with enriched data"""
        res = self.session.get(f"{BASE_URL}/api/licenses/assignments")
        assert res.status_code == 200, f"Assignments failed: {res.text}"
        data = res.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Assignments returned {len(data)} entries")
        
        # Each assignment should have enriched fields
        for assignment in data:
            assert "main_site_id" in assignment, f"Missing main_site_id: {assignment}"
            assert "package_name" in assignment, f"Missing package_name: {assignment}"
            assert "site_name" in assignment, f"Missing site_name: {assignment}"
            # Should have status field (added by fix)
            assert "status" in assignment, f"Missing status: {assignment}"
            # Should have billing_cycle field (added by fix)
            assert "billing_cycle" in assignment, f"Missing billing_cycle: {assignment}"
    
    def test_rest_api_create_assignment_visible_to_cli(self):
        """POST /api/licenses/assignments should create assignment visible to CLI"""
        # First remove any existing license
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
        
        # Get a package ID
        pkg_res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        assert pkg_res.status_code == 200
        packages = pkg_res.json()
        assert len(packages) > 0, "No packages found"
        package_id = packages[0]["id"]
        
        # Create assignment via REST API
        create_res = self.session.post(f"{BASE_URL}/api/licenses/assignments", json={
            "main_site_id": self.test_site_id,
            "package_id": package_id,
            "billing_cycle": "monthly",
            "status": "active",
            "notes": "Created via REST API test"
        })
        assert create_res.status_code == 200, f"Create failed: {create_res.text}"
        
        # Verify via CLI
        cli_res = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license info"
        })
        assert cli_res.status_code == 200
        cli_data = cli_res.json()
        output = cli_data.get("output", "")
        
        # Should show license info, not "No license assigned"
        assert "License Information" in output or "Package:" in output, f"License not visible to CLI: {output}"
        print(f"REST-created license visible to CLI:\n{output}")
        
        # Cleanup
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
    
    # ==================== CROSS-COMPATIBILITY TESTS ====================
    
    def test_cross_compatibility_cli_to_rest(self):
        """License assigned via CLI should be visible in REST API overview"""
        # Remove existing
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
        
        # Assign via CLI
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license assign Standard monthly"
        })
        
        # Check REST API overview
        overview_res = self.session.get(f"{BASE_URL}/api/licenses/overview")
        assert overview_res.status_code == 200
        overview = overview_res.json()
        
        site_entry = next((s for s in overview if s.get("site_id") == self.test_site_id), None)
        assert site_entry is not None, "Site not found in overview"
        assert site_entry.get("has_license") == True, f"CLI license not visible in REST overview: {site_entry}"
        assert site_entry.get("license_package") == "Standard", f"Wrong package: {site_entry}"
        print(f"CLI->REST cross-compatibility verified: {site_entry}")
        
        # Cleanup
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
    
    def test_cross_compatibility_rest_to_cli(self):
        """License assigned via REST API should be visible in CLI /license info"""
        # Remove existing
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
        
        # Get package ID
        pkg_res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        packages = pkg_res.json()
        package_id = packages[0]["id"]
        
        # Assign via REST API
        self.session.post(f"{BASE_URL}/api/licenses/assignments", json={
            "main_site_id": self.test_site_id,
            "package_id": package_id,
            "billing_cycle": "yearly",
            "status": "active"
        })
        
        # Check CLI
        cli_res = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license info"
        })
        assert cli_res.status_code == 200
        output = cli_res.json().get("output", "")
        
        assert "License Information" in output or "Package:" in output, f"REST license not visible in CLI: {output}"
        assert "yearly" in output.lower(), f"Billing cycle not shown: {output}"
        print(f"REST->CLI cross-compatibility verified:\n{output}")
        
        # Cleanup
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })
    
    def test_site_info_shows_license_status(self):
        """CLI /site info should show license status correctly"""
        # Assign a license first
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license assign Standard monthly"
        })
        
        # Check /site info
        res = self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/site info"
        })
        assert res.status_code == 200
        output = res.json().get("output", "")
        
        # Should show license info
        assert "License:" in output, f"License not shown in site info: {output}"
        print(f"Site info with license:\n{output}")
        
        # Cleanup
        self.session.post(f"{BASE_URL}/api/cli/execute", json={
            "main_site_id": self.test_site_id,
            "command": "/license remove"
        })


class TestLicensePackages:
    """Test license packages API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        self.token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_packages_endpoint_returns_3_defaults(self):
        """GET /api/licenses/packages should return 3 default packages"""
        res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        assert res.status_code == 200
        packages = res.json()
        
        # Should have at least 3 default packages
        assert len(packages) >= 3, f"Expected at least 3 packages, got {len(packages)}"
        
        # Check for Standard, Technical, Server
        names = [p["name"] for p in packages]
        assert "Standard" in names, f"Standard package missing: {names}"
        assert "Technical" in names, f"Technical package missing: {names}"
        assert "Server" in names, f"Server package missing: {names}"
        print(f"Packages: {names}")
    
    def test_packages_have_required_fields(self):
        """Each package should have required fields"""
        res = self.session.get(f"{BASE_URL}/api/licenses/packages")
        packages = res.json()
        
        for pkg in packages:
            assert "id" in pkg, f"Missing id: {pkg}"
            assert "name" in pkg, f"Missing name: {pkg}"
            assert "slug" in pkg, f"Missing slug: {pkg}"
            assert "features" in pkg, f"Missing features: {pkg}"
            assert "monthly_price" in pkg, f"Missing monthly_price: {pkg}"
            assert "yearly_price" in pkg, f"Missing yearly_price: {pkg}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
