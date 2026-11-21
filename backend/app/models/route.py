"""Persisted route alternatives from one comparison request."""

from __future__ import annotations

import enum
from uuid import UUID, uuid4

from geoalchemy2 import Geometry
from sqlalchemy import JSON, Enum, Float, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class TravelMode(str, enum.Enum):
    walk = "walk"
    bike = "bike"
    drive = "drive"


class Route(TimestampMixin, Base):
    __tablename__ = "routes"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), index=True, nullable=False)
    user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    travel_mode: Mapped[TravelMode] = mapped_column(
        Enum(TravelMode, name="travel_mode"), nullable=False
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    distance_m: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_s: Mapped[int] = mapped_column(Integer, nullable=False)
    safety_score: Mapped[float] = mapped_column(Float, nullable=False)
    safety_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    safety_factors: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    geometry: Mapped[object] = mapped_column(
        Geometry("LineString", srid=4326, spatial_index=False), nullable=False
    )
