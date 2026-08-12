# =============================================================================
# DevPilot AI - Makefile (dev workflow)
# Usage: `make setup`, `make dev-api`, `make test`, ...
# On Windows: use `make` from Git Bash / WSL, or run the equivalent commands
# from the `scripts/` directory manually.
# =============================================================================

.PHONY: help setup install dev-api dev-web db-init db-migrate seed test lint typecheck
.PHONY: build api build web up down logs clean

help:            ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup:           ## Install backend and frontend dependencies
	cd agency && uv sync
	cd frontend && npm install

install:         ## Install backend dependencies only
	cd agency && uv sync

dev-api:         ## Run the FastAPI backend in dev mode (auto-reload)
	cd agency && uv run uvicorn agency.api.main:app --reload --port 8000

dev-web:         ## Run the Next.js dashboard in dev mode
	cd frontend && npm run dev

db-init:         ## Create database tables + seed agents
	cd agency && uv run python -m scripts.init_db

db-migrate:      ## Generate + apply Alembic migrations
	cd agency && uv run alembic upgrade head

db-revision:     ## Autogenerate a new Alembic revision (rev=...)
	cd agency && uv run alembic revision --autogenerate -m "$(rev)"

seed:            ## Seed a demo project
	cd agency && uv run python -m scripts.seed_demo

test:            ## Run backend tests
	cd agency && uv run pytest -q

lint:            ## Lint backend
	cd agency && uv run ruff check .
	cd agency && uv run ruff format --check .

typecheck:       ## Type check backend
	cd agency && uv run mypy agency

build-web:       ## Build frontend production bundle
	cd frontend && npm run build

up:              ## Start full stack with Docker Compose
	docker compose up --build -d

down:            ## Stop the stack
	docker compose down

logs:            ## Tail container logs
	docker compose logs -f --tail=200

clean:           ## Remove local runtime artifacts
	rm -rf agency/.pytest_cache agency/**/__pycache__ agency/*.db logs/*.log
	rm -rf frontend/.next frontend/node_modules
