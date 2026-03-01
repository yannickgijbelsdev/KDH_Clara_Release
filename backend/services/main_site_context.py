"""Main Site Context - Extract and validate main_site_id from requests."""
from fastapi import Request, HTTPException, Depends
from typing import Optional, Tuple
from database import db
from services.auth import get_current_user


async def get_main_site_id_from_header(request: Request) -> Optional[str]:
    """Extract main_site_id from X-Main-Site-ID header.
    
    Returns None if header is not present (for backwards compatibility).
    This allows existing code to work without the header.
    """
    return request.headers.get('X-Main-Site-ID')


async def get_data_isolation_filter(request: Request, current_user: dict) -> dict:
    """Get the appropriate filter for data isolation.
    
    This is the PRIMARY function for multisite data isolation.
    It checks X-Main-Site-ID header first, then falls back to team_id.
    
    Returns:
        dict: Filter to use in MongoDB queries for data isolation
              {"main_site_id": ...} if header present
              {"team_id": ...} if no header but user has team_id
              {} if neither (caller must handle this case)
    """
    main_site_id = request.headers.get('X-Main-Site-ID')
    
    if main_site_id:
        return {"main_site_id": main_site_id}
    
    team_id = current_user.get('team_id')
    if team_id:
        return {"team_id": team_id}
    
    return {}


async def get_context_ids(request: Request, current_user: dict) -> Tuple[Optional[str], Optional[str]]:
    """Get both main_site_id and team_id from context.
    
    Returns:
        Tuple[main_site_id, team_id]: Both values, either may be None
    """
    main_site_id = request.headers.get('X-Main-Site-ID')
    team_id = current_user.get('team_id')
    return main_site_id, team_id


async def get_storage_prefix(request: Request, current_user: dict) -> str:
    """Get a storage prefix for file uploads that works with multisite.
    
    Uses main_site_id if available, otherwise team_id.
    """
    main_site_id = request.headers.get('X-Main-Site-ID')
    if main_site_id:
        return main_site_id
    return current_user.get('team_id', 'default')


async def get_required_main_site_id(request: Request) -> str:
    """Extract and require main_site_id from X-Main-Site-ID header.
    
    Raises 400 if header is missing.
    """
    main_site_id = request.headers.get('X-Main-Site-ID')
    if not main_site_id:
        raise HTTPException(
            status_code=400, 
            detail="X-Main-Site-ID header is required"
        )
    return main_site_id


async def validate_main_site_access(
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> str:
    """Validate user has access to the main site specified in header.
    
    Returns the main_site_id if valid.
    Raises 403 if user doesn't have access.
    """
    main_site_id = request.headers.get('X-Main-Site-ID')
    
    if not main_site_id:
        raise HTTPException(
            status_code=400, 
            detail="X-Main-Site-ID header is required"
        )
    
    # Network admins have access to all sites
    if current_user.get('is_network_admin'):
        # Verify the main site exists
        main_site = await db.main_sites.find_one({"id": main_site_id})
        if not main_site:
            raise HTTPException(status_code=404, detail="Main site not found")
        return main_site_id
    
    # Regular users - check if they have access to this main site
    access = await db.main_site_users.find_one({
        "user_id": current_user['id'],
        "main_site_id": main_site_id
    })
    
    if not access:
        raise HTTPException(
            status_code=403, 
            detail="You don't have access to this main site"
        )
    
    return main_site_id


async def get_main_site_filter(
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Get a MongoDB filter for the current main site context.
    
    Returns a dict that can be merged with other query filters.
    For backwards compatibility, returns {"team_id": ...} if no main_site_id header.
    Returns {"main_site_id": ...} if header is present.
    """
    main_site_id = request.headers.get('X-Main-Site-ID')
    
    if main_site_id:
        # Validate access first
        if not current_user.get('is_network_admin'):
            access = await db.main_site_users.find_one({
                "user_id": current_user['id'],
                "main_site_id": main_site_id
            })
            if not access:
                raise HTTPException(
                    status_code=403, 
                    detail="You don't have access to this main site"
                )
        return {"main_site_id": main_site_id}
    else:
        # Fallback to team_id for backwards compatibility
        team_id = current_user.get('team_id')
        if team_id:
            return {"team_id": team_id}
        else:
            # User has no team_id (like system admin) - return empty filter
            # This should be handled by caller
            return {}


async def get_flexible_data_filter(request: Request, current_user: dict) -> dict:
    """Get a flexible filter that works with both multisite and legacy data.
    
    For multisite: prefers main_site_id from header
    For legacy: falls back to team_id
    Returns empty dict if neither is available (caller should handle this)
    """
    main_site_id = request.headers.get('X-Main-Site-ID')
    
    if main_site_id:
        return {"main_site_id": main_site_id}
    
    team_id = current_user.get('team_id')
    if team_id:
        return {"team_id": team_id}
    
    return {}



async def get_effective_role(request: Request, current_user: dict) -> str:
    """Get the effective role for a user, considering site-specific roles.
    
    If X-Main-Site-ID header is present, checks the user's site-specific role
    and returns the higher-privilege role between global and site-specific.
    
    Returns the user's effective role string.
    """
    global_role = current_user.get('role', 'viewer')
    
    # Network admins always have full access
    if current_user.get('is_network_admin'):
        return 'admin'
    
    main_site_id = request.headers.get('X-Main-Site-ID')
    if not main_site_id:
        return global_role
    
    # Look up site-specific role
    site_access = await db.main_site_users.find_one({
        "user_id": current_user['id'],
        "main_site_id": main_site_id
    }, {"_id": 0, "role": 1})
    
    if not site_access:
        return global_role
    
    site_role = site_access.get('role', 'viewer')
    
    # Role hierarchy: admin > news_admin > editor > presenter > viewer
    role_priority = {'admin': 5, 'news_admin': 4, 'editor': 3, 'presenter': 2, 'viewer': 1}
    
    global_priority = role_priority.get(global_role, 0)
    site_priority = role_priority.get(site_role, 0)
    
    # Return the highest-privilege role
    return site_role if site_priority > global_priority else global_role
