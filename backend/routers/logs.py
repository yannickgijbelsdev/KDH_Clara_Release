"""Audit logs routes."""
from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from datetime import datetime, timedelta, timezone

from database import db
from services.auth import require_admin

logs_router = APIRouter(prefix="/logs", tags=["Audit Logs"])


async def enrich_logs_with_current_usernames(logs: list) -> list:
    """Update logs with current user names from the users collection."""
    if not logs:
        return logs
    
    # Get all unique user_ids from logs
    user_ids = list(set(log.get("user_id") for log in logs if log.get("user_id")))
    
    if not user_ids:
        return logs
    
    # Fetch current user info for all user_ids
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "name": 1, "email": 1}
    ).to_list(len(user_ids))
    
    # Create lookup dict
    user_lookup = {u["id"]: u for u in users}
    
    # Update logs with current names
    for log in logs:
        user_id = log.get("user_id")
        if user_id and user_id in user_lookup:
            log["user_name"] = user_lookup[user_id].get("name", log.get("user_name"))
            log["user_email"] = user_lookup[user_id].get("email", log.get("user_email"))
    
    return logs


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
    
    # Enrich logs with current user names
    logs = await enrich_logs_with_current_usernames(logs)
    
    # Get total count for pagination
    total = await db.audit_logs.count_documents(query)
    
    return {
        "logs": logs,
        "total": total,
        "limit": limit,
        "skip": skip
    }


@logs_router.get("/archive/dates")
async def get_archive_dates(current_user: dict = Depends(require_admin)):
    """Get dates that have activity logs for archive calendar."""
    team_id = current_user.get("team_id")
    
    # Aggregate logs by date
    pipeline = [
        {"$match": {"team_id": team_id}},
        {"$project": {
            "date": {"$substr": ["$timestamp", 0, 10]}  # Extract YYYY-MM-DD
        }},
        {"$group": {
            "_id": "$date",
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": -1}},
        {"$limit": 365}  # Last year of dates
    ]
    
    dates = await db.audit_logs.aggregate(pipeline).to_list(365)
    
    return {
        "dates": [{"date": d["_id"], "count": d["count"]} for d in dates]
    }


@logs_router.get("/archive/{date}")
async def get_logs_by_date(
    date: str,
    category: Optional[str] = Query(None),
    limit: int = Query(500),
    skip: int = Query(0),
    current_user: dict = Depends(require_admin)
):
    """Get logs for a specific date (archive view)."""
    team_id = current_user.get("team_id")
    
    # Build query for the specific date
    start_of_day = f"{date}T00:00:00"
    end_of_day = f"{date}T23:59:59"
    
    query = {
        "team_id": team_id,
        "timestamp": {"$gte": start_of_day, "$lte": end_of_day}
    }
    
    if category:
        query["category"] = category
    
    logs = await db.audit_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich logs with current user names
    logs = await enrich_logs_with_current_usernames(logs)
    
    total = await db.audit_logs.count_documents(query)
    
    return {
        "date": date,
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
