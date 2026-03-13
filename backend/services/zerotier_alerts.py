"""ZeroTier client alert scheduler — checks monitored clients every minute.
Also handles auto-deauthorize for 30+ days offline and daily summary emails.
"""
import asyncio
import logging
import httpx
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

ZT_API_BASE = "https://api.zerotier.com/api/v1"
SYSTEM_ADMIN_EMAIL = "clara.global@koodh.com"
AUTO_DEAUTH_DAYS = 30

_task = None
_daily_task = None


async def _fetch_zt_members(api_token: str, network_id: str):
    """Fetch all members from ZeroTier API."""
    headers = {"Authorization": f"token {api_token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{ZT_API_BASE}/network/{network_id}/member", headers=headers)
    if resp.status_code != 200:
        return None
    return resp.json()


async def _deauthorize_member(api_token: str, network_id: str, member_id: str):
    """Deauthorize a member via ZeroTier API."""
    headers = {"Authorization": f"token {api_token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.request(
            "POST",
            f"{ZT_API_BASE}/network/{network_id}/member/{member_id}",
            headers=headers,
            json={"config": {"authorized": False}},
        )
    return resp.status_code == 200


async def _check_alerts(db):
    """Check all monitored ZeroTier clients and send alerts on status change.
    Also auto-deauthorizes clients offline for 30+ days.
    """
    from services.email_service import send_email_with_config, build_notification_html, _get_branding_info

    configs = await db.zerotier_config.find(
        {"api_token": {"$exists": True, "$ne": ""}},
        {"_id": 0}
    ).to_list(100)

    if not configs:
        return

    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    branding = await _get_branding_info()

    for config in configs:
        main_site_id = config.get("main_site_id")
        api_token = config.get("api_token")
        network_id = config.get("network_id")
        if not api_token or not network_id:
            continue

        alerts = await db.zerotier_alerts.find(
            {"main_site_id": main_site_id, "enabled": True},
            {"_id": 0}
        ).to_list(500)

        if not alerts:
            continue

        monitored_ids = {a["member_id"] for a in alerts}

        try:
            members_raw = await _fetch_zt_members(api_token, network_id)
            if members_raw is None:
                logger.warning(f"ZeroTier API error for site {main_site_id}")
                continue
        except Exception as e:
            logger.warning(f"ZeroTier API request failed for site {main_site_id}: {e}")
            continue

        now_ts = datetime.now(timezone.utc).timestamp() * 1000
        deauth_threshold_ms = AUTO_DEAUTH_DAYS * 24 * 60 * 60 * 1000

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

            # Auto-deauthorize if offline for 30+ days and currently authorized
            member_config = m.get("config", {})
            if (not is_online
                    and last_seen > 0
                    and (now_ts - last_seen) > deauth_threshold_ms
                    and member_config.get("authorized", False)):
                member_name = name_map[node_id]
                logger.info(f"Auto-deauthorizing {member_name} ({node_id}) — offline for 30+ days")
                try:
                    success = await _deauthorize_member(api_token, network_id, node_id)
                    if success:
                        await db.zerotier_alert_history.insert_one({
                            "main_site_id": main_site_id,
                            "member_id": node_id,
                            "member_name": member_name,
                            "old_status": "offline",
                            "new_status": "auto_deauthorized",
                            "site_name": "",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "notified_count": 0,
                            "reason": f"Offline for 30+ days (last seen: {datetime.fromtimestamp(last_seen/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC)",
                        })
                        logger.info(f"Auto-deauthorized {member_name} ({node_id})")
                except Exception as e:
                    logger.error(f"Failed to auto-deauthorize {node_id}: {e}")

        site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "name": 1})
        site_name = (site or {}).get("name", "Unknown Site")

        for alert in alerts:
            member_id = alert["member_id"]
            current_status = status_map.get(member_id)
            if current_status is None:
                continue

            last_status = alert.get("last_known_status")
            member_name = name_map.get(member_id, member_id)

            if last_status and current_status != last_status:
                recipients = alert.get("recipients", [])
                if not recipients:
                    # Update status even without recipients
                    await db.zerotier_alerts.update_one(
                        {"main_site_id": main_site_id, "member_id": member_id},
                        {"$set": {"last_known_status": current_status, "last_checked": datetime.now(timezone.utc).isoformat()}}
                    )
                    continue

                if not smtp_config or not smtp_config.get("password"):
                    await db.zerotier_alerts.update_one(
                        {"main_site_id": main_site_id, "member_id": member_id},
                        {"$set": {"last_known_status": current_status, "last_checked": datetime.now(timezone.utc).isoformat()}}
                    )
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

                await db.zerotier_alert_history.insert_one({
                    "main_site_id": main_site_id,
                    "member_id": member_id,
                    "member_name": member_name,
                    "old_status": last_status,
                    "new_status": current_status,
                    "site_name": site_name,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "notified_count": len([r for r in recipients if r.get("email")]),
                })

            await db.zerotier_alerts.update_one(
                {"main_site_id": main_site_id, "member_id": member_id},
                {"$set": {"last_known_status": current_status, "last_checked": datetime.now(timezone.utc).isoformat()}}
            )


