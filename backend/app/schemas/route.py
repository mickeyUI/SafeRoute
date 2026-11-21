from typing import List, Optional, Dict, Any, Annotated
from uuid import UUID, uuid4
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, BeforeValidator

from app.models.route import TravelMode
from app.schemas.common import Point, Polyline


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
    preference: Optional[RoutePreference] = RoutePreference.SAFETY
    travel_mode: Optional[Any] = "walk"
    departure_hour: Optional[int] = Field(default=None, ge=0, le=23)
    alternatives: Optional[int] = Field(default=3, ge=1, le=5)
    use_reports: Optional[bool] = True


class SafetyFactors(BaseModel):
    model_config = ConfigDict(extra="allow")

    incident_risk: Optional[float] = None
    lighting_risk: Optional[float] = None
    isolation_risk: Optional[float] = None
    activity_risk: Optional[float] = None
    report_penalty: Optional[float] = None
    coverage_bonus: Optional[float] = None
    length_penalty: Optional[float] = None


class SafetyIndicator(BaseModel):
    overall_risk_score: float = Field(..., ge=0.0, le=100.0, description="0 is safest, 100 is highest risk")
    risk_level: str = Field(..., description="low, moderate, elevated, high")
    data_coverage_score: float = Field(..., ge=0.0, le=100.0, description="Percentage confidence in available data")
    incident_count: int = 0
    safe_haven_count: int = 0
    factors: SafetyFactors
    observations: List[str] = []


class GeoJSONLineString(BaseModel):
    type: str = "LineString"
    coordinates: List[List[float]]  # [longitude, latitude]


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
    alternatives: List[RouteAlternative]


class RouteRead(RouteAlternative):
    request_id: UUID
    created_at: datetime


class RouteCompareResponse(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid4()))
    origin: Coordinate
    destination: Coordinate
    preference: RoutePreference
    routes: List[RouteOption]
    alternatives: Optional[List[Dict[str, Any]]] = None
    disclaimer: str = (
        "SafeRoute provides risk indicators based on community reports and open geographical data. "
        "It cannot guarantee real-world conditions or absolute safety."
    )
