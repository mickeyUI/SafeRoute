# SafeRoute

SafeRoute compares candidate routes by travel time **and** perceived safety, using
community incident reports and verified safe locations. This repository contains a
FastAPI + PostGIS backend and a React + Vite web frontend that calls it.

## Layout

```
.
├── apps/web/                React + TypeScript + Leaflet frontend
├── backend/                 FastAPI application, Alembic migrations, tests
├── demo/map/                Minimal static map demo served by the backend
├── docs/                    Architecture, API contracts, ADRs, demo script
├── docker-compose.yml       Local Postgres 16 + PostGIS
├── Makefile                 Common developer commands
└── .env.example             Documented configuration placeholders
```

## Quick start

### 1. Backend

```bash
cp .env.example .env
make install
make db-up
make db-init          # CREATE EXTENSION postgis
make migrate          # apply Alembic revisions
make dev              # API only at http://localhost:8000
make dev-full         # backend (:8000) + frontend (:5173), Ctrl-C stops both
```

`make dev` still runs only the API; `make dev-web` runs only the frontend.
The SOS "nearby users" feature requires the backend revision that provides
`POST /api/v1/sos/alerts` and `GET /api/v1/sos/alerts/nearby` — older deployments
only have `/api/v1/sos` and will silently fail to broadcast.

Interactive API docs: <http://localhost:8000/docs>  
Health check: <http://localhost:8000/health>  
Readiness (DB + PostGIS): <http://localhost:8000/api/v1/health/ready>

The default routing provider is `stub`, so no external API keys are needed for local
development.

### 2. Web frontend

```bash
make web-install
make web-dev          # http://localhost:5173
```

Vite proxies `/api` to `http://localhost:8000`, so the frontend can call the backend
without CORS setup. If you serve the built frontend from a different origin, copy
`apps/web/.env.example` to `apps/web/.env.local` and set `VITE_API_BASE_URL` to the
backend origin.

The web client automatically creates/reuses a local demo account for protected
endpoints (reports and SOS). Override `VITE_DEMO_EMAIL` and `VITE_DEMO_PASSWORD` in
`apps/web/.env.local` if needed.

## Connected features

- **Route comparison:** the map calls `POST /api/v1/routes/compare`; backend safety
  scores are adapted into the frontend's route-choice cards.
- **Reports:** new reports go to `POST /api/v1/reports` as `pending`. Nearby reports
  are loaded from `GET /api/v1/reports/nearby` and shown on the map.
- **SOS:** `POST /api/v1/sos` records an alert on the backend and
  `GET /api/v1/sos/mine` reloads your alerts. It does **not** send SMS, push, email,
  or contact emergency services.
- **Place search and map tiles** still use public Photon and OpenStreetMap endpoints.

## Testing

```bash
make lint
make test
make web-build
```

See `docs/API.md` for endpoint contracts and `docs/DECISIONS.md` for the reasoning
behind auth, routing, and scoring choices.
