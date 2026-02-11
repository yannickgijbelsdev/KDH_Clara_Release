"""
Test RDS Now Playing Source Feature
Tests that GRK's now-playing data is sourced from MFY when active show has rds_station='both'

Feature: When a radio show is designated for both 'MFY' and 'GRK' stations (rds_station='both'), 
the 'Now Playing' data for the GRK station's RDS output should be sourced from the MFY stream.
"""
import pytest
import requests
import os
from datetime import datetime, timezone
from pymongo import MongoClient

# Get environment variables
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

# Connect to MongoDB for test data setup
client = MongoClient(MONGO_URL)
db = client[DB_NAME]


class TestRDSNowPlayingSourceWithBothStation:
    """Test GRK now-playing returns MFY data when active show has rds_station='both'"""
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        """Create test show with rds_station='both' and test shoutcast cache"""
        now = datetime.now(timezone.utc).isoformat()
        
        # First, deactivate any existing active shows
        db.rds_cached_rundowns.update_many(
            {"is_active": True},
            {"$set": {"is_active": False}}
        )
        
        # Create test cached rundown with rds_station='both'
        test_show = {
            "show_id": "TEST_SHOW_BOTH_ID",
            "show_title": "TEST_Both_Stations_Show",
            "show_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "show_start_time": "00:00",
            "show_end_time": "23:59",
            "is_active": True,
            "rds_station": "both",
            "items": [],
            "cached_at": now
        }
        
        # Insert the test show
        db.rds_cached_rundowns.update_one(
            {"show_id": "TEST_SHOW_BOTH_ID"},
            {"$set": test_show},
            upsert=True
        )
        
        # Create distinct test data for MFY shoutcast cache
        mfy_cache = {
            "station": "mfy",
            "status": "success",
            "station_name": "Radio MFY",
            "song_title": "TEST_MFY_SONG - Artist MFY",
            "raw_song_title": "TEST_MFY_SONG - Artist MFY",
            "current_listeners": 100,
            "peak_listeners": 150,
            "stream_online": True,
            "cached_at": now,
            "updated_at": now
        }
        
        # Create distinct test data for GRK shoutcast cache
        grk_cache = {
            "station": "grk",
            "status": "success",
            "station_name": "Radio GRK",
            "song_title": "TEST_GRK_SONG - Artist GRK",
            "raw_song_title": "TEST_GRK_SONG - Artist GRK",
            "current_listeners": 50,
            "peak_listeners": 75,
            "stream_online": True,
            "cached_at": now,
            "updated_at": now
        }
        
        db.shoutcast_cache.update_one(
            {"station": "mfy"},
            {"$set": mfy_cache},
            upsert=True
        )
        
        db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": grk_cache},
            upsert=True
        )
        
        yield
        
        # Cleanup: Remove test show
        db.rds_cached_rundowns.delete_one({"show_id": "TEST_SHOW_BOTH_ID"})
    
    def test_grk_now_playing_returns_mfy_song_when_both(self):
        """Test /api/rds/grk/now-playing returns MFY's song when rds_station='both'"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/now-playing")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Should return GRK as station (requested station)
        assert data.get("station") == "grk", f"Station should be 'grk', got '{data.get('station')}'"
        
        # CRITICAL: source_station should be 'mfy' when show is on both stations
        assert "source_station" in data, "Response should have 'source_station' field"
        assert data.get("source_station") == "mfy", \
            f"source_station should be 'mfy' when active show has rds_station='both', got '{data.get('source_station')}'"
        
        # Should have note field explaining data is from MFY
        assert "note" in data, "Response should have 'note' field when data is from MFY"
        assert "MFY" in data.get("note", ""), \
            f"Note should mention MFY, got '{data.get('note')}'"
        
        # Song should be MFY's song, not GRK's
        assert data.get("song_title") == "TEST_MFY_SONG - Artist MFY", \
            f"Song title should be MFY's song, got '{data.get('song_title')}'"
        
        print(f"SUCCESS: GRK now-playing returned MFY data:")
        print(f"  - station: {data.get('station')}")
        print(f"  - source_station: {data.get('source_station')}")
        print(f"  - song_title: {data.get('song_title')}")
        print(f"  - note: {data.get('note')}")
    
    def test_grk_now_playing_txt_returns_mfy_song_when_both(self):
        """Test /api/rds/grk/now-playing.txt returns MFY's song title when rds_station='both'"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/now-playing.txt")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/plain" in response.headers.get("content-type", ""), \
            f"Expected text/plain, got {response.headers.get('content-type')}"
        
        # Song title should be MFY's song
        assert response.text == "TEST_MFY_SONG - Artist MFY", \
            f"Song title should be MFY's song, got '{response.text}'"
        
        print(f"SUCCESS: GRK now-playing.txt returned MFY song: '{response.text}'")
    
    def test_mfy_now_playing_returns_own_data_when_both(self):
        """Test /api/rds/mfy/now-playing returns MFY's own data (unaffected by 'both')"""
        response = requests.get(f"{BASE_URL}/api/rds/mfy/now-playing")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # MFY should always return its own data
        assert data.get("station") == "mfy", f"Station should be 'mfy', got '{data.get('station')}'"
        assert data.get("song_title") == "TEST_MFY_SONG - Artist MFY", \
            f"MFY song title should be its own, got '{data.get('song_title')}'"
        
        print(f"SUCCESS: MFY now-playing returned its own data: '{data.get('song_title')}'")


