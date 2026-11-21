"""SOS alert creation and retrieval."""

from __future__ import annotations

import logging
from typing import cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.geo import coords_from_geometry, point_from_coords
from app.models.sos import SosAlert
from app.schemas.sos import SosCreate, SosRead

logger = logging.getLogger(__name__)


def create_alert(db: Session, reporter_id: UUID, payload: SosCreate) -> SosAlert:
    alert = SosAlert(
        reporter_id=reporter_id,
        location=point_from_coords(payload.location),
        reason=payload.reason,
        voice_attached=payload.voice_attached,
        picture_name=payload.picture_name,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    # No real SMS/push provider is configured yet. Log the simulated notification
    # so the flow is visible in development without sending anything externally.
    logger.info(
        "SOS alert %s recorded for user %s; simulated contact notification",
        alert.id,
        reporter_id,
    )
    return alert


def to_read(alert: SosAlert) -> SosRead:
    coords = coords_from_geometry(alert.location)
    if not isinstance(coords, list) or len(coords) != 2:
        raise ValueError("SOS alert has an invalid location geometry")
    point = cast(list[float], coords)
    return SosRead(
        id=alert.id,
        reporter_id=alert.reporter_id,
        location=[float(point[0]), float(point[1])],
        reason=alert.reason,
        voice_attached=alert.voice_attached,
        picture_name=alert.picture_name,
        status=alert.status,
        created_at=alert.created_at,
        responded_at=alert.responded_at,
    )


def list_mine(db: Session, user_id: UUID, limit: int = 25) -> list[SosRead]:
    stmt = (
        select(SosAlert)
        .where(SosAlert.reporter_id == user_id)
        .order_by(SosAlert.created_at.desc())
        .limit(limit)
    )
    return [to_read(alert) for alert in db.scalars(stmt)]
