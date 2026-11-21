"""OSRM provider street routing tests."""

from app.core.config import Settings
from app.models.route import TravelMode
from app.services.routing.osrm import OsrmRoutingProvider

ORIGIN = [38.7400, 9.0300]
DESTINATION = [38.7500, 9.0400]


def test_osrm_returns_street_geometry() -> None:
    config = Settings(routing_provider="osrm", routing_timeout_seconds=8)
    provider = OsrmRoutingProvider(config)
    options = provider.get_routes(ORIGIN, DESTINATION, TravelMode.walk, 3)
    assert len(options) >= 2
    # Verify that each route has multiple coordinates following street geometry
    for opt in options:
        assert len(opt.geometry) >= 10
        assert opt.distance_m > 0
        assert opt.duration_s > 0
