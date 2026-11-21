"""Emergency SOS alerts recorded during a journey."""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID, uuid4

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SosStatus(str, enum.Enum):
    active = "active"
    acknowledged = "acknowledged"
    cancelled = "cancelled"


class SosAlert(TimestampMixin, Base):
    __tablename__ = "sos_alerts"
    __table_args__ = (Index("ix_sos_alerts_location_gist", "location", postgresql_using="gist"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    reporter_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    location: Mapped[object] = mapped_column(
        Geometry("Point", srid=4326, spatial_index=False), nullable=False
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    voice_attached: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    picture_name: Mapped[str | None] = mapped_column(String(length=255), nullable=True)
    status: Mapped[SosStatus] = mapped_column(
        Enum(SosStatus, name="sos_status"), default=SosStatus.active, nullable=False
    )
    responded_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