class TestRDSNowPlayingSourceWithGRKOnlyStation:
    """Test GRK now-playing returns its own data when active show has rds_station='grk'"""
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        """Create test show with rds_station='grk' and test shoutcast cache"""
        now = datetime.now(timezone.utc).isoformat()
        
        # First, deactivate any existing active shows
        db.rds_cached_rundowns.update_many(
            {"is_active": True},
            {"$set": {"is_active": False}}
        )
        
        # Create test cached rundown with rds_station='grk' (GRK only)
        test_show = {
            "show_id": "TEST_SHOW_GRK_ONLY_ID",
            "show_title": "TEST_GRK_Only_Show",
            "show_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "show_start_time": "00:00",
            "show_end_time": "23:59",
            "is_active": True,
            "rds_station": "grk",
            "items": [],
            "cached_at": now
        }
        
        # Insert the test show
        db.rds_cached_rundowns.update_one(
            {"show_id": "TEST_SHOW_GRK_ONLY_ID"},
            {"$set": test_show},
            upsert=True
        )
        
        # Create distinct test data for MFY shoutcast cache
        mfy_cache = {
            "station": "mfy",
            "status": "success",
            "station_name": "Radio MFY",
            "song_title": "TEST_MFY_SONG_2 - Artist MFY",
            "raw_song_title": "TEST_MFY_SONG_2 - Artist MFY",
            "current_listeners": 100,
            "peak_listeners": 150,
            "stream_online": True,
            "cached_at": now,
            "updated_at": now
        }
        
        # Create distinct test data for GRK shoutcast cache
        grk_cache = {
            "station": "grk",
            "status": "success",
            "station_name": "Radio GRK",
            "song_title": "TEST_GRK_SONG_2 - Artist GRK",
            "raw_song_title": "TEST_GRK_SONG_2 - Artist GRK",
            "current_listeners": 50,
            "peak_listeners": 75,
            "stream_online": True,
            "cached_at": now,
            "updated_at": now
        }
        
        db.shoutcast_cache.update_one(
            {"station": "mfy"},
            {"$set": mfy_cache},
            upsert=True
        )
        
        db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": grk_cache},
            upsert=True
        )
        
        yield
        
        # Cleanup: Remove test show
        db.rds_cached_rundowns.delete_one({"show_id": "TEST_SHOW_GRK_ONLY_ID"})
    
    def test_grk_now_playing_returns_own_data_when_grk_only(self):
        """Test /api/rds/grk/now-playing returns GRK's own data when rds_station='grk'"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/now-playing")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Station should be GRK
        assert data.get("station") == "grk", f"Station should be 'grk', got '{data.get('station')}'"
        
        # source_station should be 'grk' (its own data)
        assert "source_station" in data, "Response should have 'source_station' field"
        assert data.get("source_station") == "grk", \
            f"source_station should be 'grk' when show is GRK only, got '{data.get('source_station')}'"
        
        # Should NOT have note field when using own data
        assert "note" not in data or data.get("note") is None, \
            f"Should not have note when using own data, got '{data.get('note')}'"
        
        # Song should be GRK's song, not MFY's
        assert data.get("song_title") == "TEST_GRK_SONG_2 - Artist GRK", \
            f"Song title should be GRK's own song, got '{data.get('song_title')}'"
        
        print(f"SUCCESS: GRK now-playing returned its own data:")
        print(f"  - station: {data.get('station')}")
        print(f"  - source_station: {data.get('source_station')}")
        print(f"  - song_title: {data.get('song_title')}")
    
    def test_grk_now_playing_txt_returns_own_data_when_grk_only(self):
        """Test /api/rds/grk/now-playing.txt returns GRK's own song title when rds_station='grk'"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/now-playing.txt")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Song title should be GRK's song
        assert response.text == "TEST_GRK_SONG_2 - Artist GRK", \
            f"Song title should be GRK's song, got '{response.text}'"
        
        print(f"SUCCESS: GRK now-playing.txt returned GRK song: '{response.text}'")


