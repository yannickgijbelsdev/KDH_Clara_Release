"""Radioplayer auto-sync scheduler.

Periodically pushes Now Playing and Schedule data to Radioplayer.org,
similar to how the RDS scheduler refreshes metadata.

- Now Playing: every 60 seconds (checks if track changed)
- Schedule: every 30 minutes (pushes next 7 days of shows)
"""
import asyncio
import logging

from database import db

logger = logging.getLogger(__name__)


class RadioplayerScheduler:
    """Background scheduler for Radioplayer sync jobs."""

    def __init__(self):
        self.running = False
        self.np_interval = 60       # Check now-playing every 60 seconds
        self.schedule_interval = 1800  # Push schedule every 30 minutes
        self.np_task = None
        self.schedule_task = None
        self._last_np_track = None  # Track last pushed NP to avoid duplicates

    async def start(self):
        """Start the Radioplayer sync scheduler."""
        if self.running:
            logger.warning("Radioplayer scheduler is already running")
            return

        self.running = True
        self.np_task = asyncio.create_task(self._np_loop())
        self.schedule_task = asyncio.create_task(self._schedule_loop())
        logger.info("Radioplayer scheduler started (NP: 60s, Schedule: 30min)")

    async def stop(self):
        """Stop the Radioplayer sync scheduler."""
        if not self.running:
            return

        self.running = False
        for task in [self.np_task, self.schedule_task]:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        logger.info("Radioplayer scheduler stopped")

    async def _np_loop(self):
        """Now Playing sync loop — checks every 60s if the current track changed."""
        # Small initial delay to let the app boot
        await asyncio.sleep(10)

        while self.running:
            try:
                await self._sync_now_playing()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Radioplayer NP sync error: {e}")

            try:
                await asyncio.sleep(self.np_interval)
            except asyncio.CancelledError:
                break

    async def _schedule_loop(self):
        """Schedule sync loop — pushes every 30 minutes."""
        # Initial push after 30s
        await asyncio.sleep(30)

        while self.running:
            try:
                await self._sync_schedule()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Radioplayer schedule sync error: {e}")

            try:
                await asyncio.sleep(self.schedule_interval)
            except asyncio.CancelledError:
                break

    async def _sync_now_playing(self):
        """Check current stream metadata and push to Radioplayer if changed."""
        from services.radioplayer import get_radioplayer_config, push_now_playing

        config = await get_radioplayer_config()
        if not config.get("enabled") or not config.get("auto_np"):
            return

        # Get the latest stream metadata from the shoutcast cache
        latest = await db.rds_cache.find_one(
            {},
            {"_id": 0, "artist": 1, "title": 1, "updated_at": 1}
        )
        if not latest:
            return

        artist = latest.get("artist", "").strip()
        title = latest.get("title", "").strip()
        if not artist and not title:
            return

        track_key = f"{artist}|{title}"
        if track_key == self._last_np_track:
            return  # Same track, no need to push again

        # Push to Radioplayer
        try:
            result = await push_now_playing(artist, title, config)
            if result.get("success"):
                self._last_np_track = track_key
                logger.info(f"Radioplayer NP synced: {artist} - {title}")
            else:
                logger.warning(f"Radioplayer NP sync failed: {result.get('error', 'unknown')}")
        except Exception as e:
            logger.error(f"Radioplayer NP push error: {e}")

    async def _sync_schedule(self):
        """Push upcoming show schedule to Radioplayer."""
        from services.radioplayer import get_radioplayer_config, auto_push_schedule_for_grk

        config = await get_radioplayer_config()
        if not config.get("enabled") or not config.get("auto_schedule"):
            return

        try:
            await auto_push_schedule_for_grk()
            logger.info("Radioplayer schedule synced (next 7 days)")
        except Exception as e:
            logger.error(f"Radioplayer schedule push error: {e}")


# Global scheduler instance
radioplayer_scheduler = RadioplayerScheduler()
