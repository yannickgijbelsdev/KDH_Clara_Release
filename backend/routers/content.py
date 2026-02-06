"""Content library routes."""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime, timezone
from pathlib import Path
import uuid
import mimetypes
import aiofiles
import io

from database import db, UPLOADS_DIR
from models.content import (
    ContentItemCreate, ContentItemUpdate, ContentItemResponse,
    FeaturedImageResponse, CategoryResponse, ContentApprovalUpdate
)
from services.auth import get_current_user, require_editor_or_admin, require_admin, require_can_approve_content
from services.helpers import get_content_with_publish_statuses
from services.audit import log_action, get_client_ip
from services.s3_storage import upload_file_to_s3, delete_file_from_s3, is_s3_configured

content_router = APIRouter(prefix="/content", tags=["Content Library"])


# ============== AUDIT LOG HELPERS ==============

def get_field_changes(old_data: dict, new_data: dict) -> List[dict]:
    """Compare old and new data and return list of changes."""
    changes = []
    fields_to_track = ['title', 'body', 'excerpt', 'external_url', 'category_id', 'status', 'type']
    
    for field in fields_to_track:
        old_value = old_data.get(field)
        new_value = new_data.get(field)
        
        if new_value is not None and old_value != new_value:
            # For body field, truncate for display
            if field == 'body':
                old_display = (old_value[:100] + '...') if old_value and len(old_value) > 100 else old_value
                new_display = (new_value[:100] + '...') if new_value and len(new_value) > 100 else new_value
            else:
                old_display = old_value
                new_display = new_value
            
            changes.append({
                "field": field,
                "old_value": old_display,
                "new_value": new_display
            })
    
    return changes