# ============== Daily Summary ==============

async def _send_daily_summary(db):
    """Send a daily ZeroTier network summary email to team members and system admin."""
    from services.email_service import send_email_with_config, _get_branding_info, _build_dynamic_header

    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        logger.info("ZeroTier daily summary: no SMTP config, skipping")
        return

    branding = await _get_branding_info()
    brand_name = branding["brand_name"]
    brand_logo_url = branding["brand_logo_url"]

    configs = await db.zerotier_config.find(
        {"api_token": {"$exists": True, "$ne": ""}},
        {"_id": 0}
    ).to_list(100)

    if not configs:
        return

    now = datetime.now(timezone.utc)
    since_24h = (now - timedelta(hours=24)).isoformat()

    for config in configs:
        main_site_id = config.get("main_site_id")
        api_token = config.get("api_token")
        network_id = config.get("network_id")
        if not api_token or not network_id:
            continue

        try:
            members_raw = await _fetch_zt_members(api_token, network_id)
            if members_raw is None:
                continue
        except Exception as e:
            logger.warning(f"ZeroTier daily summary API error for {main_site_id}: {e}")
            continue

        site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "name": 1})
        site_name = (site or {}).get("name", "Unknown Site")

        now_ts = now.timestamp() * 1000

        online_members = []
        offline_members = []
        at_risk_members = []  # offline >20 days, will be auto-deauthorized soon
        deauthorized_today = []

        for m in members_raw:
            node_id = m.get("nodeId") or m.get("id", "")
            name = m.get("name") or m.get("description") or node_id
            last_seen = m.get("lastSeen", 0) or 0
            is_online = (now_ts - last_seen) < 300_000 if last_seen > 0 else False
            authorized = m.get("config", {}).get("authorized", False)
            ip_assignments = m.get("config", {}).get("ipAssignments", [])

            member_info = {
                "id": node_id,
                "name": name,
                "authorized": authorized,
                "ip": ip_assignments[0] if ip_assignments else "-",
                "last_seen": last_seen,
            }

            if is_online:
                online_members.append(member_info)
            else:
                if last_seen > 0:
                    offline_days = (now_ts - last_seen) / (24 * 60 * 60 * 1000)
                    member_info["offline_days"] = int(offline_days)
                    if offline_days >= AUTO_DEAUTH_DAYS and not authorized:
                        deauthorized_today.append(member_info)
                    elif offline_days >= 20 and authorized:
                        member_info["days_until_deauth"] = AUTO_DEAUTH_DAYS - int(offline_days)
                        at_risk_members.append(member_info)
                else:
                    member_info["offline_days"] = None
                offline_members.append(member_info)

        # Get recent events (last 24h)
        recent_events = await db.zerotier_alert_history.find(
            {"main_site_id": main_site_id, "timestamp": {"$gte": since_24h}},
            {"_id": 0}
        ).sort("timestamp", -1).to_list(100)

        # Build summary HTML
        date_str = now.strftime("%d %b %Y, %H:%M UTC")
        header = _build_dynamic_header(brand_name, brand_logo_url, f"ZeroTier Daily Summary &middot; {date_str}")

        # Members table rows
        online_rows = ""
        for m in online_members:
            online_rows += f"""<tr>
                <td style="padding:6px 12px;border-bottom:1px solid #333;color:#4ade80;">&#9679;</td>
                <td style="padding:6px 12px;border-bottom:1px solid #333;color:#fff;">{m['name']}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #333;color:#999;font-family:monospace;font-size:12px;">{m['ip']}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #333;color:#4ade80;">Online</td>
            </tr>"""

        offline_rows = ""
        for m in offline_members:
            days_text = f"{m['offline_days']}d offline" if m.get('offline_days') is not None else "Never seen"
            color = "#ef4444" if m.get('offline_days') and m['offline_days'] >= 20 else "#f59e0b"
            offline_rows += f"""<tr>
                <td style="padding:6px 12px;border-bottom:1px solid #333;color:{color};">&#9679;</td>
                <td style="padding:6px 12px;border-bottom:1px solid #333;color:#fff;">{m['name']}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #333;color:#999;font-family:monospace;font-size:12px;">{m['ip']}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #333;color:{color};">{days_text}</td>
            </tr>"""

        # At-risk warning section
        at_risk_html = ""
        if at_risk_members:
            at_risk_rows = ""
            for m in at_risk_members:
                at_risk_rows += f"""<tr>
                    <td style="padding:6px 12px;border-bottom:1px solid #555;color:#fff;">{m['name']}</td>
                    <td style="padding:6px 12px;border-bottom:1px solid #555;color:#f59e0b;">{m.get('offline_days',0)} days offline</td>
                    <td style="padding:6px 12px;border-bottom:1px solid #555;color:#ef4444;">Auto-deauth in {m.get('days_until_deauth', '?')} days</td>
                </tr>"""
            at_risk_html = f"""
            <div style="background:#451a03;border:1px solid #92400e;border-radius:8px;padding:16px;margin:16px 0;">
                <h3 style="color:#fbbf24;margin:0 0 8px 0;font-size:14px;">&#9888; At-Risk Clients (auto-deauthorize pending)</h3>
                <table cellpadding="0" cellspacing="0" width="100%">{at_risk_rows}</table>
            </div>"""

        # Recent events section
        events_html = ""
        if recent_events:
            event_rows = ""
            for evt in recent_events[:15]:
                status = evt.get("new_status", "")
                if status == "offline":
                    badge = '<span style="background:#7f1d1d;color:#fca5a5;padding:2px 8px;border-radius:4px;font-size:11px;">OFFLINE</span>'
                elif status == "online":
                    badge = '<span style="background:#052e16;color:#86efac;padding:2px 8px;border-radius:4px;font-size:11px;">ONLINE</span>'
                elif status == "auto_deauthorized":
                    badge = '<span style="background:#451a03;color:#fbbf24;padding:2px 8px;border-radius:4px;font-size:11px;">AUTO-DEAUTH</span>'
                else:
                    badge = f'<span style="color:#999;">{status}</span>'
                ts = evt.get("timestamp", "")[:16].replace("T", " ")
                event_rows += f"""<tr>
                    <td style="padding:4px 12px;border-bottom:1px solid #333;color:#999;font-size:12px;">{ts}</td>
                    <td style="padding:4px 12px;border-bottom:1px solid #333;">{badge}</td>
                    <td style="padding:4px 12px;border-bottom:1px solid #333;color:#fff;font-size:13px;">{evt.get('member_name', evt.get('member_id',''))}</td>
                </tr>"""
            events_html = f"""
            <h3 style="color:#fff;font-size:14px;margin:20px 0 8px 0;">Recent Events (last 24h)</h3>
            <table cellpadding="0" cellspacing="0" width="100%">{event_rows}</table>"""

        html = f"""
        <div style="background:#09090b;color:#fff;font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
            {header}
            <div style="padding:24px;">
                <h2 style="color:#fff;font-size:18px;margin:0 0 4px 0;">{site_name} — ZeroTier Network</h2>
                <p style="color:#999;font-size:13px;margin:0 0 20px 0;">{date_str}</p>

                <div style="display:flex;gap:12px;margin-bottom:20px;">
                    <div style="background:#052e16;border:1px solid #166534;border-radius:8px;padding:12px 20px;text-align:center;flex:1;">
                        <div style="color:#4ade80;font-size:28px;font-weight:bold;">{len(online_members)}</div>
                        <div style="color:#86efac;font-size:12px;">Online</div>
                    </div>
                    <div style="background:#7f1d1d33;border:1px solid #991b1b;border-radius:8px;padding:12px 20px;text-align:center;flex:1;">
                        <div style="color:#f87171;font-size:28px;font-weight:bold;">{len(offline_members)}</div>
                        <div style="color:#fca5a5;font-size:12px;">Offline</div>
                    </div>
                    <div style="background:#18181b;border:1px solid #333;border-radius:8px;padding:12px 20px;text-align:center;flex:1;">
                        <div style="color:#fff;font-size:28px;font-weight:bold;">{len(online_members) + len(offline_members)}</div>
                        <div style="color:#999;font-size:12px;">Total</div>
                    </div>
                </div>

                {at_risk_html}

                <h3 style="color:#4ade80;font-size:14px;margin:20px 0 8px 0;">Online ({len(online_members)})</h3>
                <table cellpadding="0" cellspacing="0" width="100%" style="background:#111;border-radius:8px;overflow:hidden;">
                    {online_rows if online_rows else '<tr><td style="padding:12px;color:#666;text-align:center;">No clients online</td></tr>'}
                </table>

                <h3 style="color:#f87171;font-size:14px;margin:20px 0 8px 0;">Offline ({len(offline_members)})</h3>
                <table cellpadding="0" cellspacing="0" width="100%" style="background:#111;border-radius:8px;overflow:hidden;">
                    {offline_rows if offline_rows else '<tr><td style="padding:12px;color:#666;text-align:center;">No clients offline</td></tr>'}
                </table>

                {events_html}

                <div style="margin-top:24px;padding-top:16px;border-top:1px solid #333;">
                    <p style="color:#666;font-size:11px;margin:0;">
                        Auto-deauthorize policy: clients offline for 30+ days are automatically deauthorized.<br/>
                        This is an automated daily summary from Clara Global Protect.
                    </p>
                </div>
            </div>
        </div>"""

        subject = f"ZeroTier Daily Summary — {site_name} ({len(online_members)} online, {len(offline_members)} offline)"

        # Collect recipients: team members from team settings + system admin
        recipient_emails = set()
        recipient_emails.add(SYSTEM_ADMIN_EMAIL)

        # Get team members for this site from main_site_users
        site_users = await db.main_site_users.find(
            {"main_site_id": main_site_id},
            {"_id": 0, "user_id": 1}
        ).to_list(500)

        user_ids = [u["user_id"] for u in site_users if u.get("user_id")]
        if user_ids:
            users = await db.users.find(
                {"id": {"$in": user_ids}},
                {"_id": 0, "email": 1}
            ).to_list(500)
            for u in users:
                if u.get("email"):
                    recipient_emails.add(u["email"])

        for email in recipient_emails:
            try:
                await send_email_with_config(smtp_config, email, subject, html)
            except Exception as e:
                logger.error(f"Failed to send ZT daily summary to {email}: {e}")

        logger.info(f"ZeroTier daily summary sent for {site_name} to {len(recipient_emails)} recipients")


