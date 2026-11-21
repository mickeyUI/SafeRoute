"""GraphHopper routing adapter."""

from __future__ import annotations

from collections.abc import Sequence

import httpx

from app.core.config import Settings
from app.core.errors import RoutingError
from app.models.route import TravelMode
from app.services.routing.base import RouteOption, RoutingProvider

_VEHICLES = {
    TravelMode.walk: "foot",
    TravelMode.bike: "bike",
    TravelMode.drive: "car",
}


class GraphHopperRoutingProvider(RoutingProvider):
    name = "graphhopper"

    def __init__(self, config: Settings) -> None:
        self.url = config.graphhopper_url.rstrip("/")
        self.api_key = config.graphhopper_api_key
        self.timeout = config.routing_timeout_seconds

    def get_routes(
        self,
        origin: Sequence[float],
        destination: Sequence[float],
        travel_mode: TravelMode,
        alternatives: int,
    ) -> list[RouteOption]:
        if not self.api_key:
            raise RoutingError("GRAPHHOPPER_API_KEY is not configured")
        params: dict[str, str | int | list[str]] = {
            "point": [f"{origin[1]},{origin[0]}", f"{destination[1]},{destination[0]}"],
            "vehicle": _VEHICLES[travel_mode],
            "algorithm": "alternative_route",
            "max_paths": alternatives,
            "points_encoded": "false",
            "key": self.api_key,
        }
        try:
            response = httpx.get(self.url, params=params, timeout=self.timeout)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise RoutingError("GraphHopper request failed") from exc

        options: list[RouteOption] = []
        for path in payload.get("paths", []):
            points = path.get("points", {}).get("coordinates", [])
            if len(points) < 2:
                continue
            options.append(
                RouteOption(
                    provider=self.name,
                    travel_mode=travel_mode,
                    distance_m=int(path.get("distance", 0)),
                    duration_s=int(path.get("time", 0)) // 1000,
                    geometry=[(float(p[0]), float(p[1])) for p in points],
                )
            )
        if not options:
            raise RoutingError("GraphHopper returned no usable routes")
        return options
