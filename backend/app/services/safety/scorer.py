"""Transparent 0–100 safety score for a single route geometry."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.core.config import settings
from app.core.geo import Coordinate
from app.models.report import ReportType
from app.services.safety.coverage import safe_location_coverage
from app.services.safety.segments import haversine, split_polyline
from app.services.safety.weights import DEFAULT_WEIGHTS, SafetyWeights


@dataclass(frozen=True)
class ReportSample:
    location: Coordinate
    severity: int
    type: ReportType = ReportType.other


@dataclass(frozen=True)
class SafetyResult:
    score: float
    confidence: float
    factors: dict[str, float]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def score_route(
    coordinates: Sequence[Sequence[float]],
    reports: Sequence[ReportSample] = (),
    safe_locations: Sequence[Coordinate] = (),
    weights: SafetyWeights = DEFAULT_WEIGHTS,
    safe_location_radius_m: float = settings.safe_location_radius_m,
) -> SafetyResult:
    """Score a corridor using nearby reports and safe-location coverage."""
    segments = split_polyline(coordinates, weights.segment_length_m)
    total_length_m = sum(segment.length_m for segment in segments)
    length_km = total_length_m / 1000

    weighted_reports = 0.0
    reports_nearby = 0
    for report in reports:
        if any(
            haversine(report.location, segment.midpoint) <= weights.report_nearby_radius_m
            for segment in segments
        ):
            reports_nearby += 1
            weighted_reports += (
                report.severity * weights.type_multipliers.get(report.type, 1.0)
            )

    coverage_ratio = safe_location_coverage(
        segments, safe_locations, safe_location_radius_m
    )

    report_penalty = min(
        weights.max_report_penalty, weights.report_weight * weighted_reports
    )
    coverage_bonus = weights.coverage_weight * coverage_ratio
    length_penalty = min(
        weights.max_length_penalty, length_km * weights.length_penalty_per_km
    )

    score = _clamp(
        weights.base_score - report_penalty + coverage_bonus - length_penalty,
        0.0,
        100.0,
    )
    confidence = _clamp(
        weights.base_confidence + reports_nearby / 10 + coverage_ratio / 2,
        0.0,
        1.0,
    )

    return SafetyResult(
        score=round(score, 2),
        confidence=round(confidence, 2),
        factors={
            "report_penalty": round(report_penalty, 2),
            "coverage_bonus": round(coverage_bonus, 2),
            "length_penalty": round(length_penalty, 2),
            "nearby_report_count": float(reports_nearby),
        },
    )
