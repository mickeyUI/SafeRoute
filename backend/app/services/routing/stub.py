"""Deterministic routing provider for demos and tests."""

from __future__ import annotations

import math
from collections.abc import Sequence

from app.models.route import TravelMode
from app.services.routing.base import RouteOption, RoutingProvider

_SPEEDS_MPS = {TravelMode.walk: 1.35, TravelMode.bike: 4.5, TravelMode.drive: 11.0}


def _haversine(a: Sequence[float], b: Sequence[float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


class StubRoutingProvider(RoutingProvider):
    """Generates gently bent polylines between two points."""

    name = "stub"

    def get_routes(
        self,
        origin: Sequence[float],
        destination: Sequence[float],
        travel_mode: TravelMode,
        alternatives: int,
    ) -> list[RouteOption]:
        start = (float(origin[0]), float(origin[1]))
        end = (float(destination[0]), float(destination[1]))
        dx, dy = end[0] - start[0], end[1] - start[1]
        magnitude = math.hypot(dx, dy) or 1.0
        perpendicular = (-dy / magnitude, dx / magnitude)
        mid = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)

        options: list[RouteOption] = []
        for index in range(alternatives):
            offset = (index - (alternatives - 1) / 2) * 0.004
            bend = (perpendicular[0] * offset, perpendicular[1] * offset)
            geometry = [
                start,
                (mid[0] + bend[0], mid[1] + bend[1]),
                end,
            ]
            distance = sum(
                _haversine(geometry[i], geometry[i + 1]) for i in range(len(geometry) - 1)
            )
            distance_m = max(1, int(round(distance)))
            duration_s = max(1, int(round(distance_m / _SPEEDS_MPS[travel_mode])))
            options.append(
                RouteOption(
                    provider=self.name,
                    travel_mode=travel_mode,
                    distance_m=distance_m,
                    duration_s=duration_s,
                    geometry=geometry,
                )
            )

        return sorted(options, key=lambda option: option.distance_m)
