"""Aggregated v1 router."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    contacts,
    health,
    journeys,
    locations,
    reports,
    routes,
)

router = APIRouter()
router.include_router(health.router)
router.include_router(auth.router)
router.include_router(routes.router)
router.include_router(reports.router)
router.include_router(locations.router)
router.include_router(journeys.router)
router.include_router(contacts.router)
