# AI Governance Platform — developer commands
#
# Usage:
#   make up          # Start all services via Docker Compose
#   make down        # Stop everything
#   make logs        # Tail backend logs
#   make test        # Run backend tests
#   make clean       # Stop and remove volumes (DB data lost)

.PHONY: up down logs test clean backend worker

up:
	docker compose up -d --build
	@echo "Waiting for backend to be ready..."
	@for i in $$(seq 1 30); do \
	  curl -sf http://localhost:8000/health > /dev/null && break; \
	  sleep 1; \
	done
	@echo ""
	@echo "AI Governance platform is running:"
	@echo "  API docs:  http://localhost:8000/docs"
	@echo "  Health:    http://localhost:8000/health"
	@echo "  Postgres:  localhost:5432 (user=governance, db=ai_governance)"
	@echo "  Redis:     localhost:6379"

down:
	docker compose down

logs:
	docker compose logs -f backend

backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

worker:
	cd backend && celery -A app.celery_app worker --loglevel=info --beat

test:
	cd backend && python -m pytest tests/ -q

clean:
	docker compose down -v
