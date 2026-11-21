"""Provider-neutral routing types and factory."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass

from app.core.config import Settings, settings
from app.models.route import TravelMode


@dataclass(frozen=True)
class RouteOption:
    provider: str
    travel_mode: TravelMode
    distance_m: int
    duration_s: int
    geometry: list[tuple[float, float]]


class RoutingProvider(ABC):
    """Returns candidate geometries; implementations own provider payload details."""

    name: str

    @abstractmethod
    def get_routes(
        self,
        origin: Sequence[float],
        destination: Sequence[float],
        travel_mode: TravelMode,
        alternatives: int,
    ) -> list[RouteOption]:
        """Return up to `alternatives` options, unsorted by safety."""
        raise NotImplementedError


def get_routing_provider(config: Settings | None = None) -> RoutingProvider:
    """Select a provider from configuration; imports adapters lazily."""
    config = config or settings
    if config.routing_provider == "stub":
        from app.services.routing.stub import StubRoutingProvider

        return StubRoutingProvider()
    if config.routing_provider == "graphhopper":
        from app.services.routing.graphhopper import GraphHopperRoutingProvider

        return GraphHopperRoutingProvider(config)
    if config.routing_provider == "osrm":
        from app.services.routing.osrm import OsrmRoutingProvider

        return OsrmRoutingProvider(config)
    raise ValueError(f"Unsupported routing provider: {config.routing_provider}")
