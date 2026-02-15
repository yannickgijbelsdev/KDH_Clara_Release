"""Main Site Context - Extract and validate main_site_id from requests."""
from fastapi import Request, HTTPException, Depends
from typing import Optional
from database import db
from services.auth import get_current_user


async def get_main_site_id_from_header(request: Request) -> Optional[str]:
    """Extract main_site_id from X-Main-Site-ID header.
    
    Returns None if header is not present (for backwards compatibility).
    This allows existing code to work without the header.
    """
    return request.headers.get('X-Main-Site-ID')


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

