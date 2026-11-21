"""Incident report endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import client_key, rate_limiter
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import Paginated
from app.schemas.report import (
    ReportCreate,
    ReportModerationRequest,
    ReportNearby,
    ReportRead,
)
from app.services import report_service
from app.services.auth_service import get_current_active_user, require_moderator
from app.services.moderation_service import moderate_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> ReportRead:
    rate_limiter.hit(f"reports:{client_key(request)}")
    report = report_service.create_report(db, current_user.id, payload)
    return report_service.to_read(report)


@router.get("/nearby", response_model=Paginated[ReportNearby])
def nearby_reports(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    radius_m: float = Query(settings.default_search_radius_m, gt=0),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> Paginated[ReportNearby]:
    results = report_service.list_nearby(db, (lon, lat), radius_m, limit + offset)
    page = results[offset : offset + limit]
    items = [
        ReportNearby(**report_service.to_read(report).model_dump(), distance_m=distance)
        for report, distance in page
    ]
    return Paginated(items=items, total=len(results), limit=limit, offset=offset)


@router.get("/{report_id}", response_model=ReportRead)
def get_report(
    report_id: UUID,
    db: Session = Depends(get_db),
) -> ReportRead:
    return report_service.to_read(report_service.get_report(db, report_id))


@router.patch("/{report_id}/moderate", response_model=ReportRead)
def moderate(
    report_id: UUID,
    payload: ReportModerationRequest,
    db: Session = Depends(get_db),
    reviewer: User = Depends(require_moderator),
) -> ReportRead:
    report = moderate_report(
        db, report_id, reviewer, payload.status, payload.rejection_reason
    )
    return report_service.to_read(report)
