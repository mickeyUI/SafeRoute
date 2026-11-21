"""SOS alert endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.schemas.sos import SosCreate, SosRead
from app.services import sos_service
from app.services.auth_service import get_current_active_user

router = APIRouter(prefix="/sos", tags=["sos"])


@router.post("", response_model=SosRead, status_code=status.HTTP_201_CREATED)
def create_sos(
    payload: SosCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SosRead:
    return sos_service.to_read(
        sos_service.create_alert(db, current_user.id, payload)
    )


@router.get("/mine", response_model=list[SosRead])
def my_sos_alerts(
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[SosRead]:
    return sos_service.list_mine(db, current_user.id, limit)
