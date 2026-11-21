from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    contacts,
    health,
    journeys,
    locations,
    reports,
    routes,
    shared,
    sos,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(routes.router, prefix="/routes", tags=["Navigation"])
api_router.include_router(reports.router, prefix="/reports", tags=["Incident Reports"])
api_router.include_router(locations.router, prefix="/locations", tags=["Safe Locations"])
api_router.include_router(
    locations.router, prefix="/safe-locations", tags=["Safe Locations (Alias)"]
)
api_router.include_router(journeys.router, prefix="/journeys", tags=["Journeys"])
api_router.include_router(contacts.router, prefix="/contacts", tags=["Trusted Contacts"])
api_router.include_router(shared.router, prefix="/shared/journeys", tags=["Shared Journeys"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(sos.router)
