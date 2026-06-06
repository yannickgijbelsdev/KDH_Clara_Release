#!/usr/bin/env python3
"""
FULL Migration script for clara.koodh.com to multisite architecture.

This script will:
1. Create a default Main Site for your existing organization
2. Migrate ALL existing data to be linked to this Main Site
3. Link all existing users to the new Main Site with their current roles
4. Handle all collections including RDS, audio triggers, content, shows, etc.

IMPORTANT: Run this ONCE after deploying the multisite update to production.

Usage:
    python full_migration_to_multisite.py [--dry-run] [--main-site-name "Clara"] [--main-site-slug "clara"]
    
    --dry-run: Show what would be migrated without making changes
    --main-site-name: Name for the default main site (default: "Clara")
    --main-site-slug: URL slug for the main site (default: "clara")
"""
import asyncio
import argparse
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os

# ALL collections that need main_site_id migration
# These are grouped by category for clarity
COLLECTIONS_TO_MIGRATE = {
    # Shows & Calendar
    "shows": "Shows",
    "show_titles": "Show Titles",
    "show_series": "Show Series",
    "show_occurrences": "Show Occurrences",
    "rundowns": "Rundowns",
    "rundown_items": "Rundown Items (Legacy)",
    "rundown_items_v2": "Rundown Items V2",
    "rundown_item_media": "Rundown Item Media",
    "show_media": "Show Media",
    "show_assignments": "Show Assignments",
    "series_assignments": "Series Assignments",
    "occurrence_assignments": "Occurrence Assignments",
    "studios": "Studios",
    
    # Content
    "content_items": "Content Items",
    "content_item_publishes": "Content Publishes",
    "content_item_featured_images": "Content Featured Images",
    "content_audit_logs": "Content Audit Logs",
    "categories": "Categories",
    
    # Media
    "media_assets": "Media Assets",
    "media_folders": "Media Folders",
    "media_share_links": "Media Share Links",
    "folder_shares": "Folder Shares",
    
    # WordPress
    "wordpress_sites": "WordPress Sites",
    
    # Chat
    "chat_threads": "Chat Threads",
    "chat_messages": "Chat Messages",
    
    # RDS & Streaming
    "rds_outputs": "RDS Outputs",
    "rds_output_states": "RDS Output States",
    "rds_sequences": "RDS Sequences",
    "rds_scheduled_texts": "RDS Scheduled Texts",
    "rds_settings": "RDS Settings",
    "rds_cached_rundowns": "RDS Cached Rundowns",
    "rds_builder_output": "RDS Builder Output",
    
    # Audio Triggers
    "audio_triggers": "Audio Triggers",
    "audio_trigger_states": "Audio Trigger States",
    "audio_trigger_logs": "Audio Trigger Logs",
    
    # Sites (mini-sites/landing pages)
    "sites": "Sites (Landing Pages)",
    "site_users": "Site Users",
    "site_submissions": "Site Submissions",
}

# Collections that might have station-specific data (no team_id)
STATION_COLLECTIONS = [
    "rds_outputs",
    "rds_output_states",
    "rds_sequences",
    "rds_scheduled_texts",
    "rds_settings",
    "rds_cached_rundowns",
    "rds_builder_output",
    "audio_triggers",
    "audio_trigger_states",
    "audio_trigger_logs",
]


class MigrationStats:
    def __init__(self):
        self.created = 0
        self.updated = 0
        self.skipped = 0
        self.errors = []
    
    def __str__(self):
        return f"Created: {self.created}, Updated: {self.updated}, Skipped: {self.skipped}, Errors: {len(self.errors)}"


