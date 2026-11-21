"""SOS alert endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, status

from app.core.security import get_current_user
from app.schemas.sos import SosCreate, SosRead
from app.services import sos_service

router = APIRouter(prefix="/sos", tags=["sos"])


@router.post("", response_model=SosRead, status_code=status.HTTP_201_CREATED)
def create_sos(
    payload: SosCreate,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> SosRead:
    return sos_service.create_alert(current_user["id"], payload)


@router.get("/mine", response_model=list[SosRead])
def my_sos_alerts(
    limit: int = Query(25, ge=1, le=100),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> list[SosRead]:
    return sos_service.list_mine(current_user["id"], limit)
