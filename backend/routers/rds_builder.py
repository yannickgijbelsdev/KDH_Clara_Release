"""RDS Builder models and routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Literal
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
import asyncio

from database import db
from services.auth import require_admin

rds_builder_router = APIRouter(prefix="/rds-builder", tags=["RDS Builder"])


class RDSItem(BaseModel):
    """A single item in the RDS sequence."""
    id: str
    type: Literal["now_playing", "show_name", "custom_text"]
    content: Optional[str] = None  # For custom_text type
    duration: int = 5  # How long to display this item (seconds)


class RDSSequence(BaseModel):
    """A complete RDS sequence for a station."""
    station: Literal["mfy", "grk"]
    items: List[RDSItem]
    enabled: bool = True
    loop: bool = True  # Whether to loop the sequence


class RDSSequenceResponse(BaseModel):
    """Response model for RDS sequence."""
    id: str
    station: str
    items: List[dict]
    enabled: bool
    loop: bool
    current_index: int
    current_text: str
    updated_at: str


@rds_builder_router.get("/sequence/{station}", response_model=RDSSequenceResponse)
async def get_rds_sequence(
    station: str,
    current_user: dict = Depends(require_admin)
):
    """Get the RDS sequence for a station."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    sequence = await db.rds_sequences.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if not sequence:
        # Return default sequence
        now = datetime.now(timezone.utc).isoformat()
        return {
            "id": str(uuid.uuid4()),
            "station": station,
            "items": [
                {"id": str(uuid.uuid4()), "type": "show_name", "content": None, "duration": 10},
                {"id": str(uuid.uuid4()), "type": "now_playing", "content": None, "duration": 5},
            ],
            "enabled": False,
            "loop": True,
            "current_index": 0,
            "current_text": "",
            "updated_at": now
        }
    
    return sequence


@rds_builder_router.put("/sequence/{station}")
async def update_rds_sequence(
    station: str,
    data: RDSSequence,
    current_user: dict = Depends(require_admin)
):
    """Update the RDS sequence for a station."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Convert items to dicts
    items_data = [item.dict() for item in data.items]
    
    sequence_data = {
        "station": station,
        "items": items_data,
        "enabled": data.enabled,
        "loop": data.loop,
        "updated_at": now
    }
    
    existing = await db.rds_sequences.find_one({"station": station}, {"_id": 0})
    
    if existing:
        await db.rds_sequences.update_one(
            {"station": station},
            {"$set": sequence_data}
        )
        sequence_data["id"] = existing.get("id", str(uuid.uuid4()))
        sequence_data["current_index"] = existing.get("current_index", 0)
        sequence_data["current_text"] = existing.get("current_text", "")
    else:
        sequence_data["id"] = str(uuid.uuid4())
        sequence_data["current_index"] = 0
        sequence_data["current_text"] = ""
        await db.rds_sequences.insert_one(sequence_data)
    
    return {
        "status": "success",
        "message": f"Sequence updated for {station}",
        "sequence": sequence_data
    }


@rds_builder_router.get("/output/{station}")
async def get_rds_output(station: str):
    """Public endpoint: Get the current RDS text output for a station.
    
    This is the endpoint you configure in MagicRDS as the text source.
    Returns plain text that rotates based on the configured sequence.
    """
    from fastapi.responses import PlainTextResponse
    
    if station not in ["mfy", "grk"]:
        return PlainTextResponse(content="", media_type="text/plain")
    
    # Get current output from cache
    output = await db.rds_builder_output.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    if output and output.get("current_text"):
        return PlainTextResponse(content=output["current_text"], media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_builder_router.get("/output/{station}.txt")
async def get_rds_output_txt(station: str):
    """Same as /output/{station} but with .txt extension."""
    from fastapi.responses import PlainTextResponse
    import logging
    logger = logging.getLogger(__name__)
    
    if station not in ["mfy", "grk"]:
        return PlainTextResponse(content="", media_type="text/plain")
    
    output = await db.rds_builder_output.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    logger.info(f"RDS Builder output for {station}: {output}")
    
    if output and output.get("current_text"):
        return PlainTextResponse(content=output["current_text"], media_type="text/plain")
    
    return PlainTextResponse(content="", media_type="text/plain")


@rds_builder_router.get("/status/{station}")
async def get_rds_builder_status(
    station: str,
    current_user: dict = Depends(require_admin)
):
    """Get the current status of the RDS builder for a station."""
    if station not in ["mfy", "grk"]:
        raise HTTPException(status_code=400, detail="Station must be 'mfy' or 'grk'")
    
    output = await db.rds_builder_output.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    sequence = await db.rds_sequences.find_one(
        {"station": station},
        {"_id": 0}
    )
    
    return {
        "station": station,
        "enabled": sequence.get("enabled", False) if sequence else False,
        "current_text": output.get("current_text", "") if output else "",
        "current_index": output.get("current_index", 0) if output else 0,
        "current_item_type": output.get("current_item_type", "") if output else "",
        "next_change_at": output.get("next_change_at", "") if output else "",
        "updated_at": output.get("updated_at", "") if output else ""
    }
