"""Conversion helpers between WGS84 coordinate lists and PostGIS geometries."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, cast

from geoalchemy2.shape import from_shape, to_shape
from geoalchemy2.types import WKBElement
from shapely.geometry import LineString, Point

Coordinate = tuple[float, float]


def point_from_coords(coords: Sequence[float]) -> WKBElement:
    lon, lat = float(coords[0]), float(coords[1])
    return from_shape(Point(lon, lat), srid=4326)


def line_from_coords(coords: Sequence[Sequence[float]]) -> WKBElement:
    return from_shape(LineString([(float(p[0]), float(p[1])) for p in coords]), srid=4326)


def coords_from_geometry(geometry: Any) -> list[float] | list[list[float]]:
    """Return [lon, lat] for points or [[lon, lat], ...] for lines."""
    shape = to_shape(geometry)
    if shape.geom_type == "Point":
        point = cast(Point, shape)
        return [float(point.x), float(point.y)]
    line = cast(LineString, shape)
    return [[float(x), float(y)] for x, y in line.coords]
