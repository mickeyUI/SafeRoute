"""Route persistence."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.route import Route


def create_many(db: Session, routes: list[Route]) -> list[Route]:
    db.add_all(routes)
    db.commit()
    for route in routes:
        db.refresh(route)
    return routes


def get(db: Session, route_id: UUID) -> Route | None:
    return db.get(Route, route_id)


def list_for_request(db: Session, request_id: UUID) -> list[Route]:
    stmt = select(Route).where(Route.request_id == request_id).order_by(Route.rank)
    return list(db.scalars(stmt).all())


def list_for_user(
    db: Session, user_id: UUID, limit: int = 25, offset: int = 0
) -> tuple[list[Route], int]:
    filters = (Route.user_id == user_id,)
    total = db.scalar(select(func.count()).select_from(Route).where(*filters)) or 0
    stmt = (
        select(Route)
        .where(*filters)
        .order_by(Route.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt).all()), total
