"""Journey lifecycle endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.journey import JourneyStatus
from app.models.user import User
from app.schemas.journey import JourneyCreate, JourneyRead
from app.services import journey_service
from app.services.auth_service import get_current_active_user

router = APIRouter(prefix="/journeys", tags=["journeys"])


@router.post("", response_model=JourneyRead, status_code=status.HTTP_201_CREATED)
def create_journey(
    payload: JourneyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> JourneyRead:
    return journey_service.to_read(
        journey_service.create_journey(db, current_user.id, payload)
    )


@router.get("/active", response_model=JourneyRead)
def active_journey(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> JourneyRead:
    journey = journey_service.get_active(db, current_user.id)
    if journey is None:
        raise NotFoundError("No active or planned journey")
    return journey_service.to_read(journey)


@router.get("/{journey_id}", response_model=JourneyRead)
def get_journey(
    journey_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> JourneyRead:
    return journey_service.to_read(
        journey_service.get_journey(db, journey_id, current_user.id)
    )


@router.patch("/{journey_id}/start", response_model=JourneyRead)
def start_journey(
    journey_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> JourneyRead:
    return journey_service.to_read(
        journey_service.transition(db, journey_id, current_user.id, JourneyStatus.active)
    )


@router.patch("/{journey_id}/check-in", response_model=JourneyRead)
def check_in(
    journey_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> JourneyRead:
    return journey_service.to_read(
        journey_service.check_in(db, journey_id, current_user.id)
    )


@router.patch("/{journey_id}/complete", response_model=JourneyRead)
def complete_journey(
    journey_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> JourneyRead:
    return journey_service.to_read(
        journey_service.transition(
            db, journey_id, current_user.id, JourneyStatus.completed
        )
    )


@router.patch("/{journey_id}/cancel", response_model=JourneyRead)
def cancel_journey(
    journey_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> JourneyRead:
    return journey_service.to_read(
        journey_service.transition(
            db, journey_id, current_user.id, JourneyStatus.cancelled
        )
    )
