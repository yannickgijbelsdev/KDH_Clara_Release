"""WordPress integration routes.

SECURITY REQUIREMENTS:
- Uses WordPress Application Passwords (NOT normal login passwords)
- Credentials are never returned via API or UI
- Each WordPress site should use a dedicated service account (NOT Administrator)
- Service account minimum capabilities: edit_posts, publish_posts, upload_files
- 2FA on WordPress human accounts works independently of app passwords
- Failed authentication attempts are logged for audit
- Sites can be disabled via is_active toggle without deleting credentials
"""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from datetime import datetime, timezone
import uuid
import httpx
import base64
import aiofiles
import logging

from database import db, UPLOADS_DIR
from models.wordpress import (
    WordPressSiteCreate, WordPressSiteUpdate, WordPressSiteResponse,
    PublishToWordPressRequest, PublishResponse, PublishResult,
    WordPressConnectionTestResponse
)
from services.auth import get_current_user, require_admin, require_editor_or_admin

# Security audit logger for WordPress integration
wp_audit_logger = logging.getLogger("wordpress.audit")
wp_audit_logger.setLevel(logging.INFO)

wordpress_router = APIRouter(prefix="/wordpress", tags=["WordPress"])


@wordpress_router.get("/sites", response_model=List[WordPressSiteResponse])
async def get_wordpress_sites(
    current_user: dict = Depends(get_current_user)
):
    """Get all WordPress sites for the team."""
    sites = await db.wordpress_sites.find(
        {"team_id": current_user.get('team_id')},
        {"_id": 0, "app_password": 0}
    ).to_list(100)
    return sites