async def create_content_audit_log(
    content_id: str,
    action: str,
    user_id: str,
    user_name: str,
    changes: List[dict] = None,
    details: str = None,
    ip_address: str = None
):
    """Create an audit log entry for content changes."""
    log_entry = {
        "id": str(uuid.uuid4()),
        "content_id": content_id,
        "action": action,
        "user_id": user_id,
        "user_name": user_name,
        "changes": changes or [],
        "details": details,
        "ip_address": ip_address,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.content_audit_logs.insert_one(log_entry)
    return log_entry


# ============== CATEGORIES ==============

@content_router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(current_user: dict = Depends(get_current_user)):
    """Get all categories for the team."""
    categories = await db.categories.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    return categories


@content_router.post("/categories", response_model=CategoryResponse)
async def create_category(
    name: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Create a new category."""
    slug = name.lower().replace(" ", "-")
    cat_id = str(uuid.uuid4())[:8]
    
    cat_doc = {
        "id": f"cat_{cat_id}",
        "team_id": current_user.get('team_id'),
        "name": name,
        "slug": slug,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.categories.insert_one(cat_doc)
    cat_doc.pop('_id', None)
    return cat_doc


# ============== CONTENT ITEMS ==============

async def enrich_content_item(item: dict) -> dict:
    """Add category and creator info to content item."""
    # Add category info
    if item.get("category_id"):
        category = await db.categories.find_one({"id": item["category_id"]}, {"_id": 0})
        if category:
            item["category"] = category
    
    # Add creator name
    if item.get("created_by"):
        creator = await db.users.find_one({"id": item["created_by"]}, {"_id": 0, "name": 1})
        if creator:
            item["created_by_name"] = creator.get("name", "Unknown")
    
    return item


@content_router.get("", response_model=List[ContentItemResponse])
async def get_content_items(
    type: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[str] = None,
    search: Optional[str] = None,
    include_deleted: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get all content items for the team. Deleted items only visible to admins."""
    query = {"team_id": current_user.get('team_id')}
    
    # Filter out deleted items for non-admins
    is_admin = current_user.get('role') == 'admin'
    if not is_admin or not include_deleted:
        query["deleted_at"] = {"$exists": False}
    
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    if category_id:
        query["category_id"] = category_id
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    
    items = await db.content_items.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    
    result = []
    for item in items:
        # Enrich with category and creator info
        item = await enrich_content_item(item)
        
        # Add publish statuses
        publish_statuses = await db.content_item_publishes.find(
            {"content_item_id": item["id"]},
            {"_id": 0}
        ).to_list(100)
        
        for ps in publish_statuses:
            site = await db.wordpress_sites.find_one({"id": ps["wordpress_site_id"]}, {"_id": 0})
            ps["wordpress_site_name"] = site["name"] if site else "Unknown"
        
        item["publish_statuses"] = publish_statuses
        result.append(item)
    
    return result


@content_router.post("", response_model=ContentItemResponse, status_code=status.HTTP_201_CREATED)
async def create_content_item(
    content_data: ContentItemCreate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Create a new content item."""
    content_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    content_doc = {
        "id": content_id,
        "title": content_data.title,
        "type": content_data.type,
        "body": content_data.body or "",
        "excerpt": content_data.excerpt or "",
        "external_url": content_data.external_url or "",
        "category_id": content_data.category_id,
        "status": content_data.status,
        "team_id": current_user.get('team_id', ''),
        "created_by": current_user['id'],
        "created_at": now,
        "updated_at": now
    }
    
    await db.content_items.insert_one(content_doc)
    content_doc.pop('_id', None)
    
    # Log content creation
    await log_action(
        action="Created Content",
        category="content",
        user_id=current_user['id'],
        user_name=current_user.get('name'),
        user_email=current_user.get('email'),
        team_id=current_user.get('team_id'),
        ip_address=get_client_ip(request),
        target_type="content_item",
        target_id=content_id,
        target_name=content_data.title,
        details={
            "type": content_data.type,
            "status": content_data.status
        }
    )
    
    # Enrich with category and creator info
    content_doc = await enrich_content_item(content_doc)
    content_doc["publish_statuses"] = []
    return content_doc


@content_router.get("/{content_id}", response_model=ContentItemResponse)
async def get_content_item(
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single content item."""
    content = await get_content_with_publish_statuses(content_id, current_user.get('team_id'))
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    return content


@content_router.put("/{content_id}", response_model=ContentItemResponse)
async def update_content_item(
    content_id: str,
    content_data: ContentItemUpdate,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Update a content item."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    # Track changes before update
    update_dict = {k: v for k, v in content_data.model_dump().items() if v is not None}
    changes = get_field_changes(content, update_dict)
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # If status is changing to "ready", reset approval status to pending
    if update_dict.get('status') == 'ready' and content.get('status') != 'ready':
        update_dict["approval_status"] = "pending"
        update_dict["approved_by"] = None
        update_dict["approved_at"] = None
        update_dict["approval_notes"] = None
    
    await db.content_items.update_one(
        {"id": content_id},
        {"$set": update_dict}
    )
    
    # Create audit log if there were changes
    if changes:
        ip_address = request.client.host if request.client else None
        await create_content_audit_log(
            content_id=content_id,
            action="updated",
            user_id=current_user['id'],
            user_name=current_user.get('name', 'Unknown'),
            changes=changes,
            ip_address=ip_address
        )
    
    return await get_content_with_publish_statuses(content_id, current_user.get('team_id'))


# ============== ADMIN APPROVAL ==============

@content_router.put("/{content_id}/approval", response_model=ContentItemResponse)
async def update_content_approval(
    content_id: str,
    approval_data: ContentApprovalUpdate,
    request: Request,
    current_user: dict = Depends(require_can_approve_content)
):
    """Admin/News Admin: Approve or reject content for WordPress publishing."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    update_doc = {
        "approval_status": approval_data.approval_status,
        "approval_notes": approval_data.approval_notes,
        "updated_at": now
    }
    
    if approval_data.approval_status == "approved":
        update_doc["approved_by"] = current_user['id']
        update_doc["approved_at"] = now
    elif approval_data.approval_status == "rejected":
        update_doc["approved_by"] = current_user['id']
        update_doc["approved_at"] = now
    else:  # pending
        update_doc["approved_by"] = None
        update_doc["approved_at"] = None
    
    await db.content_items.update_one(
        {"id": content_id},
        {"$set": update_doc}
    )
    
    # Create audit log
    ip_address = request.client.host if request.client else None
    await create_content_audit_log(
        content_id=content_id,
        action=f"approval_{approval_data.approval_status}",
        user_id=current_user['id'],
        user_name=current_user.get('name', 'Unknown'),
        details=approval_data.approval_notes or f"Content {approval_data.approval_status}",
        ip_address=ip_address
    )
    
    return await get_content_with_publish_statuses(content_id, current_user.get('team_id'))


@content_router.get("/admin/pending-approval")
async def get_pending_approval_content(
    current_user: dict = Depends(require_admin)
):
    """Admin: Get all content pending approval."""
    items = await db.content_items.find(
        {
            "team_id": current_user.get('team_id'),
            "status": "ready",
            "$or": [
                {"approval_status": {"$exists": False}},
                {"approval_status": "pending"}
            ]
        },
        {"_id": 0}
    ).sort("updated_at", -1).to_list(500)
    
    result = []
    for item in items:
        item = await enrich_content_item(item)
        result.append(item)
    
    return result


@content_router.delete("/{content_id}")
async def delete_content_item(
    content_id: str,
    request: Request,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Soft delete a content item and remove from WordPress."""
    import httpx
    import base64
    
    content = await db.content_items.find_one({"id": content_id, "team_id": current_user.get('team_id')})
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    # Get all WordPress publish records
    publish_records = await db.content_item_publishes.find(
        {"content_item_id": content_id}
    ).to_list(100)
    
    wp_deletion_results = []
    
    # Delete from WordPress for each published site
    async with httpx.AsyncClient(timeout=30.0) as client:
        for record in publish_records:
            if record.get('wp_post_id'):
                site = await db.wordpress_sites.find_one({"id": record['wordpress_site_id']})
                if site and site.get('is_active'):
                    try:
                        credentials = f"{site['username']}:{site['app_password']}"
                        auth_header = base64.b64encode(credentials.encode()).decode()
                        headers = {"Authorization": f"Basic {auth_header}"}
                        
                        # Delete (trash) the WordPress post
                        endpoint = f"{site['wp_base_url']}/wp-json/wp/v2/{record.get('wp_post_type', 'post')}s/{record['wp_post_id']}"
                        response = await client.delete(endpoint, headers=headers)
                        
                        wp_deletion_results.append({
                            "site": site['name'],
                            "success": response.status_code in [200, 201],
                            "wp_post_id": record['wp_post_id']
                        })
                    except Exception as e:
                        wp_deletion_results.append({
                            "site": site.get('name', 'Unknown'),
                            "success": False,
                            "error": str(e)
                        })
    
    # Soft delete - mark as deleted instead of removing
    now = datetime.now(timezone.utc).isoformat()
    await db.content_items.update_one(
        {"id": content_id},
        {"$set": {
            "deleted_at": now,
            "deleted_by": current_user['id'],
            "updated_at": now
        }}
    )
    
    # Log the deletion
    ip_address = request.client.host if request.client else None
    await create_content_audit_log(
        content_id=content_id,
        action="deleted",
        user_id=current_user['id'],
        user_name=current_user.get('name', 'Unknown'),
        details=f"Deleted content: {content.get('title', 'Unknown')}. WordPress deletions: {len([r for r in wp_deletion_results if r.get('success')])} successful",
        ip_address=ip_address
    )
    
    return {
        "message": "Content deleted",
        "wordpress_deletions": wp_deletion_results
    }


@content_router.post("/{content_id}/restore")
async def restore_content_item(
    content_id: str,
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Admin: Restore a soft-deleted content item."""
    content = await db.content_items.find_one({
        "id": content_id, 
        "team_id": current_user.get('team_id'),
        "deleted_at": {"$exists": True}
    })
    if not content:
        raise HTTPException(status_code=404, detail="Deleted content item not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.content_items.update_one(
        {"id": content_id},
        {
            "$unset": {"deleted_at": "", "deleted_by": ""},
            "$set": {"updated_at": now}
        }
    )
    
    # Log the restoration
    ip_address = request.client.host if request.client else None
    await create_content_audit_log(
        content_id=content_id,
        action="restored",
        user_id=current_user['id'],
        user_name=current_user.get('name', 'Unknown'),
        details=f"Restored content: {content.get('title', 'Unknown')}",
        ip_address=ip_address
    )
    
    return await get_content_with_publish_statuses(content_id, current_user.get('team_id'))


@content_router.get("/admin/deleted")
async def get_deleted_content(
    current_user: dict = Depends(require_admin)
):
    """Admin: Get all soft-deleted content items."""
    items = await db.content_items.find(
        {
            "team_id": current_user.get('team_id'),
            "deleted_at": {"$exists": True}
        },
        {"_id": 0}
    ).sort("deleted_at", -1).to_list(500)
    
    result = []
    for item in items:
        item = await enrich_content_item(item)
        # Add deleted_by_name
        if item.get("deleted_by"):
            deleter = await db.users.find_one({"id": item["deleted_by"]}, {"_id": 0, "name": 1})
            if deleter:
                item["deleted_by_name"] = deleter.get("name", "Unknown")
        result.append(item)
    
    return result


@content_router.delete("/{content_id}/permanent")
async def permanent_delete_content_item(
    content_id: str,
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """Admin: Permanently delete a soft-deleted content item."""
    content = await db.content_items.find_one({
        "id": content_id, 
        "team_id": current_user.get('team_id'),
        "deleted_at": {"$exists": True}
    })
    if not content:
        raise HTTPException(status_code=404, detail="Deleted content item not found")
    
    # Delete associated data
    await db.content_item_publishes.delete_many({"content_item_id": content_id})
    await db.content_item_featured_images.delete_many({"content_item_id": content_id})
    await db.content_audit_logs.delete_many({"content_id": content_id})
    
    # Delete any uploaded files
    featured_image = content.get("featured_image")
    if featured_image:
        file_path = UPLOADS_DIR / featured_image.get("file_storage_key", "")
        if file_path.exists():
            file_path.unlink()
    
    # Delete site-specific featured images
    site_images = await db.content_item_featured_images.find(
        {"content_item_id": content_id}
    ).to_list(100)
    for img in site_images:
        img_path = UPLOADS_DIR / img.get("file_storage_key", "")
        if img_path.exists():
            img_path.unlink()
    
    # Finally, delete the content item
    await db.content_items.delete_one({"id": content_id})
    
    return {"message": "Content permanently deleted"}


# ============== CONTENT AUDIT LOGS ==============

@content_router.get("/{content_id}/audit-logs")
async def get_content_audit_logs(
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get audit logs for a specific content item."""
    # Verify content exists and user has access
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    logs = await db.content_audit_logs.find(
        {"content_id": content_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(500)
    
    return logs


@content_router.get("/{content_id}/audit-logs/export-pdf")
async def export_content_audit_logs_pdf(
    content_id: str,
    current_user: dict = Depends(require_admin)
):
    """Export audit logs for a content item as PDF."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import inch
    
    # Verify content exists and user has access
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    logs = await db.content_audit_logs.find(
        {"content_id": content_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(500)
    
    # Create PDF in memory
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=20
    )
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.grey,
        spaceAfter=20
    )
    
    elements = []
    
    # Title
    elements.append(Paragraph(f"Audit Log: {content.get('title', 'Unknown')[:60]}", title_style))
    elements.append(Paragraph(
        f"Generated on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} • {len(logs)} entries",
        subtitle_style
    ))
    
    if not logs:
        elements.append(Paragraph("No audit log entries found.", styles['Normal']))
    else:
        for log in logs:
            # Log header
            timestamp = log.get('timestamp', '')[:19].replace('T', ' ')
            action = log.get('action', 'unknown').upper()
            user_name = log.get('user_name', 'Unknown')
            ip = log.get('ip_address', 'N/A')
            
            header_text = f"<b>{timestamp}</b> - {action} by <b>{user_name}</b> (IP: {ip})"
            elements.append(Paragraph(header_text, styles['Normal']))
            
            # Changes table
            changes = log.get('changes', [])
            if changes:
                table_data = [['Field', 'Old Value', 'New Value']]
                for change in changes:
                    field = change.get('field', '')
                    old_val = str(change.get('old_value', ''))[:50] or '(empty)'
                    new_val = str(change.get('new_value', ''))[:50] or '(empty)'
                    table_data.append([field, old_val, new_val])
                
                table = Table(table_data, colWidths=[1.2*inch, 2.5*inch, 2.5*inch])
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#27272a')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                    ('TOPPADDING', (0, 0), (-1, 0), 8),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
                elements.append(Spacer(1, 5))
                elements.append(table)
            
            # Details if present
            if log.get('details'):
                elements.append(Paragraph(f"<i>Details: {log['details']}</i>", styles['Normal']))
            
            elements.append(Spacer(1, 15))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"audit_log_{content_id[:8]}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ============== CONTENT FEATURED IMAGE (Not site-specific) ==============

@content_router.post("/{content_id}/featured-image")
async def upload_content_featured_image(
    content_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Upload a featured image for the content item to S3."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    if content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}")
    
    # Delete old featured image if exists
    old_image = content.get("featured_image")
    if old_image:
        old_key = old_image.get("file_storage_key", "")
        if old_key.startswith("content/") and is_s3_configured():
            try:
                await delete_file_from_s3(old_key)
            except:
                pass
        else:
            old_file = UPLOADS_DIR / old_key
            if old_file.exists():
                old_file.unlink()
    
    # Read file content
    file_content = await file.read()
    file_size = len(file_content)
    
    # Save to S3 or local
    file_ext = Path(file.filename).suffix or '.jpg'
    storage_key = f"content/{current_user.get('team_id')}/{content_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    s3_url = None
    
    if is_s3_configured():
        try:
            result = await upload_file_to_s3(file_content, storage_key, content_type)
            s3_url = result['url']
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")
    else:
        local_key = f"content_{content_id}_{uuid.uuid4().hex[:8]}{file_ext}"
        file_path = UPLOADS_DIR / local_key
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_content)
        storage_key = local_key
    
    now = datetime.now(timezone.utc).isoformat()
    image_data = {
        "file_storage_key": storage_key,
        "s3_url": s3_url,
        "file_name": file.filename,
        "mime_type": content_type,
        "size": file_size
    }
    
    await db.content_items.update_one(
        {"id": content_id},
        {"$set": {"featured_image": image_data, "updated_at": now}}
    )
    
    return {"success": True, "featured_image": image_data}


@content_router.delete("/{content_id}/featured-image")
async def delete_content_featured_image(
    content_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete the featured image from a content item."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    featured_image = content.get("featured_image")
    if featured_image:
        storage_key = featured_image.get("file_storage_key", "")
        if storage_key.startswith("content/") and is_s3_configured():
            try:
                await delete_file_from_s3(storage_key)
            except:
                pass
        else:
            file_path = UPLOADS_DIR / storage_key
            if file_path.exists():
                file_path.unlink()
    
    await db.content_items.update_one(
        {"id": content_id},
        {"$set": {"featured_image": None, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True}


# ============== SITE-SPECIFIC FEATURED IMAGE ROUTES ==============

@content_router.get("/{content_id}/featured-images", response_model=List[FeaturedImageResponse])
async def get_featured_images(
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all featured images for a content item."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    images = await db.content_item_featured_images.find(
        {"content_item_id": content_id},
        {"_id": 0}
    ).to_list(100)
    
    for img in images:
        site = await db.wordpress_sites.find_one({"id": img["wordpress_site_id"]}, {"_id": 0})
        img["wordpress_site_name"] = site["name"] if site else "Unknown"
    
    return images


@content_router.post("/{content_id}/featured-images/{site_id}", response_model=FeaturedImageResponse)
async def upload_featured_image(
    content_id: str,
    site_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_editor_or_admin)
):
    """Upload a featured image for a specific WordPress site to S3."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    site = await db.wordpress_sites.find_one(
        {"id": site_id, "team_id": current_user.get('team_id')}
    )
    if not site:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    if content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}")
    
    # Delete existing image if any
    existing = await db.content_item_featured_images.find_one({
        "content_item_id": content_id,
        "wordpress_site_id": site_id
    })
    if existing:
        old_key = existing.get("file_storage_key", "")
        if old_key.startswith("featured/") and is_s3_configured():
            try:
                await delete_file_from_s3(old_key)
            except:
                pass
        else:
            old_file = UPLOADS_DIR / old_key
            if old_file.exists():
                old_file.unlink()
        await db.content_item_featured_images.delete_one({"id": existing["id"]})
    
    # Read file content
    file_content = await file.read()
    file_size = len(file_content)
    
    # Save to S3 or local
    file_ext = Path(file.filename).suffix or '.jpg'
    storage_key = f"featured/{current_user.get('team_id')}/{content_id}_{site_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    s3_url = None
    
    if is_s3_configured():
        try:
            result = await upload_file_to_s3(file_content, storage_key, content_type)
            s3_url = result['url']
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")
    else:
        local_key = f"{content_id}_{site_id}_{uuid.uuid4().hex[:8]}{file_ext}"
        file_path = UPLOADS_DIR / local_key
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_content)
        storage_key = local_key
    
    now = datetime.now(timezone.utc).isoformat()
    image_doc = {
        "id": str(uuid.uuid4()),
        "content_item_id": content_id,
        "wordpress_site_id": site_id,
        "file_storage_key": storage_key,
        "s3_url": s3_url,
        "file_name": file.filename,
        "mime_type": content_type,
        "size": file_size,
        "wp_media_id": None,
        "wp_media_url": None,
        "sync_status": "not_synced",
        "sync_error_message": None,
        "last_synced_at": None,
        "created_at": now,
        "updated_at": now
    }
    
    await db.content_item_featured_images.insert_one(image_doc)
    image_doc.pop("_id", None)
    image_doc["wordpress_site_name"] = site["name"]
    
    return image_doc


@content_router.delete("/{content_id}/featured-images/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_featured_image(
    content_id: str,
    site_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    """Delete a featured image for a specific WordPress site."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    image = await db.content_item_featured_images.find_one({
        "content_item_id": content_id,
        "wordpress_site_id": site_id
    })
    if not image:
        raise HTTPException(status_code=404, detail="Featured image not found")
    
    storage_key = image.get("file_storage_key", "")
    if storage_key.startswith("featured/") and is_s3_configured():
        try:
            await delete_file_from_s3(storage_key)
        except:
            pass
    else:
        file_path = UPLOADS_DIR / storage_key
        if file_path.exists():
            file_path.unlink()
    
    await db.content_item_featured_images.delete_one({"id": image["id"]})


# ============== PUBLISH STATUS ==============

@content_router.get("/{content_id}/publish/{site_id}")
async def get_publish_status(
    content_id: str,
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get publish status for a content item on a specific site."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    publish_record = await db.content_item_publishes.find_one(
        {"content_item_id": content_id, "wordpress_site_id": site_id},
        {"_id": 0}
    )
    
    if not publish_record:
        return {"sync_status": "not_synced"}
    
    site = await db.wordpress_sites.find_one({"id": site_id}, {"_id": 0})
    publish_record["wordpress_site_name"] = site["name"] if site else "Unknown"
    
    return publish_record
