"""Incident report payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.report import ReportStatus, ReportType
from app.schemas.common import Point


class ReportCreate(BaseModel):
    type: ReportType
    severity: int = Field(ge=1, le=5)
    description: str | None = Field(default=None, max_length=1000)
    location: Point
    occurred_at: datetime


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reporter_id: UUID
    type: ReportType
    severity: int
    description: str | None
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
