# SafeRoute

SafeRoute compares candidate routes by travel time **and** perceived safety, using
community incident reports and verified safe locations. This repository currently
contains the **backend scaffold** (FastAPI + PostGIS); the Expo mobile app described
in `docs/ARCHITECTURE.md` is planned but not yet generated.

## Layout

```
.
├── backend/                 FastAPI application, Alembic migrations, tests
├── docs/                    Architecture, API contracts, ADRs, demo script
├── docker-compose.yml       Local Postgres 16 + PostGIS
├── Makefile                 Common developer commands
└── .env.example             Documented configuration placeholders
```

## Quick start

```bash
cp .env.example .env
make install
make db-up
make db-init          # CREATE EXTENSION postgis
make migrate          # apply Alembic revisions
make dev              # uvicorn backend.app.main:app --reload
```

Interactive API docs: <http://localhost:8000/docs>  
Health check: <http://localhost:8000/health>  
Readiness (DB + PostGIS): <http://localhost:8000/api/v1/health/ready>

The default routing provider is `stub`, so no external API keys are needed for local
development. Switch to `graphhopper` or `osrm` in `.env` to exercise real routing.

## Testing

```bash
make test
make lint
```

See `docs/API.md` for endpoint contracts and `docs/DECISIONS.md` for the reasoning
behind auth, routing, and scoring choices.
