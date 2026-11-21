"""Safe-location queries."""

from __future__ import annotations

from typing import cast
from uuid import UUID

from geoalchemy2.types import Geography, WKBElement
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.geo import Coordinate, point_from_coords
from app.models.safe_location import SafeLocation


def get(db: Session, location_id: UUID) -> SafeLocation | None:
    return db.get(SafeLocation, location_id)


def create(db: Session, location: SafeLocation) -> SafeLocation:
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


def list_nearby(
    db: Session,
    point: Coordinate,
    radius_m: float,
    limit: int = 25,
    verified_only: bool = True,
) -> list[tuple[SafeLocation, float]]:
    geometry = point_from_coords(point)
    location_geog = func.cast(SafeLocation.location, Geography)
    point_geog = func.cast(geometry, Geography)
    distance = func.ST_Distance(location_geog, point_geog).label("distance_m")
    stmt = select(SafeLocation, distance).where(
        func.ST_DWithin(location_geog, point_geog, radius_m)
    )
    if verified_only:
        stmt = stmt.where(SafeLocation.is_verified.is_(True))
    stmt = stmt.order_by(distance).limit(limit)
    return [
        (cast(SafeLocation, location), float(cast(float, dist)))
        for location, dist in db.execute(stmt).all()
    ]


def list_near_route(
    db: Session,
    line_geometry: WKBElement,
    radius_m: float,
    verified_only: bool = True,
) -> list[SafeLocation]:
    stmt = select(SafeLocation).where(
        func.ST_DWithin(
            func.cast(SafeLocation.location, Geography),
            func.cast(line_geometry, Geography),
            radius_m,
        )
    )
    if verified_only:
        stmt = stmt.where(SafeLocation.is_verified.is_(True))
    return list(db.scalars(stmt).all())
