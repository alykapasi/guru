# Makefile — Guru dev orchestration
.PHONY: help up down db-up db-down backend frontend migrate logs clean

# ── Help ──────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Guru — available commands"
	@echo ""
	@echo "  make up          Start everything (db + backend + frontend)"
	@echo "  make down        Stop everything"
	@echo "  make db-up       Start Postgres + MinIO only"
	@echo "  make db-down     Stop Postgres + MinIO"
	@echo "  make backend     Start FastAPI dev server"
	@echo "  make frontend    Start Vite dev server"
	@echo "  make migrate     Run all SQL migrations"
	@echo "  make logs        Tail Docker logs"
	@echo "  make shell-db    Open psql shell"
	@echo "  make clean-db    Delete all materials and chunks (keep users)"
	@echo "  make install     Install all dependencies"
	@echo ""

# ── Infrastructure ─────────────────────────────────────────────────────────
db-up:
	docker compose up -d postgres minio redis
	@echo "Waiting for Postgres..."
	@until docker compose exec postgres pg_isready -U guru > /dev/null 2>&1; do sleep 1; done
	@echo "Waiting for Redis..."
	@until docker compose exec redis redis-cli ping > /dev/null 2>&1; do sleep 1; done
	@echo "All services ready."

worker:
	cd backend && uv run arq app.worker.WorkerSettings

db-down:
	docker compose stop postgres minio

up: db-up
	@echo "Starting backend and frontend..."
	@make -j2 backend frontend

down:
	docker compose stop

# ── App servers ────────────────────────────────────────────────────────────
backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

# ── Database ───────────────────────────────────────────────────────────────
migrate:
	cd backend && uv run python migrate.py

shell-db:
	docker compose exec postgres psql -U guru -d guru_db

clean-db:
	@echo "Deleting chunks, materials, sessions, messages, mastery scores..."
	docker compose exec postgres psql -U guru -d guru_db -c \
		"DELETE FROM quiz_attempts; DELETE FROM mastery_scores; DELETE FROM messages; DELETE FROM sessions; DELETE FROM chunks; DELETE FROM materials;"
	@echo "Done. Users and profiles preserved."

# ── Logs ───────────────────────────────────────────────────────────────────
logs:
	docker compose logs -f postgres minio

# ── Install ────────────────────────────────────────────────────────────────
install:
	cd backend && uv sync
	cd frontend && npm install