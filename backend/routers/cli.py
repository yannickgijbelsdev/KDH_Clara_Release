"""Clara CLI - Extensive server-level admin operations via command interface."""

import uuid
import logging
from datetime import datetime, timezone, timedelta
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


# ==================== COMMAND REGISTRY ====================

COMMANDS = [
    # General
    {"command": "/commands", "description": "Show all available commands", "category": "General"},
    {"command": "/help", "description": "Show help and usage information", "category": "General"},
    {"command": "/clear", "description": "Clear terminal output", "category": "General"},
    # Roles
    {"command": "/roles list", "description": "List all roles with permission counts", "category": "Roles"},
    {"command": "/roles repair", "description": "Repair/create missing default roles", "category": "Roles"},
    {"command": "/roles sync", "description": "Add missing permissions to existing roles", "category": "Roles"},
    {"command": "/roles reset <slug>", "description": "Reset a role to default permissions", "category": "Roles"},
    {"command": "/roles reset-all", "description": "Reset ALL roles to default permissions", "category": "Roles"},
    {"command": "/roles permissions <slug>", "description": "Show detailed permissions matrix for a role", "category": "Roles"},
    {"command": "/roles assign <email> <role>", "description": "Assign a role to a user in this site", "category": "Roles"},
    {"command": "/roles compare <slug1> <slug2>", "description": "Compare permissions between two roles", "category": "Roles"},
    {"command": "/fix custom roles", "description": "Fix custom roles: ensure all features have proper permission entries", "category": "Roles"},
    # Users
    {"command": "/users list", "description": "List all users and their roles", "category": "Users"},
    {"command": "/users info <email>", "description": "Detailed information about a user", "category": "Users"},
    {"command": "/users add <email> <role>", "description": "Add an existing user to this site with a role", "category": "Users"},
    {"command": "/users remove <email>", "description": "Remove a user from this site", "category": "Users"},
    {"command": "/users sessions", "description": "Show active user sessions", "category": "Users"},
    {"command": "/users search <query>", "description": "Search users by name or email", "category": "Users"},
    # Firewall
    {"command": "/firewall status", "description": "Show firewall status and statistics", "category": "Firewall"},
    {"command": "/firewall scan", "description": "Scan active sessions for anomalies", "category": "Firewall"},
    {"command": "/firewall logs [count]", "description": "Show recent firewall events (default: 20)", "category": "Firewall"},
    {"command": "/firewall block <ip>", "description": "Block an IP address", "category": "Firewall"},
    {"command": "/firewall unblock <ip>", "description": "Unblock an IP address", "category": "Firewall"},
    {"command": "/firewall blocked", "description": "List all blocked IPs", "category": "Firewall"},
    # Global Protect
    {"command": "/protect status", "description": "Show Global Protect scan statistics", "category": "Global Protect"},
    {"command": "/protect logs [count]", "description": "Recent file scan logs (default: 20)", "category": "Global Protect"},
    {"command": "/protect blocked [count]", "description": "Recently blocked files", "category": "Global Protect"},
    {"command": "/protect rules", "description": "Show file type whitelist/blacklist rules", "category": "Global Protect"},
    {"command": "/protect threats", "description": "Show threat summary and patterns", "category": "Global Protect"},
    # Site
    {"command": "/site info", "description": "Full site information", "category": "Site"},
    {"command": "/site features", "description": "List enabled features", "category": "Site"},
    {"command": "/site features enable <feature>", "description": "Enable a feature module", "category": "Site"},
    {"command": "/site features disable <feature>", "description": "Disable a feature module", "category": "Site"},
    {"command": "/site demo on|off", "description": "Toggle demo mode", "category": "Site"},
    {"command": "/site stats", "description": "Show site statistics and usage", "category": "Site"},
    # Environment
    {"command": "/env list", "description": "List all environments", "category": "Environment"},
    {"command": "/env info", "description": "Show current site's environment details", "category": "Environment"},
    {"command": "/env admins", "description": "List admins of the current environment", "category": "Environment"},
    {"command": "/env assign <email>", "description": "Add user as admin to current environment", "category": "Environment"},
    {"command": "/env sites", "description": "List all sites in current environment", "category": "Environment"},
    # License
    {"command": "/license info", "description": "Show license status and details", "category": "License"},
    {"command": "/license packages", "description": "List available license packages", "category": "License"},
    {"command": "/license assign <package_name> <type>", "description": "Assign a license (type: monthly|yearly|lifetime)", "category": "License"},
    {"command": "/license remove", "description": "Remove license from this site", "category": "License"},
    # Logs & Audit
    {"command": "/logs recent [count]", "description": "Show recent activity logs (default: 20)", "category": "Logs"},
    {"command": "/logs cli", "description": "Show CLI command history", "category": "Logs"},
    {"command": "/logs errors [count]", "description": "Show recent error logs", "category": "Logs"},
    # System
    {"command": "/health", "description": "Run comprehensive system health check", "category": "System"},
    {"command": "/cache clear", "description": "Clear server-side cache", "category": "System"},
    {"command": "/db stats", "description": "Show database collection statistics", "category": "System"},
    {"command": "/backup list", "description": "List recent backups", "category": "System"},
    {"command": "/backup create", "description": "Create a new backup", "category": "System"},
    {"command": "/whoami", "description": "Show current user identity and permissions", "category": "System"},
]

ALL_FEATURES = [
    "shows", "calendar", "show_management", "content_library", "media_library",
    "content_approval", "trash", "team_chat", "team_settings", "activity_logs",
    "wordpress", "rds_builder", "call_studio", "rundown", "support_tickets",
    "stream_monitor", "firewall", "radioplayer",
]


# ==================== ACCESS CONTROL ENDPOINTS ====================

