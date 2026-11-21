"""Verified places where a user can seek help or refuge."""

from __future__ import annotations

import enum
from uuid import UUID, uuid4

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, Enum, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SafeLocationCategory(str, enum.Enum):
    police = "police"
    hospital = "hospital"
    transit = "transit"
    shop = "shop"
    friend = "friend"
    other = "other"


class SafeLocation(TimestampMixin, Base):
    __tablename__ = "safe_locations"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[SafeLocationCategory] = mapped_column(
        Enum(SafeLocationCategory, name="safe_location_category"), nullable=False
    )
    address: Mapped[str | None] = mapped_column(String(240), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[object] = mapped_column(
        Geometry("Point", srid=4326, spatial_index=False), nullable=False
    )
    created_by: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
