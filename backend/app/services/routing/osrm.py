"""OSRM routing adapter (public demo server or self-hosted)."""

from __future__ import annotations

import math
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

    def _request_routes(
        self, profile: str, coordinates_str: str, request_alternatives: bool = True
    ) -> list[dict]:
        url = f"{self.base_url}/route/v1/{profile}/{coordinates_str}"
        params = {
            "alternatives": "true" if request_alternatives else "false",
            "geometries": "geojson",
            "overview": "full",
            "steps": "false",
        }
        try:
            response = httpx.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            payload = response.json()
            return payload.get("routes", [])
        except httpx.HTTPError:
            # Fall back to driving profile if foot/bike is not supported or timed out
            if profile != "driving":
                try:
                    fallback_url = f"{self.base_url}/route/v1/driving/{coordinates_str}"
                    fallback_res = httpx.get(fallback_url, params=params, timeout=self.timeout)
                    fallback_res.raise_for_status()
                    return fallback_res.json().get("routes", [])
                except httpx.HTTPError:
                    pass
            return []

    def get_routes(
        self,
        origin: Sequence[float],
        destination: Sequence[float],
        travel_mode: TravelMode,
        alternatives: int,
    ) -> list[RouteOption]:
        profile = _PROFILES.get(travel_mode, "foot")
        start = (float(origin[0]), float(origin[1]))
        end = (float(destination[0]), float(destination[1]))
        direct_coords = f"{start[0]},{start[1]};{end[0]},{end[1]}"

        routes_payload = self._request_routes(profile, direct_coords, request_alternatives=alternatives > 1)

        options: list[RouteOption] = []
        seen_distances: set[int] = set()

        for route in routes_payload:
            points = route.get("geometry", {}).get("coordinates", [])
            if len(points) < 2:
                continue
            dist_m = int(round(route.get("distance", 0)))
            if dist_m not in seen_distances:
                seen_distances.add(dist_m)
                options.append(
                    RouteOption(
                        provider=self.name,
                        travel_mode=travel_mode,
                        distance_m=dist_m,
                        duration_s=int(round(route.get("duration", dist_m / 1.25))),
                        geometry=[(float(p[0]), float(p[1])) for p in points],
                    )
                )

        # If OSRM returns fewer alternatives than requested (the public demo server
        # frequently returns only 1 route), generate distinct street-following corridor
        # alternatives via lateral waypoints snapped to real streets.
        if len(options) < alternatives:
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            dist_deg = math.hypot(dx, dy) or 0.0001
            px = -dy / dist_deg
            py = dx / dist_deg

            # Adaptive lateral offset: ~15% of corridor distance, bounded between ~120m and ~650m
            lat_offset = max(0.0011, min(0.0058, dist_deg * 0.16))
            offsets = [lat_offset, -lat_offset, lat_offset * 1.8, -lat_offset * 1.8, lat_offset * 0.6, -lat_offset * 0.6]

            for off in offsets:
                if len(options) >= alternatives:
                    break
                via_lon = round(start[0] + dx * 0.5 + px * off, 6)
                via_lat = round(start[1] + dy * 0.5 + py * off, 6)
                waypoint_coords = f"{start[0]},{start[1]};{via_lon},{via_lat};{end[0]},{end[1]}"
                waypoint_routes = self._request_routes(profile, waypoint_coords, request_alternatives=False)

                for r in waypoint_routes:
                    points = r.get("geometry", {}).get("coordinates", [])
                    if len(points) < 2:
                        continue
                    dist_m = int(round(r.get("distance", 0)))
                    # Ensure route is distinct (at least 20m difference from existing routes)
                    if not any(abs(dist_m - d) < 20 for d in seen_distances):
                        seen_distances.add(dist_m)
                        options.append(
                            RouteOption(
                                provider=self.name,
                                travel_mode=travel_mode,
                                distance_m=dist_m,
                                duration_s=int(round(r.get("duration", dist_m / 1.25))),
                                geometry=[(float(p[0]), float(p[1])) for p in points],
                            )
                        )
                        break

        if not options:
            raise RoutingError("OSRM returned no usable routes")
        return options
