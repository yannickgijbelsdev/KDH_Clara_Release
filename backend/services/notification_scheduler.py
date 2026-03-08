"""Daily notification digest scheduler.

Runs once daily and sends summary emails to users who have opted
for 'daily' or 'both' notification mode.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from database import db
from services.email_service import send_email_with_config, build_daily_summary_html

logger = logging.getLogger(__name__)

_running = False
_task = None


async def send_daily_digest():
    """Gather yesterday's notification events and send summaries."""
    try:
        # Get SMTP config
        smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
        if not smtp_config or not smtp_config.get("password"):
            logger.debug("Daily digest: SMTP not configured, skipping")
            return

        # Get ALL role notification settings (per-site and global)
        all_settings = await db.notification_config.find(
            {"type": "role_notifications"},
            {"_id": 0}
        ).to_list(100)

        if not all_settings:
            logger.debug("Daily digest: No role settings configured, skipping")
            return

        # Get events from the last 24 hours
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        events = await db.notification_log.find(
            {"timestamp": {"$gte": cutoff}},
            {"_id": 0}
        ).sort("timestamp", -1).to_list(500)

        if not events:
            logger.info("Daily digest: No events in last 24 hours")
            return

        # Process each settings doc (per-site or global)
        emails_sent = 0
        notified_users = set()  # Avoid double notifications

        for settings_doc in all_settings:
            site_id = settings_doc.get("main_site_id", "global")
            roles_config = settings_doc.get("roles", {})

            # Find roles with daily or both mode
            daily_roles = {}
            for role_slug, role_cfg in roles_config.items():
                mode = role_cfg.get("mode", "daily")
                cats = role_cfg.get("categories", [])
                if mode in ("daily", "both") and cats:
                    daily_roles[role_slug] = cats

            if not daily_roles:
                continue

            # Filter events for this site
            if site_id and site_id != "global":
                site_events = [e for e in events if e.get("main_site_id") == site_id]
            else:
                site_events = events

            if not site_events:
                continue

            for role_slug, categories in daily_roles.items():
                role_events = [e for e in site_events if e.get("category") in categories]
                if not role_events:
                    continue

                # Find users with this role
                if site_id and site_id != "global":
                    accesses = await db.main_site_users.find(
                        {"main_site_id": site_id, "role": role_slug},
                        {"_id": 0, "user_id": 1}
                    ).to_list(500)
                    user_ids = list(set(a["user_id"] for a in accesses))
                else:
                    accesses = await db.main_site_users.find(
                        {"role": role_slug}, {"_id": 0, "user_id": 1}
                    ).to_list(500)
                    user_ids = list(set(a["user_id"] for a in accesses))

                if not user_ids:
                    if role_slug == "admin":
                        users = await db.users.find(
                            {"is_network_admin": True},
                            {"_id": 0, "email": 1, "name": 1}
                        ).to_list(100)
                    else:
                        continue
                else:
                    users = await db.users.find(
                        {"id": {"$in": user_ids}},
                        {"_id": 0, "email": 1, "name": 1}
                    ).to_list(500)

                html = build_daily_summary_html(role_events)
                subject = f"Clara Global Protect — Daily Summary ({len(role_events)} notifications)"

                for user in users:
                    user_key = f"{user['email']}:{role_slug}:{site_id}"
                    if user_key in notified_users:
                        continue
                    notified_users.add(user_key)
                    success = await send_email_with_config(
                        smtp_config, user["email"], subject, html
                    )
                    if success:
                        emails_sent += 1

        logger.info(f"Daily digest: Sent {emails_sent} summary emails")

        # Log the digest run
        await db.notification_log.insert_one({
            "category": "system",
            "event_type": "daily_digest_sent",
            "details": f"Sent {emails_sent} summary emails",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "emails_sent": [],
        })

    except Exception as e:
        logger.error(f"Daily digest error: {e}")


async def _scheduler_loop():
    """Run daily at 07:00 UTC (08:00 CET)."""
    global _running
    while _running:
        try:
            now = datetime.now(timezone.utc)
            # Calculate next 07:00 UTC
            target = now.replace(hour=7, minute=0, second=0, microsecond=0)
            if now >= target:
                target += timedelta(days=1)

            wait_seconds = (target - now).total_seconds()
            logger.info(f"Daily digest: Next run in {wait_seconds/3600:.1f} hours at {target.isoformat()}")

            await asyncio.sleep(wait_seconds)

            if _running:
                await send_daily_digest()

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Notification scheduler error: {e}")
            await asyncio.sleep(3600)


async def start_notification_scheduler():
    """Start the daily notification digest scheduler."""
    global _running, _task
    _running = True
    _task = asyncio.create_task(_scheduler_loop())
    logger.info("Notification digest scheduler started")


async def stop_notification_scheduler():
    """Stop the scheduler."""
    global _running, _task
    _running = False
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    logger.info("Notification digest scheduler stopped")
