"""Email service for sending notifications via SMTP (Microsoft 365)."""
import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger(__name__)

# SMTP Configuration from environment
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.office365.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM_EMAIL = os.environ.get('SMTP_FROM_EMAIL', SMTP_USER)
SMTP_FROM_NAME = os.environ.get('SMTP_FROM_NAME', 'Clara Radio Dashboard')


def is_smtp_configured() -> bool:
    """Check if SMTP is properly configured."""
    return bool(SMTP_USER and SMTP_PASSWORD and SMTP_HOST)


async def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    plain_body: Optional[str] = None
) -> bool:
    """
    Send an email via SMTP.
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        html_body: HTML content of the email
        plain_body: Optional plain text version
        
    Returns:
        True if email was sent successfully
    """
    if not is_smtp_configured():
        logger.warning("SMTP not configured, skipping email send")
        return False
    
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        msg['To'] = to_email
        
        # Add plain text version (fallback)
        if plain_body:
            msg.attach(MIMEText(plain_body, 'plain', 'utf-8'))
        
        # Add HTML version
        msg.attach(MIMEText(html_body, 'html', 'utf-8'))
        
        # Send email
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, to_email, msg.as_string())
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False


async def send_content_approval_notification(
    to_email: str,
    to_name: str,
    content_title: str,
    approval_status: str,
    approval_notes: Optional[str] = None,
    approver_name: Optional[str] = None,
    content_url: Optional[str] = None
) -> bool:
    """
    Send a notification when content is approved or rejected.
    
    Args:
        to_email: Content creator's email
        to_name: Content creator's name
        content_title: Title of the content
        approval_status: 'approved' or 'rejected'
        approval_notes: Optional notes from the approver
        approver_name: Name of the person who approved/rejected
        content_url: Optional URL to view the content
    """
    is_approved = approval_status == 'approved'
    
    subject = f"{'✅ Goedgekeurd' if is_approved else '❌ Afgewezen'}: {content_title}"
    
    status_color = '#22c55e' if is_approved else '#ef4444'
    status_text = 'goedgekeurd' if is_approved else 'afgewezen'
    status_icon = '✅' if is_approved else '❌'
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #18181b 0%, #27272a 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; }}
            .header h1 {{ margin: 0; font-size: 24px; }}
            .content {{ background: #f4f4f5; padding: 30px; border-radius: 0 0 12px 12px; }}
            .status-badge {{ display: inline-block; background: {status_color}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: 600; margin: 15px 0; }}
            .content-title {{ background: white; padding: 15px; border-radius: 8px; border-left: 4px solid {status_color}; margin: 15px 0; }}
            .notes {{ background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }}
            .notes-label {{ font-weight: 600; color: #666; margin-bottom: 5px; }}
            .button {{ display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 15px; }}
            .footer {{ text-align: center; color: #666; font-size: 12px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Clara Radio Dashboard</h1>
            </div>
            <div class="content">
                <p>Hallo {to_name},</p>
                
                <p>Je content is <strong>{status_text}</strong> {f'door {approver_name}' if approver_name else ''}.</p>
                
                <div class="status-badge">{status_icon} {status_text.upper()}</div>
                
                <div class="content-title">
                    <strong>Content:</strong><br>
                    {content_title}
                </div>
                
                {f'''<div class="notes">
                    <div class="notes-label">Opmerkingen:</div>
                    {approval_notes}
                </div>''' if approval_notes else ''}
                
                {f'<a href="{content_url}" class="button">Bekijk Content</a>' if content_url else ''}
                
                <div class="footer">
                    <p>Dit is een automatisch gegenereerd bericht van Clara Radio Dashboard.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_body = f"""
Hallo {to_name},

Je content "{content_title}" is {status_text}{f' door {approver_name}' if approver_name else ''}.

{f'Opmerkingen: {approval_notes}' if approval_notes else ''}

{f'Bekijk: {content_url}' if content_url else ''}

-- 
Clara Radio Dashboard
    """
    
    return await send_email(to_email, subject, html_body, plain_body)


async def test_smtp_connection() -> dict:
    """Test SMTP connection and return status."""
    if not is_smtp_configured():
        return {'connected': False, 'error': 'SMTP credentials not configured'}
    
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
        return {'connected': True, 'host': SMTP_HOST, 'user': SMTP_USER}
    except Exception as e:
        return {'connected': False, 'error': str(e)}
