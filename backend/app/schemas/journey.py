"""Journey, sharing, and contact payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.journey import JourneyStatus
from app.models.route import TravelMode
from app.schemas.common import Point
from app.schemas.route import Coordinate


class JourneyCreate(BaseModel):
    origin: Any
    destination: Any
    travel_mode: TravelMode = TravelMode.walk
    route_id: UUID | None = None
    contact_id: UUID | None = None
    estimated_duration_seconds: int | None = 1800
    route_coordinates: list[list[float]] | None = None


class JourneyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    route_id: UUID | None = None
    contact_id: UUID | None = None
    origin: Point
    destination: Point
    travel_mode: TravelMode
    status: JourneyStatus
    started_at: datetime | None = None
    check_in_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime


class JourneyCheckinCreate(BaseModel):
    latitude: float
    longitude: float
    checkin_type: str = "manual_confirm"  # manual_confirm, milestone, arrival
    note: str | None = None


class JourneyShareCreate(BaseModel):
    trusted_contact_name: str | None = None
    trusted_contact_phone: str | None = None
    valid_hours: int = Field(default=2, ge=1, le=24)


class SharedJourneyView(BaseModel):
    journey_id: str
    status: Any
    origin: Coordinate
    destination: Coordinate
    started_at: datetime
    estimated_arrival_at: datetime | None = None
    last_checkin_at: datetime | None = None
    last_checkin_type: str | None = None
    is_valid: bool = True
    remaining_minutes: int = 120


class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=3, max_length=40)
    email: str | None = Field(default=None, max_length=320)
    relationship: str | None = Field(default=None, max_length=60)
    is_primary: bool = False


class ContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Any
    name: str
    phone: str | None = None
    email: str | None = None
    relationship: str | None = None
    is_primary: bool = False
    created_at: datetime
