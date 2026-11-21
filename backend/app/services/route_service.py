"""Orchestration for route comparison: provider -> safety score -> persistence."""

from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import NotFoundError
from app.core.geo import coords_from_geometry, line_from_coords
from app.models.route import Route
from app.repositories import locations as location_repo
from app.repositories import reports as report_repo
from app.repositories import routes as route_repo
from app.schemas.route import (
    RouteAlternative,
    RouteCompareRequest,
    RouteComparisonResponse,
    RouteRead,
    SafetyFactors,
)
from app.services import report_service
from app.services.routing import RouteOption, get_routing_provider
from app.services.safety.scorer import SafetyResult, score_route
from app.services.safety.weights import DEFAULT_WEIGHTS


def _to_alternative(route: Route) -> RouteAlternative:
    geometry = coords_from_geometry(route.geometry)
    return RouteAlternative(
        id=route.id,
        rank=route.rank,
        provider=route.provider,
        travel_mode=route.travel_mode,
        distance_m=route.distance_m,
        duration_s=route.duration_s,
        safety_score=route.safety_score,
        safety_confidence=route.safety_confidence,
        safety_factors=SafetyFactors(**route.safety_factors),
        geometry=geometry,  # type: ignore[arg-type]
    )


def compare_routes(
    db: Session, user_id: UUID | None, payload: RouteCompareRequest
) -> RouteComparisonResponse:
    provider = get_routing_provider()
    options = provider.get_routes(
        payload.origin,
        payload.destination,
        payload.travel_mode,
        payload.alternatives,
    )

    scored: list[tuple[RouteOption, SafetyResult, list[tuple[float, float]]]] = []
    for option in options:
        geometry = option.geometry
        samples = []
        if payload.use_reports:
            reports = report_repo.list_near_route(
                db,
                geometry,
                DEFAULT_WEIGHTS.report_nearby_radius_m,
                settings.report_max_age_days,
            )
            samples = report_service.to_scorer_samples(reports)

        locations = location_repo.list_near_route(
            db,
            line_from_coords(geometry),
            settings.safe_location_radius_m,
        )
        safe_points: list[tuple[float, float]] = []
        for location in locations:
            coords = coords_from_geometry(location.location)
            if isinstance(coords, list) and len(coords) == 2:
                point = cast(list[float], coords)
                safe_points.append((float(point[0]), float(point[1])))

        result = score_route(geometry, samples, safe_points)
        scored.append((option, result, geometry))

    # Safer routes first; ties broken by travel time.
    scored.sort(key=lambda item: (-item[1].score, item[0].duration_s))

    request_id = uuid4()
    routes = [
        Route(
            request_id=request_id,
            user_id=user_id,
            provider=option.provider,
            travel_mode=option.travel_mode,
            rank=rank,
            distance_m=option.distance_m,
            duration_s=option.duration_s,
            safety_score=result.score,
            safety_confidence=result.confidence,
            safety_factors=result.factors,
            geometry=line_from_coords(geometry),
        )
        for rank, (option, result, geometry) in enumerate(scored, start=1)
    ]
    persisted = route_repo.create_many(db, routes)
    return RouteComparisonResponse(
        request_id=request_id,
        alternatives=[_to_alternative(route) for route in persisted],
    )


def get_route(db: Session, route_id: UUID) -> RouteRead:
    route = route_repo.get(db, route_id)
    if route is None:
        raise NotFoundError("Route not found")
    alternative = _to_alternative(route)
    return RouteRead(
        **alternative.model_dump(),
        request_id=route.request_id,
        created_at=route.created_at,
    )
