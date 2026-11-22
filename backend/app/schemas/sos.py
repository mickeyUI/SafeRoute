"""SOS alert payloads for both the nearby-broadcast and account APIs."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.sos import SosStatus
from app.schemas.common import Point


class SosAlertCreate(BaseModel):
    """Payload sent when a user confirms an emergency SOS from the map UI."""

    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    radius_meters: float = Field(default=2000.0, ge=100.0, le=25000.0)
    reason: str | None = Field(default=None, max_length=500)
    client_id: str | None = Field(default=None, max_length=120)
    share_token: str | None = Field(default=None, max_length=200)
    share_url: str | None = Field(default=None, max_length=500)
    journey_id: str | None = Field(default=None, max_length=120)
    valid_hours: int = Field(default=3, ge=1, le=24)


class SosCreate(BaseModel):
    """Payload for an authenticated, recorded SOS alert."""

    location: Point
    reason: str | None = Field(default=None, max_length=500)
    voice_attached: bool = False
    picture_name: str | None = Field(default=None, max_length=255)


class SosRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reporter_id: str
    location: Point
    reason: str | None
    voice_attached: bool
    picture_name: str | None
    status: SosStatus
    created_at: datetime
    responded_at: datetime | None
