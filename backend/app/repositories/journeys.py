"""Journey persistence and active-trip lookup."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.journey import Journey, JourneyStatus


def create(db: Session, journey: Journey) -> Journey:
    db.add(journey)
    db.commit()
    db.refresh(journey)
    return journey


def get(db: Session, journey_id: UUID) -> Journey | None:
    return db.get(Journey, journey_id)


def get_active(db: Session, user_id: UUID) -> Journey | None:
    stmt = (
        select(Journey)
        .where(
            Journey.user_id == user_id,
            Journey.status.in_([JourneyStatus.planned, JourneyStatus.active]),
        )
        .order_by(Journey.created_at.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def save(db: Session, journey: Journey) -> Journey:
    db.commit()
    db.refresh(journey)
    return journey
