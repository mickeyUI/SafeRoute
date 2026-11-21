"""Journey and contact payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.journey import JourneyStatus
from app.models.route import TravelMode
from app.schemas.common import Point


class JourneyCreate(BaseModel):
    origin: Point
    destination: Point
    travel_mode: TravelMode = TravelMode.walk
    route_id: UUID | None = None
    contact_id: UUID | None = None


class JourneyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    route_id: UUID | None
    contact_id: UUID | None
    origin: Point
    destination: Point
    travel_mode: TravelMode
    status: JourneyStatus
    started_at: datetime | None
    check_in_at: datetime | None
    ended_at: datetime | None
    created_at: datetime


class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=3, max_length=40)
    email: str | None = Field(default=None, max_length=320)
    relationship: str | None = Field(default=None, max_length=60)
    is_primary: bool = False


class ContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    phone: str
    email: str | None
    relationship: str | None
    is_primary: bool
    created_at: datetime
