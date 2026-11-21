from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_optional_current_user
from app.schemas.report import (
    ModerationStatus,
    ReportCreate,
    ReportGeoJSONCollection,
    ReportGeoJSONFeature,
    ReportGeoJSONProperties,
)
from app.services.data_store import data_store

router = APIRouter()


@router.post("", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_report(
    report_in: ReportCreate,
    current_user: dict[str, Any] | None = Depends(get_optional_current_user),
):
    """
    Submit a location-based safety concern (harassment, poor lighting, etc.).
    Supports authenticated or anonymous submissions.
    """
    user_id = current_user.get("id") if (current_user and not report_in.is_anonymous) else None
    created = data_store.create_report(report_in, user_id=user_id)
    return {
        "id": created["id"],
        "status": created["status"],
        "message": "Report submitted successfully.",
        "created_at": created["created_at"].isoformat(),
    }


@router.get("/nearby", response_model=ReportGeoJSONCollection)
async def get_nearby_reports(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_meters: float = Query(default=3000.0, ge=100.0, le=25000.0),
    status: ModerationStatus | None = Query(default=None),
):
    """
    Retrieve community reports near given coordinates as a GeoJSON FeatureCollection.
    """
    raw_reports = data_store.get_nearby_reports(
        lat=latitude, lon=longitude, radius_meters=radius_meters, status=status
    )
    features = []
    for r in raw_reports:
        features.append(
            ReportGeoJSONFeature(
                type="Feature",
                geometry={"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
                properties=ReportGeoJSONProperties(
                    id=r["id"],
                    category=r["category"],
                    severity=r["severity"],
                    description=r.get("description"),
                    status=r["status"],
                    reported_days_ago=r.get("reported_days_ago", 0),
                ),
            )
        )
    return ReportGeoJSONCollection(type="FeatureCollection", features=features)


@router.patch("/{report_id}/moderate")
async def moderate_report(report_id: str, new_status: ModerationStatus):
    """
    Update moderation status of a report (approve or reject).
    """
    rep = data_store.reports.get(report_id)
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found")
    rep["status"] = new_status
    return {"id": report_id, "status": new_status, "message": "Report status updated."}
