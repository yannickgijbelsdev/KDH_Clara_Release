import requests
import sys
import json
from datetime import datetime, timedelta

class RadioShowAPITester:
    def __init__(self, base_url="https://showprep-2.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data
        self.test_user = {
            "email": "test@radio.com",
            "password": "testpass123",
            "name": "Test User"
        }
        
        self.test_show = {
            "title": "Morning Show Test",
            "description": "Test radio show for API testing",
            "date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "start_time": "06:00",
            "end_time": "10:00",
            "status": "draft"
        }
        
        self.test_rundown_items = [
            {
                "type": "music",
                "title": "Opening Theme Song",
                "notes": "Play at full volume",
                "duration": "03:30"
            },
            {
                "type": "talk",
                "title": "Morning News",
                "notes": "Local and national news",
                "duration": "10:00"
            },
            {
                "type": "ad",
                "title": "Commercial Break 1",
                "notes": "Local sponsors",
                "duration": "02:00"
            }
        ]

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            status = "✅ PASS"
        else:
            status = "❌ FAIL"
        
        result = {
            "test": name,
            "status": "PASS" if success else "FAIL",
            "details": details
        }
        self.test_results.append(result)
        print(f"{status} - {name}: {details}")

    def make_request(self, method, endpoint, data=None, expected_status=200):
        """Make HTTP request with proper headers"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            
            success = response.status_code == expected_status
            
            try:
                response_data = response.json() if response.content else {}
            except:
                response_data = {"raw_response": response.text}
            
            return success, response.status_code, response_data
            
        except requests.exceptions.RequestException as e:
            return False, 0, {"error": str(e)}

    def test_health_check(self):
        """Test API health endpoints"""
        print("\n🔍 Testing Health Endpoints...")
        
        # Test root endpoint
        success, status, data = self.make_request('GET', '', expected_status=200)
        self.log_test("Root endpoint", success, f"Status: {status}")
        
        # Test health endpoint
        success, status, data = self.make_request('GET', 'health', expected_status=200)
        self.log_test("Health endpoint", success, f"Status: {status}")

    def test_user_registration(self):
        """Test user registration"""
        print("\n🔍 Testing User Registration...")
        
        success, status, data = self.make_request(
            'POST', 'auth/register', 
            data=self.test_user, 
            expected_status=201
        )
        
        if success and 'token' in data:
            self.token = data['token']
            self.user_id = data['user']['id']
            self.log_test("User registration", True, f"User ID: {self.user_id}")
        else:
            self.log_test("User registration", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_user_login(self):
        """Test user login"""
        print("\n🔍 Testing User Login...")
        
        login_data = {
            "email": self.test_user["email"],
            "password": self.test_user["password"]
        }
        
        success, status, data = self.make_request(
            'POST', 'auth/login', 
            data=login_data, 
            expected_status=200
        )
        
        if success and 'token' in data:
            self.token = data['token']
            self.user_id = data['user']['id']
            self.log_test("User login", True, f"Token received")
        else:
            self.log_test("User login", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_get_user_profile(self):
        """Test get current user profile"""
        print("\n🔍 Testing User Profile...")
        
        success, status, data = self.make_request('GET', 'auth/me', expected_status=200)
        
        if success and data.get('email') == self.test_user['email']:
            self.log_test("Get user profile", True, f"Email: {data['email']}")
        else:
            self.log_test("Get user profile", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_create_show(self):
        """Test creating a show"""
        print("\n🔍 Testing Show Creation...")
        
        success, status, data = self.make_request(
            'POST', 'shows', 
            data=self.test_show, 
            expected_status=201
        )
        
        if success and 'id' in data:
            self.show_id = data['id']
            self.log_test("Create show", True, f"Show ID: {self.show_id}")
        else:
            self.log_test("Create show", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_get_shows(self):
        """Test getting shows list"""
        print("\n🔍 Testing Get Shows...")
        
        success, status, data = self.make_request('GET', 'shows', expected_status=200)
        
        if success and isinstance(data, list):
            self.log_test("Get shows", True, f"Found {len(data)} shows")
        else:
            self.log_test("Get shows", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_filter_shows(self):
        """Test filtering shows by status"""
        print("\n🔍 Testing Filter Shows...")
        
        success, status, data = self.make_request('GET', 'shows?status=draft', expected_status=200)
        
        if success and isinstance(data, list):
            draft_shows = [show for show in data if show.get('status') == 'draft']
            self.log_test("Filter shows by status", True, f"Found {len(draft_shows)} draft shows")
        else:
            self.log_test("Filter shows by status", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_get_show_detail(self):
        """Test getting show details"""
        print("\n🔍 Testing Get Show Detail...")
        
        if not hasattr(self, 'show_id'):
            self.log_test("Get show detail", False, "No show ID available")
            return False
        
        success, status, data = self.make_request(
            'GET', f'shows/{self.show_id}', 
            expected_status=200
        )
        
        if success and data.get('id') == self.show_id:
            self.log_test("Get show detail", True, f"Title: {data['title']}")
        else:
            self.log_test("Get show detail", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_update_show(self):
        """Test updating a show"""
        print("\n🔍 Testing Update Show...")
        
        if not hasattr(self, 'show_id'):
            self.log_test("Update show", False, "No show ID available")
            return False
        
        update_data = {
            "title": "Updated Morning Show Test",
            "status": "scheduled"
        }
        
        success, status, data = self.make_request(
            'PUT', f'shows/{self.show_id}', 
            data=update_data, 
            expected_status=200
        )
        
        if success and data.get('title') == update_data['title']:
            self.log_test("Update show", True, f"Updated title: {data['title']}")
        else:
            self.log_test("Update show", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_create_rundown_items(self):
        """Test creating rundown items"""
        print("\n🔍 Testing Create Rundown Items...")
        
        if not hasattr(self, 'show_id'):
            self.log_test("Create rundown items", False, "No show ID available")
            return False
        
        self.rundown_item_ids = []
        
        for i, item_data in enumerate(self.test_rundown_items):
            success, status, data = self.make_request(
                'POST', f'shows/{self.show_id}/rundown', 
                data=item_data, 
                expected_status=201
            )
            
            if success and 'id' in data:
                self.rundown_item_ids.append(data['id'])
                self.log_test(f"Create rundown item {i+1}", True, f"Item: {data['title']}")
            else:
                self.log_test(f"Create rundown item {i+1}", False, f"Status: {status}, Data: {data}")
        
        return len(self.rundown_item_ids) == len(self.test_rundown_items)

    def test_get_rundown(self):
        """Test getting rundown items"""
        print("\n🔍 Testing Get Rundown...")
        
        if not hasattr(self, 'show_id'):
            self.log_test("Get rundown", False, "No show ID available")
            return False
        
        success, status, data = self.make_request(
            'GET', f'shows/{self.show_id}/rundown', 
            expected_status=200
        )
        
        if success and isinstance(data, list):
            self.log_test("Get rundown", True, f"Found {len(data)} rundown items")
        else:
            self.log_test("Get rundown", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_update_rundown_item(self):
        """Test updating a rundown item"""
        print("\n🔍 Testing Update Rundown Item...")
        
        if not hasattr(self, 'show_id') or not hasattr(self, 'rundown_item_ids') or not self.rundown_item_ids:
            self.log_test("Update rundown item", False, "No show ID or rundown items available")
            return False
        
        item_id = self.rundown_item_ids[0]
        update_data = {
            "title": "Updated Opening Theme Song",
            "duration": "04:00"
        }
        
        success, status, data = self.make_request(
            'PUT', f'shows/{self.show_id}/rundown/{item_id}', 
            data=update_data, 
            expected_status=200
        )
        
        if success and data.get('title') == update_data['title']:
            self.log_test("Update rundown item", True, f"Updated title: {data['title']}")
        else:
            self.log_test("Update rundown item", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_reorder_rundown(self):
        """Test reordering rundown items"""
        print("\n🔍 Testing Reorder Rundown...")
        
        if not hasattr(self, 'show_id') or not hasattr(self, 'rundown_item_ids') or len(self.rundown_item_ids) < 2:
            self.log_test("Reorder rundown", False, "Not enough rundown items to reorder")
            return False
        
        # Reverse the order
        reorder_data = {
            "item_ids": list(reversed(self.rundown_item_ids))
        }
        
        success, status, data = self.make_request(
            'PUT', f'shows/{self.show_id}/rundown/reorder', 
            data=reorder_data, 
            expected_status=200
        )
        
        if success and isinstance(data, list) and len(data) == len(self.rundown_item_ids):
            self.log_test("Reorder rundown", True, f"Reordered {len(data)} items")
        else:
            self.log_test("Reorder rundown", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_delete_rundown_item(self):
        """Test deleting a rundown item"""
        print("\n🔍 Testing Delete Rundown Item...")
        
        if not hasattr(self, 'show_id') or not hasattr(self, 'rundown_item_ids') or not self.rundown_item_ids:
            self.log_test("Delete rundown item", False, "No rundown items available")
            return False
        
        item_id = self.rundown_item_ids[-1]  # Delete the last item
        
        success, status, data = self.make_request(
            'DELETE', f'shows/{self.show_id}/rundown/{item_id}', 
            expected_status=204
        )
        
        if success:
            self.log_test("Delete rundown item", True, f"Deleted item: {item_id}")
            self.rundown_item_ids.remove(item_id)
        else:
            self.log_test("Delete rundown item", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_delete_show(self):
        """Test deleting a show"""
        print("\n🔍 Testing Delete Show...")
        
        if not hasattr(self, 'show_id'):
            self.log_test("Delete show", False, "No show ID available")
            return False
        
        success, status, data = self.make_request(
            'DELETE', f'shows/{self.show_id}', 
            expected_status=204
        )
        
        if success:
            self.log_test("Delete show", True, f"Deleted show: {self.show_id}")
        else:
            self.log_test("Delete show", False, f"Status: {status}, Data: {data}")
        
        return success

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Radio Show API Tests...")
        print(f"Base URL: {self.base_url}")
        
        # Health checks
        self.test_health_check()
        
        # Authentication tests
        if self.test_user_registration():
            self.test_get_user_profile()
        
        # If registration fails, try login
        if not self.token:
            self.test_user_login()
        
        # Show management tests
        if self.token:
            if self.test_create_show():
                self.test_get_shows()
                self.test_filter_shows()
                self.test_get_show_detail()
                self.test_update_show()
                
                # Rundown tests
                if self.test_create_rundown_items():
                    self.test_get_rundown()
                    self.test_update_rundown_item()
                    self.test_reorder_rundown()
                    self.test_delete_rundown_item()
                
                # Cleanup
                self.test_delete_show()
        
        # Print summary
        print(f"\n📊 Test Summary:")
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        return self.tests_passed, self.tests_run, self.test_results

def main():
    tester = RadioShowAPITester()
    passed, total, results = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump({
            'summary': {
                'tests_passed': passed,
                'tests_total': total,
                'success_rate': f"{(passed/total)*100:.1f}%"
            },
            'results': results
        }, f, indent=2)
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())