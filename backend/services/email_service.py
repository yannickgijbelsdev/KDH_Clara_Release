"""Email service for sending notifications via SMTP."""
import smtplib
import ssl
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

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

        if smtp_config.get("use_tls", True):
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.starttls(context=context)
                server.login(smtp_config["username"], smtp_config["password"])
                server.sendmail(from_email, to_email, msg.as_string())
        else:
            with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as server:
                server.login(smtp_config["username"], smtp_config["password"])
                server.sendmail(from_email, to_email, msg.as_string())

        logger.info(f"Email sent to {to_email}: {subject}")
        return True
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


def build_notification_html(event_type: str, category: str, details: str, site_name: str = "", user_name: str = "") -> str:
    """Build HTML email body for a real-time notification."""
    cat_info = NOTIFICATION_CATEGORIES.get(category, {})
    cat_name = cat_info.get("name", category.title())
    now = datetime.now(timezone.utc).strftime("%d-%m-%Y %H:%M UTC")

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
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Radio Management Platform</div>
    </div>"""


def build_daily_summary_html(events: list) -> str:
    """Build HTML for daily summary email."""
    now = datetime.now(timezone.utc).strftime("%d-%m-%Y")
    rows = ""
    for evt in events[:50]:
        cat_info = NOTIFICATION_CATEGORIES.get(evt.get("category", ""), {})
        rows += f"""
        <tr style="border-bottom:1px solid #27272a;">
            <td style="padding:8px 12px;font-size:12px;color:#a1a1aa;">{evt.get('timestamp','')[:16]}</td>
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
        <div style="padding:12px 24px;background:#09090b;text-align:center;font-size:11px;color:#52525b;">Clara Radio Management Platform</div>
    </div>"""
