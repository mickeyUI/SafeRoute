"""SOS alert creation and retrieval using the shared demo data store."""

from __future__ import annotations

import logging

from app.schemas.sos import SosCreate, SosRead
from app.services.data_store import data_store

logger = logging.getLogger(__name__)


def create_alert(reporter_id: str, payload: SosCreate) -> SosRead:
    """Record an SOS alert for the demo backend without contacting responders."""
    alert = data_store.create_sos_alert_recorded(
        reporter_id=reporter_id,
        location=list(payload.location),
        reason=payload.reason,
        voice_attached=payload.voice_attached,
        picture_name=payload.picture_name,
    )

    # No real SMS/push provider is configured. Log the simulated notification so
    # the flow is visible in development without sending anything externally.
    logger.info(
        "SOS alert %s recorded for user %s; simulated contact notification",
        alert["id"],
        reporter_id,
    )
    return SosRead(**alert)


def list_mine(reporter_id: str, limit: int = 25) -> list[SosRead]:
    return [SosRead(**alert) for alert in data_store.list_sos_alerts(reporter_id, limit)]
