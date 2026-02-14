"""
Migration script to add main_site_id to existing content.

This script migrates existing data to the multisite architecture by:
1. Finding the first/default main_site for each team
2. Adding main_site_id to all content that doesn't have it

Run this script once after deploying the multisite update.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# Collections that need main_site_id migration
CONTENT_COLLECTIONS = [
    'shows',
    'show_titles',
    'studios',
    'media_assets',
    'content_items',
    'categories',
    'series'
]


async def migrate_content_to_main_sites():
    client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
    db = client[os.environ.get('DB_NAME', 'radio_show_planner')]
    
    print("Starting multisite content migration...")
    
    # Get all main_sites grouped by their owner's team_id
    main_sites = await db.main_sites.find({}, {'_id': 0}).to_list(100)
    print(f"Found {len(main_sites)} main sites")
    
    if not main_sites:
        print("No main sites found. Creating default main site from existing teams...")
        # If no main sites exist yet, we need to create them from existing teams
        # This handles the case where the migration runs before any main sites are created
        return
    
    # Build a map of team_id -> first main_site_id
    # Assume the first main_site for a team is the "default" one
    team_to_main_site = {}
    
    # Get owner info to find team_id for each main_site
    for ms in main_sites:
        owner = await db.users.find_one({'id': ms['owner_id']}, {'_id': 0, 'team_id': 1})
        if owner and owner.get('team_id'):
            team_id = owner['team_id']
            if team_id not in team_to_main_site:
                team_to_main_site[team_id] = ms['id']
                print(f"Team {team_id} -> Main Site {ms['name']} ({ms['id'][:8]}...)")
    
    # Migrate each collection
    for collection_name in CONTENT_COLLECTIONS:
        collection = db[collection_name]
        
        # Find documents without main_site_id
        query = {
            '$or': [
                {'main_site_id': {'$exists': False}},
                {'main_site_id': None}
            ]
        }
        
        count_before = await collection.count_documents(query)
        if count_before == 0:
            print(f"  {collection_name}: No documents to migrate")
            continue
        
        print(f"  {collection_name}: Found {count_before} documents to migrate")
        
        # Update documents based on their team_id
        migrated = 0
        for team_id, main_site_id in team_to_main_site.items():
            result = await collection.update_many(
                {
                    'team_id': team_id,
                    '$or': [
                        {'main_site_id': {'$exists': False}},
                        {'main_site_id': None}
                    ]
                },
                {'$set': {'main_site_id': main_site_id}}
            )
            migrated += result.modified_count
        
        print(f"  {collection_name}: Migrated {migrated} documents")
    
    print("\nMigration complete!")
    print("\nIMPORTANT: Documents with unknown team_ids were not migrated.")
    print("You may need to manually assign main_site_id to orphaned documents.")


if __name__ == "__main__":
    asyncio.run(migrate_content_to_main_sites())
