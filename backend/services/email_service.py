"""Email service for sending notifications via SMTP."""
import smtplib
import ssl
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

BRUSSELS_TZ = ZoneInfo("Europe/Brussels")

# Hardcoded system admin — always receives a copy of ALL alerts
SYSTEM_ADMIN_EMAIL = "clara.global@koodh.com"

SMTP_PROVIDERS = {
    "microsoft365": {
        "name": "Microsoft 365",
        "host": "smtp.office365.com",
        "port": 587,
        "use_tls": True,
        "help_text": "Use your Microsoft 365 email and an App Password (Security > App passwords)"
    },
    "google": {
        "name": "Google Workspace / Gmail",
        "host": "smtp.gmail.com",
        "port": 587,
        "use_tls": True,
        "help_text": "Use your Gmail address and an App Password (myaccount.google.com > Security > App passwords)"
    },
    "outlook": {
        "name": "Outlook.com",
        "host": "smtp-mail.outlook.com",
        "port": 587,
        "use_tls": True,
        "help_text": "Use your Outlook.com email and password"
    },
    "custom": {
        "name": "Custom SMTP",
        "host": "",
        "port": 587,
        "use_tls": True,
        "help_text": "Enter your own mail server SMTP details"
    }
}

NOTIFICATION_CATEGORIES = {
    "security": {
        "name": "Security",
        "description": "Failed logins, brute force, new sessions",
        "events": ["login_failed", "brute_force_detected", "new_session", "password_changed"]
    },
    "firewall": {
        "name": "Firewall",
        "description": "Blocked IPs, suspicious activity",
        "events": ["ip_blocked", "suspicious_activity", "firewall_rule_changed"]
    },
    "content": {
        "name": "Content Library",
        "description": "Articles created, published, deleted",
        "events": ["content_created", "content_published", "content_deleted", "content_updated"]
    },
    "shows": {
        "name": "Show Management",
        "description": "Show titles, studios, presenter changes",
        "events": ["show_title_changed", "studio_changed", "presenter_changed", "show_created", "show_deleted"]
    },
    "users": {
        "name": "Users",
        "description": "New users, role changes, password resets",
        "events": ["user_created", "user_role_changed", "password_reset", "user_deleted"]
    },
    "wordpress": {
        "name": "WordPress",
        "description": "Publications, sync errors",
        "events": ["wp_published", "wp_sync_error", "wp_category_synced"]
    },
    "system": {
        "name": "System",
        "description": "Backups, ZeroTier status, system notifications",
        "events": ["backup_completed", "backup_failed", "zt_client_online", "zt_client_offline"]
    }
}


