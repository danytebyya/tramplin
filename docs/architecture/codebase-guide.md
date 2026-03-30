# Codebase Guide

## Why this file exists

This guide is meant to answer one practical question quickly: where should you go in the codebase when you need to change a specific behavior?

## Frontend map

### Start here

- `frontend/src/main.tsx`: browser entry point.
- `frontend/src/app/App.tsx`: app shell.
- `frontend/src/app/providers/index.tsx`: app-wide providers and bootstrapping logic.
- `frontend/src/app/router/index.tsx`: route table and access rules.

### By responsibility

- `frontend/src/pages/*`: full pages bound to routes.
- `frontend/src/features/*`: domain logic with API calls, local state, realtime hooks, and feature-specific UI.
- `frontend/src/widgets/*`: larger reusable UI sections used by pages.
- `frontend/src/shared/ui/*`: low-level reusable components such as buttons, inputs, modals, cards, and controls.
- `frontend/src/shared/api/*`: API transport layer.
- `frontend/src/shared/lib/*`: pure helpers and utility logic.
- `frontend/src/shared/config/*`: environment and runtime config.
- `frontend/src/shared/styles/*`: tokens, global styles, and shared CSS foundations.

### Common frontend tasks

- Add a new route: update `frontend/src/app/router/index.tsx`, then create or reuse a page in `frontend/src/pages`.
- Change authenticated session behavior: inspect `frontend/src/features/auth/*` and `frontend/src/app/providers/index.tsx`.
- Change API request behavior globally: inspect `frontend/src/shared/api/client.ts`.
- Change notifications or websocket handling: inspect `frontend/src/features/notifications/*`, `frontend/src/features/chat/realtime.ts`, and `frontend/src/features/presence/*`.
- Change a reusable UI primitive: inspect `frontend/src/shared/ui/*`.
- Change a page-specific layout or styling: inspect the matching page folder in `frontend/src/pages/*`.

## Backend map

### Start here

- `backend/src/main.py`: FastAPI app setup and lifecycle.
- `backend/src/api/v1/router.py`: API router composition.

### By responsibility

- `backend/src/api/v1/endpoints/*`: HTTP endpoints and transport-level validation.
- `backend/src/services/*`: business rules and orchestration.
- `backend/src/repositories/*`: SQLAlchemy query and persistence helpers.
- `backend/src/models/*`: ORM models and relationships.
- `backend/src/schemas/*`: request/response schemas.
- `backend/src/db/*`: database session, base metadata, seed routines.
- `backend/src/realtime/*`: websocket hubs and realtime coordination.
- `backend/src/core/*`: app configuration, logging, security utilities.
- `backend/src/tests/*`: regression coverage for API and domain behavior.

### Common backend tasks

- Add or change an endpoint: update the matching file in `backend/src/api/v1/endpoints/*`, then wire business logic in `backend/src/services/*`.
- Change domain rules: start in the relevant service and keep endpoint handlers thin.
- Change query logic: inspect the related repository and model definitions.
- Change API contracts: update schemas in `backend/src/schemas/*` and make sure the frontend caller matches.
- Change persistence or schema: update models, add an Alembic migration in `backend/alembic/versions`, and adjust tests.
- Change startup or shared runtime behavior: inspect `backend/src/main.py` and `backend/src/core/config.py`.

## End-to-end change checklist

When a feature spans both applications, the safest path is:

1. Find the frontend page or feature entry point.
2. Trace the API call to `frontend/src/shared/api/client.ts` or the local feature API module.
3. Find the backend endpoint in `backend/src/api/v1/endpoints/*`.
4. Follow the call into the corresponding service and repository.
5. If the data shape changed, update schemas, tests, and any frontend consumers together.

## Files worth knowing early

- `README.md`: repository overview and doc index.
- `QUICKSTART.md`: local setup and first-run instructions.
- `docs/architecture/overview.md`: high-level system picture.
- `docs/database/tramplin-db-architecture.md`: detailed data model notes.
- `docs/product/verification-and-moderation.md`: domain rules for moderation-related flows.

## Current architectural conventions

- Frontend routes are centralized in one router file.
- Frontend feature code is grouped by domain instead of by technical primitive only.
- Backend endpoints are expected to stay relatively thin.
- Backend services are the main place for business logic.
- Database schema changes are tracked through Alembic, not manual SQL-only edits.
