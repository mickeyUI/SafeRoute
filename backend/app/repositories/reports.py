"""Report queries, including spatial corridor lookups."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from geoalchemy2.types import Geography
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.geo import Coordinate, line_from_coords, point_from_coords
from app.models.report import Report, ReportStatus


def get(db: Session, report_id: UUID) -> Report | None:
    return db.get(Report, report_id)


def create(db: Session, report: Report) -> Report:
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def list_nearby(
    db: Session,
    point: Coordinate,
    radius_m: float,
    limit: int = 25,
    approved_only: bool = True,
) -> list[tuple[Report, float]]:
    geometry = point_from_coords(point)
    report_geog = func.cast(Report.location, Geography)
    point_geog = func.cast(geometry, Geography)
    distance = func.ST_Distance(report_geog, point_geog).label("distance_m")
    stmt = select(Report, distance).where(
        func.ST_DWithin(report_geog, point_geog, radius_m)
    )
    if approved_only:
        stmt = stmt.where(Report.status == ReportStatus.approved)
    stmt = stmt.order_by(distance).limit(limit)
    return [
        (cast(Report, report), float(cast(float, dist)))
        for report, dist in db.execute(stmt).all()
    ]


def list_near_route(
    db: Session,
    coordinates: Sequence[Sequence[float]],
    radius_m: float,
    max_age_days: int,
) -> list[Report]:
    """Approved, recent reports whose point falls within the route corridor."""
    corridor = line_from_coords(coordinates)
    cutoff = datetime.now(UTC) - timedelta(days=max_age_days)
    stmt = (
        select(Report)
        .where(
            Report.status == ReportStatus.approved,
            Report.occurred_at >= cutoff,
            func.ST_DWithin(
                func.cast(Report.location, Geography),
                func.cast(corridor, Geography),
                radius_m,
            ),
        )
        .order_by(Report.occurred_at.desc())
    )
    return list(db.scalars(stmt).all())


def save(db: Session, report: Report) -> Report:
    db.commit()
    db.refresh(report)
    return report
