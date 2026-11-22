.PHONY: help install dev dev-api dev-web dev-full db-up db-down db-init revision migrate test lint format openapi web-install web-dev web-build clean

PYTHON ?= python3
VENV ?= .venv
NPM ?= npm
WEB_DIR := apps/web
PIP := $(VENV)/bin/pip
PY := $(VENV)/bin/python
PY_ABS := $(abspath $(PY))

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

install: ## Create a virtualenv and install backend dependencies
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -e "./backend[dev]"

dev: dev-api ## Run the API with reload

dev-api: ## Run the FastAPI backend on port 8000
	$(PY) -m uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000

dev-web: ## Run the Vite frontend on port 5173
	cd frontend && npm run dev

dev-full: ## Run backend and frontend together (Ctrl-C stops both)
	@$(PY) -m uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000 & \
	API_PID=$$!; \
	trap 'kill $$API_PID 2>/dev/null || true' EXIT INT TERM; \
	cd frontend && npm run dev

db-up: ## Start local Postgres 16 + PostGIS
	docker compose up -d db

db-down: ## Stop the local database
	docker compose down

db-init: ## Ensure the PostGIS extension exists
	$(PY) -m app.db.init_postgis

revision: ## Create a migration: make revision m="add users"
	cd backend && $(PY_ABS) -m alembic revision --autogenerate -m "$(m)"

migrate: ## Apply all migrations
	cd backend && $(PY_ABS) -m alembic upgrade head

test: ## Run the test suite
	$(PY) -m pytest backend/tests -q

lint: ## Run Ruff and mypy
	$(PY) -m ruff check backend
	$(PY) -m mypy backend/app

format: ## Format backend code
	$(PY) -m ruff format backend

openapi: ## Write the OpenAPI schema to docs/openapi.json
	$(PY) -c "import json,pathlib; from app.main import create_app; \
		pathlib.Path('docs/openapi.json').write_text(json.dumps(create_app().openapi(), indent=2))"

web-install: ## Install frontend dependencies
	cd $(WEB_DIR) && $(NPM) install

web-dev: ## Run the React frontend (proxies /api to the backend)
	cd $(WEB_DIR) && $(NPM) run dev

web-build: ## Build the production frontend bundle
	cd $(WEB_DIR) && $(NPM) run build

clean: ## Remove caches
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf .pytest_cache .mypy_cache .ruff_cache
