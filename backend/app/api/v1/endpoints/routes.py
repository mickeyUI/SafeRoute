"""Route comparison endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.schemas.route import RouteCompareRequest, RouteComparisonResponse, RouteRead
from app.services import route_service
from app.services.auth_service import get_optional_user

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("/compare", response_model=RouteComparisonResponse)
def compare_routes(
    payload: RouteCompareRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> RouteComparisonResponse:
    user_id = current_user.id if current_user else None
    return route_service.compare_routes(db, user_id, payload)


@router.get("/{route_id}", response_model=RouteRead)
def get_route(
    route_id: UUID,
    db: Session = Depends(get_db),
) -> RouteRead:
    return route_service.get_route(db, route_id)
