"""Report creation, retrieval, and moderation."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.core.geo import Coordinate, coords_from_geometry, point_from_coords
from app.models.report import Report, ReportStatus, ReportType
from app.models.user import User
from app.repositories import reports as report_repo
from app.schemas.report import ReportCreate, ReportRead
from app.services.safety.scorer import ReportSample

# The database keeps a small legacy `type` enum for the scoring engine, while
# `category` stores the full value used by the API and map UI.
CATEGORY_TO_TYPE: dict[str, ReportType] = {
    "harassment": ReportType.harassment,
    "poor_street_lighting": ReportType.unsafe_lighting,
    "suspicious_activity": ReportType.suspicious,
}
TYPE_TO_CATEGORY: dict[ReportType, str] = {
    ReportType.harassment: "harassment",
    ReportType.suspicious: "suspicious_activity",
    ReportType.unsafe_lighting: "poor_street_lighting",
}


def category_value(payload: ReportCreate) -> str:
    if payload.category is not None:
        return payload.category.value
    if payload.type is not None:
        return TYPE_TO_CATEGORY.get(payload.type, "other")
    return "other"


def create_report(db: Session, reporter_id: UUID | None, payload: ReportCreate, report_id: UUID | None = None) -> Report:
    if payload.location is not None:
        coords = payload.location
    elif payload.latitude is not None and payload.longitude is not None:
        coords = [payload.longitude, payload.latitude]
    else:
        raise ValueError("A report location is required")

    category = category_value(payload)
    report = Report(
        id=report_id,
        reporter_id=reporter_id,
        type=payload.type or CATEGORY_TO_TYPE.get(category, ReportType.other),
        category=category,
        severity=payload.severity,
        description=payload.description,
        location=point_from_coords(coords),
        occurred_at=payload.occurred_at or datetime.now(UTC),
        # Live community reports are visible immediately, matching the existing
        # in-memory behaviour used by the map and safety warnings.
        status=ReportStatus.approved,
    )
    return report_repo.create(db, report)


def get_report(db: Session, report_id: UUID) -> Report:
    report = report_repo.get(db, report_id)
    if report is None:
        raise NotFoundError("Report not found")
    return report


def list_nearby(
    db: Session, point: Coordinate, radius_m: float, limit: int
) -> list[tuple[Report, float]]:
    return report_repo.list_nearby(db, point, radius_m, limit, approved_only=True)


def moderate_report(
    db: Session,
    report_id: UUID,
    reviewer: User,
    status: ReportStatus,
    rejection_reason: str | None = None,
) -> Report:
    if status not in {ReportStatus.approved, ReportStatus.rejected}:
        raise ValueError("Reports can only be approved or rejected")
    report = get_report(db, report_id)
    report.status = status
    report.reviewed_by = reviewer.id
    report.reviewed_at = datetime.now(UTC)
    report.rejection_reason = rejection_reason
    return report_repo.save(db, report)


def to_read(report: Report) -> ReportRead:
    """Convert an ORM row (with WKB geometry) into the API schema."""
    coords = coords_from_geometry(report.location)
    return ReportRead(
        id=report.id,
        reporter_id=report.reporter_id,
        type=report.type,
        severity=report.severity,
        description=report.description,
        location=coords,  # type: ignore[arg-type]
        occurred_at=report.occurred_at,
        status=report.status,
        created_at=report.created_at,
    )


def to_scorer_samples(reports: Sequence[Report]) -> list[ReportSample]:
    """Project ORM rows into the minimal shape the scorer needs."""
    samples: list[ReportSample] = []
    for report in reports:
        coords = coords_from_geometry(report.location)
        if not isinstance(coords, list) or len(coords) != 2:
            continue
        point = cast(list[float], coords)
        samples.append(
            ReportSample(
                location=(float(point[0]), float(point[1])),
                severity=report.severity,
                type=report.type,
            )
        )
    return samples
