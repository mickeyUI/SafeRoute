"""Moderation entry point.

Kept separate from `report_service` so abuse checks and audit logging can be added
without changing the report API. The MVP delegates directly.
"""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.report import Report, ReportStatus
from app.models.user import User
from app.services import report_service

logger = logging.getLogger(__name__)


def moderate_report(
    db: Session,
    report_id: UUID,
    reviewer: User,
    status: ReportStatus,
    rejection_reason: str | None = None,
) -> Report:
    report = report_service.moderate_report(
        db, report_id, reviewer, status, rejection_reason
    )
    logger.info(
        "report_moderated",
        extra={
            "report_id": str(report.id),
            "reviewer_id": str(reviewer.id),
            "status": status.value,
        },
    )
    return report
