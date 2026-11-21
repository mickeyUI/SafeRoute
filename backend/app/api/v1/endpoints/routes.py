from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.schemas.route import (
    RouteCompareRequest,
    RouteCompareResponse,
    RouteOption,
    Coordinate,
    RoutePreference
)
from app.services.routing_service import routing_service
from app.services.safety_engine import safety_engine
from app.services.data_store import data_store

router = APIRouter()

@router.post("/compare", response_model=RouteCompareResponse)
async def compare_routes(payload: RouteCompareRequest):
    """
    Compare multiple pedestrian routes between origin and destination.
    Evaluates safety hazards, street lighting, safe haven proximity,
    and ranks routes according to user preference (safety, balanced, fastest).
    """
    origin = payload.origin
    destination = payload.destination
    
    # 1. Fetch alternative pedestrian routes
    raw_routes = await routing_service.get_candidate_routes(origin, destination)
    if not raw_routes:
        raise HTTPException(
            status_code=400,
            detail="Unable to generate walking routes for the selected coordinates."
        )

    # 2. Fetch nearby safety reports and safe havens
    mid_lat = (origin.latitude + destination.latitude) / 2.0
    mid_lon = (origin.longitude + destination.longitude) / 2.0
    
    nearby_reports = data_store.get_nearby_reports(mid_lat, mid_lon, radius_meters=5000.0)
    safe_locations = data_store.get_nearby_safe_locations(mid_lat, mid_lon, radius_meters=5000.0)

    # 3. Determine departure hour for day/night factor
    dep_hour = payload.departure_hour
    if dep_hour is None:
        dep_hour = datetime.now(timezone.utc).hour

    # 4. Evaluate and score each candidate route
    scored_candidates = []
    for r in raw_routes:
        indicator = safety_engine.score_route(
            route_id=r["route_id"],
            summary=r["summary"],
            distance_meters=r["distance_meters"],
            duration_seconds=r["duration_seconds"],
            geometry=r["geometry"],
            reports=nearby_reports,
            safe_locations=safe_locations,
            departure_hour=dep_hour
        )

        option = RouteOption(
            route_id=r["route_id"],
            summary=r["summary"],
            distance_meters=r["distance_meters"],
            duration_seconds=r["duration_seconds"],
            cost_score=0.0,  # Will be ranked by preference
            safety_indicator=indicator,
            geometry=r["geometry"]
        )
        scored_candidates.append(option)

    # 5. Rank routes based on user preference: Route Cost = αD + βT + γR
    ranked_routes = safety_engine.rank_routes(scored_candidates, payload.preference)

    return RouteCompareResponse(
        origin=origin,
        destination=destination,
        preference=payload.preference,
        routes=ranked_routes
    )
