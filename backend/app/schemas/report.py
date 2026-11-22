"""Incident report schemas and payloads."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.report import ReportStatus, ReportType
from app.schemas.common import Point


class ReportCategory(str, Enum):
    HARASSMENT = "harassment"
    STALKING = "stalking"
    POOR_LIGHTING = "poor_street_lighting"
    ISOLATED_AREA = "unsafe_isolated_area"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    UNSAFE_STOP = "unsafe_transport_stop"
    HAZARD = "hazard"
    ACCIDENT = "accident"
    THEFT = "theft"
    OTHER = "other"


class ModerationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ReportCreate(BaseModel):
    category: ReportCategory | None = None
    type: ReportType | None = None
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    location: Point | None = None
    severity: int = Field(default=3, ge=1, le=5)
    description: str | None = Field(default=None, max_length=1000)
    is_anonymous: bool = True
    occurred_at: datetime | None = None


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reporter_id: UUID | None
    type: ReportType
    severity: int
    description: str | None = None
    location: Point
    occurred_at: datetime
    status: ReportStatus
    created_at: datetime


class ReportNearby(ReportRead):
    distance_m: float


class ReportModerationRequest(BaseModel):
    status: ReportStatus
    rejection_reason: str | None = Field(default=None, max_length=500)

    @field_validator("status")
    @classmethod
    def _require_decision(cls, value: ReportStatus) -> ReportStatus:
        if value not in {ReportStatus.approved, ReportStatus.rejected}:
            raise ValueError("status must be approved or rejected")
        return value


class ReportOut(BaseModel):
    id: str
    category: ReportCategory
    latitude: float
    longitude: float
    severity: int
    description: str | None = None
    status: ModerationStatus
    is_anonymous: bool
    created_at: datetime
    reported_days_ago: int | None = 0


class ReportGeoJSONProperties(BaseModel):
    id: str
    category: ReportCategory
    severity: int
    description: str | None
    status: ModerationStatus
    reported_days_ago: int


class ReportGeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: dict
    properties: ReportGeoJSONProperties


class ReportGeoJSONCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[ReportGeoJSONFeature]
