"""Fraction of a route within reach of a verified safe location."""

from __future__ import annotations

from collections.abc import Sequence

from app.core.geo import Coordinate
from app.services.safety.segments import Segment, haversine


def safe_location_coverage(
    segments: Sequence[Segment],
    safe_locations: Sequence[Coordinate],
    radius_m: float,
) -> float:
    """Return a ratio in [0, 1]; an empty route has zero coverage."""
    if not segments:
        return 0.0
    covered = 0
    for segment in segments:
        if any(haversine(segment.midpoint, point) <= radius_m for point in safe_locations):
            covered += 1
    return covered / len(segments)