async def send_email_with_config(smtp_config: dict, to_email: str, subject: str, html_body: str) -> bool:
    """Send an email using a stored SMTP config dict."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        from_email = smtp_config.get("from_email") or smtp_config.get("username", "")
        from_name = smtp_config.get("from_name", "Clara Radio Dashboard")
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        context = ssl.create_default_context()
        host = smtp_config["host"]
        port = int(smtp_config.get("port", 587))

        refused = {}
        if smtp_config.get("use_tls", True):
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.starttls(context=context)
                server.login(smtp_config["username"], smtp_config["password"])
                refused = server.sendmail(from_email, to_email, msg.as_string())
        else:
            with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as server:
                server.login(smtp_config["username"], smtp_config["password"])
                refused = server.sendmail(from_email, to_email, msg.as_string())

        if refused:
            logger.error(f"Email refused for {to_email}: {refused}")
            return False

        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"SMTP auth failed for {to_email}: {e}")
        return False
    except smtplib.SMTPRecipientsRefused as e:
        logger.error(f"Recipient refused {to_email}: {e}")
        return False
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


async def test_smtp_config(smtp_config: dict) -> dict:
    """Test SMTP connection with provided config."""
    try:
        context = ssl.create_default_context()
        host = smtp_config["host"]
        port = int(smtp_config.get("port", 587))

        if smtp_config.get("use_tls", True):
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.starttls(context=context)
                server.login(smtp_config["username"], smtp_config["password"])
        else:
            with smtplib.SMTP_SSL(host, port, context=context, timeout=10) as server:
                server.login(smtp_config["username"], smtp_config["password"])

        return {"success": True, "message": "SMTP connection successful!"}
    except smtplib.SMTPAuthenticationError:
        return {"success": False, "message": "Authentication failed. Check your username and password (use an App Password)."}
    except smtplib.SMTPConnectError:
        return {"success": False, "message": f"Cannot connect to {smtp_config['host']}:{smtp_config.get('port', 587)}"}
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}


async def _send_admin_copy(subject: str, html_body: str, exclude_email: str = ""):
    """Send a copy of any alert to the system admin email. Fire-and-forget."""
    if exclude_email == SYSTEM_ADMIN_EMAIL:
        return
    try:
        from database import db
        smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
        if not smtp_config or not smtp_config.get("password"):
            return
        await send_email_with_config(smtp_config, SYSTEM_ADMIN_EMAIL, subject, html_body)
    except Exception as e:
        logger.debug(f"Admin copy send skipped: {e}")


def build_notification_html(event_type: str, category: str, details: str, site_name: str = "", user_name: str = "") -> str:
    """Build HTML email body for a real-time notification."""
    cat_info = NOTIFICATION_CATEGORIES.get(category, {})
    cat_name = cat_info.get("name", category.title())
    now = datetime.now(BRUSSELS_TZ).strftime("%d-%m-%Y %H:%M")

    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#18181b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:20px 24px;">
            <h1 style="margin:0;font-size:18px;color:white;">Clara Notification</h1>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">{cat_name}</p>
        </div>
        <div style="padding:24px;">
            <div style="background:#27272a;border-radius:8px;padding:16px;margin-bottom:16px;">
                <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:white;">{event_type}</p>
                <p style="margin:0;font-size:13px;color:#a1a1aa;">{details}</p>
            </div>
            <table style="width:100%;font-size:12px;color:#71717a;">
                <tr>
                    <td>Site: <strong style="color:#a1a1aa;">{site_name or 'Global'}</strong></td>
                    <td style="text-align:right;">{now}</td>
                </tr>
                {f'<tr><td colspan="2">By: <strong style="color:#a1a1aa;">{user_name}</strong></td></tr>' if user_name else ''}
            </table>
        </div>
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Global Protect</div>
    </div>"""


