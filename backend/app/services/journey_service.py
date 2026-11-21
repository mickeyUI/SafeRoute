"""Journey creation and state transitions."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, InvalidStateError, NotFoundError
from app.core.geo import coords_from_geometry, point_from_coords
from app.models.journey import Journey, JourneyStatus
from app.models.route import TravelMode
from app.repositories import journeys as journey_repo
from app.schemas.journey import JourneyCreate, JourneyRead

_ALLOWED_TRANSITIONS: dict[JourneyStatus, set[JourneyStatus]] = {
    JourneyStatus.planned: {JourneyStatus.active, JourneyStatus.cancelled},
    JourneyStatus.active: {JourneyStatus.completed, JourneyStatus.cancelled},
    JourneyStatus.completed: set(),
    JourneyStatus.cancelled: set(),
}


def to_read(journey: Journey) -> JourneyRead:
    return JourneyRead(
        id=journey.id,
        user_id=journey.user_id,
        route_id=journey.route_id,
        contact_id=journey.contact_id,
        origin=coords_from_geometry(journey.origin),  # type: ignore[arg-type]
        destination=coords_from_geometry(journey.destination),  # type: ignore[arg-type]
        travel_mode=TravelMode(journey.travel_mode),
        status=journey.status,
        started_at=journey.started_at,
        check_in_at=journey.check_in_at,
        ended_at=journey.ended_at,
        created_at=journey.created_at,
    )


def create_journey(db: Session, user_id: UUID, payload: JourneyCreate) -> Journey:
    journey = Journey(
        user_id=user_id,
        origin=point_from_coords(payload.origin),
        destination=point_from_coords(payload.destination),
        travel_mode=payload.travel_mode.value,
        route_id=payload.route_id,
        contact_id=payload.contact_id,
        status=JourneyStatus.planned,
    )
    return journey_repo.create(db, journey)


def get_journey(db: Session, journey_id: UUID, user_id: UUID) -> Journey:
    journey = journey_repo.get(db, journey_id)
    if journey is None:
        raise NotFoundError("Journey not found")
    if journey.user_id != user_id:
        raise ForbiddenError("This journey belongs to another user")
    return journey


def get_active(db: Session, user_id: UUID) -> Journey | None:
    return journey_repo.get_active(db, user_id)


def transition(
    db: Session,
    journey_id: UUID,
    user_id: UUID,
    target: JourneyStatus,
) -> Journey:
    journey = get_journey(db, journey_id, user_id)
    if target not in _ALLOWED_TRANSITIONS[journey.status]:
        raise InvalidStateError(
            f"Cannot move journey from {journey.status.value} to {target.value}",
            details={"current": journey.status.value, "target": target.value},
        )

    now = datetime.now(UTC)
    journey.status = target
    if target == JourneyStatus.active:
        journey.started_at = journey.started_at or now
        journey.check_in_at = now
    if target in {JourneyStatus.completed, JourneyStatus.cancelled}:
        journey.ended_at = now
    return journey_repo.save(db, journey)


def check_in(db: Session, journey_id: UUID, user_id: UUID) -> Journey:
    journey = get_journey(db, journey_id, user_id)
    if journey.status != JourneyStatus.active:
        raise InvalidStateError("Only active journeys can check in")
    journey.check_in_at = datetime.now(UTC)
    return journey_repo.save(db, journey)
