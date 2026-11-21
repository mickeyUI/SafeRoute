from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import get_optional_current_user
from app.schemas.journey import JourneyCheckinCreate, JourneyCreate, JourneyShareCreate
from app.services.data_store import data_store


def _extract_lat_lon(point: Any) -> tuple[float, float]:
    if hasattr(point, "latitude") and hasattr(point, "longitude"):
        return float(point.latitude), float(point.longitude)
    if isinstance(point, dict):
        lat = point.get("latitude") if "latitude" in point else point.get("lat")
        lon = point.get("longitude") if "longitude" in point else point.get("lon")
        return float(lat), float(lon)
    if isinstance(point, (list, tuple)) and len(point) == 2:
        return float(point[1]), float(point[0])
    raise ValueError(f"Invalid coordinate: {point}")


router = APIRouter()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_journey(
    payload: JourneyCreate, current_user: dict[str, Any] | None = Depends(get_optional_current_user)
):
    """
    Initiate a new active journey with origin, destination, and estimated duration.
    """
    user_id = current_user.get("id") if current_user else "user_demo_123"
    origin_lat, origin_lon = _extract_lat_lon(payload.origin)
    dest_lat, dest_lon = _extract_lat_lon(payload.destination)
    duration = payload.estimated_duration_seconds or 1800
    journey = data_store.create_journey(
        user_id=user_id,
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        duration_seconds=duration,
        route_coords=payload.route_coordinates,
    )
    return {
        "id": journey["id"],
        "journey_id": journey["id"],
        "status": journey["status"],
        "started_at": journey["started_at"].isoformat(),
        "estimated_arrival_at": journey["estimated_arrival_at"].isoformat(),
    }


@router.get("/active")
async def get_active_journey(
    current_user: dict[str, Any] | None = Depends(get_optional_current_user),
):
    user_id = current_user.get("id") if current_user else "user_demo_123"
    active = next(
        (
            j
            for j in data_store.journeys.values()
            if j.get("user_id") == user_id
            and j.get("status") in {"active", "in_progress", "planned"}
        ),
        None,
    )
    if not active:
        raise HTTPException(status_code=404, detail="No active or planned journey")
    return active


@router.get("/{journey_id}")
async def get_journey(journey_id: str):
    journey = data_store.get_journey(journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found")
    return journey


@router.patch("/{journey_id}/start")
async def start_journey(journey_id: str):
    journey = data_store.get_journey(journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found")
    journey["status"] = "active"
    return {"message": "Journey started", "journey": journey}


@router.post("/{journey_id}/checkin")
@router.patch("/{journey_id}/check-in")
async def add_checkin(journey_id: str, payload: JourneyCheckinCreate):
    """
    Add a manual milestone check-in or arrival confirmation.
    """
    checkin = data_store.add_checkin(
        journey_id=journey_id,
        lat=payload.latitude,
        lon=payload.longitude,
        checkin_type=payload.checkin_type,
        note=payload.note,
    )
    if not checkin:
        raise HTTPException(status_code=404, detail="Journey not found")
    return {"message": "Check-in recorded successfully", "checkin": checkin}


@router.post("/{journey_id}/share")
async def create_journey_share(journey_id: str, payload: JourneyShareCreate):
    """
    Generate an expiring, revocable sharing link for trusted contacts.
    """
    journey = data_store.get_journey(journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found")

    share_record = data_store.create_share_token(journey_id, valid_hours=payload.valid_hours)
    return {
        "share_token": share_record["token"],
        "expires_at": share_record["expires_at"].isoformat(),
        "valid_hours": payload.valid_hours,
        "message": "Share link generated successfully.",
    }


@router.post("/{journey_id}/end")
@router.patch("/{journey_id}/complete")
async def end_journey(journey_id: str):
    """
    Mark journey as completed and stop sharing.
    """
    journey = data_store.complete_journey(journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found")
    return {"message": "Journey completed and location sharing stopped.", "journey": journey}


@router.patch("/{journey_id}/cancel")
async def cancel_journey(journey_id: str):
    """
    Cancel journey prematurely.
    """
    journey = data_store.cancel_journey(journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found")
    return {"message": "Journey cancelled.", "journey": journey}
