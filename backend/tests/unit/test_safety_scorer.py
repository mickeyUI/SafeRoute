"""Pure-python safety score tests (no database)."""

from app.models.report import ReportType
from app.services.safety.scorer import ReportSample, score_route

ROUTE = [[-122.4194, 37.7749], [-122.4089, 37.7866]]


def test_clean_route_scores_high() -> None:
    result = score_route(ROUTE)
    assert result.score > 90
    assert 0 <= result.confidence <= 1
    assert set(result.factors) == {
        "report_penalty",
        "coverage_bonus",
        "length_penalty",
    }


def test_reports_lower_the_score() -> None:
    clean = score_route(ROUTE)
    with_reports = score_route(
        ROUTE,
        reports=[
            ReportSample(
                location=(-122.4140, 37.7807),
                severity=5,
                type=ReportType.assault,
            )
        ],
    )
    assert with_reports.score < clean.score
    assert with_reports.factors["report_penalty"] > 0


def test_safe_location_coverage_adds_bonus() -> None:
    without = score_route(ROUTE)
    with_location = score_route(ROUTE, safe_locations=[(-122.4140, 37.7807)])
    assert with_location.factors["coverage_bonus"] > without.factors["coverage_bonus"]
    assert with_location.score >= without.score
