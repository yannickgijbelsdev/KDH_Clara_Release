"""ZeroTier client alert scheduler — checks monitored clients every minute."""
import asyncio
import logging
import httpx
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

ZT_API_BASE = "https://api.zerotier.com/api/v1"

_task = None


async def _check_alerts(db):
    """Check all monitored ZeroTier clients and send alerts on status change."""
    from services.email_service import send_email_with_config, build_notification_html, _get_branding_info

    # Get all sites with ZeroTier config
    configs = await db.zerotier_config.find(
        {"api_token": {"$exists": True, "$ne": ""}},
        {"_id": 0}
    ).to_list(100)

    if not configs:
        return

    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        return

    branding = await _get_branding_info()

    for config in configs:
        main_site_id = config.get("main_site_id")
        api_token = config.get("api_token")
        network_id = config.get("network_id")
        if not api_token or not network_id:
            continue

        # Get alert settings for this site
        alerts = await db.zerotier_alerts.find(
            {"main_site_id": main_site_id, "enabled": True},
            {"_id": 0}
        ).to_list(500)

        if not alerts:
            continue

        monitored_ids = {a["member_id"] for a in alerts}

        # Fetch current members from ZeroTier API
        try:
            headers = {"Authorization": f"token {api_token}"}
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{ZT_API_BASE}/network/{network_id}/member", headers=headers)
            if resp.status_code != 200:
                logger.warning(f"ZeroTier API error for site {main_site_id}: {resp.status_code}")
                continue
            members_raw = resp.json()
        except Exception as e:
            logger.warning(f"ZeroTier API request failed for site {main_site_id}: {e}")
            continue

        now_ts = datetime.now(timezone.utc).timestamp() * 1000

        # Build current status map
        status_map = {}
        name_map = {}
        for m in members_raw:
            node_id = m.get("nodeId") or m.get("id", "")
            if node_id not in monitored_ids:
                continue
            last_seen = m.get("lastSeen", 0) or 0
            is_online = (now_ts - last_seen) < 300_000 if last_seen > 0 else False
            status_map[node_id] = "online" if is_online else "offline"
            name_map[node_id] = m.get("name") or m.get("description") or node_id

        # Get site name
        site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "name": 1})
        site_name = (site or {}).get("name", "Unknown Site")

        # Check for status changes
        for alert in alerts:
            member_id = alert["member_id"]
            current_status = status_map.get(member_id)
            if current_status is None:
                continue

            last_status = alert.get("last_known_status")
            member_name = name_map.get(member_id, member_id)

            if last_status and current_status != last_status:
                # Status changed! Send notification
                recipients = alert.get("recipients", [])
                if not recipients:
                    continue

                is_offline = current_status == "offline"
                event_type = f"ZeroTier Client {'Offline' if is_offline else 'Back Online'}"
                details = (
                    f"Client '{member_name}' ({member_id}) on {site_name} is now "
                    f"{'OFFLINE' if is_offline else 'back ONLINE'}."
                )

                html = build_notification_html(
                    event_type, "system", details, site_name,
                    brand_name=branding["brand_name"],
                    brand_logo_url=branding["brand_logo_url"],
                )

                subject = f"Clara Global Protect - {member_name} {'OFFLINE' if is_offline else 'Online'}"

                for recipient in recipients:
                    email = recipient.get("email")
                    if email:
                        try:
                            await send_email_with_config(smtp_config, email, subject, html)
                        except Exception as e:
                            logger.error(f"Failed to send ZT alert to {email}: {e}")

                logger.info(f"ZeroTier alert: {member_name} ({member_id}) changed from {last_status} to {current_status}")

            # Update last known status
            await db.zerotier_alerts.update_one(
                {"main_site_id": main_site_id, "member_id": member_id},
                {"$set": {"last_known_status": current_status, "last_checked": datetime.now(timezone.utc).isoformat()}}
            )


async def _scheduler_loop(db):
    """Run the ZeroTier alert check every 60 seconds."""
    while True:
        try:
            await _check_alerts(db)
        except Exception as e:
            logger.error(f"ZeroTier alert scheduler error: {e}")
        await asyncio.sleep(60)


async def start_zerotier_alert_scheduler(db):
    """Start the ZeroTier alert scheduler."""
    global _task
    _task = asyncio.create_task(_scheduler_loop(db))
    logger.info("ZeroTier alert scheduler started (60s interval)")


async def stop_zerotier_alert_scheduler():
    """Stop the scheduler."""
    global _task
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
    logger.info("ZeroTier alert scheduler stopped")
