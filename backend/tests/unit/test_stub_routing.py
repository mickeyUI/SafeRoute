"""Stub provider determinism tests."""

from app.models.route import TravelMode
from app.services.routing.stub import StubRoutingProvider

ORIGIN = [-122.4194, 37.7749]
DESTINATION = [-122.4089, 37.7866]


def test_returns_requested_number_of_options() -> None:
    options = StubRoutingProvider().get_routes(ORIGIN, DESTINATION, TravelMode.walk, 3)
    assert len(options) == 3
    assert all(option.provider == "stub" for option in options)


def test_options_are_sorted_by_distance_and_deterministic() -> None:
    provider = StubRoutingProvider()
    first = provider.get_routes(ORIGIN, DESTINATION, TravelMode.walk, 3)
    second = provider.get_routes(ORIGIN, DESTINATION, TravelMode.walk, 3)
    assert first == second
    assert [option.distance_m for option in first] == sorted(
        option.distance_m for option in first
    )
