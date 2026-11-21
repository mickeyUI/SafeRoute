"""Safe-location endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import NotFoundError
from app.core.geo import coords_from_geometry, point_from_coords
from app.db.session import get_db
from app.models.safe_location import SafeLocation
from app.models.user import User
from app.repositories import locations as location_repo
from app.schemas.common import Paginated
from app.schemas.location import (
    SafeLocationCreate,
    SafeLocationNearby,
    SafeLocationRead,
)
from app.services.auth_service import get_current_active_user

router = APIRouter(prefix="/safe-locations", tags=["safe-locations"])


def _to_read(location: SafeLocation) -> SafeLocationRead:
    return SafeLocationRead(
        id=location.id,
        name=location.name,
        category=location.category,
        address=location.address,
        notes=location.notes,
        location=coords_from_geometry(location.location),  # type: ignore[arg-type]
        is_verified=location.is_verified,
        created_at=location.created_at,
    )


@router.post("", response_model=SafeLocationRead, status_code=status.HTTP_201_CREATED)
def create_location(
    payload: SafeLocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SafeLocationRead:
    location = SafeLocation(
        name=payload.name,
        category=payload.category,
        address=payload.address,
        notes=payload.notes,
        location=point_from_coords(payload.location),
        created_by=current_user.id,
        is_verified=False,
    )
    return _to_read(location_repo.create(db, location))


@router.get("/nearby", response_model=Paginated[SafeLocationNearby])
def nearby_locations(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    radius_m: float = Query(settings.default_search_radius_m, gt=0),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> Paginated[SafeLocationNearby]:
    results = location_repo.list_nearby(db, (lon, lat), radius_m, limit + offset)
    page = results[offset : offset + limit]
    items = [
        SafeLocationNearby(**_to_read(location).model_dump(), distance_m=distance)
        for location, distance in page
    ]
    return Paginated(items=items, total=len(results), limit=limit, offset=offset)


@router.get("/{location_id}", response_model=SafeLocationRead)
def get_location(
    location_id: UUID,
    db: Session = Depends(get_db),
) -> SafeLocationRead:
    location = location_repo.get(db, location_id)
    if location is None:
        raise NotFoundError("Safe location not found")
    return _to_read(location)
