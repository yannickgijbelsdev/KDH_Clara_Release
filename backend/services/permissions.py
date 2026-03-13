"""Permission enforcement service — checks role-based permissions per main site."""
from fastapi import Request, HTTPException, Depends
from database import db
from services.auth import get_current_user
from services.main_site_context import get_main_site_id_from_header


async def get_user_permissions(request: Request, current_user: dict) -> dict:
    """Get the full permissions matrix for a user in the current main site context.
    
    Returns dict of {feature_id: {view: bool, create: bool, edit: bool, delete: bool}}
    Network admins get all permissions.
    """
    # Network admins have full access
    if current_user.get("is_network_admin"):
        return {"_full_access": True}

    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        # No main site context — fall back to legacy role-based defaults
        return {"_full_access": current_user.get("role") == "admin"}

    # Get the user's role for this main site
    site_access = await db.main_site_users.find_one(
        {"user_id": current_user["id"], "main_site_id": main_site_id},
        {"_id": 0, "role": 1},
    )
    if not site_access:
        return {}

    role_slug = site_access.get("role", "viewer")

    # Look up role permissions
    role = await db.roles.find_one(
        {"main_site_id": main_site_id, "slug": role_slug},
        {"_id": 0, "permissions": 1, "is_system": 1, "slug": 1},
    )

    if not role:
        # Role not found in DB — check if admin slug (always full access)
        if role_slug == "admin":
            return {"_full_access": True}
        return {}

    # Admin system role always has full access
    if role.get("is_system") and role.get("slug") == "admin":
        return {"_full_access": True}

    return _merge_alias_permissions(role.get("permissions", {}))


# Features that share permission scope — mirrors the middleware FEATURE_ALIASES.
_FEATURE_ALIASES = {
    "shows": ["calendar"],
    "calendar": ["shows"],
}


def _merge_alias_permissions(permissions: dict) -> dict:
    """Merge alias feature permissions so that e.g. 'calendar.edit' also
    grants 'shows.edit' in the permissions matrix sent to the frontend."""
    if not permissions or permissions.get("_full_access"):
        return permissions

    merged = {k: dict(v) if isinstance(v, dict) else v for k, v in permissions.items()}

    for feature, aliases in _FEATURE_ALIASES.items():
        for alias in aliases:
            alias_perms = permissions.get(alias, {})
            if not isinstance(alias_perms, dict):
                continue
            if feature not in merged:
                merged[feature] = {}
            if not isinstance(merged[feature], dict):
                continue
            for action in ("view", "create", "edit", "delete"):
                if alias_perms.get(action) and not merged[feature].get(action):
                    merged[feature][action] = True

    return merged


def has_permission(permissions: dict, feature: str, action: str) -> bool:
    """Check if a permissions dict grants a specific feature+action (including aliases)."""
    if permissions.get("_full_access"):
        return True
    feature_perms = permissions.get(feature, {})
    if feature_perms.get(action, False):
        return True
    # Check alias features
    for alias in _FEATURE_ALIASES.get(feature, []):
        alias_perms = permissions.get(alias, {})
        if isinstance(alias_perms, dict) and alias_perms.get(action, False):
            return True
    return False


async def check_permission(request: Request, current_user: dict, feature: str, action: str):
    """Check if user has permission, raise 403 if not."""
    permissions = await get_user_permissions(request, current_user)
    if not has_permission(permissions, feature, action):
        raise HTTPException(
            status_code=403,
            detail=f"You don't have {action} permission for {feature}",
        )


def require_permission(feature: str, action: str):
    """FastAPI dependency factory — returns a dependency that checks a specific permission.
    
    Usage: Depends(require_permission("shows", "edit"))
    """
    async def _check(request: Request, current_user: dict = Depends(get_current_user)):
        await check_permission(request, current_user, feature, action)
        return current_user
    return _check