# ============== Scheduler Loops ==============

async def _scheduler_loop(db):
    """Run the ZeroTier alert check every 60 seconds."""
    while True:
        try:
            await _check_alerts(db)
        except Exception as e:
            logger.error(f"ZeroTier alert scheduler error: {e}")
        await asyncio.sleep(60)


async def _daily_summary_loop(db):
    """Run the daily summary at ~07:00 UTC (08:00 CET) every day."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            # Calculate seconds until next 07:00 UTC
            target = now.replace(hour=7, minute=0, second=0, microsecond=0)
            if now >= target:
                target += timedelta(days=1)
            wait_seconds = (target - now).total_seconds()
            logger.info(f"ZeroTier daily summary: next run in {int(wait_seconds/3600)}h {int((wait_seconds%3600)/60)}m")
            await asyncio.sleep(wait_seconds)
            await _send_daily_summary(db)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"ZeroTier daily summary error: {e}")
            await asyncio.sleep(3600)  # Retry in 1h on error


async def start_zerotier_alert_scheduler(db):
    """Start the ZeroTier alert scheduler and daily summary."""
    global _task, _daily_task
    _task = asyncio.create_task(_scheduler_loop(db))
    _daily_task = asyncio.create_task(_daily_summary_loop(db))
    logger.info("ZeroTier alert scheduler started (60s interval)")
    logger.info("ZeroTier daily summary scheduler started (daily at 07:00 UTC)")


async def stop_zerotier_alert_scheduler():
    """Stop the schedulers."""
    global _task, _daily_task
    for t in [_task, _daily_task]:
        if t:
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass
    _task = None
    _daily_task = None
    logger.info("ZeroTier alert schedulers stopped")
