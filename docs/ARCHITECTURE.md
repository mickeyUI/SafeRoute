# SafeRoute architecture

This document describes the intended system and the current backend scaffold.

## Goals

1. Let a user compare multiple route alternatives on **time** and **safety**.
2. Let users contribute incident reports and verified safe locations.
3. Support journey check-ins so a trusted contact can be alerted if a user stops moving.
4. Keep the routing engine replaceable and the safety score explainable.

Non-goals for the MVP: real-time crime-data feeds, push notifications, offline maps,
social graph features, and automated incident verification.

## System shape

```
Mobile client (planned, Expo)
        |
        v  HTTPS / JWT
FastAPI application
        |
        +--> routers (HTTP concerns only)
        +--> schemas (Pydantic validation + OpenAPI)
        +--> services (business rules)
        |       +--> routing providers (GraphHopper / OSRM / stub)
        |       +--> safety scorer (reports + safe locations)
        |       +--> auth, moderation, journey state machine
        +--> repositories (SQLAlchemy queries)
        +--> PostGIS (geometry columns + spatial indexes)
```

### Layering rules

- Endpoints never write SQL directly; they call repositories or services.
- Services never import FastAPI `Request`/`Response`; they accept plain values.
- Repositories accept a `Session` supplied by the `get_db` dependency.
- Cross-cutting errors are raised as `AppError` subclasses and translated by handlers in
  `app/main.py`.

## Request flow: route comparison

1. `POST /api/v1/routes/compare` validates a point pair and travel mode.
2. `RoutingProvider.get_routes()` returns candidate `RouteOption`s.
   - Default is the deterministic `stub` provider; no API key required.
   - `graphhopper` and `osrm` adapters translate provider payloads into the same shape.
3. The report repository loads recent, approved reports near the corridor.
4. The safe-location repository loads verified locations near the corridor.
5. `SafetyScorer` splits each geometry into segments and produces:
   - `score` (0–100, higher is safer),
   - `confidence` (0–1, based on data coverage),
   - `factors` (report pressure, safe-location coverage, route length).
6. Alternatives are ranked by `score - time_penalty`, persisted as a group sharing a
   `request_id`, and returned to the client.

## Data model

| Table | Purpose | Key geometry |
| --- | --- | --- |
| `users` | Accounts and roles (`user`, `moderator`, `admin`) | — |
| `reports` | Community incident reports with moderation status | `Point` |
| `safe_locations` | Verified places of refuge/help | `Point` |
| `contacts` | Trusted contacts for journey alerts | — |
| `routes` | Persisted alternatives from one comparison | `LineString` |
| `journeys` | Planned/active/completed trips with check-ins | `Point` start + destination |
| `sos_alerts` | Recorded emergency alerts with optional attachment flags | `Point` |

All geometry uses SRID 4326 (WGS84 lon/lat) and GiST indexes are created in Alembic
migrations. Distances are computed with `ST_DWithin` in SQL or haversine in the scorer.

## Safety score (v1)

```
base             = 100
report_penalty   = min(60, 2.5 * sum(severity_weight for nearby reports))
coverage_bonus   = 10 * safe_location_coverage_ratio
length_penalty   = min(10, distance_km * 0.2)
score            = clamp(base - report_penalty + coverage_bonus - length_penalty, 0, 100)
confidence       = clamp(0.25 + reports_nearby / 10 + coverage_ratio / 2, 0, 1)
```

Weights live in `services/safety/weights.py`; no magic numbers in endpoint code.
Reports must be `approved` and no older than `REPORT_MAX_AGE_DAYS` to count.

## Journeys (Phase 5+, worker not in MVP)

`planned -> active -> completed`, with `cancelled` as a terminal branch. The
`workers/reminders.py` module is a placeholder for the check-in timeout job. In the
MVP, check-in state is stored but no notifications are dispatched.

SOS alerts are persisted through `POST /api/v1/sos` and listed via `GET /sos/mine`.
The backend logs a simulated contact notification; it does not send SMS, email, push,
or contact emergency services.

## Phasing

| Phase | Scope |
| --- | --- |
| 0 | Scaffold, config, health, auth (this repo state) |
| 1 | Reports, safe locations, stub routing, safety score |
| 2 | Real routing providers, report moderation |
| 3 | Route persistence and comparison UX |
| 4 | Journeys + trusted contacts |
| 5 | Reminder worker, alerts, observability hardening |

## Local development

See the root `Makefile`. `docker-compose.yml` starts Postgres 16 with PostGIS;
`make db-init` installs the extension and `make migrate` applies schema changes.
