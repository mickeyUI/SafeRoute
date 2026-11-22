from enum import Enum

from pydantic import BaseModel


class SafeLocationCategory(str, Enum):
    POLICE_STATION = "police_station"
    HOSPITAL = "hospital"
    PHARMACY = "pharmacy"
    VERIFIED_HAVEN = "verified_haven"


class SafeLocationOut(BaseModel):
    id: str
    name: str
    category: SafeLocationCategory
    latitude: float
    longitude: float
    description: str | None = None
    contact_phone: str | None = None
    is_24_7: bool = True
    verification_status: str = "verified"


class SafeLocationGeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: dict
    properties: dict


class SafeLocationGeoJSONCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[SafeLocationGeoJSONFeature]
