"""Team management routes."""
from fastapi import APIRouter, HTTPException, Depends

from ..database import db
from ..models.auth import TeamCreate, TeamResponse
from ..services.auth import get_current_user, require_admin

teams_router = APIRouter(prefix="/teams", tags=["Teams"])


@teams_router.get("/current", response_model=TeamResponse)
async def get_current_team(current_user: dict = Depends(get_current_user)):
    """Get the current user's team."""
    team = await db.teams.find_one({"id": current_user.get('team_id')}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@teams_router.put("/current", response_model=TeamResponse)
async def update_team(
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
