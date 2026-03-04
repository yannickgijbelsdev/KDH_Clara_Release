"""Role & Permissions management — custom roles per main site with granular permissions."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from database import db
from services.auth import get_current_user
from services.main_site_context import get_main_site_id_from_header

roles_router = APIRouter(prefix="/roles", tags=["roles"])

# All available permission categories mapped to features/menu items
PERMISSION_CATEGORIES = [
    {
        "group": "Shows",
        "permissions": [
            {"id": "shows", "label": "Shows"},
            {"id": "calendar", "label": "Calendar"},
            {"id": "show_management", "label": "Show Management"},
        ]
    },
    {
        "group": "Content",
        "permissions": [
            {"id": "content_library", "label": "Content Library"},
            {"id": "media_library", "label": "Media Library"},
            {"id": "content_approval", "label": "Content Approval"},
            {"id": "trash", "label": "Trash"},
        ]
    },
    {
        "group": "Communication",
        "permissions": [
            {"id": "team_chat", "label": "Team Chat"},
        ]
    },
    {
        "group": "Streaming & RDS",
        "permissions": [
            {"id": "rds_settings", "label": "RDS Settings"},
            {"id": "rds_builder", "label": "RDS Builder"},
            {"id": "rds_monitor", "label": "RDS Monitor"},
            {"id": "stream_monitor", "label": "Stream Monitor"},
            {"id": "call_studio", "label": "Call Studio"},
        ]
    },
    {
        "group": "Sites",
        "permissions": [
            {"id": "sites", "label": "Sites"},
        ]
    },
    {
        "group": "Administration",
        "permissions": [
            {"id": "team_settings", "label": "Team Settings"},
            {"id": "wordpress", "label": "WordPress"},
            {"id": "activity_logs", "label": "Activity Logs"},
            {"id": "firewall", "label": "Firewall"},
            {"id": "support_tickets", "label": "Support Tickets"},
        ]
    },
]

# Actions per permission
ACTIONS = ["view", "create", "edit", "delete"]

# Default role templates
DEFAULT_ROLES = [
    {
        "name": "Admin",
        "slug": "admin",
        "is_system": True,
        "description": "Full access to everything",
        "color": "#ef4444",
    },
    {
        "name": "Editor",
        "slug": "editor",
        "is_system": False,
        "description": "Can manage content and shows",
        "color": "#f59e0b",
    },
    {
        "name": "Presenter",
        "slug": "presenter",
        "is_system": False,
        "description": "Can view and manage assigned shows",
        "color": "#3b82f6",
    },
    {
        "name": "Viewer",
        "slug": "viewer",
        "is_system": False,
        "description": "Read-only access",
        "color": "#6b7280",
    },
]


def _all_permission_ids():
    """Get flat list of all permission IDs."""
    ids = []
    for cat in PERMISSION_CATEGORIES:
        for p in cat["permissions"]:
            ids.append(p["id"])
    return ids


def _generate_default_permissions(slug):
    """Generate default permissions matrix for a role template."""
    all_ids = _all_permission_ids()
    permissions = {}

    if slug == "admin":
        for pid in all_ids:
            permissions[pid] = {"view": True, "create": True, "edit": True, "delete": True}
    elif slug == "editor":
        for pid in all_ids:
            if pid in ("team_settings", "firewall", "wordpress", "activity_logs"):
                permissions[pid] = {"view": False, "create": False, "edit": False, "delete": False}
            elif pid in ("shows", "calendar", "content_library", "media_library", "content_approval", "team_chat", "call_studio", "support_tickets"):
                permissions[pid] = {"view": True, "create": True, "edit": True, "delete": True}
            else:
                permissions[pid] = {"view": True, "create": False, "edit": False, "delete": False}
    elif slug == "presenter":
        for pid in all_ids:
            if pid in ("shows", "calendar", "team_chat", "call_studio", "support_tickets"):
                permissions[pid] = {"view": True, "create": False, "edit": True, "delete": False}
            elif pid in ("content_library", "media_library"):
                permissions[pid] = {"view": True, "create": True, "edit": False, "delete": False}
            else:
                permissions[pid] = {"view": False, "create": False, "edit": False, "delete": False}
    else:
        # viewer / custom default
        for pid in all_ids:
            if pid in ("shows", "calendar", "support_tickets"):
                permissions[pid] = {"view": True, "create": False, "edit": False, "delete": False}
            else:
                permissions[pid] = {"view": False, "create": False, "edit": False, "delete": False}

    return permissions


def _now():
    return datetime.now(timezone.utc).isoformat()


def require_network_admin(user: dict):
    if not user.get("is_network_admin"):
        raise HTTPException(403, "Network admin access required")


# ============== PERMISSION SCHEMA ==============

@roles_router.get("/schema")
async def get_permission_schema(current_user: dict = Depends(get_current_user)):
    """Get the permission categories and actions schema."""
    require_network_admin(current_user)
    return {
        "categories": PERMISSION_CATEGORIES,
        "actions": ACTIONS,
    }


# ============== ROLES CRUD ==============

@roles_router.get("/{main_site_id}")
async def list_roles(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """List all roles for a main site."""
    require_network_admin(current_user)

    roles = await db.roles.find(
        {"main_site_id": main_site_id}, {"_id": 0}
    ).sort("sort_order", 1).to_list(50)

    # If no roles exist yet, seed defaults
    if not roles:
        roles = await _seed_default_roles(main_site_id)

    return {"roles": roles}


@roles_router.post("/{main_site_id}")
async def create_role(main_site_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Create a new custom role for a main site."""
    require_network_admin(current_user)
    body = await request.json()

    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Role name is required")

    # Check for duplicate name
    existing = await db.roles.find_one({
        "main_site_id": main_site_id,
        "name": {"$regex": f"^{name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(400, f"Role '{name}' already exists")

    slug = name.lower().replace(" ", "_")
    permissions = body.get("permissions", _generate_default_permissions("viewer"))
    color = body.get("color", "#6b7280")
    description = body.get("description", "")

    # Get max sort order
    last = await db.roles.find_one(
        {"main_site_id": main_site_id}, sort=[("sort_order", -1)]
    )
    sort_order = (last.get("sort_order", 0) + 1) if last else 0

    role = {
        "id": str(uuid.uuid4()),
        "main_site_id": main_site_id,
        "name": name,
        "slug": slug,
        "is_system": False,
        "description": description,
        "color": color,
        "permissions": permissions,
        "sort_order": sort_order,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.roles.insert_one({**role})
    return role


@roles_router.put("/{main_site_id}/{role_id}")
async def update_role(
    main_site_id: str, role_id: str, request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Update a role's name, description, color, or permissions."""
    require_network_admin(current_user)
    body = await request.json()

    role = await db.roles.find_one({"id": role_id, "main_site_id": main_site_id})
    if not role:
        raise HTTPException(404, "Role not found")

    # Admin role: only permissions can be changed (not name/slug)
    updates = {"updated_at": _now()}

    if "name" in body and not role.get("is_system"):
        new_name = body["name"].strip()
        if new_name:
            # Check for duplicate
            existing = await db.roles.find_one({
                "main_site_id": main_site_id,
                "name": {"$regex": f"^{new_name}$", "$options": "i"},
                "id": {"$ne": role_id}
            })
            if existing:
                raise HTTPException(400, f"Role '{new_name}' already exists")
            updates["name"] = new_name
            updates["slug"] = new_name.lower().replace(" ", "_")

    if "description" in body:
        updates["description"] = body["description"]
    if "color" in body:
        updates["color"] = body["color"]
    if "permissions" in body:
        updates["permissions"] = body["permissions"]

    await db.roles.update_one({"id": role_id}, {"$set": updates})
    updated = await db.roles.find_one({"id": role_id}, {"_id": 0})
    return updated


@roles_router.delete("/{main_site_id}/{role_id}")
async def delete_role(
    main_site_id: str, role_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a custom role. System roles cannot be deleted."""
    require_network_admin(current_user)

    role = await db.roles.find_one({"id": role_id, "main_site_id": main_site_id})
    if not role:
        raise HTTPException(404, "Role not found")
    if role.get("is_system"):
        raise HTTPException(400, "System roles cannot be deleted")

    # Check if any users have this role
    user_count = await db.main_site_users.count_documents({
        "main_site_id": main_site_id, "role": role["slug"]
    })
    if user_count > 0:
        raise HTTPException(400, f"Cannot delete role: {user_count} user(s) still have this role. Reassign them first.")

    await db.roles.delete_one({"id": role_id})
    return {"deleted": True}


# ============== HELPER: Seed defaults ==============

async def _seed_default_roles(main_site_id: str):
    """Create default roles for a main site."""
    roles = []
    for i, template in enumerate(DEFAULT_ROLES):
        role = {
            "id": str(uuid.uuid4()),
            "main_site_id": main_site_id,
            "name": template["name"],
            "slug": template["slug"],
            "is_system": template["is_system"],
            "description": template["description"],
            "color": template["color"],
            "permissions": _generate_default_permissions(template["slug"]),
            "sort_order": i,
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.roles.insert_one({**role})
        role_copy = {k: v for k, v in role.items() if k != "_id"}
        roles.append(role_copy)
    return roles


# ============== PERMISSION AUDIT LOGS ==============

@roles_router.get("/audit/logs")
async def get_permission_audit_logs(
    main_site_id: Optional[str] = None,
    user_email: Optional[str] = None,
    feature: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """Get permission denial audit logs. Network admin only."""
    require_network_admin(current_user)

    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id
    if user_email:
        query["user_email"] = {"$regex": user_email, "$options": "i"}
    if feature:
        query["feature"] = feature

    total = await db.permission_audit_logs.count_documents(query)
    logs = await db.permission_audit_logs.find(query, {"_id": 0}).sort(
        "timestamp", -1
    ).skip(offset).limit(limit).to_list(limit)

    return {"logs": logs, "total": total}


@roles_router.get("/audit/stats")
async def get_permission_audit_stats(
    main_site_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get aggregated permission audit stats. Network admin only."""
    require_network_admin(current_user)

    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id

    total = await db.permission_audit_logs.count_documents(query)

    # Last 24h
    from datetime import timedelta
    cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent = await db.permission_audit_logs.count_documents({**query, "timestamp": {"$gte": cutoff_24h}})

    # Top blocked users
    user_pipeline = [
        {"$match": query} if query else {"$match": {}},
        {"$group": {"_id": "$user_email", "count": {"$sum": 1}, "last_role": {"$last": "$role"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_users = []
    async for doc in db.permission_audit_logs.aggregate(user_pipeline):
        top_users.append({"email": doc["_id"], "count": doc["count"], "role": doc.get("last_role", "")})

    # Top blocked features
    feature_pipeline = [
        {"$match": query} if query else {"$match": {}},
        {"$group": {"_id": {"feature": "$feature", "action": "$action"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_features = []
    async for doc in db.permission_audit_logs.aggregate(feature_pipeline):
        top_features.append({
            "feature": doc["_id"]["feature"],
            "action": doc["_id"]["action"],
            "count": doc["count"],
        })

    return {
        "total_denials": total,
        "denials_24h": recent,
        "top_blocked_users": top_users,
        "top_blocked_features": top_features,
    }