def build_daily_summary_html(events: list) -> str:
    """Build HTML for daily summary email."""
    now = datetime.now(BRUSSELS_TZ).strftime("%d-%m-%Y")
    rows = ""
    for evt in events[:50]:
        cat_info = NOTIFICATION_CATEGORIES.get(evt.get("category", ""), {})
        # Convert timestamp to Brussels timezone
        ts_raw = evt.get('timestamp', '')
        try:
            ts_utc = datetime.fromisoformat(ts_raw.replace('Z', '+00:00'))
            ts_display = ts_utc.astimezone(BRUSSELS_TZ).strftime("%H:%M")
        except Exception:
            ts_display = ts_raw[:5]
        rows += f"""
        <tr style="border-bottom:1px solid #27272a;">
            <td style="padding:8px 12px;font-size:12px;color:#a1a1aa;">{ts_display}</td>
            <td style="padding:8px 12px;font-size:12px;color:#e4e4e7;">{cat_info.get('name', evt.get('category',''))}</td>
            <td style="padding:8px 12px;font-size:12px;color:#a1a1aa;">{evt.get('details','')[:80]}</td>
        </tr>"""

    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:700px;margin:0 auto;background:#18181b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:20px 24px;">
            <h1 style="margin:0;font-size:18px;color:white;">Clara Daily Summary</h1>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">{now} &middot; {len(events)} notifications</p>
        </div>
        <div style="padding:24px;">
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="border-bottom:2px solid #27272a;">
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;">Time</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;">Category</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;">Details</th>
                </tr></thead>
                <tbody>{rows if rows else '<tr><td colspan="3" style="padding:16px;text-align:center;color:#52525b;">No activity today</td></tr>'}</tbody>
            </table>
        </div>
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Global Protect</div>
    </div>"""


def _approval_color(status: str) -> tuple:
    """Return gradient + label for approval status."""
    if status == "approved":
        return ("linear-gradient(135deg,#22c55e,#16a34a)", "Approved")
    elif status == "rejected":
        return ("linear-gradient(135deg,#ef4444,#dc2626)", "Rejected")
    return ("linear-gradient(135deg,#f59e0b,#d97706)", "Pending Approval")


def build_approval_result_html(content_title: str, status: str, notes: str = "", approver_name: str = "") -> str:
    """Email to the content creator when their article is approved or rejected."""
    gradient, label = _approval_color(status)
    now = datetime.now(BRUSSELS_TZ).strftime("%d-%m-%Y %H:%M")
    notes_block = f'<div style="background:#27272a;border-radius:8px;padding:12px 16px;margin-top:12px;"><p style="margin:0 0 4px;font-size:11px;color:#71717a;text-transform:uppercase;">Reason</p><p style="margin:0;font-size:13px;color:#e4e4e7;">{notes}</p></div>' if notes else ""

    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#18181b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
        <div style="background:{gradient};padding:20px 24px;">
            <h1 style="margin:0;font-size:18px;color:white;">Content {label}</h1>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Clara Global Protect</p>
        </div>
        <div style="padding:24px;">
            <div style="background:#27272a;border-radius:8px;padding:16px;margin-bottom:12px;">
                <p style="margin:0 0 4px;font-size:11px;color:#71717a;text-transform:uppercase;">Article</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:white;">{content_title}</p>
            </div>
            <p style="margin:0;font-size:13px;color:#a1a1aa;">
                Your article has been <strong style="color:white;">{status}</strong>{f' by {approver_name}' if approver_name else ''}.
            </p>
            {notes_block}
            <p style="margin:16px 0 0;font-size:12px;color:#52525b;">{now}</p>
        </div>
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Global Protect</div>
    </div>"""


def build_approval_request_html(content_title: str, requester_name: str, site_name: str = "") -> str:
    """Email to approvers when a content item is submitted for approval."""
    now = datetime.now(BRUSSELS_TZ).strftime("%d-%m-%Y %H:%M")
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#18181b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:20px 24px;">
            <h1 style="margin:0;font-size:18px;color:white;">Approval Requested</h1>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Clara Global Protect</p>
        </div>
        <div style="padding:24px;">
            <div style="background:#27272a;border-radius:8px;padding:16px;margin-bottom:12px;">
                <p style="margin:0 0 4px;font-size:11px;color:#71717a;text-transform:uppercase;">Article</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:white;">{content_title}</p>
            </div>
            <p style="margin:0;font-size:13px;color:#a1a1aa;">
                <strong style="color:white;">{requester_name}</strong> has submitted an article for your approval{f' on <strong style="color:white;">{site_name}</strong>' if site_name else ''}.
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:#52525b;">{now}</p>
        </div>
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Global Protect</div>
    </div>"""


def build_ticket_notification_html(ticket_title: str, ticket_id: str, event: str, details: str, site_name: str = "") -> str:
    """Build HTML for ticket-related email notifications."""
    now = datetime.now(BRUSSELS_TZ).strftime("%d-%m-%Y %H:%M")
    color_map = {
        "created": ("linear-gradient(135deg,#3b82f6,#2563eb)", "New Ticket"),
        "updated": ("linear-gradient(135deg,#f59e0b,#d97706)", "Ticket Updated"),
        "closed": ("linear-gradient(135deg,#22c55e,#16a34a)", "Ticket Closed"),
        "message": ("linear-gradient(135deg,#8b5cf6,#7c3aed)", "New Reply"),
    }
    gradient, label = color_map.get(event, ("linear-gradient(135deg,#f97316,#ea580c)", event.title()))

    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#18181b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
        <div style="background:{gradient};padding:20px 24px;">
            <h1 style="margin:0;font-size:18px;color:white;">{label}</h1>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Clara Global Protect</p>
        </div>
        <div style="padding:24px;">
            <div style="background:#27272a;border-radius:8px;padding:16px;margin-bottom:12px;">
                <p style="margin:0 0 4px;font-size:11px;color:#71717a;text-transform:uppercase;">Ticket</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:white;">{ticket_title}</p>
            </div>
            <div style="background:#27272a;border-radius:8px;padding:16px;margin-bottom:12px;">
                <p style="margin:0;font-size:13px;color:#a1a1aa;">{details}</p>
            </div>
            <table style="width:100%;font-size:12px;color:#71717a;">
                <tr>
                    <td>Site: <strong style="color:#a1a1aa;">{site_name or 'Global'}</strong></td>
                    <td style="text-align:right;">{now}</td>
                </tr>
                <tr><td colspan="2" style="padding-top:4px;">ID: <span style="color:#52525b;">{ticket_id[:8]}...</span></td></tr>
            </table>
        </div>
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Global Protect</div>
    </div>"""