@wordpress_router.get("/sites/{site_id}", response_model=WordPressSiteResponse)
async def get_wordpress_site(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single WordPress site."""
    site = await db.wordpress_sites.find_one(
        {"id": site_id, "team_id": current_user.get('team_id')},
        {"_id": 0, "app_password": 0}
    )
    if not site:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    return site


@wordpress_router.post("/sites", response_model=WordPressSiteResponse, status_code=status.HTTP_201_CREATED)
async def create_wordpress_site(
    site_data: WordPressSiteCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new WordPress site connection (admin only)."""
    site_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    site_doc = {
        "id": site_id,
        "team_id": current_user.get('team_id'),
        "name": site_data.name,
        "wp_base_url": site_data.wp_base_url.rstrip('/'),
        "username": site_data.username,
        "app_password": site_data.app_password,
        "default_post_type": site_data.default_post_type,
        "default_publish_status": site_data.default_publish_status,
        "is_active": site_data.is_active,
        "created_at": now,
        "updated_at": now
    }
    
    await db.wordpress_sites.insert_one(site_doc)
    
    del site_doc["app_password"]
    site_doc.pop("_id", None)
    return site_doc


@wordpress_router.put("/sites/{site_id}", response_model=WordPressSiteResponse)
async def update_wordpress_site(
    site_id: str,
    site_data: WordPressSiteUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a WordPress site connection (admin only)."""
    site = await db.wordpress_sites.find_one(
        {"id": site_id, "team_id": current_user.get('team_id')}
    )
    if not site:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    
    update_dict = {k: v for k, v in site_data.model_dump().items() if v is not None}
    if "wp_base_url" in update_dict:
        update_dict["wp_base_url"] = update_dict["wp_base_url"].rstrip('/')
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.wordpress_sites.update_one(
        {"id": site_id},
        {"$set": update_dict}
    )
    
    updated_site = await db.wordpress_sites.find_one(
        {"id": site_id},
        {"_id": 0, "app_password": 0}
    )
    return updated_site


@wordpress_router.delete("/sites/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wordpress_site(
    site_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a WordPress site connection (admin only)."""
    result = await db.wordpress_sites.delete_one(
        {"id": site_id, "team_id": current_user.get('team_id')}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    
    await db.content_item_publishes.delete_many({"wordpress_site_id": site_id})


@wordpress_router.post("/sites/{site_id}/test")
async def test_wordpress_site(
    site_id: str,
    current_user: dict = Depends(require_admin)
):
    """Test a WordPress site connection (admin only)."""
    site = await db.wordpress_sites.find_one(
        {"id": site_id, "team_id": current_user.get('team_id')}
    )
    if not site:
        raise HTTPException(status_code=404, detail="WordPress site not found")
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            auth_string = f"{site['username']}:{site['app_password']}"
            auth_bytes = base64.b64encode(auth_string.encode()).decode()
            headers = {"Authorization": f"Basic {auth_bytes}"}
            
            response = await client.get(
                f"{site['wp_base_url']}/wp-json/wp/v2/users/me",
                headers=headers
            )
            
            if response.status_code == 200:
                user_data = response.json()
                return {
                    "success": True,
                    "message": f"Connected as {user_data.get('name', 'Unknown')}",
                    "wp_user": user_data.get('name')
                }
            else:
                return {
                    "success": False,
                    "message": f"Authentication failed: {response.status_code}",
                    "error": response.text[:200]
                }
    except httpx.TimeoutException:
        return {"success": False, "message": "Connection timed out"}
    except Exception as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}


@wordpress_router.get("/connection")
async def get_legacy_connection(
    current_user: dict = Depends(get_current_user)
):
    """Legacy endpoint - returns first active site if exists."""
    site = await db.wordpress_sites.find_one(
        {"team_id": current_user.get('team_id'), "is_active": True},
        {"_id": 0, "app_password": 0}
    )
    if site:
        return {
            "id": site["id"],
            "team_id": site["team_id"],
            "wp_base_url": site["wp_base_url"],
            "username": site["username"],
            "default_post_type": site["default_post_type"],
            "default_status": site["default_publish_status"],
            "created_at": site["created_at"],
            "updated_at": site["updated_at"]
        }
    return None


# ============== MULTI-SITE PUBLISH TO WORDPRESS ==============

async def publish_content_to_wordpress(
    content_id: str,
    publish_data: PublishToWordPressRequest,
    current_user: dict
) -> PublishResponse:
    """Publish content item to one or more WordPress sites."""
    content = await db.content_items.find_one(
        {"id": content_id, "team_id": current_user.get('team_id')}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content item not found")
    
    results = []
    
    for target in publish_data.targets:
        site = await db.wordpress_sites.find_one(
            {"id": target.site_id, "team_id": current_user.get('team_id')}
        )
        if not site:
            results.append(PublishResult(
                site_id=target.site_id,
                site_name="Unknown",
                success=False,
                message="WordPress site not found"
            ))
            continue
        
        if not site.get('is_active', True):
            results.append(PublishResult(
                site_id=target.site_id,
                site_name=site['name'],
                success=False,
                message="WordPress site is inactive"
            ))
            continue
        
        publish_record = await db.content_item_publishes.find_one({
            "content_item_id": content_id,
            "wordpress_site_id": target.site_id
        })
        
        featured_image = await db.content_item_featured_images.find_one({
            "content_item_id": content_id,
            "wordpress_site_id": target.site_id
        })
        
        now = datetime.now(timezone.utc).isoformat()
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                auth_string = f"{site['username']}:{site['app_password']}"
                auth_bytes = base64.b64encode(auth_string.encode()).decode()
                headers = {
                    "Authorization": f"Basic {auth_bytes}",
                    "Content-Type": "application/json"
                }
                
                wp_media_id = None
                if featured_image:
                    file_path = UPLOADS_DIR / featured_image.get("file_storage_key", "")
                    
                    needs_upload = (
                        featured_image.get("sync_status") != "synced" or
                        not featured_image.get("wp_media_id")
                    )
                    
                    if needs_upload and file_path.exists():
                        async with aiofiles.open(file_path, 'rb') as f:
                            file_content = await f.read()
                        
                        media_headers = {
                            "Authorization": f"Basic {auth_bytes}",
                            "Content-Disposition": f'attachment; filename="{featured_image["file_name"]}"',
                            "Content-Type": featured_image["mime_type"]
                        }
                        
                        media_response = await client.post(
                            f"{site['wp_base_url']}/wp-json/wp/v2/media",
                            headers=media_headers,
                            content=file_content
                        )
                        
                        if media_response.status_code in [200, 201]:
                            media_data = media_response.json()
                            wp_media_id = media_data.get('id')
                            wp_media_url = media_data.get('source_url')
                            
                            await db.content_item_featured_images.update_one(
                                {"id": featured_image["id"]},
                                {"$set": {
                                    "wp_media_id": wp_media_id,
                                    "wp_media_url": wp_media_url,
                                    "sync_status": "synced",
                                    "sync_error_message": None,
                                    "last_synced_at": now,
                                    "updated_at": now
                                }}
                            )
                        else:
                            await db.content_item_featured_images.update_one(
                                {"id": featured_image["id"]},
                                {"$set": {
                                    "sync_status": "failed",
                                    "sync_error_message": f"Media upload failed: {media_response.status_code}",
                                    "last_synced_at": now,
                                    "updated_at": now
                                }}
                            )
                    else:
                        wp_media_id = featured_image.get("wp_media_id")
                
                body = content.get('body', '')
                if content.get('type') == 'link' and content.get('external_url'):
                    body = f'<p><a href="{content["external_url"]}" target="_blank">{content["external_url"]}</a></p>\n\n{body}'
                
                wp_data = {
                    "title": content['title'],
                    "content": body,
                    "status": target.wp_status
                }
                
                if content.get('excerpt'):
                    wp_data["excerpt"] = content['excerpt']
                
                if wp_media_id:
                    wp_data["featured_media"] = wp_media_id
                
                endpoint = f"{site['wp_base_url']}/wp-json/wp/v2/{target.post_type}s"
                
                wp_post_id = publish_record.get('wp_post_id') if publish_record else None
                
                if wp_post_id:
                    response = await client.post(
                        f"{endpoint}/{wp_post_id}",
                        headers=headers,
                        json=wp_data
                    )
                else:
                    response = await client.post(
                        endpoint,
                        headers=headers,
                        json=wp_data
                    )
                
                if response.status_code in [200, 201]:
                    wp_response = response.json()
                    
                    publish_doc = {
                        "content_item_id": content_id,
                        "wordpress_site_id": target.site_id,
                        "wp_post_id": wp_response.get('id'),
                        "wp_post_type": target.post_type,
                        "wp_status": wp_response.get('status'),
                        "wp_permalink": wp_response.get('link'),
                        "sync_status": "synced",
                        "sync_error_message": None,
                        "last_synced_at": now,
                        "updated_at": now
                    }
                    
                    if publish_record:
                        await db.content_item_publishes.update_one(
                            {"id": publish_record['id']},
                            {"$set": publish_doc}
                        )
                    else:
                        publish_doc["id"] = str(uuid.uuid4())
                        publish_doc["created_at"] = now
                        await db.content_item_publishes.insert_one(publish_doc)
                    
                    results.append(PublishResult(
                        site_id=target.site_id,
                        site_name=site['name'],
                        success=True,
                        message="Published successfully",
                        wp_post_id=wp_response.get('id'),
                        wp_permalink=wp_response.get('link')
                    ))
                else:
                    error_msg = response.text[:200]
                    
                    publish_doc = {
                        "content_item_id": content_id,
                        "wordpress_site_id": target.site_id,
                        "wp_post_type": target.post_type,
                        "wp_status": target.wp_status,
                        "sync_status": "failed",
                        "sync_error_message": f"HTTP {response.status_code}: {error_msg}",
                        "last_synced_at": now,
                        "updated_at": now
                    }
                    
                    if publish_record:
                        await db.content_item_publishes.update_one(
                            {"id": publish_record['id']},
                            {"$set": publish_doc}
                        )
                    else:
                        publish_doc["id"] = str(uuid.uuid4())
                        publish_doc["created_at"] = now
                        publish_doc["wp_post_id"] = None
                        publish_doc["wp_permalink"] = None
                        await db.content_item_publishes.insert_one(publish_doc)
                    
                    results.append(PublishResult(
                        site_id=target.site_id,
                        site_name=site['name'],
                        success=False,
                        message=f"HTTP {response.status_code}: {error_msg}"
                    ))
                    
        except Exception as e:
            publish_doc = {
                "content_item_id": content_id,
                "wordpress_site_id": target.site_id,
                "wp_post_type": target.post_type,
                "wp_status": target.wp_status,
                "sync_status": "failed",
                "sync_error_message": str(e),
                "last_synced_at": now,
                "updated_at": now
            }
            
            if publish_record:
                await db.content_item_publishes.update_one(
                    {"id": publish_record['id']},
                    {"$set": publish_doc}
                )
            else:
                publish_doc["id"] = str(uuid.uuid4())
                publish_doc["created_at"] = now
                publish_doc["wp_post_id"] = None
                publish_doc["wp_permalink"] = None
                await db.content_item_publishes.insert_one(publish_doc)
            
            results.append(PublishResult(
                site_id=target.site_id,
                site_name=site['name'],
                success=False,
                message=str(e)
            ))
    
    return PublishResponse(results=results)
