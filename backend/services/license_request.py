"""License request service — sends license request emails when a new main site is created."""
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from database import db
from services.email_service import (
    send_email_with_config, _get_branding_info, _build_dynamic_header,
)

logger = logging.getLogger(__name__)

LICENSE_ADMIN_EMAIL = "clara.license@koodh.com"
BRUSSELS_TZ = ZoneInfo("Europe/Brussels")

SITE_TYPE_LABELS = {
    "radio": "Standard",
    "technical": "Technical",
    "server": "Server",
    "task_scheduler": "Tasks",
}


def build_license_request_html(
    site_name: str,
    site_type: str,
    site_slug: str,
    requester_name: str,
    requester_email: str,
    environment_name: str,
    brand_name: str = "Clara",
    brand_logo_url: str = None,
) -> str:
    """Build HTML email body for a license request."""
    type_label = SITE_TYPE_LABELS.get(site_type, site_type)
    now_brussels = datetime.now(BRUSSELS_TZ).strftime("%d-%m-%Y %H:%M")
    header = _build_dynamic_header(brand_name, brand_logo_url, "New License Request", "linear-gradient(135deg,#3b82f6,#2563eb)")

    return f"""
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:600px;margin:0 auto;background:#111;border-radius:12px;overflow:hidden;border:1px solid #333;">
      {header}
      <div style="padding:24px;">
        <p style="color:#d4d4d8;font-size:14px;margin:0 0 16px;">
          A new site has been created and requires a license assignment.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:10px 12px;color:#a1a1aa;font-size:13px;border-bottom:1px solid #333;width:140px;">Site Name</td><td style="padding:10px 12px;color:#fff;font-size:14px;font-weight:600;border-bottom:1px solid #333;">{site_name}</td></tr>
          <tr><td style="padding:10px 12px;color:#a1a1aa;font-size:13px;border-bottom:1px solid #333;">Site Type</td><td style="padding:10px 12px;color:#fff;font-size:14px;border-bottom:1px solid #333;">{type_label}</td></tr>
          <tr><td style="padding:10px 12px;color:#a1a1aa;font-size:13px;border-bottom:1px solid #333;">URL Slug</td><td style="padding:10px 12px;color:#fff;font-size:14px;font-family:monospace;border-bottom:1px solid #333;">/{site_slug}</td></tr>
          <tr><td style="padding:10px 12px;color:#a1a1aa;font-size:13px;border-bottom:1px solid #333;">Environment</td><td style="padding:10px 12px;color:#fff;font-size:14px;border-bottom:1px solid #333;">{environment_name}</td></tr>
          <tr><td style="padding:10px 12px;color:#a1a1aa;font-size:13px;border-bottom:1px solid #333;">Requested By</td><td style="padding:10px 12px;color:#fff;font-size:14px;border-bottom:1px solid #333;">{requester_name}</td></tr>
          <tr><td style="padding:10px 12px;color:#a1a1aa;font-size:13px;border-bottom:1px solid #333;">Email</td><td style="padding:10px 12px;color:#fff;font-size:14px;border-bottom:1px solid #333;">{requester_email}</td></tr>
          <tr><td style="padding:10px 12px;color:#a1a1aa;font-size:13px;">Date</td><td style="padding:10px 12px;color:#fff;font-size:14px;">{now_brussels}</td></tr>
        </table>
        <p style="color:#71717a;font-size:12px;margin:20px 0 0;text-align:center;">
          Log in to {brand_name} License Manager to assign a license to this site.
        </p>
      </div>
    </div>
    """


async def send_license_request(
    site_name: str,
    site_type: str,
    site_slug: str,
    site_id: str,
    environment_id: str,
    requester_id: str,
    requester_name: str,
    requester_email: str,
) -> dict:
    """Create a license request record and send notification email."""

    # Resolve environment name
    env_name = "Unknown"
    if environment_id:
        env = await db.environments.find_one({"id": environment_id}, {"_id": 0, "name": 1})
        if env:
            env_name = env["name"]

    now = datetime.now(timezone.utc).isoformat()
    request_doc = {
        "id": f"lr-{site_id}",
        "main_site_id": site_id,
        "site_name": site_name,
        "site_type": site_type,
        "site_slug": site_slug,
        "environment_id": environment_id or "",
        "environment_name": env_name,
        "requester_id": requester_id,
        "requester_name": requester_name,
        "requester_email": requester_email,
        "status": "pending",
        "created_at": now,
        "updated_at": now,
        "reviewed_by": None,
        "reviewed_at": None,
        "notes": "",
    }
    await db.license_requests.insert_one(request_doc)
    logger.info(f"License request created for site '{site_name}' by {requester_email}")

    # Send email
    smtp_config = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp_config or not smtp_config.get("password"):
        logger.warning("SMTP not configured — license request email not sent")
        return {"sent": False, "reason": "smtp_not_configured"}

    branding = await _get_branding_info()
    html = build_license_request_html(
        site_name=site_name,
        site_type=site_type,
        site_slug=site_slug,
        requester_name=requester_name,
        requester_email=requester_email,
        environment_name=env_name,
        brand_name=branding["brand_name"],
        brand_logo_url=branding["brand_logo_url"],
    )

    type_label = SITE_TYPE_LABELS.get(site_type, site_type)
    subject = f"{branding['brand_name']} — License Request: {site_name} ({type_label})"

    success = await send_email_with_config(smtp_config, LICENSE_ADMIN_EMAIL, subject, html)
    if success:
        logger.info(f"License request email sent to {LICENSE_ADMIN_EMAIL} for site '{site_name}'")
    else:
        logger.error(f"Failed to send license request email for site '{site_name}'")

    return {"sent": success}