class TestRDSNowPlayingSourceNoActiveShow:
    """Test GRK now-playing returns its own data when there's no active show"""
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        """Deactivate all shows and set up shoutcast cache"""
        now = datetime.now(timezone.utc).isoformat()
        
        # Deactivate all shows
        db.rds_cached_rundowns.update_many(
            {"is_active": True},
            {"$set": {"is_active": False}}
        )
        
        # Create distinct test data for shoutcast cache
        mfy_cache = {
            "station": "mfy",
            "status": "success",
            "station_name": "Radio MFY",
            "song_title": "TEST_MFY_SONG_3 - No Show MFY",
            "raw_song_title": "TEST_MFY_SONG_3 - No Show MFY",
            "current_listeners": 100,
            "stream_online": True,
            "cached_at": now,
            "updated_at": now
        }
        
        grk_cache = {
            "station": "grk",
            "status": "success",
            "station_name": "Radio GRK",
            "song_title": "TEST_GRK_SONG_3 - No Show GRK",
            "raw_song_title": "TEST_GRK_SONG_3 - No Show GRK",
            "current_listeners": 50,
            "stream_online": True,
            "cached_at": now,
            "updated_at": now
        }
        
        db.shoutcast_cache.update_one(
            {"station": "mfy"},
            {"$set": mfy_cache},
            upsert=True
        )
        
        db.shoutcast_cache.update_one(
            {"station": "grk"},
            {"$set": grk_cache},
            upsert=True
        )
        
        yield
    
    def test_grk_now_playing_returns_own_data_no_active_show(self):
        """Test /api/rds/grk/now-playing returns GRK's own data when no active show"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/now-playing")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Station should be GRK
        assert data.get("station") == "grk", f"Station should be 'grk', got '{data.get('station')}'"
        
        # source_station should be 'grk' (its own data) when no active show
        assert "source_station" in data, "Response should have 'source_station' field"
        assert data.get("source_station") == "grk", \
            f"source_station should be 'grk' when no active show, got '{data.get('source_station')}'"
        
        # Song should be GRK's song
        assert data.get("song_title") == "TEST_GRK_SONG_3 - No Show GRK", \
            f"Song title should be GRK's own song, got '{data.get('song_title')}'"
        
        print(f"SUCCESS: GRK now-playing returned its own data (no active show):")
        print(f"  - station: {data.get('station')}")
        print(f"  - source_station: {data.get('source_station')}")
        print(f"  - song_title: {data.get('song_title')}")


class TestRDSBuilderSchedulerSourceLogic:
    """Test the RDS Builder Scheduler's get_now_playing_station_for function logic"""
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        """Create test show for scheduler testing"""
        now = datetime.now(timezone.utc).isoformat()
        
        # Deactivate any existing active shows
        db.rds_cached_rundowns.update_many(
            {"is_active": True},
            {"$set": {"is_active": False}}
        )
        
        yield
        
        # Cleanup
        db.rds_cached_rundowns.delete_one({"show_id": "TEST_SCHEDULER_SHOW"})
    
    def test_scheduler_logic_with_both_station(self):
        """Verify the scheduler logic by checking get_now_playing_source_station function"""
        now = datetime.now(timezone.utc).isoformat()
        
        # Create active show with rds_station='both'
        test_show = {
            "show_id": "TEST_SCHEDULER_SHOW",
            "show_title": "Scheduler Test Show",
            "is_active": True,
            "rds_station": "both",
            "cached_at": now
        }
        db.rds_cached_rundowns.update_one(
            {"show_id": "TEST_SCHEDULER_SHOW"},
            {"$set": test_show},
            upsert=True
        )
        
        # Test the API endpoint which uses the same logic
        response = requests.get(f"{BASE_URL}/api/rds/grk/now-playing")
        data = response.json()
        
        # When rds_station='both', GRK should use MFY as source
        assert data.get("source_station") == "mfy", \
            f"With rds_station='both', GRK source should be 'mfy', got '{data.get('source_station')}'"
        
        print("SUCCESS: Scheduler logic correctly routes GRK to MFY when rds_station='both'")


class TestRDSNowPlayingResponseSchema:
    """Test the response schema of now-playing endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        """Setup test data"""
        now = datetime.now(timezone.utc).isoformat()
        
        # Deactivate all shows
        db.rds_cached_rundowns.update_many(
            {"is_active": True},
            {"$set": {"is_active": False}}
        )
        
        # Create active show with rds_station='both'
        test_show = {
            "show_id": "TEST_SCHEMA_SHOW",
            "show_title": "Schema Test Show",
            "is_active": True,
            "rds_station": "both",
            "cached_at": now
        }
        db.rds_cached_rundowns.update_one(
            {"show_id": "TEST_SCHEMA_SHOW"},
            {"$set": test_show},
            upsert=True
        )
        
        yield
        
        # Cleanup
        db.rds_cached_rundowns.delete_one({"show_id": "TEST_SCHEMA_SHOW"})
    
    def test_grk_response_has_required_fields(self):
        """Test GRK now-playing response has all required fields"""
        response = requests.get(f"{BASE_URL}/api/rds/grk/now-playing")
        data = response.json()
        
        # Required fields
        required_fields = ["station", "song_title", "source_station"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Conditional fields
        if data.get("source_station") != data.get("station"):
            assert "note" in data, "Should have 'note' when source differs from requested station"
        
        print(f"SUCCESS: Response has all required fields: {list(data.keys())}")
    
    def test_mfy_response_schema(self):
        """Test MFY now-playing response schema (should not have source_station routing)"""
        response = requests.get(f"{BASE_URL}/api/rds/mfy/now-playing")
        data = response.json()
        
        # MFY should always show its own data
        assert data.get("station") == "mfy", f"Station should be 'mfy'"
        assert "song_title" in data, "Should have song_title"
        
        print(f"SUCCESS: MFY response schema correct: station={data.get('station')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
