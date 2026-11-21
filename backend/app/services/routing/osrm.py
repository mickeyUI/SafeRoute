"""OSRM routing adapter (public demo server or self-hosted)."""

from __future__ import annotations

from collections.abc import Sequence

import httpx

from app.core.config import Settings
from app.core.errors import RoutingError
from app.models.route import TravelMode
from app.services.routing.base import RouteOption, RoutingProvider

_PROFILES = {
    TravelMode.walk: "foot",
    TravelMode.bike: "bike",
    TravelMode.drive: "driving",
}


class OsrmRoutingProvider(RoutingProvider):
    name = "osrm"

    def __init__(self, config: Settings) -> None:
        self.base_url = config.osrm_url.rstrip("/")
        self.timeout = config.routing_timeout_seconds

    def get_routes(
        self,
        origin: Sequence[float],
        destination: Sequence[float],
        travel_mode: TravelMode,
        alternatives: int,
    ) -> list[RouteOption]:
        coordinates = f"{origin[0]},{origin[1]};{destination[0]},{destination[1]}"
        url = f"{self.base_url}/route/v1/{_PROFILES[travel_mode]}/{coordinates}"
        params = {
            "alternatives": str(alternatives).lower() if alternatives > 1 else "false",
            "geometries": "geojson",
            "overview": "full",
            "steps": "false",
        }
        try:
            response = httpx.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise RoutingError("OSRM request failed") from exc

        options: list[RouteOption] = []
        for route in payload.get("routes", []):
            points = route.get("geometry", {}).get("coordinates", [])
            if len(points) < 2:
                continue
            options.append(
                RouteOption(
                    provider=self.name,
                    travel_mode=travel_mode,
                    distance_m=int(route.get("distance", 0)),
                    duration_s=int(route.get("duration", 0)),
                    geometry=[(float(p[0]), float(p[1])) for p in points],
                )
            )
        if not options:
            raise RoutingError("OSRM returned no usable routes")
        return options
