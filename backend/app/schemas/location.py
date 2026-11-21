"""Safe-location payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.safe_location import SafeLocationCategory
from app.schemas.common import Point


class SafeLocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: SafeLocationCategory
    address: str | None = Field(default=None, max_length=240)
    notes: str | None = Field(default=None, max_length=1000)
    location: Point


class SafeLocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: SafeLocationCategory
    address: str | None
    notes: str | None
    location: Point
    is_verified: bool
    created_at: datetime


class SafeLocationNearby(SafeLocationRead):
    distance_m: float
