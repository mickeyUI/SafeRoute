"""SOS alert payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.sos import SosStatus
from app.schemas.common import Point


class SosCreate(BaseModel):
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
