"""Pydantic models for Room Bookings.

Rooms are Clara "Studios" under the hood — the same physical spaces where
radio shows are scheduled. Room bookings therefore participate in the same
conflict-detection domain as calendar shows: any overlapping share of the
same room where BOTH entries have ``blocks_room=True`` triggers a conflict.

The ``blocks_room`` flag lets pre-recorded / non-blocking shows share the
room with a booking without producing a conflict — set it to False on
recorded shows and on bookings that don't physically claim the space.

Extended booking fields (contact + attendees + recurrence) round out the
"meeting" experience users asked for. Recurrence explodes on create into
individual sibling bookings that share a ``parent_booking_id`` so future
edits/deletes can target either the single instance or the whole series.
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal


RecurrenceType = Literal["none", "daily", "weekly", "monthly"]


class RoomBookingCreate(BaseModel):
    room_id: str
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = ""
    start_at: str  # ISO datetime
    end_at: str    # ISO datetime
    blocks_room: bool = True
    contact_person: Optional[str] = ""
    contact_email: Optional[str] = ""
    attendees: Optional[int] = 0
    recurrence_type: RecurrenceType = "none"
    recurrence_end_date: Optional[str] = None  # YYYY-MM-DD, inclusive


class RoomBookingUpdate(BaseModel):
    room_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    blocks_room: Optional[bool] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    attendees: Optional[int] = None
    # Updating a recurrence rule on an existing booking is a bigger surface;
    # keep it here for future expansion but ignore in the router for now.
    recurrence_type: Optional[RecurrenceType] = None
    recurrence_end_date: Optional[str] = None
    update_series: Optional[bool] = False  # true = propagate to siblings


class RoomBookingResponse(BaseModel):
    id: str
    room_id: str
    room_name: Optional[str] = None
    title: str
    description: Optional[str] = ""
    start_at: str
    end_at: str
    blocks_room: bool = True
    contact_person: Optional[str] = ""
    contact_email: Optional[str] = ""
    attendees: Optional[int] = 0
    recurrence_type: RecurrenceType = "none"
    recurrence_end_date: Optional[str] = None
    parent_booking_id: Optional[str] = None
    created_by: str
    created_by_name: Optional[str] = None
    created_at: str
    updated_at: str
