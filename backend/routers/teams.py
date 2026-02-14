"""Team management routes."""
from fastapi import APIRouter, HTTPException, Depends, Request

from database import db
from models.auth import TeamCreate, TeamResponse
from services.auth import get_current_user, require_admin
from services.main_site_context import get_main_site_id_from_header

teams_router = APIRouter(prefix="/teams", tags=["Teams"])


@teams_router.get("/current", response_model=TeamResponse)
async def get_current_team(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get the current user's team, isolated by main_site_id if in multisite context."""
    main_site_id = await get_main_site_id_from_header(request)
    
    if main_site_id:
        # In multisite context, get team settings specific to this main site
        team = await db.teams.find_one(
            {"id": current_user.get('team_id'), "main_site_id": main_site_id}, 
            {"_id": 0}
        )
        # If no site-specific settings exist, return base team with empty/default values
        if not team:
            base_team = await db.teams.find_one({"id": current_user.get('team_id')}, {"_id": 0})
            if not base_team:
                raise HTTPException(status_code=404, detail="Team not found")
            # Return base team info but indicate no site-specific settings
            return base_team
    else:
        team = await db.teams.find_one({"id": current_user.get('team_id')}, {"_id": 0})
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
    return team


@teams_router.put("/current", response_model=TeamResponse)
async def update_team(
    request: Request,
    team_data: TeamCreate,
    current_user: dict = Depends(require_admin)
):
    """Update team name (admin only), isolated by main_site_id if in multisite context."""
    main_site_id = await get_main_site_id_from_header(request)
    
    if main_site_id:
        # In multisite context, update or create site-specific team settings
        await db.teams.update_one(
            {"id": current_user['team_id'], "main_site_id": main_site_id},
            {"$set": {"name": team_data.name, "main_site_id": main_site_id}},
            upsert=True
        )
        team = await db.teams.find_one(
            {"id": current_user['team_id'], "main_site_id": main_site_id}, 
            {"_id": 0}
        )
    else:
        await db.teams.update_one(
            {"id": current_user['team_id']},
            {"$set": {"name": team_data.name}}
        )
        team = await db.teams.find_one({"id": current_user['team_id']}, {"_id": 0})
    return team
