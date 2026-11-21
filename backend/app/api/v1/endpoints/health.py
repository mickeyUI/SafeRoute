"""Liveness and readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": settings.version,
        "routing_provider": settings.routing_provider,
    }


@router.get("/health/ready")
def readiness(response: Response, db: Session = Depends(get_db)) -> dict:
    try:
        db.execute(text("SELECT 1")).scalar()
        postgis_version = db.execute(
            text("SELECT extversion FROM pg_extension WHERE extname = 'postgis'")
        ).scalar()
    except SQLAlchemyError:
        response.status_code = 503
        return {"status": "degraded", "database": "unavailable", "postgis": None}

    return {
        "status": "ok",
        "database": "ok",
        "postgis": postgis_version,
    }
