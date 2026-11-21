"""Route comparison payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.models.route import TravelMode
from app.schemas.common import Point, Polyline


class RouteCompareRequest(BaseModel):
    origin: Point
    destination: Point
    travel_mode: TravelMode = TravelMode.walk
    alternatives: int = Field(
        default=settings.routing_alternatives, ge=1, le=5
    )
    depart_at: datetime | None = None
    use_reports: bool = True


class SafetyFactors(BaseModel):
    report_penalty: float
    coverage_bonus: float
    length_penalty: float


class RouteAlternative(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rank: int
    provider: str
    travel_mode: TravelMode
    distance_m: int
    duration_s: int
    safety_score: float = Field(ge=0, le=100)
    safety_confidence: float = Field(ge=0, le=1)
    safety_factors: SafetyFactors
    geometry: Polyline


class RouteComparisonResponse(BaseModel):
    request_id: UUID
    alternatives: list[RouteAlternative]


class RouteRead(RouteAlternative):
    request_id: UUID
    created_at: datetime
