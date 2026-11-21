"""Shared primitives and error envelopes."""

from __future__ import annotations

from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, BeforeValidator, Field

T = TypeVar("T")


def _validate_point(value: Any) -> list[float]:
    """Accept [lon, lat] sequences or {latitude, longitude} dicts and validate WGS84 values."""
    if isinstance(value, dict):
        lat = value.get("latitude") if "latitude" in value else value.get("lat")
        lon = value.get("longitude") if "longitude" in value else value.get("lon")
        if lat is None or lon is None:
            raise ValueError("coordinate dict must contain latitude and longitude")
        coords = [float(lon), float(lat)]
    elif isinstance(value, (str, bytes)) or not hasattr(value, "__iter__"):
        raise ValueError("coordinate must be a [longitude, latitude] pair")
    else:
        coords = [float(item) for item in value]
    if len(coords) != 2:
        raise ValueError("coordinate must contain exactly two values")
    lon, lat = coords
    if not -180 <= lon <= 180 or not -90 <= lat <= 90:
        raise ValueError("longitude must be [-180, 180] and latitude [-90, 90]")
    return [lon, lat]


Point = Annotated[list[float], BeforeValidator(_validate_point)]
Polyline = list[Point]


class PaginationParams(BaseModel):
    limit: int = Field(default=25, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Any = None
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
