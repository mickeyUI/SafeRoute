"""Journey lifecycle and check-in timestamps."""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID, uuid4

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class JourneyStatus(str, enum.Enum):
    planned = "planned"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ARRIVED = "completed"
    EXPIRED = "cancelled"


class Journey(TimestampMixin, Base):
    __tablename__ = "journeys"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    route_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("routes.id", ondelete="SET NULL"), nullable=True
    )
    contact_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True
    )
    origin: Mapped[object] = mapped_column(
        Geometry("Point", srid=4326, spatial_index=False), nullable=False
    )
    destination: Mapped[object] = mapped_column(
        Geometry("Point", srid=4326, spatial_index=False), nullable=False
    )
    travel_mode: Mapped[str] = mapped_column(String(16), default="walk", nullable=False)
    status: Mapped[JourneyStatus] = mapped_column(
        Enum(JourneyStatus, name="journey_status"),
        default=JourneyStatus.planned,
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
