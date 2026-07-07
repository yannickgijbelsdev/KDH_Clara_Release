"""Room Bookings CRUD + conflict-detection.

Endpoints:
  * GET    /api/bookings                — list bookings (optionally filter by room/date range)
  * POST   /api/bookings                — create (any authenticated user; expands recurrence)
  * PUT    /api/bookings/{id}           — update (admin OR creator; ?update_series=true propagates)
  * DELETE /api/bookings/{id}           — delete (admin OR creator; ?delete_series=true wipes siblings)
  * GET    /api/bookings/rooms          — list rooms (proxy over studios with extended fields)
  * POST   /api/bookings/rooms          — create room (admin)
  * PUT    /api/bookings/rooms/{id}     — update room (admin)
  * DELETE /api/bookings/rooms/{id}     — delete room (admin)

Conflict rules:
  * Only entries with ``blocks_room=True`` on BOTH sides trigger a conflict.
  * Pre-recorded / no-block shows and bookings freely coexist on the same room.
  * Overlap uses half-open intervals: A ends AT B start (or vice versa) is
    fine, only strict overlap fails.
"""
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from models.bookings import (
    RoomBookingCreate,
    RoomBookingUpdate,
    RoomBookingResponse,
)
from services.auth import get_current_user, require_admin
from database import db


bookings_router = APIRouter(prefix="/bookings", tags=["Room Bookings"])


# ─── Conflict detection ─────────────────────────────────────────────────

async def find_room_conflict(
    room_id: str,
    start_at: str,
    end_at: str,
    *,
    blocks_room: bool = True,
    exclude_booking_id: Optional[str] = None,
    exclude_show_id: Optional[str] = None,
    main_site_id: Optional[str] = None,
    team_id: Optional[str] = None,
) -> Optional[dict]:
    """Return a conflict descriptor when ``room_id`` is already claimed by
    another blocking Show or Booking during ``[start_at, end_at)``.

    Non-blocking entries (``blocks_room=False``) are ignored on both sides.
    Returns None when the room is free. The response shape mirrors the
    conflict payload the API surfaces to editors.
    """
    if not blocks_room:
        return None  # non-blocking entries never conflict

    # Bookings scan
    booking_q: dict = {
        "room_id": room_id,
        "blocks_room": True,
        "start_at": {"$lt": end_at},
        "end_at": {"$gt": start_at},
    }
    if exclude_booking_id:
        booking_q["id"] = {"$ne": exclude_booking_id}
    if main_site_id:
        booking_q["main_site_id"] = main_site_id
    elif team_id:
        booking_q["team_id"] = team_id
    hit = await db.room_bookings.find_one(booking_q, {"_id": 0})
    if hit:
        return {
            "type": "booking",
            "id": hit.get("id"),
            "title": hit.get("title"),
            "start_at": hit.get("start_at"),
            "end_at": hit.get("end_at"),
            "created_by_name": hit.get("created_by_name"),
        }

    # Shows scan — shows carry `studio_id` and store date + start_time/end_time
    # separately. Build ISO datetime strings for the overlap comparison.
    show_q: dict = {
        "studio_id": room_id,
        # Only shows that actually block the room. Legacy shows without the
        # field default to blocking (True) via the {"$ne": False} test.
        "blocks_room": {"$ne": False},
    }
    if exclude_show_id:
        show_q["id"] = {"$ne": exclude_show_id}
    if main_site_id:
        show_q["main_site_id"] = main_site_id
    elif team_id:
        show_q["team_id"] = team_id

    start_dt = _parse_iso(start_at)
    end_dt = _parse_iso(end_at)
    if start_dt is None or end_dt is None:
        return None

    async for s in db.shows.find(show_q, {
        "_id": 0, "id": 1, "title": 1, "date": 1, "start_time": 1, "end_time": 1
    }):
        s_start = _combine_show_datetime(s.get("date"), s.get("start_time"))
        s_end = _combine_show_datetime(s.get("date"), s.get("end_time"))
        if not s_start or not s_end:
            continue
        # Half-open overlap: A.start < B.end AND B.start < A.end
        if s_start < end_dt and start_dt < s_end:
            return {
                "type": "show",
                "id": s.get("id"),
                "title": s.get("title"),
                "start_at": s_start.isoformat(),
                "end_at": s_end.isoformat(),
            }

    return None


