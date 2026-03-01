"""Daily backup scheduler — runs automatic backups every 24 hours at 03:00 UTC."""
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_task = None


async def _backup_loop():
    """Run daily backup at ~03:00 UTC, then sleep 24h."""
    from services.backup_service import run_daily_backup
    # Wait 60s after startup to let everything initialize
    await asyncio.sleep(60)
    while True:
        try:
            now = datetime.now(timezone.utc)
            # Calculate seconds until next 03:00 UTC
            target_hour = 3
            if now.hour < target_hour:
                wait_hours = target_hour - now.hour
            else:
                wait_hours = 24 - now.hour + target_hour
            wait_seconds = wait_hours * 3600 - now.minute * 60 - now.second
            if wait_seconds < 300:
                wait_seconds += 86400  # Skip to next day if within 5 min

            logger.info(f"Next daily backup in {wait_seconds // 3600}h {(wait_seconds % 3600) // 60}m")
            await asyncio.sleep(wait_seconds)

            logger.info("Starting daily automatic backup...")
            results = await run_daily_backup()
            for r in results:
                logger.info(f"  {r['site']}: {r['status']}")

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Daily backup error: {e}")
            await asyncio.sleep(3600)  # Retry in 1 hour on error


async def start_backup_scheduler():
    """Start the background backup scheduler."""
    global _task
    _task = asyncio.create_task(_backup_loop())


async def stop_backup_scheduler():
    """Stop the backup scheduler."""
    global _task
    if _task:
        _task.cancel()
        _task = None
