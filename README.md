# Tramplin

Tramplin is a career platform for students, graduates, curators, and employers. The repository is organized as a monorepo with a React frontend, a FastAPI backend, PostgreSQL, and supporting infrastructure/scripts for local development.

## Repository layout

- `frontend/`: Vite + React application.
- `backend/`: FastAPI application, SQLAlchemy models, Alembic migrations, tests, and local file storage.
- `docs/`: architecture notes, database documentation, API notes, QA materials, and product rules.
- `infra/`: Docker and Nginx configuration for local infrastructure.
- `scripts/`: helper scripts.
- `run.sh` / `stop.sh`: shortcuts to start and stop the local stack.

## Core stack

- Frontend: React 18, TypeScript, Vite, React Router, TanStack Query, Zustand
- Backend: FastAPI, SQLAlchemy, Alembic, Pydantic
- Database: PostgreSQL
- Realtime: WebSocket-based chat, notifications, and presence

## Where to start in the code

### Frontend

- Entry point: `frontend/src/main.tsx`
- App shell: `frontend/src/app/App.tsx`
- Providers and app bootstrap: `frontend/src/app/providers/index.tsx`
- Route definitions: `frontend/src/app/router/index.tsx`
- Shared API client: `frontend/src/shared/api/client.ts`
- Feature modules: `frontend/src/features/*`
- Pages: `frontend/src/pages/*`
- Shared UI primitives: `frontend/src/shared/ui/*`

### Backend

- Entry point: `backend/src/main.py`
- API router composition: `backend/src/api/v1/router.py`
- HTTP endpoints: `backend/src/api/v1/endpoints/*`
- Business logic: `backend/src/services/*`
- Data access: `backend/src/repositories/*`
- SQLAlchemy models: `backend/src/models/*`
- Pydantic schemas: `backend/src/schemas/*`
- Realtime hubs: `backend/src/realtime/*`
- Tests: `backend/src/tests/*`

## Documentation index

- Local setup: [QUICKSTART.md](./QUICKSTART.md)
- Architecture overview: [docs/architecture/overview.md](./docs/architecture/overview.md)
- Codebase guide: [docs/architecture/codebase-guide.md](./docs/architecture/codebase-guide.md)
- Database architecture: [docs/database/tramplin-db-architecture.md](./docs/database/tramplin-db-architecture.md)
- Verification and moderation rules: [docs/product/verification-and-moderation.md](./docs/product/verification-and-moderation.md)
- QA materials: [docs/qa/tester-brief.md](./docs/qa/tester-brief.md)

## Local development

Quick start instructions were moved to [QUICKSTART.md](./QUICKSTART.md).

Common commands from the repository root:

```bash
./run.sh
./stop.sh
STOP_POSTGRES=1 ./stop.sh
```

Backend:

```bash
cd backend
source .venv/bin/activate
pytest
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
```

## Runtime entry points

- Frontend app: `http://localhost:5173`
- Backend API: `http://localhost:8000/api/v1`
- Swagger: `http://localhost:8000/api/v1/docs`
- Health check: `http://localhost:8000/health`

## Development conventions

- Frontend talks to the backend through `frontend/src/shared/api/client.ts`.
- Route-level screens live under `frontend/src/pages`, while reusable product logic lives under `frontend/src/features`.
- Backend endpoints should stay thin; domain logic belongs in `backend/src/services`, and database access belongs in `backend/src/repositories`.
- Database changes should be reflected through Alembic migrations in `backend/alembic/versions`.

## About

This project is developed for the "Applied Programming if...else" (IT-Planet 2026) competition.