def _parse_iso(value: str):
    """Parse ISO datetime tolerant of `Z` suffix; None on failure."""
    if not value:
        return None
    try:
        s = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _combine_show_datetime(date_str: Optional[str], time_str: Optional[str]):
    """Combine a show's ``date`` (YYYY-MM-DD) + ``start_time`` (HH:MM) into
    a timezone-aware datetime for overlap comparisons."""
    if not date_str or not time_str:
        return None
    try:
        dt = datetime.fromisoformat(f"{date_str}T{time_str}")
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except (ValueError, TypeError):
        return None


def _generate_recurrence_offsets(
    start_dt: datetime,
    recurrence_type: str,
    recurrence_end_date: Optional[str],
    hard_cap: int = 200,
) -> List[timedelta]:
    """Return time-deltas from ``start_dt`` for each additional occurrence.

    The first occurrence is the original booking so we only return future
    offsets. Caps at ``hard_cap`` to avoid pathological input.
    """
    if recurrence_type == "none" or not recurrence_end_date:
        return []
    try:
        end_date = datetime.fromisoformat(recurrence_end_date).replace(
            hour=23, minute=59, second=59, tzinfo=start_dt.tzinfo,
        )
    except ValueError:
        return []
    step_map = {
        "daily": timedelta(days=1),
        "weekly": timedelta(days=7),
        "monthly": timedelta(days=30),  # simple approximation
    }
    step = step_map.get(recurrence_type)
    if not step:
        return []
    offsets: List[timedelta] = []
    cursor = start_dt + step
    while cursor <= end_date and len(offsets) < hard_cap:
        offsets.append(cursor - start_dt)
        cursor += step
    return offsets


# ─── Helpers ─────────────────────────────────────────────────────────────

async def _enrich_booking(booking: dict) -> dict:
    """Denormalise ``room_name`` for UI convenience."""
    if not booking or not booking.get("room_id"):
        return booking
    st = await db.studios.find_one({"id": booking["room_id"]}, {"_id": 0, "name": 1})
    booking["room_name"] = (st or {}).get("name")
    return booking


def _scope_query(request: Request, current_user: dict) -> dict:
    """Return a Mongo query fragment scoped to the current tenant."""
    q: dict = {}
    main_site_id = request.headers.get("X-Main-Site-ID") or None
    if main_site_id:
        q["main_site_id"] = main_site_id
    elif current_user.get("team_id"):
        q["team_id"] = current_user.get("team_id")
    return q


def _is_admin(user: dict) -> bool:
    return (user or {}).get("role") in ("admin", "system_admin")


# ─── Booking CRUD ────────────────────────────────────────────────────────

@bookings_router.get("", response_model=List[RoomBookingResponse])
async def list_bookings(
    request: Request,
    room_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, description="ISO date/datetime, inclusive"),
    to_date: Optional[str] = Query(None, description="ISO date/datetime, exclusive"),
    current_user: dict = Depends(get_current_user),
):
    q = _scope_query(request, current_user)
    if room_id:
        q["room_id"] = room_id
    # Simple date-range filter — leverages the same half-open convention
    # as the conflict detector so pagination stays consistent.
    if from_date or to_date:
        window: dict = {}
        if from_date:
            window["$gte"] = from_date
        if to_date:
            window["$lt"] = to_date
        q["start_at"] = window

    cursor = db.room_bookings.find(q, {"_id": 0}).sort("start_at", 1)
    docs = [d async for d in cursor]
    # Bulk enrich room_name
    room_ids = list({d.get("room_id") for d in docs if d.get("room_id")})
    name_map: dict = {}
    if room_ids:
        async for st in db.studios.find({"id": {"$in": room_ids}}, {"_id": 0, "id": 1, "name": 1}):
            name_map[st["id"]] = st.get("name")
    for d in docs:
        d["room_name"] = name_map.get(d.get("room_id"))
    return docs


