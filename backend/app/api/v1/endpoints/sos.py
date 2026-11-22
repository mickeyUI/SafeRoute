"""SOS alert endpoints.

Two compatible SOS APIs live here:

* ``/sos/alerts`` — the public broadcast/nearby/resolve API used by the
  map UI for one-tap SOS and live nearby discovery.
* ``/sos`` and ``/sos/mine`` — the authenticated, recorded-alert API used by
  the account-based frontend.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_current_user, get_optional_current_user
from app.schemas.sos import SosAlertCreate, SosCreate, SosRead
from app.services import sos_service
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


@router.post("", response_model=SosRead, status_code=status.HTTP_201_CREATED)
def create_sos(
    payload: SosCreate,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> SosRead:
    """Record an authenticated SOS alert for the signed-in user."""
    return sos_service.create_alert(current_user["id"], payload)


@router.get("/mine", response_model=list[SosRead])
def my_sos_alerts(
    limit: int = Query(25, ge=1, le=100),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> list[SosRead]:
    """List the signed-in user's recorded SOS alerts."""
    return sos_service.list_mine(current_user["id"], limit)