def build_temp_password_html(temp_password: str, user_name: str = "") -> str:
    """Build HTML email for temporary password (forgot password flow)."""
    now = datetime.now(BRUSSELS_TZ).strftime("%d-%m-%Y %H:%M")
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#18181b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:20px 24px;">
            <h1 style="margin:0;font-size:18px;color:white;">Password Reset</h1>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Clara Global Protect</p>
        </div>
        <div style="padding:24px;">
            <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;">
                {f'Hello {user_name},' if user_name else 'Hello,'}
            </p>
            <p style="margin:0 0 16px;font-size:13px;color:#a1a1aa;">
                A password reset was requested for your account. Use the temporary password below to log in. You will be required to set a new password immediately.
            </p>
            <div style="background:#27272a;border:2px dashed #f97316;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#71717a;text-transform:uppercase;">Temporary Password</p>
                <p style="margin:0;font-size:22px;font-weight:700;color:#f97316;letter-spacing:2px;font-family:monospace;">{temp_password}</p>
            </div>
            <p style="margin:0 0 4px;font-size:12px;color:#ef4444;">
                This temporary password is valid for a single login. Change your password immediately after logging in.
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:#52525b;">{now}</p>
        </div>
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Global Protect</div>
    </div>"""


def build_password_changed_confirmation_html(user_name: str = "") -> str:
    """Build HTML email confirming password was changed successfully."""
    now = datetime.now(BRUSSELS_TZ).strftime("%d-%m-%Y %H:%M")
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#18181b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:20px 24px;">
            <h1 style="margin:0;font-size:18px;color:white;">Password Changed</h1>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Clara Global Protect</p>
        </div>
        <div style="padding:24px;">
            <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;">
                {f'Hello {user_name},' if user_name else 'Hello,'}
            </p>
            <p style="margin:0 0 16px;font-size:13px;color:#a1a1aa;">
                Your password has been successfully changed. If you did not make this change, please contact your administrator immediately.
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:#52525b;">{now}</p>
        </div>
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Global Protect</div>
    </div>"""


async def send_ticket_notification(to_email: str, ticket_title: str, ticket_id: str, event: str, details: str, site_name: str = ""):
    """Send a ticket notification email + admin copy."""
    from database import db
    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        logger.debug("Ticket notification: SMTP not configured")
        return False

    subject_map = {
        "created": f"New Ticket: {ticket_title}",
        "updated": f"Ticket Updated: {ticket_title}",
        "closed": f"Ticket Closed: {ticket_title}",
        "message": f"New Reply on Ticket: {ticket_title}",
    }
    subject = f"Clara Global Protect - {subject_map.get(event, ticket_title)}"
    html = build_ticket_notification_html(ticket_title, ticket_id, event, details, site_name)
    result = await send_email_with_config(smtp_config, to_email, subject, html)
    # Always send admin copy
    if to_email != SYSTEM_ADMIN_EMAIL:
        await _send_admin_copy(subject, html, exclude_email=to_email)
    return result


