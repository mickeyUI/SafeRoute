# Architecture decision records

## ADR-001: Password + JWT authentication

- **Status:** Accepted (MVP)
- **Context:** The mobile client needs stateless auth, and we do not want to operate a
  session store in the first release.
- **Decision:** Store bcrypt password hashes; issue short-lived HS256 JWTs signed with
  `SECRET_KEY`. `sub` contains the user UUID.
- **Consequences:** Tokens cannot be revoked individually before expiry. Rotate
  `SECRET_KEY` to invalidate all sessions. Add a refresh-token/denylist in a later ADR
  if user demand requires it.

## ADR-002: Routing provider abstraction with a stub default

- **Status:** Accepted
- **Context:** GraphHopper and OSRM have different payloads and auth models; we also
  need deterministic demos and offline tests.
- **Decision:** Define `RoutingProvider` in `services/routing/base.py`; adapters for
  both real providers plus a `stub` implementation selected by `ROUTING_PROVIDER`.
- **Consequences:** Safety scoring only sees `RouteOption`, never a provider payload.
  The stub must never be enabled in production config.

## ADR-003: Explainable additive safety score

- **Status:** Accepted
- **Context:** Users need to trust the score and understand why one route ranks higher.
- **Decision:** Use a transparent 0–100 additive formula with three published factors
  (`report_penalty`, `coverage_bonus`, `length_penalty`) and a separate confidence value
  driven by data density. We explicitly avoid an opaque ML model for v1.
- **Consequences:** Scores are easy to test and debug, but are only as good as report
  moderation. Confidence is returned alongside the score so low-data areas are visible.

## ADR-004: PostGIS for geospatial storage

- **Status:** Accepted
- **Context:** We need radius queries for reports/safe locations and corridor proximity.
- **Decision:** Use Postgres 16 + PostGIS with `Geometry(Point, 4326)` and
  `Geometry(LineString, 4326)` columns, GiST indexes, and `ST_DWithin` for lookups.
- **Consequences:** Local development requires the `postgis/postgis` container. Unit
  tests of the scorer use plain haversine math and do not need a database.

## ADR-005: Moderate reports before scoring

- **Status:** Accepted
- **Context:** Unchecked reports could be abused to down-rank a route.
- **Decision:** New reports start `pending`; only `approved` reports within
  `REPORT_MAX_AGE_DAYS` contribute to `report_penalty`. Moderators can reject with a
  reason.
- **Consequences:** Cold-start scores have low confidence. Demo data must be explicitly
  approved.

## ADR-006: Journey state machine lives in the service layer

- **Status:** Proposed
- **Context:** Check-ins and alerts will gain complexity (grace periods, contacts,
  notification providers).
- **Decision:** Keep transition rules in `JourneyService`; repositories only persist
  state. The reminder worker is a thin scheduled caller, not a second source of truth.
- **Consequences:** MVP stores check-in timestamps but does not send alerts.