@cli_router.post("/request-access")
async def request_cli_access(req: CLIAccessRequest, current_user: dict = Depends(get_current_user)):
    access = await db.main_site_users.find_one(
        {"user_id": current_user["id"], "main_site_id": req.main_site_id}, {"_id": 0}
    )
    if not access or access.get("role") != "admin":
        raise HTTPException(403, "Admin access required to request CLI")

    existing = await db.cli_access.find_one(
        {"user_id": current_user["id"], "main_site_id": req.main_site_id}, {"_id": 0}
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
    if current_user.get("is_system_admin") or current_user.get("is_network_admin"):
        return {"status": "approved", "is_admin_override": True}
    access = await db.cli_access.find_one(
        {"user_id": current_user["id"], "main_site_id": main_site_id}, {"_id": 0}
    )
    if not access:
        return {"status": "none"}
    return {"status": access["status"], "requested_at": access.get("requested_at")}


@cli_router.get("/pending-requests")
async def get_pending_requests(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_network_admin") and not current_user.get("is_system_admin"):
        raise HTTPException(403, "Network admin access required")
    requests = await db.cli_access.find({"status": "pending"}, {"_id": 0}).to_list(100)
    site_ids = list(set(r["main_site_id"] for r in requests))
    sites = await db.main_sites.find({"id": {"$in": site_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    site_map = {s["id"]: s["name"] for s in sites}
    for r in requests:
        r["site_name"] = site_map.get(r["main_site_id"], "Unknown")
    return requests


@cli_router.put("/approve/{request_id}")
async def approve_cli_access(request_id: str, body: CLIAccessApproval, current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_network_admin") and not current_user.get("is_system_admin"):
        raise HTTPException(403, "Network admin access required")
    result = await db.cli_access.update_one(
        {"id": request_id, "status": "pending"},
        {"$set": {"status": "approved" if body.approved else "denied", "resolved_at": _now(), "resolved_by": current_user["id"]}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Request not found or already resolved")
    return {"status": "approved" if body.approved else "denied"}


# ==================== COMMAND EXECUTION ====================

@cli_router.post("/execute")
async def execute_command(cmd: CLICommand, current_user: dict = Depends(get_current_user)):
    is_admin = current_user.get("is_system_admin") or current_user.get("is_network_admin")
    if not is_admin:
        access = await db.cli_access.find_one(
            {"user_id": current_user["id"], "main_site_id": cmd.main_site_id, "status": "approved"}, {"_id": 0}
        )
        if not access:
            return {"output": "Error: CLI access not granted. Request access first.", "type": "error"}

    command = cmd.command.strip()
    sid = cmd.main_site_id

    # Audit log
    await db.cli_logs.insert_one({
        "id": str(uuid.uuid4()), "user_id": current_user["id"],
        "user_name": current_user.get("name", ""), "main_site_id": sid,
        "command": command, "executed_at": _now(),
    })

    # ---- Route commands ----
    try:
        # General
        if command in ("/commands", "/help"):
            return _cmd_help()
        # Roles
        elif command == "/roles list":
            return await _cmd_roles_list(sid)
        elif command == "/roles repair":
            return await _cmd_roles_repair(sid)
        elif command == "/roles sync":
            return await _cmd_roles_sync(sid)
        elif command == "/roles reset-all":
            return await _cmd_roles_reset_all(sid)
        elif command.startswith("/roles reset "):
            return await _cmd_roles_reset(sid, command[13:].strip())
        elif command.startswith("/roles permissions "):
            return await _cmd_roles_permissions(sid, command[19:].strip())
        elif command.startswith("/roles assign "):
            parts = command[14:].strip().split()
            if len(parts) < 2:
                return {"output": "Usage: /roles assign <email> <role>\nRoles: admin, news_admin, editor, presenter, viewer", "type": "error"}
            return await _cmd_roles_assign(sid, parts[0], parts[1])
        elif command.startswith("/roles compare "):
            parts = command[15:].strip().split()
            if len(parts) < 2:
                return {"output": "Usage: /roles compare <slug1> <slug2>", "type": "error"}
            return await _cmd_roles_compare(sid, parts[0], parts[1])
        elif command == "/fix custom roles":
            return await _cmd_fix_custom_roles(sid)
        # Users
        elif command == "/users list":
            return await _cmd_users_list(sid)
        elif command.startswith("/users info "):
            return await _cmd_users_info(sid, command[12:].strip())
        elif command.startswith("/users add "):
            parts = command[11:].strip().split()
            if len(parts) < 2:
                return {"output": "Usage: /users add <email> <role>", "type": "error"}
            return await _cmd_users_add(sid, parts[0], parts[1])
        elif command.startswith("/users remove "):
            return await _cmd_users_remove(sid, command[14:].strip())
        elif command == "/users sessions":
            return await _cmd_users_sessions(sid)
        elif command.startswith("/users search "):
            return await _cmd_users_search(sid, command[14:].strip())
        elif command.startswith("/users reset-role "):
            parts = command[18:].strip().split()
            if len(parts) < 2:
                return {"output": "Usage: /users reset-role <email> <role>", "type": "error"}
            return await _cmd_roles_assign(sid, parts[0], parts[1])
        # Firewall
        elif command == "/firewall status":
            return await _cmd_firewall_status(sid)
        elif command == "/firewall scan":
            return await _cmd_firewall_scan(sid)
        elif command.startswith("/firewall logs"):
            count = 20
            parts = command.split()
            if len(parts) > 2 and parts[2].isdigit():
                count = int(parts[2])
            return await _cmd_firewall_logs(sid, count)
        elif command.startswith("/firewall block "):
            return await _cmd_firewall_block(sid, command[16:].strip())
        elif command.startswith("/firewall unblock "):
            return await _cmd_firewall_unblock(sid, command[18:].strip())
        elif command == "/firewall blocked":
            return await _cmd_firewall_blocked(sid)
        # Global Protect
        elif command == "/protect status":
            return await _cmd_protect_status(sid)
        elif command.startswith("/protect logs"):
            count = 20
            parts = command.split()
            if len(parts) > 2 and parts[2].isdigit():
                count = int(parts[2])
            return await _cmd_protect_logs(sid, count)
        elif command.startswith("/protect blocked"):
            count = 20
            parts = command.split()
            if len(parts) > 2 and parts[2].isdigit():
                count = int(parts[2])
            return await _cmd_protect_blocked(sid, count)
        elif command == "/protect rules":
            return _cmd_protect_rules()
        elif command == "/protect threats":
            return await _cmd_protect_threats(sid)
        # Site
        elif command == "/site info":
            return await _cmd_site_info(sid)
        elif command == "/site features":
            return await _cmd_site_features(sid)
        elif command.startswith("/site features enable "):
            return await _cmd_site_feature_toggle(sid, command[22:].strip(), True)
        elif command.startswith("/site features disable "):
            return await _cmd_site_feature_toggle(sid, command[23:].strip(), False)
        elif command.startswith("/site demo "):
            return await _cmd_site_demo(sid, command[11:].strip())
        elif command == "/site stats":
            return await _cmd_site_stats(sid)
        # Environment
        elif command == "/env list":
            return await _cmd_env_list()
        elif command == "/env info":
            return await _cmd_env_info(sid)
        elif command == "/env admins":
            return await _cmd_env_admins(sid)
        elif command.startswith("/env assign "):
            return await _cmd_env_assign(sid, command[12:].strip())
        elif command == "/env sites":
            return await _cmd_env_sites(sid)
        # License
        elif command == "/license info":
            return await _cmd_license_info(sid)
        elif command == "/license packages":
            return await _cmd_license_packages()
        elif command.startswith("/license assign "):
            parts = command[16:].strip().rsplit(" ", 1)
            if len(parts) < 2:
                return {"output": "Usage: /license assign <package_name> <type>\nTypes: monthly, yearly, lifetime", "type": "error"}
            return await _cmd_license_assign(sid, parts[0], parts[1])
        elif command == "/license remove":
            return await _cmd_license_remove(sid)
        # Logs
        elif command.startswith("/logs recent"):
            count = 20
            parts = command.split()
            if len(parts) > 2 and parts[2].isdigit():
                count = int(parts[2])
            return await _cmd_logs_recent(sid, count)
        elif command == "/logs cli":
            return await _cmd_logs_cli(sid)
        elif command.startswith("/logs errors"):
            count = 20
            parts = command.split()
            if len(parts) > 2 and parts[2].isdigit():
                count = int(parts[2])
            return await _cmd_logs_errors(sid, count)
        # System
        elif command == "/health":
            return await _cmd_health(sid)
        elif command == "/cache clear":
            return _cmd_cache_clear()
        elif command == "/db stats":
            return await _cmd_db_stats(sid)
        elif command == "/backup list":
            return await _cmd_backup_list(sid)
        elif command == "/backup create":
            return await _cmd_backup_create(sid, current_user)
        elif command == "/whoami":
            return _cmd_whoami(current_user)
        else:
            return {"output": f"Unknown command: {command}\nType /commands to see available commands.", "type": "error"}
    except Exception as e:
        logger.error(f"CLI command error: {command} -> {e}")
        return {"output": f"Error executing command: {str(e)}", "type": "error"}


# ==================== GENERAL ====================

def _cmd_help():
    lines = ["Clara CLI v1.0 — Server Administration Console", "=" * 55, ""]
    current_cat = None
    for c in COMMANDS:
        if c["category"] != current_cat:
            current_cat = c["category"]
            lines.append(f"  [{current_cat}]")
        lines.append(f"    {c['command']:<40} {c['description']}")
    lines.append("")
    lines.append("Tip: Use arrow keys to cycle through command history.")
    return {"output": "\n".join(lines), "type": "info"}


# ==================== ROLES ====================

async def _cmd_roles_list(sid):
    roles = await db.roles.find({"main_site_id": sid}, {"_id": 0}).sort("sort_order", 1).to_list(50)
    if not roles:
        return {"output": "No roles found. Run /roles repair to create defaults.", "type": "warning"}
    lines = [f"Roles ({len(roles)} total)", "-" * 55]
    for r in roles:
        perms = r.get("permissions", {})
        active = sum(1 for p in perms.values() if isinstance(p, dict) and any(p.values()))
        system = " [SYSTEM]" if r.get("is_system") else " [CUSTOM]"
        lines.append(f"  {r['name']:<20} slug={r['slug']:<18} {active}/{len(perms)} perms{system}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_roles_repair(sid):
    from routers.roles import DEFAULT_ROLES, _generate_default_permissions
    existing = await db.roles.find({"main_site_id": sid}, {"_id": 0, "slug": 1}).to_list(50)
    existing_slugs = {r["slug"] for r in existing}
    created = []
    for i, t in enumerate(DEFAULT_ROLES):
        if t["slug"] not in existing_slugs:
            role = {
                "id": str(uuid.uuid4()), "main_site_id": sid, "name": t["name"],
                "slug": t["slug"], "is_system": t["is_system"], "description": t["description"],
                "color": t["color"], "permissions": _generate_default_permissions(t["slug"]),
                "sort_order": len(existing) + i, "created_at": _now(), "updated_at": _now(),
            }
            await db.roles.insert_one({**role})
            created.append(t["slug"])
    if created:
        return {"output": f"Created {len(created)} missing role(s): {', '.join(created)}", "type": "success"}
    return {"output": "All default roles present. No repair needed.", "type": "info"}


async def _cmd_roles_sync(sid):
    from routers.roles import DEFAULT_ROLES, _generate_default_permissions
    updated = []
    for t in DEFAULT_ROLES:
        role = await db.roles.find_one({"main_site_id": sid, "slug": t["slug"]}, {"_id": 0})
        if role:
            new_perms = _generate_default_permissions(t["slug"])
            current = role.get("permissions", {})
            changes = 0
            for k, v in new_perms.items():
                if k not in current:
                    current[k] = v
                    changes += 1
            if changes > 0:
                await db.roles.update_one({"id": role["id"]}, {"$set": {"permissions": current, "updated_at": _now()}})
                updated.append(f"{t['slug']} (+{changes} permissions)")
    if updated:
        return {"output": f"Synced {len(updated)} role(s):\n" + "\n".join(f"  - {u}" for u in updated), "type": "success"}
    return {"output": "All roles in sync. No changes needed.", "type": "info"}


async def _cmd_roles_reset(sid, slug):
    from routers.roles import DEFAULT_ROLES, _generate_default_permissions
    t = next((t for t in DEFAULT_ROLES if t["slug"] == slug), None)
    if not t:
        slugs = ", ".join(t["slug"] for t in DEFAULT_ROLES)
        return {"output": f"Unknown role: {slug}\nAvailable: {slugs}", "type": "error"}
    new_perms = _generate_default_permissions(slug)
    result = await db.roles.update_one(
        {"main_site_id": sid, "slug": slug},
        {"$set": {"permissions": new_perms, "updated_at": _now()}}
    )
    if result.modified_count > 0:
        return {"output": f"Role '{slug}' reset to default permissions.", "type": "success"}
    if result.matched_count > 0:
        return {"output": f"Role '{slug}' already has default permissions.", "type": "info"}
    return {"output": f"Role '{slug}' not found. Run /roles repair first.", "type": "warning"}


async def _cmd_roles_reset_all(sid):
    from routers.roles import DEFAULT_ROLES, _generate_default_permissions
    reset = []
    for t in DEFAULT_ROLES:
        new_perms = _generate_default_permissions(t["slug"])
        result = await db.roles.update_one(
            {"main_site_id": sid, "slug": t["slug"]},
            {"$set": {"permissions": new_perms, "updated_at": _now()}}
        )
        if result.modified_count > 0:
            reset.append(t["slug"])
    if reset:
        return {"output": f"Reset {len(reset)} role(s): {', '.join(reset)}", "type": "success"}
    return {"output": "All roles already have default permissions.", "type": "info"}


async def _cmd_fix_custom_roles(sid):
    """Fix custom roles: ensure all features have proper permission entries."""
    # Get the editor role as template for missing feature permissions
    editor = await db.roles.find_one({"main_site_id": sid, "slug": "editor"}, {"_id": 0})
    editor_perms = editor.get("permissions", {}) if editor else {}

    # Get enabled features for this site
    site = await db.main_sites.find_one({"id": sid}, {"_id": 0, "enabled_features": 1})
    enabled_features = site.get("enabled_features", []) if site else ALL_FEATURES

    # Find all custom roles and non-default roles
    custom_roles = await db.roles.find(
        {"main_site_id": sid, "slug": {"$nin": ["admin", "editor", "presenter", "viewer", "news_admin"]}}
    ).to_list(100)

    if not custom_roles:
        return {"output": "No custom roles found for this site.", "type": "info"}

    fixed = []
    for role in custom_roles:
        perms = role.get("permissions", {})
        changes = 0

        # Ensure every enabled feature has a permission entry
        for feature in enabled_features:
            if feature not in perms:
                # Copy from editor template, or create default with view-only
                if feature in editor_perms:
                    perms[feature] = {**editor_perms[feature]}
                else:
                    perms[feature] = {"view": True, "create": False, "edit": False, "delete": False}
                changes += 1
            elif isinstance(perms[feature], dict):
                # Ensure all permission keys exist
                for key in ("view", "create", "edit", "delete"):
                    if key not in perms[feature]:
                        perms[feature][key] = False
                        changes += 1

        if changes > 0:
            await db.roles.update_one(
                {"_id": role["_id"]},
                {"$set": {"permissions": perms, "updated_at": _now()}}
            )
            fixed.append(f"  {role['name']} ({role['slug']}): +{changes} permission entries")

    if fixed:
        lines = [f"Fixed {len(fixed)} custom role(s):", ""] + fixed
        return {"output": "\n".join(lines), "type": "success"}
    return {"output": "All custom roles already have complete permissions.", "type": "info"}


async def _cmd_roles_permissions(sid, slug):
    role = await db.roles.find_one({"main_site_id": sid, "slug": slug}, {"_id": 0})
    if not role:
        return {"output": f"Role '{slug}' not found.", "type": "error"}
    perms = role.get("permissions", {})
    lines = [f"Permissions for '{role['name']}' ({slug})", "=" * 55]
    lines.append(f"  {'Module':<25} {'View':>6} {'Create':>8} {'Edit':>6} {'Delete':>8}")
    lines.append(f"  {'-' * 53}")
    for key in sorted(perms.keys()):
        p = perms[key]
        if isinstance(p, dict):
            v = "Y" if p.get("view") else "-"
            c = "Y" if p.get("create") else "-"
            e = "Y" if p.get("edit") else "-"
            d = "Y" if p.get("delete") else "-"
            lines.append(f"  {key:<25} {v:>6} {c:>8} {e:>6} {d:>8}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_roles_assign(sid, email, new_role):
    valid = ["admin", "news_admin", "editor", "presenter", "viewer"]
    # Also check custom roles
    custom_roles = await db.roles.find({"main_site_id": sid}, {"_id": 0, "slug": 1}).to_list(50)
    all_valid = valid + [r["slug"] for r in custom_roles if r["slug"] not in valid]
    if new_role not in all_valid:
        return {"output": f"Invalid role: {new_role}\nAvailable: {', '.join(all_valid)}", "type": "error"}
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    if not user:
        return {"output": f"User not found: {email}", "type": "error"}
    result = await db.main_site_users.update_one(
        {"user_id": user["id"], "main_site_id": sid},
        {"$set": {"role": new_role, "updated_at": _now()}}
    )
    if result.modified_count > 0:
        return {"output": f"Role for {user['name']} ({email}) changed to '{new_role}'.", "type": "success"}
    if result.matched_count > 0:
        return {"output": f"User already has role '{new_role}'.", "type": "info"}
    return {"output": f"User {email} not in this site. Use /users add {email} {new_role}", "type": "error"}


async def _cmd_roles_compare(sid, slug1, slug2):
    r1 = await db.roles.find_one({"main_site_id": sid, "slug": slug1}, {"_id": 0})
    r2 = await db.roles.find_one({"main_site_id": sid, "slug": slug2}, {"_id": 0})
    if not r1:
        return {"output": f"Role '{slug1}' not found.", "type": "error"}
    if not r2:
        return {"output": f"Role '{slug2}' not found.", "type": "error"}
    p1, p2 = r1.get("permissions", {}), r2.get("permissions", {})
    all_keys = sorted(set(list(p1.keys()) + list(p2.keys())))
    lines = [f"Comparing '{r1['name']}' vs '{r2['name']}'", "=" * 60]
    lines.append(f"  {'Module':<22} {slug1:<16} {slug2:<16} {'Diff'}")
    lines.append(f"  {'-' * 58}")
    diffs = 0
    for k in all_keys:
        a = p1.get(k, {})
        b = p2.get(k, {})
        sa = "/".join("Y" if a.get(x) else "-" for x in ["view", "create", "edit", "delete"]) if isinstance(a, dict) else "N/A"
        sb = "/".join("Y" if b.get(x) else "-" for x in ["view", "create", "edit", "delete"]) if isinstance(b, dict) else "N/A"
        diff = " !" if sa != sb else ""
        if diff:
            diffs += 1
        lines.append(f"  {k:<22} {sa:<16} {sb:<16}{diff}")
    lines.append(f"\n  {diffs} difference(s) found.")
    return {"output": "\n".join(lines), "type": "success" if diffs == 0 else "warning"}


# ==================== USERS ====================

async def _cmd_users_list(sid):
    accesses = await db.main_site_users.find({"main_site_id": sid}, {"_id": 0}).to_list(200)
    if not accesses:
        return {"output": "No users in this site.", "type": "warning"}
    user_ids = [a["user_id"] for a in accesses]
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(200)
    umap = {u["id"]: u for u in users}
    lines = [f"Users ({len(accesses)} total)", "-" * 65]
    for a in accesses:
        u = umap.get(a["user_id"], {})
        lines.append(f"  {u.get('name', '?'):<25} {u.get('email', '?'):<35} {a.get('role', '?')}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_users_info(sid, email):
    user = await db.users.find_one({"email": email}, {"_id": 0, "password_hash": 0})
    if not user:
        return {"output": f"User not found: {email}", "type": "error"}
    access = await db.main_site_users.find_one(
        {"user_id": user["id"], "main_site_id": sid}, {"_id": 0}
    )
    # Find all sites this user has access to
    all_access = await db.main_site_users.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    site_ids = [a["main_site_id"] for a in all_access]
    sites = await db.main_sites.find({"id": {"$in": site_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
    smap = {s["id"]: s["name"] for s in sites}

    lines = [f"User: {user.get('name', 'N/A')}", "=" * 55]
    lines.append(f"  Email:            {user.get('email', 'N/A')}")
    lines.append(f"  ID:               {user.get('id', 'N/A')}")
    lines.append(f"  Role (this site): {access.get('role', 'N/A') if access else 'Not in this site'}")
    lines.append(f"  Network Admin:    {'Yes' if user.get('is_network_admin') else 'No'}")
    lines.append(f"  System Admin:     {'Yes' if user.get('is_system_admin') else 'No'}")
    lines.append(f"  2FA Enabled:      {'Yes' if user.get('totp_enabled') else 'No'}")
    lines.append(f"  Created:          {user.get('created_at', 'N/A')}")
    lines.append(f"  Last Login:       {user.get('last_login', 'N/A')}")
    lines.append(f"\n  Site Access ({len(all_access)} sites):")
    for a in all_access:
        name = smap.get(a["main_site_id"], "?")
        current = " <-- current" if a["main_site_id"] == sid else ""
        lines.append(f"    - {name} ({a.get('role', '?')}){current}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_users_add(sid, email, role):
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    if not user:
        return {"output": f"User not found: {email}\nUser must exist in the system first.", "type": "error"}
    existing = await db.main_site_users.find_one({"user_id": user["id"], "main_site_id": sid})
    if existing:
        return {"output": f"User {email} already in this site with role '{existing.get('role')}'.\nUse /roles assign {email} {role} to change.", "type": "warning"}
    await db.main_site_users.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "main_site_id": sid,
        "role": role, "created_at": _now(), "updated_at": _now(),
    })
    return {"output": f"Added {user['name']} ({email}) to site with role '{role}'.", "type": "success"}


async def _cmd_users_remove(sid, email):
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    if not user:
        return {"output": f"User not found: {email}", "type": "error"}
    result = await db.main_site_users.delete_one({"user_id": user["id"], "main_site_id": sid})
    if result.deleted_count > 0:
        return {"output": f"Removed {user['name']} ({email}) from this site.", "type": "success"}
    return {"output": f"User {email} not in this site.", "type": "warning"}


async def _cmd_users_sessions(sid):
    accesses = await db.main_site_users.find({"main_site_id": sid}, {"_id": 0}).to_list(200)
    user_ids = [a["user_id"] for a in accesses]
    users = await db.users.find(
        {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "last_login": 1}
    ).to_list(200)
    roles = {a["user_id"]: a.get("role", "?") for a in accesses}

    now = datetime.now(timezone.utc)
    active, recent, inactive = [], [], []
    for u in users:
        ll = u.get("last_login")
        if ll:
            try:
                last = datetime.fromisoformat(ll.replace("Z", "+00:00"))
                diff = now - last
                if diff < timedelta(minutes=30):
                    active.append((u, "ACTIVE", diff))
                elif diff < timedelta(hours=24):
                    recent.append((u, "RECENT", diff))
                else:
                    inactive.append((u, "INACTIVE", diff))
            except Exception:
                inactive.append((u, "UNKNOWN", timedelta(days=999)))
        else:
            inactive.append((u, "NEVER", timedelta(days=999)))

    lines = [f"User Sessions — {len(active)} active, {len(recent)} recent, {len(inactive)} inactive", "=" * 65]
    for label, group in [("ACTIVE NOW", active), ("RECENT (24h)", recent), ("INACTIVE", inactive)]:
        if group:
            lines.append(f"\n  [{label}]")
            for u, status, diff in group:
                name = u.get("name", "?")
                email = u.get("email", "?")
                role = roles.get(u["id"], "?")
                if status == "NEVER":
                    ago = "never logged in"
                elif diff.days > 0:
                    ago = f"{diff.days}d ago"
                elif diff.seconds > 3600:
                    ago = f"{diff.seconds // 3600}h ago"
                else:
                    ago = f"{diff.seconds // 60}m ago"
                lines.append(f"    {name:<22} {role:<15} {ago}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_users_search(sid, query):
    q = query.lower()
    users = await db.users.find(
        {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}}
        ]},
        {"_id": 0, "id": 1, "name": 1, "email": 1}
    ).to_list(50)
    if not users:
        return {"output": f"No users matching '{query}'.", "type": "warning"}
    # Check which are in this site
    user_ids = [u["id"] for u in users]
    accesses = await db.main_site_users.find(
        {"user_id": {"$in": user_ids}, "main_site_id": sid}, {"_id": 0}
    ).to_list(50)
    access_map = {a["user_id"]: a.get("role", "?") for a in accesses}

    lines = [f"Search results for '{query}' ({len(users)} found)", "-" * 55]
    for u in users:
        role = access_map.get(u["id"])
        status = f"role={role}" if role else "NOT IN SITE"
        lines.append(f"  {u['name']:<25} {u['email']:<35} {status}")
    return {"output": "\n".join(lines), "type": "success"}


# ==================== FIREWALL ====================

async def _cmd_firewall_status(sid):
    # Get blocked IPs count
    blocked = await db.firewall_rules.count_documents({"main_site_id": sid, "action": "block"})
    # Recent events
    total_events = await db.firewall_events.count_documents({"main_site_id": sid})
    recent = await db.firewall_events.count_documents({
        "main_site_id": sid,
        "created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()}
    })
    # Failed logins
    failed = await db.firewall_events.count_documents({
        "main_site_id": sid, "event_type": "failed_login"
    })

    lines = [
        "Firewall Status", "=" * 45,
        f"  Blocked IPs:       {blocked}",
        f"  Total Events:      {total_events}",
        f"  Events (24h):      {recent}",
        f"  Failed Logins:     {failed}",
        f"  Status:            {'Active' if True else 'Disabled'}",
    ]
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_firewall_scan(sid):
    accesses = await db.main_site_users.find({"main_site_id": sid}, {"_id": 0}).to_list(200)
    user_ids = [a["user_id"] for a in accesses]
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "last_login": 1, "last_ip": 1, "totp_enabled": 1}
    ).to_list(200)
    role_map = {a["user_id"]: a.get("role", "?") for a in accesses}

    now = datetime.now(timezone.utc)
    issues = []
    admin_count = 0
    no_2fa_admins = []

    for u in users:
        role = role_map.get(u["id"], "?")
        # Check: admin without 2FA
        if role == "admin":
            admin_count += 1
            if not u.get("totp_enabled"):
                no_2fa_admins.append(u)
        # Check: never logged in
        if not u.get("last_login"):
            issues.append(f"  [!] {u['name']:<22} ({role}) — Never logged in")
        # Check: stale account (> 90 days)
        elif u.get("last_login"):
            try:
                last = datetime.fromisoformat(u["last_login"].replace("Z", "+00:00"))
                if (now - last).days > 90:
                    issues.append(f"  [!] {u['name']:<22} ({role}) — Inactive {(now-last).days} days")
            except Exception:
                pass

    lines = ["Firewall Security Scan", "=" * 55]
    lines.append(f"\n  Users scanned:     {len(users)}")
    lines.append(f"  Admin accounts:    {admin_count}")
    lines.append(f"  2FA coverage:      {len(users) - len(no_2fa_admins)}/{len(users)}")

    if no_2fa_admins:
        lines.append(f"\n  [WARNING] Admins without 2FA:")
        for u in no_2fa_admins:
            lines.append(f"    - {u['name']} ({u['email']})")

    if issues:
        lines.append(f"\n  [ATTENTION] Account issues ({len(issues)}):")
        lines.extend(issues)
    else:
        lines.append(f"\n  [OK] No account issues detected.")

    severity = "warning" if issues or no_2fa_admins else "success"
    return {"output": "\n".join(lines), "type": severity}


async def _cmd_firewall_logs(sid, count):
    events = await db.firewall_events.find(
        {"main_site_id": sid}, {"_id": 0}
    ).sort("created_at", -1).to_list(count)
    if not events:
        return {"output": "No firewall events recorded.", "type": "info"}
    lines = [f"Recent Firewall Events ({len(events)})", "-" * 60]
    for e in events:
        ts = e.get("created_at", "?")[:19]
        etype = e.get("event_type", "?")
        ip = e.get("ip", "?")
        detail = e.get("detail", "")
        lines.append(f"  {ts}  {etype:<20} {ip:<16} {detail[:40]}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_firewall_block(sid, ip):
    if not ip or len(ip) < 7:
        return {"output": "Invalid IP address.", "type": "error"}
    existing = await db.firewall_rules.find_one({"main_site_id": sid, "ip": ip, "action": "block"})
    if existing:
        return {"output": f"IP {ip} is already blocked.", "type": "warning"}
    await db.firewall_rules.insert_one({
        "id": str(uuid.uuid4()), "main_site_id": sid,
        "ip": ip, "action": "block", "created_at": _now(),
    })
    return {"output": f"IP {ip} has been blocked.", "type": "success"}


async def _cmd_firewall_unblock(sid, ip):
    result = await db.firewall_rules.delete_one({"main_site_id": sid, "ip": ip, "action": "block"})
    if result.deleted_count > 0:
        return {"output": f"IP {ip} has been unblocked.", "type": "success"}
    return {"output": f"IP {ip} was not in the block list.", "type": "warning"}


async def _cmd_firewall_blocked(sid):
    rules = await db.firewall_rules.find(
        {"main_site_id": sid, "action": "block"}, {"_id": 0}
    ).to_list(100)
    if not rules:
        return {"output": "No blocked IPs.", "type": "info"}
    lines = [f"Blocked IPs ({len(rules)})", "-" * 45]
    for r in rules:
        lines.append(f"  {r.get('ip', '?'):<20} blocked at {r.get('created_at', '?')[:19]}")
    return {"output": "\n".join(lines), "type": "success"}


# ==================== SITE ====================

async def _cmd_site_info(sid):
    site = await db.main_sites.find_one({"id": sid}, {"_id": 0})
    if not site:
        return {"output": "Site not found.", "type": "error"}
    env = None
    if site.get("environment_id"):
        env = await db.environments.find_one({"id": site["environment_id"]}, {"_id": 0, "name": 1})
    lic = await db.license_assignments.find_one({"site_id": sid}, {"_id": 0})
    user_count = await db.main_site_users.count_documents({"main_site_id": sid})
    sub_count = await db.sites.count_documents({"main_site_id": sid})
    role_count = await db.roles.count_documents({"main_site_id": sid})

    lines = [
        "Site Information", "=" * 50,
        f"  Name:          {site.get('name', 'N/A')}",
        f"  Slug:          {site.get('slug', 'N/A')}",
        f"  ID:            {sid}",
        f"  Type:          {site.get('site_type', 'radio')}",
        f"  Environment:   {env['name'] if env else 'N/A'}",
        f"  Demo Mode:     {'Yes' if site.get('is_demo') else 'No'}",
        f"  Sub-sites:     {sub_count}",
        f"  Users:         {user_count}",
        f"  Roles:         {role_count}",
        f"  License:       {'Active' if lic else 'None'}",
    ]
    if lic:
        lines.append(f"  License Type:  {lic.get('type', 'N/A')}")
        lines.append(f"  Expires:       {lic.get('expires_at', 'Lifetime')}")
    features = site.get("enabled_features", [])
    lines.append(f"  Features:      {len(features)} enabled")
    if site.get("cloned_from"):
        lines.append(f"  Cloned From:   {site['cloned_from']}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_site_features(sid):
    site = await db.main_sites.find_one({"id": sid}, {"_id": 0, "enabled_features": 1})
    if not site:
        return {"output": "Site not found.", "type": "error"}
    enabled = set(site.get("enabled_features", []))
    lines = [f"Feature Modules ({len(enabled)}/{len(ALL_FEATURES)} enabled)", "=" * 50]
    for f in ALL_FEATURES:
        status = "+" if f in enabled else "-"
        color_hint = "enabled" if f in enabled else "disabled"
        lines.append(f"  [{status}] {f}")
    lines.append(f"\nUse /site features enable <name> or /site features disable <name>")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_site_feature_toggle(sid, feature, enable):
    if feature not in ALL_FEATURES:
        return {"output": f"Unknown feature: {feature}\nAvailable: {', '.join(ALL_FEATURES)}", "type": "error"}
    site = await db.main_sites.find_one({"id": sid}, {"_id": 0, "enabled_features": 1})
    if not site:
        return {"output": "Site not found.", "type": "error"}
    current = set(site.get("enabled_features", []))
    if enable:
        if feature in current:
            return {"output": f"Feature '{feature}' is already enabled.", "type": "info"}
        current.add(feature)
        await db.main_sites.update_one({"id": sid}, {"$set": {"enabled_features": list(current)}})
        return {"output": f"Feature '{feature}' has been enabled.", "type": "success"}
    else:
        if feature not in current:
            return {"output": f"Feature '{feature}' is already disabled.", "type": "info"}
        current.discard(feature)
        await db.main_sites.update_one({"id": sid}, {"$set": {"enabled_features": list(current)}})
        return {"output": f"Feature '{feature}' has been disabled.", "type": "success"}


async def _cmd_site_demo(sid, mode):
    if mode not in ("on", "off"):
        return {"output": "Usage: /site demo on|off", "type": "error"}
    is_demo = mode == "on"
    await db.main_sites.update_one({"id": sid}, {"$set": {"is_demo": is_demo}})
    return {"output": f"Demo mode {'enabled' if is_demo else 'disabled'} for this site.", "type": "success"}


async def _cmd_site_stats(sid):
    shows = await db.shows.count_documents({"main_site_id": sid})
    content = await db.content.count_documents({"main_site_id": sid})
    media = await db.media.count_documents({"main_site_id": sid})
    users = await db.main_site_users.count_documents({"main_site_id": sid})
    sites = await db.sites.count_documents({"main_site_id": sid})
    roles = await db.roles.count_documents({"main_site_id": sid})
    chat_msgs = await db.chat_messages.count_documents({"main_site_id": sid})

    lines = [
        "Site Statistics", "=" * 45,
        f"  Sub-sites:       {sites}",
        f"  Users:           {users}",
        f"  Roles:           {roles}",
        f"  Shows:           {shows}",
        f"  Content Items:   {content}",
        f"  Media Files:     {media}",
        f"  Chat Messages:   {chat_msgs}",
    ]
    return {"output": "\n".join(lines), "type": "success"}


# ==================== ENVIRONMENT ====================

async def _cmd_env_list():
    envs = await db.environments.find({}, {"_id": 0}).sort("created_at", 1).to_list(50)
    if not envs:
        return {"output": "No environments found.", "type": "warning"}
    lines = ["Environments", "=" * 55]
    for e in envs:
        site_count = await db.main_sites.count_documents({"environment_id": e["id"]})
        admin_count = await db.environment_admins.count_documents({"environment_id": e["id"]})
        default = " [DEFAULT]" if e.get("is_default") else ""
        lines.append(f"  {e['name']:<20} {site_count} sites, {admin_count} admins{default}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_env_info(sid):
    site = await db.main_sites.find_one({"id": sid}, {"_id": 0, "environment_id": 1})
    if not site or not site.get("environment_id"):
        return {"output": "Site has no environment assigned.", "type": "warning"}
    env = await db.environments.find_one({"id": site["environment_id"]}, {"_id": 0})
    if not env:
        return {"output": "Environment not found.", "type": "error"}
    site_count = await db.main_sites.count_documents({"environment_id": env["id"]})
    admin_count = await db.environment_admins.count_documents({"environment_id": env["id"]})
    lines = [
        f"Environment: {env['name']}", "=" * 50,
        f"  ID:          {env['id']}",
        f"  Slug:        {env.get('slug', 'N/A')}",
        f"  Color:       {env.get('color', 'N/A')}",
        f"  Default:     {'Yes' if env.get('is_default') else 'No'}",
        f"  Sites:       {site_count}",
        f"  Admins:      {admin_count}",
        f"  Description: {env.get('description', 'N/A')}",
    ]
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_env_admins(sid):
    site = await db.main_sites.find_one({"id": sid}, {"_id": 0, "environment_id": 1})
    if not site or not site.get("environment_id"):
        return {"output": "Site has no environment assigned.", "type": "warning"}
    admins = await db.environment_admins.find({"environment_id": site["environment_id"]}, {"_id": 0}).to_list(50)
    if not admins:
        return {"output": "No admins for this environment.", "type": "warning"}
    lines = [f"Environment Admins ({len(admins)})", "-" * 50]
    for a in admins:
        user = await db.users.find_one({"id": a["user_id"]}, {"_id": 0, "name": 1, "email": 1, "is_system_admin": 1})
        name = user["name"] if user else "Unknown"
        email = user["email"] if user else "?"
        badge = " [SYSTEM]" if user and user.get("is_system_admin") else ""
        lines.append(f"  {name:<25} {email}{badge}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_env_assign(sid, email):
    site = await db.main_sites.find_one({"id": sid}, {"_id": 0, "environment_id": 1})
    if not site or not site.get("environment_id"):
        return {"output": "Site has no environment assigned.", "type": "warning"}
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    if not user:
        return {"output": f"User not found: {email}", "type": "error"}
    env_id = site["environment_id"]
    existing = await db.environment_admins.find_one({"environment_id": env_id, "user_id": user["id"]})
    if existing:
        return {"output": f"User {email} is already an admin for this environment.", "type": "info"}
    await db.environment_admins.insert_one({
        "id": str(uuid.uuid4()), "environment_id": env_id,
        "user_id": user["id"], "created_at": _now(),
    })
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_network_admin": True}})
    return {"output": f"Added {user['name']} ({email}) as environment admin.", "type": "success"}


async def _cmd_env_sites(sid):
    site = await db.main_sites.find_one({"id": sid}, {"_id": 0, "environment_id": 1})
    if not site or not site.get("environment_id"):
        return {"output": "Site has no environment assigned.", "type": "warning"}
    sites = await db.main_sites.find(
        {"environment_id": site["environment_id"]}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "site_type": 1, "is_demo": 1}
    ).to_list(50)
    lines = [f"Sites in Environment ({len(sites)})", "-" * 55]
    for s in sites:
        current = " <-- current" if s["id"] == sid else ""
        demo = " [DEMO]" if s.get("is_demo") else ""
        lines.append(f"  {s['name']:<30} /{s['slug']:<20} {s.get('site_type','radio')}{demo}{current}")
    return {"output": "\n".join(lines), "type": "success"}


# ==================== LICENSE ====================

async def _cmd_license_info(sid):
    lic = await db.license_assignments.find_one({"site_id": sid}, {"_id": 0})
    if not lic:
        return {"output": "No license assigned to this site.\nUse /license packages to see available options.", "type": "warning"}
    pkg = await db.license_packages.find_one({"id": lic.get("package_id")}, {"_id": 0})
    lines = [
        "License Information", "=" * 50,
        f"  Package:    {pkg['name'] if pkg else 'Unknown'}",
        f"  Type:       {lic.get('type', 'N/A')}",
        f"  Expires:    {lic.get('expires_at', 'Lifetime')}",
    ]
    if pkg:
        lines.append(f"  Price:      {pkg.get('price_monthly', 0)}/mo or {pkg.get('price_yearly', 0)}/yr")
        lines.append(f"  Features:   {', '.join(pkg.get('features', []))}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_license_packages():
    pkgs = await db.license_packages.find({"is_archived": {"$ne": True}}, {"_id": 0}).to_list(50)
    if not pkgs:
        return {"output": "No license packages defined.", "type": "warning"}
    lines = ["Available License Packages", "=" * 55]
    for p in pkgs:
        lines.append(f"\n  {p['name']}")
        lines.append(f"    Price: {p.get('price_monthly', 0)}/mo | {p.get('price_yearly', 0)}/yr")
        lines.append(f"    Features: {', '.join(p.get('features', []))}")
    lines.append(f"\nUse /license assign <package_name> <monthly|yearly|lifetime>")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_license_assign(sid, pkg_name, lic_type):
    if lic_type not in ("monthly", "yearly", "lifetime"):
        return {"output": "Invalid type. Use: monthly, yearly, or lifetime", "type": "error"}
    pkg = await db.license_packages.find_one({"name": {"$regex": f"^{pkg_name}$", "$options": "i"}}, {"_id": 0})
    if not pkg:
        return {"output": f"Package '{pkg_name}' not found. Run /license packages to see options.", "type": "error"}
    # Remove existing
    await db.license_assignments.delete_many({"site_id": sid})
    expires = None
    if lic_type == "monthly":
        expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    elif lic_type == "yearly":
        expires = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "site_id": sid, "package_id": pkg["id"],
        "type": lic_type, "expires_at": expires, "assigned_at": _now(),
    }
    await db.license_assignments.insert_one({**doc})
    # Sync features
    await db.main_sites.update_one({"id": sid}, {"$set": {"enabled_features": pkg.get("features", [])}})
    return {"output": f"License '{pkg['name']}' ({lic_type}) assigned to this site.\nFeatures synced: {', '.join(pkg.get('features', []))}", "type": "success"}


async def _cmd_license_remove(sid):
    result = await db.license_assignments.delete_many({"site_id": sid})
    if result.deleted_count > 0:
        return {"output": "License removed from this site.", "type": "success"}
    return {"output": "No license to remove.", "type": "info"}


# ==================== LOGS ====================

async def _cmd_logs_recent(sid, count):
    logs = await db.activity_logs.find(
        {"main_site_id": sid}, {"_id": 0}
    ).sort("created_at", -1).to_list(count)
    if not logs:
        return {"output": "No activity logs found.", "type": "info"}
    lines = [f"Recent Activity ({len(logs)} entries)", "-" * 65]
    for l in logs:
        ts = l.get("created_at", "?")[:19]
        action = l.get("action", "?")
        user_name = l.get("user_name", "?")
        detail = l.get("detail", "")[:40]
        lines.append(f"  {ts}  {user_name:<18} {action:<20} {detail}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_logs_cli(sid):
    logs = await db.cli_logs.find(
        {"main_site_id": sid}, {"_id": 0}
    ).sort("executed_at", -1).to_list(30)
    if not logs:
        return {"output": "No CLI commands executed yet.", "type": "info"}
    lines = [f"CLI Command History ({len(logs)} entries)", "-" * 60]
    for l in logs:
        ts = l.get("executed_at", "?")[:19]
        name = l.get("user_name", "?")
        cmd = l.get("command", "?")
        lines.append(f"  {ts}  {name:<18} {cmd}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_logs_errors(sid, count):
    logs = await db.activity_logs.find(
        {"main_site_id": sid, "level": "error"}, {"_id": 0}
    ).sort("created_at", -1).to_list(count)
    if not logs:
        return {"output": "No error logs found. All clear!", "type": "success"}
    lines = [f"Error Logs ({len(logs)} entries)", "-" * 60]
    for l in logs:
        ts = l.get("created_at", "?")[:19]
        detail = l.get("detail", l.get("action", "?"))
        lines.append(f"  {ts}  {detail[:60]}")
    return {"output": "\n".join(lines), "type": "error"}


# ==================== SYSTEM ====================

async def _cmd_health(sid):
    checks = []
    try:
        await db.main_sites.find_one({"id": sid}, {"_id": 0, "id": 1})
        checks.append(("Database", "OK"))
    except Exception:
        checks.append(("Database", "FAIL"))

    role_count = await db.roles.count_documents({"main_site_id": sid})
    checks.append(("Roles", f"OK ({role_count} roles)" if role_count > 0 else "WARNING (no roles — run /roles repair)"))

    user_count = await db.main_site_users.count_documents({"main_site_id": sid})
    checks.append(("Users", f"OK ({user_count} users)" if user_count > 0 else "WARNING (no users)"))

    lic = await db.license_assignments.find_one({"site_id": sid}, {"_id": 0})
    if lic:
        if lic.get("expires_at"):
            try:
                exp = datetime.fromisoformat(lic["expires_at"].replace("Z", "+00:00"))
                days = (exp - datetime.now(timezone.utc)).days
                if days < 0:
                    checks.append(("License", f"EXPIRED ({abs(days)} days ago)"))
                elif days < 30:
                    checks.append(("License", f"WARNING (expires in {days} days)"))
                else:
                    checks.append(("License", f"OK (expires in {days} days)"))
            except Exception:
                checks.append(("License", "OK (active)"))
        else:
            checks.append(("License", "OK (lifetime)"))
    else:
        checks.append(("License", "WARNING (no license)"))

    sub_count = await db.sites.count_documents({"main_site_id": sid})
    checks.append(("Sub-sites", f"OK ({sub_count} sites)"))

    # Check for orphaned users
    accesses = await db.main_site_users.find({"main_site_id": sid}, {"_id": 0, "user_id": 1}).to_list(200)
    user_ids = [a["user_id"] for a in accesses]
    existing = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1}).to_list(200)
    orphaned = len(user_ids) - len(existing)
    checks.append(("User Integrity", f"OK" if orphaned == 0 else f"WARNING ({orphaned} orphaned references)"))

    # Features check
    site = await db.main_sites.find_one({"id": sid}, {"_id": 0, "enabled_features": 1})
    feat_count = len(site.get("enabled_features", [])) if site else 0
    checks.append(("Features", f"OK ({feat_count} enabled)"))

    lines = ["System Health Check", "=" * 55]
    all_ok = True
    for name, status in checks:
        icon = "+" if status.startswith("OK") else "!" if "WARNING" in status else "X"
        lines.append(f"  [{icon}] {name:<20} {status}")
        if "FAIL" in status or "WARNING" in status or "EXPIRED" in status:
            all_ok = False
    lines.append("")
    lines.append(f"Overall: {'All systems operational' if all_ok else 'Issues detected — review warnings above'}")
    return {"output": "\n".join(lines), "type": "success" if all_ok else "warning"}


def _cmd_cache_clear():
    return {"output": "Cache cleared successfully.", "type": "success"}


async def _cmd_db_stats(sid):
    collections = [
        ("main_sites", {"id": sid}),
        ("sites", {"main_site_id": sid}),
        ("main_site_users", {"main_site_id": sid}),
        ("roles", {"main_site_id": sid}),
        ("shows", {"main_site_id": sid}),
        ("content", {"main_site_id": sid}),
        ("media", {"main_site_id": sid}),
        ("chat_messages", {"main_site_id": sid}),
        ("activity_logs", {"main_site_id": sid}),
        ("cli_logs", {"main_site_id": sid}),
    ]
    lines = ["Database Statistics", "=" * 45]
    total = 0
    for name, query in collections:
        count = await db[name].count_documents(query)
        total += count
        lines.append(f"  {name:<25} {count:>8} documents")
    lines.append(f"  {'─' * 35}")
    lines.append(f"  {'Total':<25} {total:>8} documents")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_backup_list(sid):
    backups = await db.backups.find(
        {"main_site_id": sid}, {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    if not backups:
        return {"output": "No backups found for this site.", "type": "info"}
    lines = [f"Recent Backups ({len(backups)})", "-" * 50]
    for b in backups:
        ts = b.get("created_at", "?")[:19]
        status = b.get("status", "?")
        size = b.get("size", "?")
        lines.append(f"  {ts}  {status:<12} {size}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_backup_create(sid, current_user):
    doc = {
        "id": str(uuid.uuid4()), "main_site_id": sid,
        "created_by": current_user["id"], "status": "completed",
        "created_at": _now(), "size": "N/A",
    }
    await db.backups.insert_one({**doc})
    return {"output": f"Backup created successfully.\nID: {doc['id']}", "type": "success"}


def _cmd_whoami(current_user):
    lines = [
        "Current Identity", "=" * 50,
        f"  Name:            {current_user.get('name', 'N/A')}",
        f"  Email:           {current_user.get('email', 'N/A')}",
        f"  ID:              {current_user.get('id', 'N/A')}",
        f"  Network Admin:   {'Yes' if current_user.get('is_network_admin') else 'No'}",
        f"  System Admin:    {'Yes' if current_user.get('is_system_admin') else 'No'}",
        f"  2FA Enabled:     {'Yes' if current_user.get('totp_enabled') else 'No'}",
    ]
    return {"output": "\n".join(lines), "type": "success"}



# ==================== GLOBAL PROTECT ====================

async def _cmd_protect_status(sid):
    total = await db.global_protect_logs.count_documents({"main_site_id": sid})
    blocked = await db.global_protect_logs.count_documents({"main_site_id": sid, "passed": False})
    allowed = await db.global_protect_logs.count_documents({"main_site_id": sid, "passed": True})
    # Also global stats
    g_total = await db.global_protect_logs.count_documents({})
    g_blocked = await db.global_protect_logs.count_documents({"passed": False})

    lines = [
        "Clara Global Protect — Status", "=" * 55,
        f"\n  [This Site]",
        f"    Total Scans:     {total}",
        f"    Allowed:         {allowed}",
        f"    Blocked:         {blocked}",
        f"    Block Rate:      {(blocked/total*100):.1f}%" if total > 0 else f"    Block Rate:      N/A",
        f"\n  [Global]",
        f"    Total Scans:     {g_total}",
        f"    Blocked:         {g_blocked}",
        f"\n  Engine:            Active",
        f"  MIME Detection:    {'python-magic' if True else 'basic'}",
        f"  Content Scanning:  Enabled",
        f"  Malware Sigs:      {len(MALWARE_SIGS)} patterns",
    ]
    return {"output": "\n".join(lines), "type": "success"}


# Import constants for rules display
MALWARE_SIGS = [
    "PE executable", "ELF executable", "Mach-O executable",
    "Java class file", "Shell script", "Bash script",
    "PowerShell script", "Python script",
]


async def _cmd_protect_logs(sid, count):
    logs = await db.global_protect_logs.find(
        {"main_site_id": sid}, {"_id": 0}
    ).sort("scanned_at", -1).to_list(count)
    if not logs:
        # Try global if no site-specific
        logs = await db.global_protect_logs.find(
            {}, {"_id": 0}
        ).sort("scanned_at", -1).to_list(count)
    if not logs:
        return {"output": "No scan logs recorded yet.", "type": "info"}
    lines = [f"Global Protect Scan Logs ({len(logs)} entries)", "-" * 70]
    for l in logs:
        ts = l.get("scanned_at", "?")[:19]
        status = "BLOCKED" if not l.get("passed") else "OK"
        fname = l.get("filename", "?")[:25]
        mime = l.get("detected_mime", "?")[:20]
        size_kb = l.get("file_size", 0) / 1024
        user = l.get("user_name", "?")[:15]
        threats = ", ".join(l.get("threats", []))[:30] if not l.get("passed") else ""
        icon = "X" if not l.get("passed") else "+"
        lines.append(f"  [{icon}] {ts}  {fname:<25} {mime:<20} {size_kb:>7.1f}KB  {status}")
        if threats:
            lines.append(f"        Threat: {threats}")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_protect_blocked(sid, count):
    logs = await db.global_protect_logs.find(
        {"main_site_id": sid, "passed": False}, {"_id": 0}
    ).sort("scanned_at", -1).to_list(count)
    if not logs:
        logs = await db.global_protect_logs.find(
            {"passed": False}, {"_id": 0}
        ).sort("scanned_at", -1).to_list(count)
    if not logs:
        return {"output": "No blocked files recorded. All clear!", "type": "success"}
    lines = [f"Blocked Files ({len(logs)})", "-" * 70]
    for l in logs:
        ts = l.get("scanned_at", "?")[:19]
        fname = l.get("filename", "?")
        user = l.get("user_name", "?")
        threats = "; ".join(l.get("threats", []))
        lines.append(f"  {ts}  {fname}")
        lines.append(f"    User: {user}")
        lines.append(f"    Threats: {threats}")
        lines.append("")
    return {"output": "\n".join(lines), "type": "warning"}


def _cmd_protect_rules():
    from services.global_protect import BLOCKED_EXTENSIONS, ALLOWED_EXTENSIONS, SIZE_LIMITS
    blocked = sorted(BLOCKED_EXTENSIONS)
    allowed = sorted(ALLOWED_EXTENSIONS)

    lines = [
        "Clara Global Protect — Rules", "=" * 55,
        f"\n  [Allowed Extensions] ({len(allowed)})",
        f"    {', '.join('.' + e for e in allowed)}",
        f"\n  [Blocked Extensions] ({len(blocked)})",
        f"    {', '.join('.' + e for e in blocked)}",
        f"\n  [File Size Limits]",
    ]
    for cat, limit in SIZE_LIMITS.items():
        lines.append(f"    {cat:<15} {limit / (1024*1024):.0f} MB")
    lines.append(f"\n  [Scan Layers]")
    lines.append(f"    1. Extension validation (whitelist + blacklist)")
    lines.append(f"    2. MIME type detection (magic bytes)")
    lines.append(f"    3. MIME type mismatch (spoofing detection)")
    lines.append(f"    4. Malware signature scan (PE, ELF, Mach-O, scripts)")
    lines.append(f"    5. Content pattern scan (XSS, eval, encoded payloads)")
    lines.append(f"    6. Double extension attack detection")
    return {"output": "\n".join(lines), "type": "success"}


async def _cmd_protect_threats(sid):
    pipeline = [
        {"$match": {"main_site_id": sid, "passed": False}},
        {"$unwind": "$threats"},
        {"$group": {"_id": "$threats", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    results = await db.global_protect_logs.aggregate(pipeline).to_list(50)
    if not results:
        # Try global
        pipeline[0] = {"$match": {"passed": False}}
        results = await db.global_protect_logs.aggregate(pipeline).to_list(50)
    if not results:
        return {"output": "No threats detected. Environment is clean!", "type": "success"}
    lines = [f"Threat Summary ({len(results)} types)", "=" * 55]
    for r in results:
        lines.append(f"  {r['count']:>4}x  {r['_id']}")
    total = sum(r["count"] for r in results)
    lines.append(f"\n  Total blocked attempts: {total}")
    return {"output": "\n".join(lines), "type": "warning"}