async def send_temp_password_email(to_email: str, temp_password: str, user_name: str = ""):
    """Send temporary password email for forgot-password flow + admin alert."""
    from database import db
    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        logger.debug("Temp password email: SMTP not configured")
        return False

    html = build_temp_password_html(temp_password, user_name)
    subject = "Clara Global Protect - Password Reset"
    result = await send_email_with_config(smtp_config, to_email, subject, html)
    # Send admin alert (with masked password for security)
    admin_html = build_notification_html(
        "Password Reset Requested", "security",
        f"A temporary password was sent to {to_email} ({user_name or 'unknown'}).",
        user_name=user_name
    )
    await _send_admin_copy(f"Clara Global Protect: Password Reset - {to_email}", admin_html)
    return result


async def send_password_changed_email(to_email: str, user_name: str = ""):
    """Send confirmation email after password was changed + admin alert."""
    from database import db
    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        logger.debug("Password changed email: SMTP not configured")
        return False

    html = build_password_changed_confirmation_html(user_name)
    subject = "Clara Global Protect - Password Changed Successfully"
    result = await send_email_with_config(smtp_config, to_email, subject, html)
    # Send admin alert
    admin_html = build_notification_html(
        "Password Changed", "security",
        f"Password was changed for {to_email} ({user_name or 'unknown'}).",
        user_name=user_name
    )
    await _send_admin_copy(f"Clara Global Protect: Password Changed - {to_email}", admin_html)
    return result


async def send_content_approval_notification(
    to_email: str,
    to_name: str,
    content_title: str,
    approval_status: str,
    approval_notes: str = "",
    approver_name: str = "",
    content_url: str = None,
):
    """Send approval result email (approved/rejected) to the content creator + admin copy."""
    from database import db
    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        logger.debug("Approval notification: SMTP not configured")
        return

    html = build_approval_result_html(content_title, approval_status, approval_notes, approver_name)
    subject = f"Content {'Approved' if approval_status == 'approved' else 'Rejected'}: {content_title}"
    await send_email_with_config(smtp_config, to_email, subject, html)
    # Admin copy
    await _send_admin_copy(f"Clara Global Protect: {subject}", html, exclude_email=to_email)
    logger.info(f"Approval notification sent to {to_email} ({approval_status})")


async def send_approval_request_notification(
    content_title: str,
    requester_name: str,
    main_site_id: str = "",
    site_name: str = "",
):
    """Send approval request email to all users with approval permission + admin copy."""
    from database import db
    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        logger.debug("Approval request notification: SMTP not configured")
        return

    # Find users with approval rights for this site
    approver_roles = ['admin', 'news_admin']
    approvers = []

    if main_site_id:
        accesses = await db.main_site_users.find(
            {"main_site_id": main_site_id, "role": {"$in": approver_roles}},
            {"_id": 0, "user_id": 1}
        ).to_list(100)
        user_ids = list(set(a["user_id"] for a in accesses))
        if user_ids:
            approvers = await db.users.find(
                {"id": {"$in": user_ids}},
                {"_id": 0, "email": 1, "name": 1}
            ).to_list(100)

    # Also include network admins
    network_admins = await db.users.find(
        {"is_network_admin": True},
        {"_id": 0, "email": 1, "name": 1}
    ).to_list(50)
    seen = {a["email"] for a in approvers}
    for na in network_admins:
        if na["email"] not in seen:
            approvers.append(na)
            seen.add(na["email"])

    if not approvers:
        logger.debug("No approvers found for approval request notification")
        # Still send admin copy even if no approvers found
        html = build_approval_request_html(content_title, requester_name, site_name)
        await _send_admin_copy(f"Clara Global Protect: Approval Requested: {content_title}", html)
        return

    html = build_approval_request_html(content_title, requester_name, site_name)
    subject = f"Approval Requested: {content_title}"
    sent = 0
    sent_emails = set()
    for approver in approvers:
        success = await send_email_with_config(smtp_config, approver["email"], subject, html)
        if success:
            sent += 1
            sent_emails.add(approver["email"])
    # Admin copy if not already sent to admin
    if SYSTEM_ADMIN_EMAIL not in sent_emails:
        await _send_admin_copy(f"Clara Global Protect: {subject}", html)
    logger.info(f"Approval request sent to {sent} approvers")
