from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_optional_current_user
from app.schemas.sos import SosAlertCreate
from app.services.data_store import data_store

router = APIRouter()


@router.post("/alerts", status_code=status.HTTP_201_CREATED)
async def create_sos_alert(
    payload: SosAlertCreate,
    current_user: dict[str, Any] | None = Depends(get_optional_current_user),
):
    """
    Broadcast an active SOS with the user's current location.

    Nearby clients discover the alert through GET /sos/alerts/nearby. A live
    journey share link can be attached so responders can follow movement.
    """
    user_id = current_user.get("id") if current_user else "user_demo_123"
    alert = data_store.create_sos_alert(payload, user_id=user_id)
    return {
        "alert_id": alert["id"],
        "status": alert["status"],
        "radius_meters": alert["radius_meters"],
        "created_at": alert["created_at"].isoformat(),
        "expires_at": alert["expires_at"].isoformat(),
        "message": "SOS location shared with nearby SafeRoute users.",
    }


@router.get("/alerts/nearby")
async def get_nearby_sos_alerts(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_meters: float = Query(default=25000.0, ge=100.0, le=25000.0),
):
    """List active SOS alerts that are visible near the requested location."""
    alerts = data_store.get_active_sos_alerts_nearby(
        lat=latitude,
        lon=longitude,
        radius_meters=radius_meters,
    )
    return {
        "alerts": [
            {
                "alert_id": alert["id"],
                "client_id": alert.get("client_id"),
                "latitude": alert["latitude"],
                "longitude": alert["longitude"],
                "radius_meters": alert["radius_meters"],
                "reason": alert.get("reason"),
                "status": alert["status"],
                "distance_meters": round(alert["distance_meters"], 1),
                "share_token": alert.get("share_token"),
                "share_url": alert.get("share_url"),
                "created_at": alert["created_at"].isoformat(),
                "expires_at": alert["expires_at"].isoformat(),
            }
            for alert in alerts
        ]
    }


@router.patch("/alerts/{alert_id}/resolve")
async def resolve_sos_alert(
    alert_id: str,
    client_id: str | None = Query(default=None, max_length=120),
    current_user: dict[str, Any] | None = Depends(get_optional_current_user),
):
    """Stop sharing an alert. Only the device/user that created it may resolve it."""
    user_id = current_user.get("id") if current_user else None
    resolved = data_store.resolve_sos_alert(
        alert_id=alert_id,
        client_id=client_id,
        user_id=user_id,
    )
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active SOS alert not found for this device or user.",
        )
    return {
        "alert_id": alert_id,
        "status": "resolved",
        "message": "Location sharing stopped. Nearby clients will no longer see this alert.",
    }