async def run_migration(dry_run: bool, main_site_name: str, main_site_slug: str):
    """Run the full migration process."""
    
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'radio_show_planner')
    
    if not mongo_url:
        print("ERROR: MONGO_URL environment variable not set!")
        print("Please set it to your MongoDB connection string.")
        return
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("=" * 70)
    print("CLARA.KOODH.COM - MULTISITE MIGRATION SCRIPT")
    print("=" * 70)
    print(f"Database: {db_name}")
    print(f"Main Site Name: {main_site_name}")
    print(f"Main Site Slug: {main_site_slug}")
    print(f"Dry Run: {dry_run}")
    print("=" * 70)
    
    stats = MigrationStats()
    
    # Step 1: Get existing team(s)
    print("\n[STEP 1] Finding existing teams...")
    teams = await db.teams.find({}, {"_id": 0}).to_list(100)
    
    if not teams:
        print("ERROR: No teams found in database!")
        return
    
    print(f"Found {len(teams)} team(s):")
    for team in teams:
        print(f"  - {team.get('name', 'Unknown')} (ID: {team.get('id', 'N/A')})")
    
    # We'll use the first team as the primary team
    primary_team = teams[0]
    primary_team_id = primary_team.get('id')
    print(f"\nUsing primary team: {primary_team.get('name')} (ID: {primary_team_id})")
    
    # Step 2: Check if main site already exists
    print("\n[STEP 2] Checking for existing main sites...")
    existing_main_site = await db.main_sites.find_one({"slug": main_site_slug})
    
    if existing_main_site:
        print(f"Main site '{main_site_name}' already exists (ID: {existing_main_site['id']})")
        main_site_id = existing_main_site['id']
    else:
        print(f"Creating new main site: {main_site_name}...")
        
        # Get the first admin user to be the owner
        admin_user = await db.users.find_one(
            {"team_id": primary_team_id, "role": "admin"},
            {"_id": 0}
        )
        
        if not admin_user:
            # Fallback to any user
            admin_user = await db.users.find_one(
                {"team_id": primary_team_id},
                {"_id": 0}
            )
        
        if not admin_user:
            print("ERROR: No users found in the primary team!")
            return
        
        main_site_id = str(uuid.uuid4())
        
        # All features enabled by default
        all_features = [
            "shows", "calendar", "show_management",
            "content_library", "media_library", "content_approval", "trash",
            "team_chat",
            "rds_settings", "rds_builder", "stream_monitor",
            "sites",
            "team_settings", "wordpress", "activity_logs"
        ]
        
        main_site_doc = {
            "id": main_site_id,
            "name": main_site_name,
            "slug": main_site_slug,
            "description": f"Migrated from {primary_team.get('name', 'existing')} team",
            "owner_id": admin_user['id'],
            "enabled_features": all_features,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        if not dry_run:
            await db.main_sites.insert_one(main_site_doc)
            stats.created += 1
            print(f"  ✅ Created main site: {main_site_name} (ID: {main_site_id})")
        else:
            print(f"  [DRY RUN] Would create main site: {main_site_name}")
    
    # Step 3: Link all existing users to the main site
    print("\n[STEP 3] Linking users to main site...")
    users = await db.users.find({"team_id": primary_team_id}, {"_id": 0}).to_list(500)
    print(f"Found {len(users)} users to link")
    
    for user in users:
        # Check if already linked
        existing_link = await db.main_site_users.find_one({
            "user_id": user['id'],
            "main_site_id": main_site_id
        })
        
        if existing_link:
            stats.skipped += 1
            continue
        
        # Map legacy roles to main site roles
        role = user.get('role', 'viewer')
        if role == 'admin':
            main_site_role = 'admin'
        elif role == 'editor':
            main_site_role = 'editor'
        elif role == 'presenter':
            main_site_role = 'presenter'
        else:
            main_site_role = 'viewer'
        
        link_doc = {
            "id": str(uuid.uuid4()),
            "main_site_id": main_site_id,
            "user_id": user['id'],
            "role": main_site_role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        if not dry_run:
            await db.main_site_users.insert_one(link_doc)
            stats.created += 1
        
        print(f"  {'[DRY RUN] Would link' if dry_run else '✅ Linked'}: {user.get('name', user.get('email'))} ({main_site_role})")
    
    # Step 4: Migrate all content collections
    print("\n[STEP 4] Migrating content collections...")
    
    for collection_name, description in COLLECTIONS_TO_MIGRATE.items():
        collection = db[collection_name]
        
        # Check if collection exists
        if collection_name not in await db.list_collection_names():
            print(f"  ⏭️  {description}: Collection does not exist, skipping")
            continue
        
        # Find documents without main_site_id
        query = {
            "$or": [
                {"main_site_id": {"$exists": False}},
                {"main_site_id": None},
                {"main_site_id": ""}
            ]
        }
        
        count = await collection.count_documents(query)
        
        if count == 0:
            print(f"  ✅ {description}: Already migrated (0 documents need update)")
            continue
        
        print(f"  📦 {description}: {count} documents to migrate...")
        
        if not dry_run:
            # For station-specific collections (no team_id), update all
            if collection_name in STATION_COLLECTIONS:
                result = await collection.update_many(
                    query,
                    {"$set": {"main_site_id": main_site_id}}
                )
            else:
                # For team-based collections, only update matching team_id
                result = await collection.update_many(
                    {
                        "$and": [
                            {"team_id": primary_team_id},
                            query
                        ]
                    },
                    {"$set": {"main_site_id": main_site_id}}
                )
                
                # Also try to update documents without team_id (legacy data)
                result2 = await collection.update_many(
                    {
                        "$and": [
                            {"team_id": {"$exists": False}},
                            query
                        ]
                    },
                    {"$set": {"main_site_id": main_site_id}}
                )
                
                result.modified_count += result2.modified_count
            
            stats.updated += result.modified_count
            print(f"     ✅ Updated {result.modified_count} documents")
        else:
            print(f"     [DRY RUN] Would update {count} documents")
    
    # Step 5: Summary
    print("\n" + "=" * 70)
    print("MIGRATION SUMMARY")
    print("=" * 70)
    print(f"Main Site: {main_site_name} (/{main_site_slug})")
    print(f"Main Site ID: {main_site_id}")
    print(f"\nStatistics: {stats}")
    
    if stats.errors:
        print("\nErrors encountered:")
        for error in stats.errors:
            print(f"  ❌ {error}")
    
    if dry_run:
        print("\n⚠️  This was a DRY RUN - no changes were made!")
        print("Run without --dry-run to apply the migration.")
    else:
        print("\n✅ Migration complete!")
        print("\nNext steps:")
        print(f"1. Access your main site at: https://clara.koodh.com/{main_site_slug}")
        print("2. Log in with a network admin account to manage main sites")
        print("3. Check that all your data appears correctly")
    
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="Migrate clara.koodh.com to multisite architecture")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be migrated without making changes")
    parser.add_argument("--main-site-name", default="Radiogroep", help="Name for the main site (default: Radiogroep)")
    parser.add_argument("--main-site-slug", default="radiogroep", help="URL slug for the main site (default: radiogroep)")
    
    args = parser.parse_args()
    
    asyncio.run(run_migration(
        dry_run=args.dry_run,
        main_site_name=args.main_site_name,
        main_site_slug=args.main_site_slug
    ))


if __name__ == "__main__":
    main()
