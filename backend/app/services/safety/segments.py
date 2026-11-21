"""Route segmentation and distance helpers (pure Python, no DB needed)."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from app.core.geo import Coordinate


@dataclass(frozen=True)
class Segment:
    start: Coordinate
    end: Coordinate
    midpoint: Coordinate
    length_m: float


def haversine(a: Sequence[float], b: Sequence[float]) -> float:
    """Great-circle distance in metres between two [lon, lat] points."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def split_polyline(
    coordinates: Sequence[Sequence[float]], max_segment_m: float = 150.0
) -> list[Segment]:
    """Split each polyline leg into near-equal sub-segments."""
    segments: list[Segment] = []
    for start, end in zip(coordinates, coordinates[1:], strict=False):
        start_point = (float(start[0]), float(start[1]))
        end_point = (float(end[0]), float(end[1]))
        length = haversine(start_point, end_point)
        count = max(1, math.ceil(length / max_segment_m))
        for index in range(count):
            first_fraction = index / count
            second_fraction = (index + 1) / count
            seg_start = _interpolate(start_point, end_point, first_fraction)
            seg_end = _interpolate(start_point, end_point, second_fraction)
            segments.append(
                Segment(
                    start=seg_start,
                    end=seg_end,
                    midpoint=_interpolate(seg_start, seg_end, 0.5),
                    length_m=length / count,
                )
            )
    return segments


def _interpolate(a: Coordinate, b: Coordinate, fraction: float) -> Coordinate:
    return (
        a[0] + (b[0] - a[0]) * fraction,
        a[1] + (b[1] - a[1]) * fraction,
    )
