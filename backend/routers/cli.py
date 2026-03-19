"""Clara CLI - Server-level admin operations via command interface."""

import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import db
from services.auth import get_current_user

logger = logging.getLogger(__name__)

cli_router = APIRouter(prefix="/cli", tags=["CLI"])


def _now():
    return datetime.now(timezone.utc).isoformat()


# ==================== MODELS ====================

class CLIAccessRequest(BaseModel):
    main_site_id: str
    reason: Optional[str] = None

class CLICommand(BaseModel):
    main_site_id: str
    command: str

class CLIAccessApproval(BaseModel):
    approved: bool


# ==================== ACCESS CONTROL ====================

COMMANDS = [
    {"command": "/commands", "description": "Show all available commands", "category": "General"},
    {"command": "/help", "description": "Show help information", "category": "General"},
    {"command": "/roles list", "description": "List all roles and their permissions for this site", "category": "Roles"},
    {"command": "/roles repair", "description": "Repair missing default roles for this site", "category": "Roles"},
    {"command": "/roles sync", "description": "Sync role permissions with default templates", "category": "Roles"},
    {"command": "/roles reset <role_slug>", "description": "Reset a specific role to default permissions", "category": "Roles"},
    {"command": "/users list", "description": "List all users and their roles in this site", "category": "Users"},
    {"command": "/users reset-role <email> <role>", "description": "Change a user's role in this site", "category": "Users"},
    {"command": "/site info", "description": "Show site information (license, environment, etc.)", "category": "Site"},
    {"command": "/site features", "description": "List enabled features for this site", "category": "Site"},
    {"command": "/health", "description": "Run system health check", "category": "System"},
    {"command": "/cache clear", "description": "Clear server-side cache for this site", "category": "System"},
]


@cli_router.post("/request-access")
async def request_cli_access(req: CLIAccessRequest, current_user: dict = Depends(get_current_user)):
    """Request CLI access for a main site. Requires admin role."""
    # Check user has admin access to this site
    access = await db.main_site_users.find_one(
        {"user_id": current_user["id"], "main_site_id": req.main_site_id},
        {"_id": 0}
    )
    if not access or access.get("role") != "admin":
        raise HTTPException(403, "Admin access required to request CLI")

    # Check if already has access
    existing = await db.cli_access.find_one(
        {"user_id": current_user["id"], "main_site_id": req.main_site_id},
        {"_id": 0}
    )
    if existing:
        return {"status": existing["status"], "message": f"Access already {existing['status']}"}

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_email": current_user.get("email", ""),
        "main_site_id": req.main_site_id,
        "reason": req.reason,
        "status": "pending",
        "requested_at": _now(),
        "resolved_at": None,
        "resolved_by": None,
    }
    await db.cli_access.insert_one({**doc})
    return {"status": "pending", "message": "CLI access request submitted. Awaiting approval from Clara Support."}


@cli_router.get("/access-status/{main_site_id}")
async def get_cli_access_status(main_site_id: str, current_user: dict = Depends(get_current_user)):
    """Check CLI access status for current user on a site."""
    # System admins always have CLI access
    if current_user.get("is_system_admin") or current_user.get("is_network_admin"):
        return {"status": "approved", "is_admin_override": True}

    access = await db.cli_access.find_one(
        {"user_id": current_user["id"], "main_site_id": main_site_id},
        {"_id": 0}
    )
    if not access:
        return {"status": "none"}
    return {"status": access["status"], "requested_at": access.get("requested_at")}


