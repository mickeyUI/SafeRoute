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


def haversine_m(c1: Sequence[float], c2: Sequence[float]) -> float:
    lon1, lat1 = c1[0], c1[1]
    lon2, lat2 = c2[0], c2[1]
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def remove_dead_end_spurs(
    points: list[tuple[float, float]], junction_threshold_m: float = 45.0, min_spur_points: int = 3
) -> list[tuple[float, float]]:
    """
    Detects and prunes out-and-back dead-end loops where the route departs a junction,
    travels out along a dead-end spur, and returns to the same junction.
    """
    if len(points) < min_spur_points + 2:
        return points

    cleaned = list(points)
    changed = True
    passes = 0
    max_passes = 10

    while changed and passes < max_passes:
        passes += 1
        changed = False
        n = len(cleaned)
        best_i = -1
        best_j = -1
        max_spur_len = 0

        for i in range(n - min_spur_points):
            for j in range(i + min_spur_points, n):
                dist_direct = haversine_m(cleaned[i], cleaned[j])
                if dist_direct <= junction_threshold_m:
                    path_dist = 0.0
                    for k in range(i, j):
                        path_dist += haversine_m(cleaned[k], cleaned[k + 1])

                    if path_dist > max(40.0, dist_direct * 2.5):
                        apex_idx = i
                        max_apex_dist = 0.0
                        for k in range(i, j + 1):
                            d_k = haversine_m(cleaned[i], cleaned[k])
                            if d_k > max_apex_dist:
                                max_apex_dist = d_k
                                apex_idx = k

                        if max_apex_dist > max(20.0, dist_direct * 1.5) and apex_idx > i and apex_idx < j:
                            spur_len = j - i
                            if spur_len > max_spur_len:
                                max_spur_len = spur_len
                                best_i = i
                                best_j = j

        if best_i != -1 and best_j != -1:
            cleaned = cleaned[: best_i + 1] + cleaned[best_j + 1 :]
            changed = True

    return cleaned


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
            raw_points = route.get("geometry", {}).get("coordinates", [])
            if len(raw_points) < 2:
                continue
            cleaned_points = remove_dead_end_spurs([(float(p[0]), float(p[1])) for p in raw_points])
            if len(cleaned_points) < 2:
                continue
            dist_m = int(round(sum(haversine_m(cleaned_points[i], cleaned_points[i + 1]) for i in range(len(cleaned_points) - 1))))
            if not any(abs(dist_m - d) < 35 for d in seen_distances):
                seen_distances.add(dist_m)
                options.append(
                    RouteOption(
                        provider=self.name,
                        travel_mode=travel_mode,
                        distance_m=dist_m,
                        duration_s=int(round(dist_m / 1.25)),
                        geometry=cleaned_points,
                    )
                )

        # If OSRM returns fewer alternatives than requested, generate distinct street-following
        # corridor alternatives via lateral through-street waypoints, pruning any dead-end spurs.
        if len(options) < alternatives:
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            dist_deg = math.hypot(dx, dy) or 0.0001
            px = -dy / dist_deg
            py = dx / dist_deg

            lat_offset = max(0.0011, min(0.0055, dist_deg * 0.16))
            candidate_specs = [
                (0.5, lat_offset),
                (0.5, -lat_offset),
                (0.5, lat_offset * 1.8),
                (0.5, -lat_offset * 1.8),
                (0.35, lat_offset * 0.8),
                (0.35, -lat_offset * 0.8),
                (0.65, lat_offset * 0.8),
                (0.65, -lat_offset * 0.8),
            ]

            for frac, off in candidate_specs:
                if len(options) >= alternatives:
                    break
                via_lon = round(start[0] + dx * frac + px * off, 6)
                via_lat = round(start[1] + dy * frac + py * off, 6)
                waypoint_coords = f"{start[0]},{start[1]};{via_lon},{via_lat};{end[0]},{end[1]}"
                waypoint_routes = self._request_routes(profile, waypoint_coords, request_alternatives=False)

                for r in waypoint_routes:
                    raw_points = r.get("geometry", {}).get("coordinates", [])
                    if len(raw_points) < 2:
                        continue
                    cleaned_points = remove_dead_end_spurs([(float(p[0]), float(p[1])) for p in raw_points])
                    if len(cleaned_points) < 2:
                        continue
                    dist_m = int(round(sum(haversine_m(cleaned_points[i], cleaned_points[i + 1]) for i in range(len(cleaned_points) - 1))))
                    # Ensure route is distinct after pruning (reject if it collapsed back into an existing route)
                    if not any(abs(dist_m - d) < 35 for d in seen_distances):
                        seen_distances.add(dist_m)
                        options.append(
                            RouteOption(
                                provider=self.name,
                                travel_mode=travel_mode,
                                distance_m=dist_m,
                                duration_s=int(round(dist_m / 1.25)),
                                geometry=cleaned_points,
                            )
                        )
                        break

        if not options:
            raise RoutingError("OSRM returned no usable routes")
        return options
