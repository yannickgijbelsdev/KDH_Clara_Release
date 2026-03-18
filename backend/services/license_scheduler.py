"""License expiry reminder scheduler.

Checks daily for licenses expiring within 30 days.
Sends reminder emails every 10 days to site admins + clara.license@koodh.com.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from database import db
from services.email_service import (
    send_email_with_config, _get_branding_info, _build_dynamic_header,
)

logger = logging.getLogger(__name__)

LICENSE_ADMIN_EMAIL = "clara.license@koodh.com"
REMINDER_THRESHOLD_DAYS = 30
REMINDER_INTERVAL_DAYS = 10


def build_license_expiry_html(
    site_name: str, package_name: str, days_remaining: int,
    billing_cycle: str, expires_at: str,
    brand_name: str = "Clara", brand_logo_url: str = None,
) -> str:
    """Build HTML email for license expiry reminder."""
    urgency_color = "#ef4444" if days_remaining <= 7 else "#f59e0b" if days_remaining <= 14 else "#3b82f6"
    gradient = f"linear-gradient(135deg,{urgency_color},{urgency_color}cc)"
    header = _build_dynamic_header(brand_name, brand_logo_url, "License Expiry Reminder", gradient)

    try:
        exp_dt = datetime.fromisoformat(expires_at)
        exp_display = exp_dt.strftime("%d %B %Y")
    except (ValueError, TypeError):
        exp_display = expires_at or "Unknown"

    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#18181b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
        {header}
        <div style="padding:24px;">
            <div style="text-align:center;margin-bottom:20px;">
                <p style="margin:0;font-size:48px;font-weight:800;color:{urgency_color};">{days_remaining}</p>
                <p style="margin:0;font-size:14px;color:#a1a1aa;">days remaining</p>
            </div>
            <div style="background:#27272a;border-radius:8px;padding:16px;margin-bottom:16px;">
                <table style="width:100%;font-size:13px;color:#a1a1aa;">
                    <tr>
                        <td style="padding:4px 0;color:#71717a;">Site</td>
                        <td style="padding:4px 0;text-align:right;color:white;font-weight:600;">{site_name}</td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0;color:#71717a;">Package</td>
                        <td style="padding:4px 0;text-align:right;color:white;">{package_name}</td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0;color:#71717a;">Billing</td>
                        <td style="padding:4px 0;text-align:right;color:white;text-transform:capitalize;">{billing_cycle}</td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0;color:#71717a;">Expires</td>
                        <td style="padding:4px 0;text-align:right;color:{urgency_color};font-weight:600;">{exp_display}</td>
                    </tr>
                </table>
            </div>
            <p style="margin:0 0 16px;font-size:13px;color:#a1a1aa;">
                Your license for <strong style="color:white;">{site_name}</strong> will expire in <strong style="color:{urgency_color};">{days_remaining} days</strong>. 
                Please renew your license to maintain uninterrupted access to all features.
            </p>
            <div style="text-align:center;">
                <a href="mailto:info@koodh.com?subject=License%20Renewal%20-%20{site_name}" 
                   style="display:inline-block;background:{urgency_color};color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
                    Contact Us to Renew
                </a>
            </div>
        </div>
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">
            Clara License Management
        </div>
    </div>"""


async def check_expiring_licenses():
    """Check for licenses expiring within 30 days and send reminders."""
    logger.info("Checking for expiring licenses...")
    now = datetime.now(timezone.utc)
    threshold = now + timedelta(days=REMINDER_THRESHOLD_DAYS)

    # Find active, non-lifetime assignments with expires_at within threshold
    assignments = await db.license_assignments.find({
        "status": "active",
        "is_lifetime": {"$ne": True},
        "expires_at": {"$ne": None},
    }, {"_id": 0}).to_list(500)

    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        logger.debug("License reminders: SMTP not configured")
        return

    branding = await _get_branding_info()
    sent_count = 0

    for assignment in assignments:
        try:
            expires_at = datetime.fromisoformat(assignment["expires_at"])
        except (ValueError, TypeError):
            continue

        days_remaining = (expires_at - now).days
        if days_remaining < 0 or days_remaining > REMINDER_THRESHOLD_DAYS:
            continue

        # Check if we already sent a reminder recently (within REMINDER_INTERVAL_DAYS)
        last_sent = assignment.get("last_reminder_sent_at")
        if last_sent:
            try:
                last_sent_dt = datetime.fromisoformat(last_sent)
                if (now - last_sent_dt).days < REMINDER_INTERVAL_DAYS:
                    continue  # Skip, too soon for another reminder
            except (ValueError, TypeError):
                pass

        # Get site and package info
        site = await db.main_sites.find_one(
            {"id": assignment["main_site_id"]}, {"_id": 0, "name": 1, "id": 1}
        )
        pkg = await db.license_packages.find_one(
            {"id": assignment["package_id"]}, {"_id": 0, "name": 1}
        )
        if not site or not pkg:
            continue

        site_name = site["name"]
        package_name = pkg["name"]
        billing_cycle = assignment.get("billing_cycle", "monthly")

        html = build_license_expiry_html(
            site_name, package_name, days_remaining, billing_cycle,
            assignment["expires_at"],
            brand_name=branding["brand_name"],
            brand_logo_url=branding["brand_logo_url"],
        )
        subject = f"License Expiry Reminder: {site_name} ({days_remaining} days remaining)"

        # Find site admins
        admin_accesses = await db.main_site_users.find(
            {"main_site_id": assignment["main_site_id"], "role": {"$in": ["admin", "news_admin"]}},
            {"_id": 0, "user_id": 1}
        ).to_list(100)
        admin_ids = [a["user_id"] for a in admin_accesses]

        if admin_ids:
            admins = await db.users.find(
                {"id": {"$in": admin_ids}}, {"_id": 0, "email": 1, "name": 1}
            ).to_list(100)
        else:
            admins = []

        # Also include network admins
        net_admins = await db.users.find(
            {"is_network_admin": True}, {"_id": 0, "email": 1}
        ).to_list(50)
        sent_emails = set()

        for admin in admins:
            if admin["email"] not in sent_emails:
                await send_email_with_config(smtp_config, admin["email"], subject, html)
                sent_emails.add(admin["email"])

        for na in net_admins:
            if na["email"] not in sent_emails:
                await send_email_with_config(smtp_config, na["email"], subject, html)
                sent_emails.add(na["email"])

        # Always send to clara.license@koodh.com
        if LICENSE_ADMIN_EMAIL not in sent_emails:
            await send_email_with_config(smtp_config, LICENSE_ADMIN_EMAIL, subject, html)

        # Update last_reminder_sent_at
        await db.license_assignments.update_one(
            {"id": assignment["id"]},
            {"$set": {"last_reminder_sent_at": _now()}}
        )
        sent_count += 1
        logger.info(f"License reminder sent for {site_name} ({days_remaining} days)")

    if sent_count > 0:
        logger.info(f"Sent {sent_count} license expiry reminder(s)")


def _now():
    return datetime.now(timezone.utc).isoformat()


async def start_license_scheduler():
    """Start the license expiry check scheduler (runs daily)."""
    logger.info("License expiry scheduler started")
    while True:
        try:
            await check_expiring_licenses()
        except Exception as e:
            logger.error(f"License scheduler error: {e}")
        # Check once per day (86400 seconds)
        await asyncio.sleep(86400)
