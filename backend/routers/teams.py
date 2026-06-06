"""Team management routes."""
from fastapi import APIRouter, HTTPException, Depends, Request

from database import db
from models.auth import TeamCreate, TeamResponse
from services.auth import get_current_user, require_admin

teams_router = APIRouter(prefix="/teams", tags=["Teams"])


@teams_router.get("/current", response_model=TeamResponse)
async def get_current_team(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get the current user's team. For network admins without team, return a default team object."""
    team_id = current_user.get('team_id')
    
    if not team_id:
        # Network admin without team - return a default team object
        if current_user.get('is_network_admin'):
            from datetime import datetime, timezone
            return {
                "id": "network",
                "name": "Network Administration",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        raise HTTPException(status_code=404, detail="Team not found")
    
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@teams_router.put("/current", response_model=TeamResponse)
async def update_team(
    request: Request,
    team_data: TeamCreate,
    current_user: dict = Depends(require_admin)
):
    """Update team name (admin only)."""
    await db.teams.update_one(
        {"id": current_user['team_id']},
        {"$set": {"name": team_data.name}}
    )
    team = await db.teams.find_one({"id": current_user['team_id']}, {"_id": 0})
    return team
