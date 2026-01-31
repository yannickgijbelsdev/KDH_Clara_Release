"""WordPress Scheduler - Background worker for publishing scheduled posts.

This module provides a background scheduler that checks for posts scheduled 
for WordPress publication and publishes them at the scheduled time.
"""
import asyncio
import logging
from datetime import datetime, timezone
import httpx
import base64

from database import db

logger = logging.getLogger(__name__)

class WordPressScheduler:
    """Background scheduler for WordPress post publishing."""
    
    def __init__(self):
        self.running = False
        self.check_interval = 60  # Check every 60 seconds
        self.task = None
    
    async def start(self):
        """Start the background scheduler."""
        if self.running:
            logger.warning("WordPress scheduler is already running")
            return
        
        self.running = True
        self.task = asyncio.create_task(self._run_scheduler())
        logger.info("WordPress scheduler started")
    
    async def stop(self):
        """Stop the background scheduler."""
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("WordPress scheduler stopped")
    
    async def _run_scheduler(self):
        """Main scheduler loop."""
        while self.running:
            try:
                await self._check_and_publish_scheduled()
            except Exception as e:
                logger.error(f"Error in WordPress scheduler: {e}")
            
            await asyncio.sleep(self.check_interval)
    
    async def _check_and_publish_scheduled(self):
        """Check for scheduled posts that need to be published now."""
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # Find all scheduled publish records where the scheduled time has passed
        # and the post hasn't been published yet
        scheduled_records = await db.content_item_publishes.find({
            "sync_status": "scheduled",
            "wp_scheduled_date": {"$exists": True, "$ne": None}
        }).to_list(100)
        
        for record in scheduled_records:
            try:
                scheduled_date_str = record.get('wp_scheduled_date')
                if not scheduled_date_str:
                    continue
                
                # Parse the scheduled date
                # Handle both ISO format and WordPress datetime format
                try:
                    if 'T' in scheduled_date_str:
                        # ISO format: 2026-01-31T16:00:00
                        scheduled_date = datetime.fromisoformat(scheduled_date_str.replace('Z', '+00:00'))
                    else:
                        # WordPress format or similar
                        scheduled_date = datetime.fromisoformat(scheduled_date_str)
                except ValueError:
                    logger.warning(f"Could not parse scheduled date: {scheduled_date_str}")
                    continue
                
                # Make it timezone aware if not already
                if scheduled_date.tzinfo is None:
                    scheduled_date = scheduled_date.replace(tzinfo=timezone.utc)
                
                # Check if the scheduled time has passed
                if scheduled_date <= now:
                    logger.info(f"Publishing scheduled post: content_id={record.get('content_item_id')}, scheduled={scheduled_date_str}")
                    await self._publish_scheduled_post(record)
                    
            except Exception as e:
                logger.error(f"Error processing scheduled record {record.get('id')}: {e}")
    
    async def _publish_scheduled_post(self, publish_record: dict):
        """Actually publish a scheduled post to WordPress."""
        content_id = publish_record.get('content_item_id')
        site_id = publish_record.get('wordpress_site_id')
        wp_post_id = publish_record.get('wp_post_id')
        
        if not all([content_id, site_id, wp_post_id]):
            logger.warning(f"Missing required fields for scheduled publish: {publish_record.get('id')}")
            return
        
        # Get the WordPress site credentials
        site = await db.wordpress_sites.find_one({"id": site_id})
        if not site:
            logger.error(f"WordPress site not found: {site_id}")
            await self._update_publish_status(publish_record['id'], 'failed', "WordPress site not found")
            return
        
        if not site.get('is_active'):
            logger.warning(f"WordPress site is inactive: {site['name']}")
            await self._update_publish_status(publish_record['id'], 'failed', "WordPress site is inactive")
            return
        
        now = datetime.now(timezone.utc).isoformat()
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                auth_string = f"{site['username']}:{site['app_password']}"
                auth_bytes = base64.b64encode(auth_string.encode()).decode()
                headers = {
                    "Authorization": f"Basic {auth_bytes}",
                    "Content-Type": "application/json"
                }
                
                # Update the post status from 'future' to 'publish'
                post_type = publish_record.get('wp_post_type', 'post')
                endpoint = f"{site['wp_base_url']}/wp-json/wp/v2/{post_type}s/{wp_post_id}"
                
                # Change status to publish
                wp_data = {
                    "status": "publish"
                }
                
                response = await client.post(endpoint, headers=headers, json=wp_data)
                
                if response.status_code in [200, 201]:
                    wp_response = response.json()
                    
                    # Update the publish record
                    await db.content_item_publishes.update_one(
                        {"id": publish_record['id']},
                        {"$set": {
                            "sync_status": "synced",
                            "wp_status": "publish",
                            "wp_permalink": wp_response.get('link'),
                            "last_synced_at": now,
                            "updated_at": now,
                            "sync_error_message": None
                        }}
                    )
                    
                    logger.info(f"Successfully published scheduled post: {wp_response.get('link')}")
                else:
                    error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                    await self._update_publish_status(publish_record['id'], 'failed', error_msg)
                    logger.error(f"Failed to publish scheduled post: {error_msg}")
                    
        except Exception as e:
            error_msg = str(e)
            await self._update_publish_status(publish_record['id'], 'failed', error_msg)
            logger.error(f"Exception publishing scheduled post: {e}")
    
    async def _update_publish_status(self, record_id: str, status: str, error_message: str = None):
        """Update the sync status of a publish record."""
        now = datetime.now(timezone.utc).isoformat()
        await db.content_item_publishes.update_one(
            {"id": record_id},
            {"$set": {
                "sync_status": status,
                "sync_error_message": error_message,
                "last_synced_at": now,
                "updated_at": now
            }}
        )


# Global scheduler instance
wp_scheduler = WordPressScheduler()
