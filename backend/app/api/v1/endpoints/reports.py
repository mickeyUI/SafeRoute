"""Community report endpoints.

Reports are written to the in-memory store for immediate map/safety-engine use
and, whenever the database is available, persisted to PostGIS so they survive
backend restarts and appear on other users' devices.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.geo import coords_from_geometry
from app.core.security import get_optional_current_user
from app.db.session import get_db
from app.models.report import ReportStatus
from app.repositories import reports as report_repo
from app.schemas.report import (
    ModerationStatus,
    ReportCreate,
    ReportGeoJSONCollection,
    ReportGeoJSONFeature,
    ReportGeoJSONProperties,
)
from app.services import report_service
from app.services.data_store import data_store

logger = logging.getLogger(__name__)

router = APIRouter()


def _reporter_uuid(current_user: dict[str, Any] | None) -> UUID | None:
    """Only real UUID user ids can satisfy the database foreign key."""
    if not current_user:
        return None
    try:
        return UUID(str(current_user.get("id", "")))
    except (ValueError, AttributeError, TypeError):
        return None


def _persist_report(
    db: Session,
    report_in: ReportCreate,
    reporter_id: UUID | None,
    in_memory_report: dict[str, Any],
) -> None:
    """Best-effort database write; local map data still works if DB is down."""
    try:
        report_service.create_report(
            db,
            reporter_id,
            report_in,
            report_id=UUID(str(in_memory_report["id"])),
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.warning("Report persisted locally only (database unavailable): %s", exc)
    except (TypeError, ValueError) as exc:
        db.rollback()
        logger.warning("Report persisted locally only (invalid DB payload): %s", exc)


def _persisted_nearby_reports(
    db: Session,
    lat: float,
    lon: float,
    radius_meters: float,
    requested_status: ModerationStatus | None,
) -> list[dict[str, Any]]:
    """Read persisted reports from PostGIS. Returns [] when DB is unavailable."""
    approved_only = requested_status is None or requested_status == ModerationStatus.APPROVED
    try:
        pairs = report_repo.list_nearby(
            db,
            point=(lon, lat),
            radius_m=radius_meters,
            limit=500,
            approved_only=approved_only,
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.warning("Could not read persisted reports; using local data: %s", exc)
        return []

    now = datetime.now(UTC)
    results: list[dict[str, Any]] = []
    for row, _ in pairs:
        if requested_status and row.status.value != requested_status.value:
            continue
        coords = coords_from_geometry(row.location)
        if not isinstance(coords, list) or len(coords) != 2:
            continue
        longitude, latitude = float(coords[0]), float(coords[1])
        occurred_at = row.occurred_at or row.created_at or now
        category = row.category or report_service.TYPE_TO_CATEGORY.get(row.type, "other")
        results.append(
            {
                "id": str(row.id),
                "category": category,
                "latitude": latitude,
                "longitude": longitude,
                "severity": row.severity,
                "description": row.description,
                "status": row.status.value,
                "created_at": occurred_at,
                "reported_days_ago": max(0, (now - occurred_at).days),
            }
        )
    return results


@router.post("", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_report(
    report_in: ReportCreate,
    db: Session = Depends(get_db),
    current_user: dict[str, Any] | None = Depends(get_optional_current_user),
):
    """Submit a location-based safety concern (harassment, poor lighting, etc.)."""
    anonymous = bool(report_in.is_anonymous)
    user_id = current_user.get("id") if (current_user and not anonymous) else None
    created = data_store.create_report(report_in, user_id=user_id)
    _persist_report(db, report_in, None if anonymous else _reporter_uuid(current_user), created)
    return {
        "id": created["id"],
        "status": created["status"],
        "message": "Report submitted successfully.",
        "created_at": created["created_at"].isoformat(),
    }


@router.get("/nearby", response_model=ReportGeoJSONCollection)
async def get_nearby_reports(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_meters: float = Query(default=3000.0, ge=100.0, le=25000.0),
    status: ModerationStatus | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Retrieve community reports near given coordinates as a GeoJSON FeatureCollection."""
    raw_by_id: dict[str, dict[str, Any]] = {}
    for report in data_store.get_nearby_reports(
        lat=latitude, lon=longitude, radius_meters=radius_meters, status=status
    ):
        raw_by_id[str(report["id"])] = report

    # Persisted records win over in-memory demo/seeded records with the same id.
    for report in _persisted_nearby_reports(db, latitude, longitude, radius_meters, status):
        raw_by_id[report["id"]] = report

    features = [
        ReportGeoJSONFeature(
            type="Feature",
            geometry={"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
            properties=ReportGeoJSONProperties(
                id=r["id"],
                category=r["category"],
                severity=r["severity"],
                description=r.get("description"),
                status=r["status"],
                reported_days_ago=r.get("reported_days_ago", 0),
            ),
        )
        for r in raw_by_id.values()
    ]
    return ReportGeoJSONCollection(type="FeatureCollection", features=features)


@router.patch("/{report_id}/moderate")
async def moderate_report(
    report_id: str,
    new_status: ModerationStatus,
    db: Session = Depends(get_db),
):
    """Update moderation status of a report (approve or reject)."""
    rep = data_store.reports.get(report_id)
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found")
    rep["status"] = new_status

    try:
        persisted = report_repo.get(db, UUID(report_id))
        if persisted:
            persisted.status = ReportStatus(new_status.value)
            report_repo.save(db, persisted)
    except (ValueError, SQLAlchemyError) as exc:
        db.rollback()
        logger.warning("Could not update persisted report status: %s", exc)

    return {"id": report_id, "status": new_status, "message": "Report status updated."}
