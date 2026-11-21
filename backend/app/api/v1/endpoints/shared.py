from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from app.services.data_store import data_store

router = APIRouter()


@router.get("/{share_token}")
async def get_shared_journey(share_token: str):
    """
    Public view for trusted contact accessing a shared journey.
    Validates token expiration and revocability before disclosing minimal tracking info.
    """
    share = data_store.get_share_by_token(share_token)
    if not share or share.get("is_revoked"):
        raise HTTPException(
            status_code=404, detail="Shared journey link is invalid or has been revoked."
        )

    now = datetime.now(UTC)
    if now > share["expires_at"]:
        raise HTTPException(status_code=410, detail="This shared journey link has expired.")

    journey = data_store.get_journey(share["journey_id"])
    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found.")

    last_checkin = journey["checkins"][-1] if journey["checkins"] else None
    remaining_secs = max(0, int((share["expires_at"] - now).total_seconds()))

    return {
        "journey_id": journey["id"],
        "status": journey["status"],
        "origin": journey["origin"],
        "destination": journey["destination"],
        "started_at": journey["started_at"].isoformat(),
        "estimated_arrival_at": journey["estimated_arrival_at"].isoformat()
        if journey["estimated_arrival_at"]
        else None,
        "ended_at": journey["ended_at"].isoformat() if journey["ended_at"] else None,
        "last_checkin": last_checkin,
        "route_coordinates": journey.get("route_coordinates", []),
        "share_expires_at": share["expires_at"].isoformat(),
        "remaining_minutes": int(remaining_secs / 60),
    }
