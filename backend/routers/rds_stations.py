"""RDS Station configuration CRUD - dynamic station management per main site."""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Header

from database import db
from services.auth import get_current_user

logger = logging.getLogger(__name__)

rds_stations_router = APIRouter(prefix="/rds-stations", tags=["RDS Stations"])


# ── Pydantic models ──

class RDSStationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=30)
    stream_url: Optional[str] = None
    stream_type: str = "shoutcast_v1"  # shoutcast_v1, shoutcast_v2, icecast
    default_text: str = ""  # fallback text when no show is live
    color: str = "#f97316"
    order: int = 0


class RDSStationUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    stream_url: Optional[str] = None
    stream_type: Optional[str] = None
    default_text: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None


class RDSStationBulkSync(BaseModel):
    """Bulk sync: frontend sends the full list; backend replaces all stations."""
    stations: List[RDSStationCreate]


# ── Helpers ──

async def get_stations_for_site(main_site_id: str) -> list:
    """Return all RDS stations for a main site, sorted by order."""
    stations = await db.rds_stations.find(
        {"main_site_id": main_site_id}, {"_id": 0}
    ).sort("order", 1).to_list(100)
    return stations


async def get_station_codes_for_site(main_site_id: str) -> list:
    """Return just the station codes for a main site."""
    stations = await get_stations_for_site(main_site_id)
    return [s["code"] for s in stations]


async def resolve_station(station_code: str, main_site_id: str = None):
    """Find a station by code, optionally scoped to a main_site_id."""
    query = {"code": station_code}
    if main_site_id:
        query["main_site_id"] = main_site_id
    station = await db.rds_stations.find_one(query, {"_id": 0})
    return station


# ── Endpoints ──

@rds_stations_router.get("/by-slug/{slug}")
async def list_stations_by_slug(
    slug: str,
    current_user: dict = Depends(get_current_user),
):
    """List all RDS stations for a main site identified by its slug."""
    site = await db.main_sites.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")
    stations = await get_stations_for_site(site["id"])
    return {"stations": stations}



@rds_stations_router.get("/{main_site_id}")
async def list_stations(
    main_site_id: str,
    current_user: dict = Depends(get_current_user),
):
    """List all RDS stations for a main site."""
    stations = await get_stations_for_site(main_site_id)
    return {"stations": stations}