@bookings_router.post("", response_model=RoomBookingResponse, status_code=201)
async def create_booking(
    payload: RoomBookingCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    main_site_id = request.headers.get("X-Main-Site-ID") or None
    team_id = current_user.get("team_id")

    # Validate room exists in current scope
    room_q: dict = {"id": payload.room_id}
    if main_site_id:
        room_q["main_site_id"] = main_site_id
    elif team_id:
        room_q["team_id"] = team_id
    room = await db.studios.find_one(room_q, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    # Validate time window
    start_dt = _parse_iso(payload.start_at)
    end_dt = _parse_iso(payload.end_at)
    if not start_dt or not end_dt or start_dt >= end_dt:
        raise HTTPException(status_code=422, detail="Invalid time window")

    # ── First occurrence conflict check
    conflict = await find_room_conflict(
        payload.room_id, payload.start_at, payload.end_at,
        blocks_room=payload.blocks_room,
        main_site_id=main_site_id, team_id=team_id,
    )
    if conflict:
        raise HTTPException(status_code=409, detail={
            "message": f"Room is already booked ({conflict['type']}): {conflict.get('title')}",
            "conflict": conflict,
        })

    now = datetime.now(timezone.utc).isoformat()
    parent_id = str(uuid4())
    base_doc = {
        "id": parent_id,
        "room_id": payload.room_id,
        "title": payload.title.strip(),
        "description": (payload.description or "").strip(),
        "start_at": payload.start_at,
        "end_at": payload.end_at,
        "blocks_room": bool(payload.blocks_room),
        "contact_person": (payload.contact_person or "").strip(),
        "contact_email": (payload.contact_email or "").strip(),
        "attendees": int(payload.attendees or 0),
        "recurrence_type": payload.recurrence_type,
        "recurrence_end_date": payload.recurrence_end_date,
        "parent_booking_id": None,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "updated_at": now,
        "main_site_id": main_site_id,
        "team_id": team_id,
    }

    # ── Recurrence expansion (skipped when type == "none")
    offsets = _generate_recurrence_offsets(
        start_dt, payload.recurrence_type, payload.recurrence_end_date,
    )
    # Pre-scan every future occurrence for conflicts so we don't create a
    # half-populated series.
    if offsets:
        for delta in offsets:
            occ_start = (start_dt + delta).isoformat()
            occ_end = (end_dt + delta).isoformat()
            occ_conflict = await find_room_conflict(
                payload.room_id, occ_start, occ_end,
                blocks_room=payload.blocks_room,
                main_site_id=main_site_id, team_id=team_id,
            )
            if occ_conflict:
                raise HTTPException(status_code=409, detail={
                    "message": (
                        f"Recurring occurrence on {occ_start[:10]} conflicts with "
                        f"{occ_conflict['type']}: {occ_conflict.get('title')}"
                    ),
                    "conflict": occ_conflict,
                })

    await db.room_bookings.insert_one(base_doc)
    # Motor's insert_one mutates the dict with the generated `_id`; drop it
    # so subsequent occurrence docs get their own fresh ObjectId.
    base_doc.pop("_id", None)
    for delta in offsets:
        occ_doc = {
            **base_doc,
            "id": str(uuid4()),
            "start_at": (start_dt + delta).isoformat(),
            "end_at": (end_dt + delta).isoformat(),
            "parent_booking_id": parent_id,
        }
        await db.room_bookings.insert_one(occ_doc)

    return await _enrich_booking(base_doc)


@bookings_router.put("/{booking_id}", response_model=RoomBookingResponse)
async def update_booking(
    booking_id: str,
    payload: RoomBookingUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    scope = _scope_query(request, current_user)
    existing = await db.room_bookings.find_one({"id": booking_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Permission: admin OR creator only
    if not _is_admin(current_user) and existing.get("created_by") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Only the creator or an admin can edit this booking")

    updates = payload.model_dump(exclude_unset=True)
    update_series = bool(updates.pop("update_series", False))
    # `recurrence_type` / `recurrence_end_date` changes on an existing
    # booking series need dedicated handling — silently ignore them here
    # to avoid clobbering the shape of the series.
    updates.pop("recurrence_type", None)
    updates.pop("recurrence_end_date", None)

    merged = {**existing, **updates}

    if "start_at" in updates or "end_at" in updates or "room_id" in updates or "blocks_room" in updates:
        start_dt = _parse_iso(merged["start_at"])
        end_dt = _parse_iso(merged["end_at"])
        if not start_dt or not end_dt or start_dt >= end_dt:
            raise HTTPException(status_code=422, detail="Invalid time window")
        conflict = await find_room_conflict(
            merged["room_id"], merged["start_at"], merged["end_at"],
            blocks_room=bool(merged.get("blocks_room", True)),
            exclude_booking_id=booking_id,
            main_site_id=existing.get("main_site_id"), team_id=existing.get("team_id"),
        )
        if conflict:
            raise HTTPException(status_code=409, detail={
                "message": f"Room is already booked ({conflict['type']}): {conflict.get('title')}",
                "conflict": conflict,
            })

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    if update_series and (existing.get("parent_booking_id") or existing.get("recurrence_type") not in (None, "none")):
        # Propagate metadata fields (never start_at/end_at because siblings
        # sit on different timestamps).
        series_updates = {k: v for k, v in updates.items() if k not in {"start_at", "end_at"}}
        parent_id = existing.get("parent_booking_id") or booking_id
        await db.room_bookings.update_many(
            {"$or": [{"id": parent_id}, {"parent_booking_id": parent_id}]},
            {"$set": series_updates},
        )
        # Also apply the timing/room-specific updates to just this occurrence
        instance_only = {k: updates[k] for k in ("start_at", "end_at", "room_id", "blocks_room") if k in updates}
        if instance_only:
            instance_only["updated_at"] = updates["updated_at"]
            await db.room_bookings.update_one({"id": booking_id}, {"$set": instance_only})
    else:
        await db.room_bookings.update_one({"id": booking_id}, {"$set": updates})

    refreshed = await db.room_bookings.find_one({"id": booking_id}, {"_id": 0})
    return await _enrich_booking(refreshed)


@bookings_router.delete("/{booking_id}", status_code=204)
async def delete_booking(
    booking_id: str,
    request: Request,
    delete_series: bool = Query(False, description="Delete this booking and every sibling in its recurrence series"),
    current_user: dict = Depends(get_current_user),
):
    scope = _scope_query(request, current_user)
    existing = await db.room_bookings.find_one({"id": booking_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not _is_admin(current_user) and existing.get("created_by") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Only the creator or an admin can delete this booking")
    if delete_series and (existing.get("parent_booking_id") or existing.get("recurrence_type") not in (None, "none")):
        parent_id = existing.get("parent_booking_id") or booking_id
        await db.room_bookings.delete_many(
            {"$or": [{"id": parent_id}, {"parent_booking_id": parent_id}]}
        )
    else:
        await db.room_bookings.delete_one({"id": booking_id})
    return None


# ─── Rooms endpoints (admin-scoped studios wrapper) ──────────────────────

@bookings_router.get("/rooms")
async def list_rooms(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    scope = _scope_query(request, current_user)
    cursor = db.studios.find(scope, {"_id": 0}).sort("name", 1)
    return [d async for d in cursor]


@bookings_router.post("/rooms", status_code=201)
async def create_room(
    payload: dict,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Extended studio create — supports the new `description`, `capacity`
    and `color` fields alongside the legacy `name`."""
    main_site_id = request.headers.get("X-Main-Site-ID") or None
    team_id = current_user.get("team_id")
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name required")

    dup_q: dict = {"name": name}
    if main_site_id:
        dup_q["main_site_id"] = main_site_id
    elif team_id:
        dup_q["team_id"] = team_id
    if await db.studios.find_one(dup_q, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="A room with this name already exists")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid4()),
        "name": name,
        "description": (payload.get("description") or "").strip(),
        "capacity": int(payload.get("capacity") or 0) or None,
        "color": (payload.get("color") or "#71717a").strip(),
        "created_at": now,
        "updated_at": now,
        "main_site_id": main_site_id,
        "team_id": team_id,
    }
    await db.studios.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@bookings_router.put("/rooms/{room_id}")
async def update_room(
    room_id: str,
    payload: dict,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    scope = _scope_query(request, current_user)
    existing = await db.studios.find_one({"id": room_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Room not found")
    allowed = {"name", "description", "capacity", "color"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if "capacity" in updates:
        updates["capacity"] = int(updates["capacity"] or 0) or None
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.studios.update_one({"id": room_id}, {"$set": updates})
    return await db.studios.find_one({"id": room_id}, {"_id": 0})


@bookings_router.delete("/rooms/{room_id}", status_code=204)
async def delete_room(
    room_id: str,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    scope = _scope_query(request, current_user)
    existing = await db.studios.find_one({"id": room_id, **scope}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Room not found")
    # Refuse when any live show OR active booking is still linked. Editors
    # must first re-assign or delete those.
    if await db.shows.find_one({"studio_id": room_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="Room has shows attached — reassign or delete them first")
    if await db.room_bookings.find_one({"room_id": room_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="Room has bookings attached — delete them first")
    await db.studios.delete_one({"id": room_id})
    return None
