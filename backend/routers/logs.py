"""Audit logs routes."""
from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from datetime import datetime, timedelta

from database import db
from services.auth import require_admin

logs_router = APIRouter(prefix="/logs", tags=["Audit Logs"])


@logs_router.get("")
async def get_audit_logs(
    category: Optional[str] = Query(None, description="Filter by category"),
    user_id: Optional[str] = Query(None, description="Filter by user"),
    action: Optional[str] = Query(None, description="Filter by action"),
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)"),
    search: Optional[str] = Query(None, description="Search in details"),
    limit: int = Query(100, le=500),
    skip: int = Query(0),
    current_user: dict = Depends(require_admin)
):
    """Get audit logs with filters (admin only)."""
    query = {"team_id": current_user.get("team_id")}
    
    if category:
        query["category"] = category
    
    if user_id:
        query["user_id"] = user_id
    
    if action:
        query["action"] = {"$regex": action, "$options": "i"}
    
    if start_date:
        query["timestamp"] = {"$gte": start_date}
    
    if end_date:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = end_date
        else:
            query["timestamp"] = {"$lte": end_date}
    
    if search:
        query["$or"] = [
            {"action": {"$regex": search, "$options": "i"}},
            {"user_name": {"$regex": search, "$options": "i"}},
            {"user_email": {"$regex": search, "$options": "i"}},
            {"target_name": {"$regex": search, "$options": "i"}},
            {"ip_address": {"$regex": search, "$options": "i"}}
        ]
    
    logs = await db.audit_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get total count for pagination
    total = await db.audit_logs.count_documents(query)
    
    return {
        "logs": logs,
        "total": total,
        "limit": limit,
        "skip": skip
    }


@logs_router.get("/categories")
async def get_log_categories(current_user: dict = Depends(require_admin)):
    """Get all available log categories."""
    return {
        "categories": [
            {"value": "auth", "label": "Authentication", "description": "Login, logout, password changes"},
            {"value": "user", "label": "User Management", "description": "Create, update, delete users"},
            {"value": "show", "label": "Shows", "description": "Show creation and updates"},
            {"value": "rundown", "label": "Rundown", "description": "Rundown item changes"},
            {"value": "content", "label": "Content Library", "description": "Content changes"},
            {"value": "media", "label": "Media Library", "description": "Media uploads and changes"},
            {"value": "team", "label": "Team Settings", "description": "Team configuration changes"},
            {"value": "settings", "label": "Show Settings", "description": "Show titles and studios"}
        ]
    }


@logs_router.get("/users")
async def get_log_users(current_user: dict = Depends(require_admin)):
    """Get unique users who have audit logs."""
    pipeline = [
        {"$match": {"team_id": current_user.get("team_id")}},
        {"$group": {
            "_id": "$user_id",
            "user_name": {"$first": "$user_name"},
            "user_email": {"$first": "$user_email"}
        }},
        {"$match": {"_id": {"$ne": None}}}
    ]
    
    users = await db.audit_logs.aggregate(pipeline).to_list(100)
    return [{"id": u["_id"], "name": u["user_name"], "email": u["user_email"]} for u in users]


@logs_router.get("/stats")
async def get_log_stats(current_user: dict = Depends(require_admin)):
    """Get audit log statistics."""
    team_id = current_user.get("team_id")
    
    # Get counts by category
    category_pipeline = [
        {"$match": {"team_id": team_id}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}}
    ]
    categories = await db.audit_logs.aggregate(category_pipeline).to_list(20)
    
    # Get recent activity (last 24 hours)
    yesterday = (datetime.utcnow() - timedelta(days=1)).isoformat()
    recent_count = await db.audit_logs.count_documents({
        "team_id": team_id,
        "timestamp": {"$gte": yesterday}
    })
    
    # Total logs
    total = await db.audit_logs.count_documents({"team_id": team_id})
    
    return {
        "total": total,
        "recent_24h": recent_count,
        "by_category": {c["_id"]: c["count"] for c in categories if c["_id"]}
    }