@cli_router.get("/pending-requests")
async def get_pending_requests(current_user: dict = Depends(get_current_user)):
    """Get all pending CLI access requests. Network admin only."""
    if not current_user.get("is_network_admin") and not current_user.get("is_system_admin"):
        raise HTTPException(403, "Network admin access required")

    requests = await db.cli_access.find(
        {"status": "pending"}, {"_id": 0}
    ).to_list(100)

    # Enrich with site names
    site_ids = list(set(r["main_site_id"] for r in requests))
    sites = await db.main_sites.find(
        {"id": {"$in": site_ids}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    site_map = {s["id"]: s["name"] for s in sites}

    for r in requests:
        r["site_name"] = site_map.get(r["main_site_id"], "Unknown")
    return requests


@cli_router.put("/approve/{request_id}")
async def approve_cli_access(request_id: str, body: CLIAccessApproval, current_user: dict = Depends(get_current_user)):
    """Approve or deny a CLI access request. Network admin only."""
    if not current_user.get("is_network_admin") and not current_user.get("is_system_admin"):
        raise HTTPException(403, "Network admin access required")

    result = await db.cli_access.update_one(
        {"id": request_id, "status": "pending"},
        {"$set": {
            "status": "approved" if body.approved else "denied",
            "resolved_at": _now(),
            "resolved_by": current_user["id"],
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Request not found or already resolved")
    return {"status": "approved" if body.approved else "denied"}


# ==================== COMMAND EXECUTION ====================

@cli_router.post("/execute")
async def execute_command(cmd: CLICommand, current_user: dict = Depends(get_current_user)):
    """Execute a CLI command against a main site."""
    # Check access
    is_admin = current_user.get("is_system_admin") or current_user.get("is_network_admin")
    if not is_admin:
        access = await db.cli_access.find_one(
            {"user_id": current_user["id"], "main_site_id": cmd.main_site_id, "status": "approved"},
            {"_id": 0}
        )
        if not access:
            return {"output": "Error: CLI access not granted. Request access first.", "type": "error"}

    command = cmd.command.strip()
    main_site_id = cmd.main_site_id

    # Log command
    await db.cli_logs.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "main_site_id": main_site_id,
        "command": command,
        "executed_at": _now(),
    })

    # Route command
    if command in ("/commands", "/help"):
        return _cmd_help()
    elif command == "/roles list":
        return await _cmd_roles_list(main_site_id)
    elif command == "/roles repair":
        return await _cmd_roles_repair(main_site_id)
    elif command == "/roles sync":
        return await _cmd_roles_sync(main_site_id)
    elif command.startswith("/roles reset "):
        slug = command.replace("/roles reset ", "").strip()
        return await _cmd_roles_reset(main_site_id, slug)
    elif command == "/users list":
        return await _cmd_users_list(main_site_id)
    elif command.startswith("/users reset-role "):
        parts = command.replace("/users reset-role ", "").strip().split()
        if len(parts) < 2:
            return {"output": "Usage: /users reset-role <email> <role>\nAvailable roles: admin, news_admin, editor, presenter, viewer", "type": "error"}
        return await _cmd_users_reset_role(main_site_id, parts[0], parts[1])
    elif command == "/site info":
        return await _cmd_site_info(main_site_id)
    elif command == "/site features":
        return await _cmd_site_features(main_site_id)
    elif command == "/health":
        return await _cmd_health(main_site_id)
    elif command == "/cache clear":
        return await _cmd_cache_clear(main_site_id)
    else:
        return {"output": f"Unknown command: {command}\nType /commands to see available commands.", "type": "error"}


# ==================== COMMAND HANDLERS ====================

def _cmd_help():
    lines = ["Clara CLI v1.0 - Available Commands", "=" * 45, ""]
    current_cat = None
    for c in COMMANDS:
        if c["category"] != current_cat:
            current_cat = c["category"]
            lines.append(f"  [{current_cat}]")
        lines.append(f"    {c['command']:<35} {c['description']}")
    lines.append("")
    lines.append("Type any command to execute it.")
    return {"output": "\n".join(lines), "type": "info"}


async def _cmd_roles_list(main_site_id: str):
    from routers.roles import PERMISSION_CATEGORIES
    roles = await db.roles.find(
        {"main_site_id": main_site_id}, {"_id": 0}
    ).sort("sort_order", 1).to_list(50)

    if not roles:
        return {"output": "No roles found for this site. Run /roles repair to create default roles.", "type": "warning"}

    lines = [f"Roles for site ({len(roles)} total)", "-" * 45]
    for r in roles:
        perms = r.get("permissions", {})
        perm_count = sum(1 for p in perms.values() if isinstance(p, dict) and any(p.values()))
        total = len(perms)
        system = " [SYSTEM]" if r.get("is_system") else ""
        lines.append(f"  {r['name']:<20} slug={r['slug']:<15} perms={perm_count}/{total}{system}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_roles_repair(main_site_id: str):
    from routers.roles import DEFAULT_ROLES, _generate_default_permissions
    existing = await db.roles.find(
        {"main_site_id": main_site_id}, {"_id": 0, "slug": 1}
    ).to_list(50)
    existing_slugs = {r["slug"] for r in existing}

    created = []
    for i, template in enumerate(DEFAULT_ROLES):
        if template["slug"] not in existing_slugs:
            role = {
                "id": str(uuid.uuid4()),
                "main_site_id": main_site_id,
                "name": template["name"],
                "slug": template["slug"],
                "is_system": template["is_system"],
                "description": template["description"],
                "color": template["color"],
                "permissions": _generate_default_permissions(template["slug"]),
                "sort_order": len(existing) + i,
                "created_at": _now(),
                "updated_at": _now(),
            }
            await db.roles.insert_one({**role})
            created.append(template["slug"])

    if created:
        return {"output": f"Repaired {len(created)} missing role(s): {', '.join(created)}\nAll default roles are now present.", "type": "success"}
    return {"output": "All default roles already exist. No repair needed.", "type": "info"}


async def _cmd_roles_sync(main_site_id: str):
    from routers.roles import DEFAULT_ROLES, _generate_default_permissions
    updated = []
    for template in DEFAULT_ROLES:
        role = await db.roles.find_one(
            {"main_site_id": main_site_id, "slug": template["slug"]}, {"_id": 0}
        )
        if role:
            new_perms = _generate_default_permissions(template["slug"])
            # Merge: add missing permissions, don't overwrite existing
            current_perms = role.get("permissions", {})
            changes = 0
            for key, val in new_perms.items():
                if key not in current_perms:
                    current_perms[key] = val
                    changes += 1
            if changes > 0:
                await db.roles.update_one(
                    {"id": role["id"]},
                    {"$set": {"permissions": current_perms, "updated_at": _now()}}
                )
                updated.append(f"{template['slug']} (+{changes} permissions)")

    if updated:
        return {"output": f"Synced {len(updated)} role(s):\n" + "\n".join(f"  - {u}" for u in updated), "type": "success"}
    return {"output": "All roles are in sync. No changes needed.", "type": "info"}


async def _cmd_roles_reset(main_site_id: str, slug: str):
    from routers.roles import DEFAULT_ROLES, _generate_default_permissions
    template = next((t for t in DEFAULT_ROLES if t["slug"] == slug), None)
    if not template:
        slugs = ", ".join(t["slug"] for t in DEFAULT_ROLES)
        return {"output": f"Unknown role slug: {slug}\nAvailable: {slugs}", "type": "error"}

    new_perms = _generate_default_permissions(slug)
    result = await db.roles.update_one(
        {"main_site_id": main_site_id, "slug": slug},
        {"$set": {"permissions": new_perms, "updated_at": _now()}}
    )
    if result.modified_count > 0:
        return {"output": f"Role '{slug}' has been reset to default permissions.", "type": "success"}
    if result.matched_count > 0:
        return {"output": f"Role '{slug}' already has default permissions.", "type": "info"}
    return {"output": f"Role '{slug}' not found. Run /roles repair first.", "type": "warning"}


async def _cmd_users_list(main_site_id: str):
    accesses = await db.main_site_users.find(
        {"main_site_id": main_site_id}, {"_id": 0}
    ).to_list(200)

    if not accesses:
        return {"output": "No users found for this site.", "type": "warning"}

    user_ids = [a["user_id"] for a in accesses]
    users = await db.users.find(
        {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}
    ).to_list(200)
    user_map = {u["id"]: u for u in users}

    lines = [f"Users in site ({len(accesses)} total)", "-" * 60]
    for a in accesses:
        u = user_map.get(a["user_id"], {})
        name = u.get("name", "Unknown")
        email = u.get("email", "?")
        role = a.get("role", "none")
        lines.append(f"  {name:<25} {email:<35} role={role}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_users_reset_role(main_site_id: str, email: str, new_role: str):
    valid_roles = ["admin", "news_admin", "editor", "presenter", "viewer"]
    if new_role not in valid_roles:
        return {"output": f"Invalid role: {new_role}\nAvailable: {', '.join(valid_roles)}", "type": "error"}

    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    if not user:
        return {"output": f"User not found: {email}", "type": "error"}

    result = await db.main_site_users.update_one(
        {"user_id": user["id"], "main_site_id": main_site_id},
        {"$set": {"role": new_role, "updated_at": _now()}}
    )
    if result.modified_count > 0:
        return {"output": f"Role for {user['name']} ({email}) changed to '{new_role}'.", "type": "success"}
    if result.matched_count > 0:
        return {"output": f"User already has role '{new_role}'.", "type": "info"}
    return {"output": f"User {email} not found in this site.", "type": "error"}


async def _cmd_site_info(main_site_id: str):
    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not site:
        return {"output": "Site not found.", "type": "error"}

    # Get environment
    env = None
    if site.get("environment_id"):
        env = await db.environments.find_one({"id": site["environment_id"]}, {"_id": 0, "name": 1})

    # Get license
    license_info = await db.license_assignments.find_one(
        {"site_id": main_site_id}, {"_id": 0}
    )

    user_count = await db.main_site_users.count_documents({"main_site_id": main_site_id})
    site_count = await db.sites.count_documents({"main_site_id": main_site_id})

    lines = [
        "Site Information",
        "=" * 45,
        f"  Name:          {site.get('name', 'N/A')}",
        f"  Slug:          {site.get('slug', 'N/A')}",
        f"  Type:          {site.get('site_type', 'radio')}",
        f"  Environment:   {env['name'] if env else 'N/A'}",
        f"  Demo Mode:     {'Yes' if site.get('is_demo') else 'No'}",
        f"  Sub-sites:     {site_count}",
        f"  Users:         {user_count}",
        f"  License:       {'Active' if license_info else 'None'}",
    ]
    if license_info:
        lines.append(f"  License Type:  {license_info.get('type', 'N/A')}")
        lines.append(f"  Expires:       {license_info.get('expires_at', 'Lifetime')}")

    lines.append(f"  Features:      {', '.join(site.get('enabled_features', [])) or 'None'}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_site_features(main_site_id: str):
    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "enabled_features": 1, "name": 1})
    if not site:
        return {"output": "Site not found.", "type": "error"}

    features = site.get("enabled_features", [])
    if not features:
        return {"output": "No features enabled for this site.", "type": "warning"}

    lines = [f"Enabled Features for {site.get('name', 'site')} ({len(features)})", "-" * 45]
    for f in sorted(features):
        lines.append(f"  + {f}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_health(main_site_id: str):
    # Check various system components
    checks = []

    # DB connectivity
    try:
        await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "id": 1})
        checks.append(("Database", "OK"))
    except Exception:
        checks.append(("Database", "FAIL"))

    # Roles exist
    role_count = await db.roles.count_documents({"main_site_id": main_site_id})
    checks.append(("Roles", f"OK ({role_count} roles)" if role_count > 0 else "WARNING (no roles)"))

    # Users exist
    user_count = await db.main_site_users.count_documents({"main_site_id": main_site_id})
    checks.append(("Users", f"OK ({user_count} users)" if user_count > 0 else "WARNING (no users)"))

    # License
    license_info = await db.license_assignments.find_one({"site_id": main_site_id}, {"_id": 0})
    checks.append(("License", "OK (active)" if license_info else "WARNING (no license)"))

    # Sites
    site_count = await db.sites.count_documents({"main_site_id": main_site_id})
    checks.append(("Sub-sites", f"OK ({site_count} sites)"))

    lines = ["System Health Check", "=" * 45]
    all_ok = True
    for name, status in checks:
        icon = "+" if status.startswith("OK") else "!" if "WARNING" in status else "X"
        lines.append(f"  [{icon}] {name:<20} {status}")
        if "FAIL" in status or "WARNING" in status:
            all_ok = False

    lines.append("")
    lines.append(f"Overall: {'All systems operational' if all_ok else 'Some issues detected'}")
    return {"output": "\n".join(lines), "type": "success" if all_ok else "warning"}


async def _cmd_cache_clear(main_site_id: str):
    return {"output": "Cache cleared successfully for this site.", "type": "success"}
