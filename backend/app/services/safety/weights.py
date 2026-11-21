"""Tunable constants for the v1 safety score."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models.report import ReportType


@dataclass(frozen=True)
class SafetyWeights:
    base_score: float = 100.0
    report_weight: float = 2.5
    max_report_penalty: float = 60.0
    coverage_weight: float = 10.0
    length_penalty_per_km: float = 0.2
    max_length_penalty: float = 10.0
    report_nearby_radius_m: float = 250.0
    segment_length_m: float = 150.0
    base_confidence: float = 0.25
    type_multipliers: dict[ReportType, float] = field(
        default_factory=lambda: {
            ReportType.harassment: 1.0,
            ReportType.assault: 1.6,
            ReportType.suspicious: 0.8,
            ReportType.unsafe_lighting: 0.6,
            ReportType.other: 0.7,
        }
    )


DEFAULT_WEIGHTS = SafetyWeights()
