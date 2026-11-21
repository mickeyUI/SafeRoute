from datetime import datetime
from enum import Enum
from typing import Annotated, Any
from uuid import UUID, uuid4

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.models.route import TravelMode
from app.schemas.common import Polyline


class Coordinate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


def coerce_coordinate(value: Any) -> Coordinate:
    if isinstance(value, Coordinate):
        return value
    if isinstance(value, dict):
        lat = value.get("latitude") if "latitude" in value else value.get("lat")
        lon = value.get("longitude") if "longitude" in value else value.get("lon")
        if lat is None or lon is None:
            raise ValueError("coordinate dict must contain latitude and longitude")
        return Coordinate(latitude=float(lat), longitude=float(lon))
    if isinstance(value, (list, tuple)):
        if len(value) != 2:
            raise ValueError("coordinate must contain exactly two values: [longitude, latitude]")
        lon, lat = float(value[0]), float(value[1])
        return Coordinate(latitude=lat, longitude=lon)
    raise ValueError("Invalid coordinate format")


CoordType = Annotated[Coordinate, BeforeValidator(coerce_coordinate)]


class RoutePreference(str, Enum):
    SAFETY = "safety"
    BALANCED = "balanced"
    FASTEST = "fastest"


class RouteCompareRequest(BaseModel):
    origin: CoordType
    destination: CoordType
    preference: RoutePreference | None = RoutePreference.SAFETY
    travel_mode: Any | None = "walk"
    departure_hour: int | None = Field(default=None, ge=0, le=23)
    alternatives: int | None = Field(default=3, ge=1, le=5)
    use_reports: bool | None = True


class SafetyFactors(BaseModel):
    model_config = ConfigDict(extra="allow")

    incident_risk: float | None = None
    lighting_risk: float | None = None
    isolation_risk: float | None = None
    activity_risk: float | None = None
    report_penalty: float | None = None
    coverage_bonus: float | None = None
    length_penalty: float | None = None


class SafetyIndicator(BaseModel):
    overall_risk_score: float = Field(
        ..., ge=0.0, le=100.0, description="0 is safest, 100 is highest risk"
    )
    risk_level: str = Field(..., description="low, moderate, elevated, high")
    data_coverage_score: float = Field(
        ..., ge=0.0, le=100.0, description="Percentage confidence in available data"
    )
    incident_count: int = 0
    safe_haven_count: int = 0
    factors: SafetyFactors
    observations: list[str] = []


class GeoJSONLineString(BaseModel):
    type: str = "LineString"
    coordinates: list[list[float]]  # [longitude, latitude]


class RouteOption(BaseModel):
    route_id: str
    summary: str
    distance_meters: float
    duration_seconds: float
    cost_score: float
    safety_indicator: SafetyIndicator
    geometry: GeoJSONLineString


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


class RouteCompareResponse(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid4()))
    origin: Coordinate
    destination: Coordinate
    preference: RoutePreference
    routes: list[RouteOption]
    alternatives: list[dict[str, Any]] | None = None
    disclaimer: str = (
        "SafeRoute provides risk indicators based on community reports and open geographical data. "
        "It cannot guarantee real-world conditions or absolute safety."
    )
