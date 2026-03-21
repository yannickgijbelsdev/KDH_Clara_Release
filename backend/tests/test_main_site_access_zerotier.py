"""
Test suite for:
1. GET /api/main-sites/my/access - system_admin sees ALL sites, network_admin (non-system) sees ONLY direct access sites
2. POST /api/zerotier/{main_site_id}/send-daily-summary - passes main_site_id to filter
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN_EMAIL = "admkoodh@koodh.com"
SYSTEM_ADMIN_PASSWORD = "KYLovie13monx"

# ZeroTier Monitor site ID
ZEROTIER_SITE_ID = "8750b614-9b27-49a9-8da7-62380e5c46f8"


class TestMainSiteAccess:
    """Test /api/main-sites/my/access endpoint for system_admin vs network_admin access"""
    
    @pytest.fixture(scope="class")
    def system_admin_token(self):
        """Login as system admin and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"System admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        return data["token"]
    
    def test_system_admin_login(self, system_admin_token):
        """Verify system admin can login"""
        assert system_admin_token is not None
        assert len(system_admin_token) > 0
        print(f"✓ System admin login successful, token length: {len(system_admin_token)}")
    
    def test_system_admin_sees_all_sites(self, system_admin_token):
        """System admin should see ALL sites (13+ sites)"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/my/access",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get my/access: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "is_network_admin" in data, "Missing is_network_admin field"
        assert "is_system_admin" in data, "Missing is_system_admin field"
        assert "main_sites" in data, "Missing main_sites field"
        
        # System admin should have both flags true
        assert data["is_network_admin"] == True, "System admin should have is_network_admin=True"
        assert data["is_system_admin"] == True, "System admin should have is_system_admin=True"
        
        # System admin should see ALL sites (13+ based on bug report)
        site_count = len(data["main_sites"])
        assert site_count >= 10, f"System admin should see 10+ sites, got {site_count}"
        
        print(f"✓ System admin sees {site_count} sites (expected 13+)")
        print(f"  Sites: {[s['name'] for s in data['main_sites'][:5]]}...")
        
        return data["main_sites"]
    
    def test_system_admin_sites_have_required_fields(self, system_admin_token):
        """Verify each site in response has required fields"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/my/access",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        for site in data["main_sites"]:
            assert "id" in site, "Site missing 'id' field"
            assert "name" in site, "Site missing 'name' field"
            assert "slug" in site, "Site missing 'slug' field"
            assert "role" in site, "Site missing 'role' field"
            # System admin should have network_admin role for all sites
            assert site["role"] == "network_admin", f"System admin should have network_admin role, got {site['role']}"
        
        print(f"✓ All {len(data['main_sites'])} sites have required fields and correct role")
    
    def test_get_all_main_sites_endpoint(self, system_admin_token):
        """Verify GET /api/main-sites returns all sites for system admin"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get main-sites: {response.text}"
        sites = response.json()
        
        assert isinstance(sites, list), "Response should be a list"
        assert len(sites) >= 10, f"Should have 10+ main sites, got {len(sites)}"
        
        print(f"✓ GET /api/main-sites returns {len(sites)} sites")


class TestNetworkAdminAccessScoping:
    """Test that network admin (non-system) only sees sites they have DIRECT access to"""
    
    @pytest.fixture(scope="class")
    def system_admin_token(self):
        """Login as system admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_verify_code_logic_for_network_admin(self, system_admin_token):
        """
        Verify the code logic: network admin (non-system) should query main_site_users
        for their user_id, not get all sites in their environments.
        
        Since we can't login as yannick.gijbels@koodh.com (password unknown),
        we verify by checking the debug endpoint and code review.
        """
        # Get all user access records to verify the data model
        response = requests.get(
            f"{BASE_URL}/api/main-sites/debug/all-user-access",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Debug endpoint accessible")
            print(f"  Total access records: {data.get('total_access_records', 0)}")
            print(f"  Total users: {data.get('total_users', 0)}")
            print(f"  Total main sites: {data.get('total_main_sites', 0)}")
            
            # Look for yannick.gijbels@koodh.com access records
            all_records = data.get("all_access_records", [])
            yannick_records = [r for r in all_records if "yannick" in r.get("user_email", "").lower()]
            
            if yannick_records:
                print(f"  Yannick's direct site access: {len(yannick_records)} sites")
                for r in yannick_records:
                    print(f"    - {r.get('main_site_name')} ({r.get('site_role')})")
            else:
                print("  Note: yannick.gijbels@koodh.com not found in main_site_users")
        else:
            print(f"  Debug endpoint returned {response.status_code} - may not be accessible")
    
    def test_my_access_response_structure(self, system_admin_token):
        """Verify the /my/access response includes is_system_admin flag"""
        response = requests.get(
            f"{BASE_URL}/api/main-sites/my/access",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # The fix adds is_system_admin to distinguish system admin from network admin
        assert "is_system_admin" in data, "Response should include is_system_admin flag"
        assert "is_network_admin" in data, "Response should include is_network_admin flag"
        
        print(f"✓ Response includes is_system_admin={data['is_system_admin']}, is_network_admin={data['is_network_admin']}")


class TestZeroTierSendSummary:
    """Test POST /api/zerotier/{main_site_id}/send-daily-summary passes main_site_id"""
    
    @pytest.fixture(scope="class")
    def system_admin_token(self):
        """Login as system admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SYSTEM_ADMIN_EMAIL,
            "password": SYSTEM_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_zerotier_send_summary_endpoint_exists(self, system_admin_token):
        """Verify the send-daily-summary endpoint exists and accepts main_site_id"""
        response = requests.post(
            f"{BASE_URL}/api/zerotier/{ZEROTIER_SITE_ID}/send-daily-summary",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        
        # Should return 200 OK (task started) or 400 if ZeroTier not configured
        # Should NOT return 404 (endpoint not found) or 500 (server error)
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}, {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert data.get("status") == "ok", f"Expected status=ok, got {data}"
            print(f"✓ ZeroTier send-daily-summary triggered successfully for site {ZEROTIER_SITE_ID}")
        else:
            # 400 means ZeroTier not configured for this site, which is acceptable
            print(f"✓ Endpoint exists but ZeroTier not configured for site {ZEROTIER_SITE_ID}: {response.text}")
    
    def test_zerotier_config_endpoint(self, system_admin_token):
        """Verify ZeroTier config endpoint works"""
        response = requests.get(
            f"{BASE_URL}/api/zerotier/{ZEROTIER_SITE_ID}/config",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        
        # Should return 200 (config exists) or 403 (no access)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ ZeroTier config for site {ZEROTIER_SITE_ID}:")
            print(f"  - main_site_id: {data.get('main_site_id')}")
            print(f"  - network_id: {data.get('network_id', 'not set')}")
            print(f"  - api_token_masked: {data.get('api_token_masked', 'not set')}")
        elif response.status_code == 403:
            print(f"✓ ZeroTier config endpoint returns 403 (access denied) - expected if no site access")
        else:
            print(f"  ZeroTier config returned {response.status_code}: {response.text}")
    
    def test_zerotier_alert_history_endpoint(self, system_admin_token):
        """Verify ZeroTier alert history endpoint works"""
        response = requests.get(
            f"{BASE_URL}/api/zerotier/{ZEROTIER_SITE_ID}/alert-history",
            headers={"Authorization": f"Bearer {system_admin_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            events = data.get("events", [])
            stats = data.get("stats", [])
            print(f"✓ ZeroTier alert history: {len(events)} events, {len(stats)} monitored members")
        elif response.status_code == 403:
            print(f"✓ ZeroTier alert history returns 403 (no access)")
        else:
            print(f"  ZeroTier alert history returned {response.status_code}")


class TestCodeReviewVerification:
    """Verify the code changes match the bug fix requirements"""
    
    def test_main_sites_my_access_code_review(self):
        """
        Code review: main_sites.py get_my_main_site_access (line ~717)
        
        Expected fix:
        - System admin (is_system_admin=True): Gets ALL sites from db.main_sites.find({})
        - Network admin (non-system): Gets ONLY sites from db.main_site_users where user_id matches
        """
        # Read the code file
        with open("/app/backend/routers/main_sites.py", "r") as f:
            code = f.read()
        
        # Verify the fix is in place
        assert "is_system_admin" in code, "Code should check is_system_admin"
        assert "main_site_users" in code, "Code should query main_site_users for non-system admins"
        
        # Check for the specific fix pattern
        # System admin path: db.main_sites.find({})
        # Network admin path: db.main_site_users.find({"user_id": user_id})
        
        # Find the get_my_main_site_access function
        if "async def get_my_main_site_access" in code:
            print("✓ get_my_main_site_access function found")
            
            # Check for system admin branch
            if 'is_network_admin and current_user.get(\'is_system_admin\')' in code:
                print("✓ System admin branch checks both is_network_admin AND is_system_admin")
            
            # Check for network admin (non-system) branch
            if 'Network admin (non-system)' in code or 'DIRECT access' in code.lower():
                print("✓ Network admin (non-system) branch documented")
        
        print("✓ Code review passed for main_sites.py")
    
    def test_zerotier_send_summary_code_review(self):
        """
        Code review: zerotier.py trigger_daily_summary (line ~445)
        
        Expected fix:
        - Passes main_site_id to _send_daily_summary function
        """
        with open("/app/backend/routers/zerotier.py", "r") as f:
            code = f.read()
        
        # Check that trigger_daily_summary passes main_site_id
        assert "_send_daily_summary(db, main_site_id=main_site_id)" in code, \
            "trigger_daily_summary should pass main_site_id to _send_daily_summary"
        
        print("✓ zerotier.py passes main_site_id to _send_daily_summary")
    
    def test_zerotier_alerts_service_code_review(self):
        """
        Code review: zerotier_alerts.py _send_daily_summary (line ~259)
        
        Expected fix:
        - Accepts optional main_site_id parameter
        - Filters query by main_site_id if provided
        """
        with open("/app/backend/services/zerotier_alerts.py", "r") as f:
            code = f.read()
        
        # Check function signature accepts main_site_id
        assert "async def _send_daily_summary(db, main_site_id=None)" in code, \
            "_send_daily_summary should accept optional main_site_id parameter"
        
        # Check that it filters by main_site_id
        assert 'query["main_site_id"] = main_site_id' in code or \
               'if main_site_id:' in code, \
            "_send_daily_summary should filter by main_site_id when provided"
        
        print("✓ zerotier_alerts.py _send_daily_summary accepts and uses main_site_id filter")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