@rds_stations_router.post("/{main_site_id}")
async def create_station(
    main_site_id: str,
    data: RDSStationCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new RDS station for a main site."""
    # Validate main site exists
    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "id": 1})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")

    code = data.code.lower().strip()

    # Code must be unique within this site
    existing = await db.rds_stations.find_one(
        {"main_site_id": main_site_id, "code": code}
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Station code '{code}' already exists for this site")

    now = datetime.now(timezone.utc).isoformat()
    station_doc = {
        "id": str(uuid.uuid4()),
        "main_site_id": main_site_id,
        "name": data.name.strip(),
        "code": code,
        "stream_url": (data.stream_url or "").strip(),
        "stream_type": data.stream_type,
        "default_text": data.default_text.strip(),
        "color": data.color,
        "order": data.order,
        "created_at": now,
        "updated_at": now,
    }

    await db.rds_stations.insert_one(station_doc)
    station_doc.pop("_id", None)
    logger.info(f"RDS station created: {data.name} ({code}) for site {main_site_id}")
    return station_doc


@rds_stations_router.put("/{main_site_id}/bulk-sync")
async def bulk_sync_stations(
    main_site_id: str,
    data: RDSStationBulkSync,
    current_user: dict = Depends(get_current_user),
):
    """Replace all stations for a main site at once.
    Used by the site creation/edit wizards."""
    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "id": 1})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")

    # Validate uniqueness of codes within the list
    codes = [s.code.lower().strip() for s in data.stations]
    if len(codes) != len(set(codes)):
        raise HTTPException(status_code=400, detail="Duplicate station codes in request")

    now = datetime.now(timezone.utc).isoformat()

    # Get existing stations to preserve IDs where possible
    existing = await db.rds_stations.find(
        {"main_site_id": main_site_id}, {"_id": 0}
    ).to_list(100)
    existing_by_code = {s["code"]: s for s in existing}

    new_docs = []
    for i, station in enumerate(data.stations):
        code = station.code.lower().strip()
        prev = existing_by_code.get(code)
        new_docs.append({
            "id": prev["id"] if prev else str(uuid.uuid4()),
            "main_site_id": main_site_id,
            "name": station.name.strip(),
            "code": code,
            "stream_url": (station.stream_url or "").strip(),
            "stream_type": station.stream_type,
            "default_text": station.default_text.strip(),
            "color": station.color,
            "order": i,
            "created_at": prev["created_at"] if prev else now,
            "updated_at": now,
        })

    # Delete all, then insert new
    await db.rds_stations.delete_many({"main_site_id": main_site_id})
    if new_docs:
        await db.rds_stations.insert_many(new_docs)
        # Remove _id from returned docs
        for doc in new_docs:
            doc.pop("_id", None)

    logger.info(f"RDS stations bulk-synced for site {main_site_id}: {len(new_docs)} stations")
    return {"stations": new_docs}


@rds_stations_router.put("/{main_site_id}/{station_id}")
async def update_station(
    main_site_id: str,
    station_id: str,
    data: RDSStationUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update an RDS station."""
    station = await db.rds_stations.find_one(
        {"id": station_id, "main_site_id": main_site_id}
    )
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    update_fields = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if data.name is not None:
        update_fields["name"] = data.name.strip()
    if data.code is not None:
        new_code = data.code.lower().strip()
        if new_code != station["code"]:
            dup = await db.rds_stations.find_one(
                {"main_site_id": main_site_id, "code": new_code, "id": {"$ne": station_id}}
            )
            if dup:
                raise HTTPException(status_code=400, detail=f"Station code '{new_code}' already exists")
        update_fields["code"] = new_code
    if data.stream_url is not None:
        update_fields["stream_url"] = data.stream_url.strip()
    if data.stream_type is not None:
        update_fields["stream_type"] = data.stream_type
    if data.default_text is not None:
        update_fields["default_text"] = data.default_text.strip()
    if data.color is not None:
        update_fields["color"] = data.color
    if data.order is not None:
        update_fields["order"] = data.order

    await db.rds_stations.update_one({"id": station_id}, {"$set": update_fields})
    updated = await db.rds_stations.find_one({"id": station_id}, {"_id": 0})
    return updated


@rds_stations_router.delete("/{main_site_id}/{station_id}")
async def delete_station(
    main_site_id: str,
    station_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete an RDS station."""
    station = await db.rds_stations.find_one(
        {"id": station_id, "main_site_id": main_site_id}
    )
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    await db.rds_stations.delete_one({"id": station_id})
    logger.info(f"RDS station deleted: {station['name']} ({station['code']})")
    return {"message": "Station deleted"}


# ── Migration endpoint ──

@rds_stations_router.post("/migrate/legacy")
async def migrate_legacy_stations(
    current_user: dict = Depends(get_current_user),
):
    """One-time migration: create RDS station records for the legacy MFY/GRK setup.
    Finds the 'radiogroep' main site and creates station configs."""
    if not current_user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Network admin required")

    # Find radiogroep site
    radiogroep = await db.main_sites.find_one({"slug": "radiogroep"}, {"_id": 0})
    if not radiogroep:
        raise HTTPException(status_code=404, detail="Main site 'radiogroep' not found")

    main_site_id = radiogroep["id"]

    # Check if already migrated
    existing = await db.rds_stations.count_documents({"main_site_id": main_site_id})
    if existing > 0:
        return {"message": "Already migrated", "station_count": existing}

    now = datetime.now(timezone.utc).isoformat()

    stations = [
        {
            "id": str(uuid.uuid4()),
            "main_site_id": main_site_id,
            "name": "Radio MFY",
            "code": "mfy",
            "stream_url": "http://stream-shout.koodh.be:9010/stats?sid=1",
            "stream_type": "shoutcast_v1",
            "default_text": "altijd dichtbij",
            "color": "#f97316",
            "order": 0,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "main_site_id": main_site_id,
            "name": "Radio GRK",
            "code": "grk",
            "stream_url": "http://stream-shout.koodh.be:9010/stats?sid=2",
            "stream_type": "shoutcast_v1",
            "default_text": "the feelgood station",
            "color": "#8b5cf6",
            "order": 1,
            "created_at": now,
            "updated_at": now,
        },
    ]

    await db.rds_stations.insert_many(stations)
    for s in stations:
        s.pop("_id", None)

    logger.info(f"Legacy MFY/GRK stations migrated for site {main_site_id}")
    return {"message": "Migration complete", "stations": stations}
