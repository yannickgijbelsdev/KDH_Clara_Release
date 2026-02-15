#!/usr/bin/env python3
"""
Pre-migration check script for clara.koodh.com.

This script analyzes your database and shows:
1. What data exists in each collection
2. What needs to be migrated
3. Potential issues or conflicts

Run this BEFORE running the full migration script.

Usage:
    python check_migration_status.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# All collections to check
ALL_COLLECTIONS = [
    # Core
    "teams", "users", "main_sites", "main_site_users",
    
    # Shows
    "shows", "show_titles", "show_series", "show_occurrences",
    "rundowns", "rundown_items", "rundown_items_v2",
    "rundown_item_media", "show_media",
    "show_assignments", "series_assignments", "occurrence_assignments",
    "studios",
    
    # Content
    "content_items", "content_item_publishes", "content_item_featured_images",
    "content_audit_logs", "categories",
    
    # Media
    "media_assets", "media_folders", "media_share_links", "folder_shares",
    
    # WordPress
    "wordpress_sites",
    
    # Chat
    "chat_threads", "chat_messages",
    
    # RDS
    "rds_outputs", "rds_output_states", "rds_sequences",
    "rds_scheduled_texts", "rds_settings", "rds_cached_rundowns",
    "rds_builder_output",
    
    # Audio
    "audio_triggers", "audio_trigger_states", "audio_trigger_logs",
    
    # Sites
    "sites", "site_users", "site_submissions",
]


async def check_migration_status():
    """Check the current state of the database."""
    
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'radio_show_planner')
    
    if not mongo_url:
        print("ERROR: MONGO_URL environment variable not set!")
        return
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("=" * 80)
    print("CLARA.KOODH.COM - PRE-MIGRATION CHECK")
    print("=" * 80)
    print(f"Database: {db_name}")
    print("=" * 80)
    
    # Check teams
    print("\n📊 TEAMS")
    print("-" * 40)
    teams = await db.teams.find({}, {"_id": 0}).to_list(100)
    if teams:
        for team in teams:
            user_count = await db.users.count_documents({"team_id": team.get('id')})
            print(f"  • {team.get('name', 'Unknown')}")
            print(f"    ID: {team.get('id')}")
            print(f"    Users: {user_count}")
            print(f"    Created: {team.get('created_at', 'Unknown')}")
    else:
        print("  ⚠️  No teams found!")
    
    # Check main sites
    print("\n📊 MAIN SITES (Multisite)")
    print("-" * 40)
    main_sites = await db.main_sites.find({}, {"_id": 0}).to_list(100)
    if main_sites:
        print(f"  Found {len(main_sites)} main site(s):")
        for ms in main_sites:
            user_count = await db.main_site_users.count_documents({"main_site_id": ms.get('id')})
            print(f"  • {ms.get('name')} (/{ms.get('slug')})")
            print(f"    ID: {ms.get('id')}")
            print(f"    Users: {user_count}")
            print(f"    Features: {len(ms.get('enabled_features', []))}")
    else:
        print("  ⚠️  No main sites exist yet - migration needed!")
    
    # Check collections
    print("\n📊 COLLECTION STATISTICS")
    print("-" * 80)
    print(f"{'Collection':<35} {'Total':>10} {'Has main_site_id':>18} {'Needs Migration':>18}")
    print("-" * 80)
    
    total_docs = 0
    total_needs_migration = 0
    
    for coll_name in ALL_COLLECTIONS:
        if coll_name not in await db.list_collection_names():
            continue
        
        collection = db[coll_name]
        
        total = await collection.count_documents({})
        if total == 0:
            continue
        
        has_main_site = await collection.count_documents({
            "main_site_id": {"$exists": True, "$ne": None, "$ne": ""}
        })
        
        needs_migration = total - has_main_site
        
        total_docs += total
        total_needs_migration += needs_migration
        
        status = "✅" if needs_migration == 0 else "⚠️"
        
        print(f"{status} {coll_name:<33} {total:>10} {has_main_site:>18} {needs_migration:>18}")
    
    print("-" * 80)
    print(f"{'TOTAL':<35} {total_docs:>10} {total_docs - total_needs_migration:>18} {total_needs_migration:>18}")
    
    # Sample data check
    print("\n📊 SAMPLE DATA CHECK")
    print("-" * 40)
    
    # Shows
    show_count = await db.shows.count_documents({})
    if show_count:
        sample_show = await db.shows.find_one({}, {"_id": 0, "title": 1, "date": 1})
        print(f"  Shows: {show_count} (sample: '{sample_show.get('title', 'N/A')}')")
    
    # Content
    content_count = await db.content_items.count_documents({})
    if content_count:
        sample_content = await db.content_items.find_one({}, {"_id": 0, "title": 1})
        print(f"  Content items: {content_count} (sample: '{sample_content.get('title', 'N/A')}')")
    
    # Media
    media_count = await db.media_assets.count_documents({})
    print(f"  Media assets: {media_count}")
    
    # RDS
    rds_count = await db.rds_outputs.count_documents({})
    print(f"  RDS outputs: {rds_count}")
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    if not main_sites:
        print("⚠️  STATUS: Migration REQUIRED")
        print(f"   - {total_needs_migration} documents need main_site_id")
        print(f"   - No main sites exist yet")
        print("\n   Run: python full_migration_to_multisite.py --dry-run")
        print("   Then: python full_migration_to_multisite.py")
    elif total_needs_migration > 0:
        print("⚠️  STATUS: Partial migration needed")
        print(f"   - {total_needs_migration} documents still need main_site_id")
        print("\n   Run: python full_migration_to_multisite.py")
    else:
        print("✅ STATUS: Already migrated!")
        print("   All documents have main_site_id assigned.")
    
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(check_migration_status())
