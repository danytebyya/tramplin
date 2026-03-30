# Architecture Overview

## Purpose

Tramplin is structured as a monorepo with a browser client in `frontend/`, an HTTP and realtime backend in `backend/`, PostgreSQL as the main data store, and a small set of scripts and infrastructure files for local development.

The codebase follows a practical split:

- `frontend` is responsible for routing, UI composition, local session state, optimistic UX, and realtime subscriptions.
- `backend` is responsible for auth, RBAC, business rules, persistence, moderation flows, notifications, and websocket coordination.
- `docs` stores durable project knowledge that should not live only in code comments.

## High-level flow

1. The browser loads the Vite app from `frontend/src/main.tsx`.
2. `frontend/src/app/App.tsx` mounts app providers and the router.
3. `frontend/src/app/providers/index.tsx` bootstraps the React Query client, auth session restoration, chat key provisioning, notifications, and presence listeners.
4. `frontend/src/app/router/index.tsx` decides which page to render and applies guards for guest-only, protected, and employer-specific onboarding routes.
5. Frontend feature modules call the API through `frontend/src/shared/api/client.ts`.
6. FastAPI receives requests in `backend/src/main.py`, passes them through `backend/src/api/v1/router.py`, and dispatches them into endpoint modules under `backend/src/api/v1/endpoints`.
7. Endpoint modules delegate business rules to services in `backend/src/services`, which in turn use repositories in `backend/src/repositories` and SQLAlchemy models in `backend/src/models`.
8. Realtime features use websocket hubs in `backend/src/realtime` for chat, notifications, and presence.

## Frontend structure

### App layer

- `frontend/src/main.tsx`: React entry point and global CSS imports.
- `frontend/src/app/App.tsx`: minimal app shell.
- `frontend/src/app/providers/index.tsx`: React Query provider, router provider, auth bootstrap, chat key bootstrap, and presence wiring.
- `frontend/src/app/router/index.tsx`: application routes and route guards.

### Product layers

- `frontend/src/pages/*`: route-level pages such as dashboards, moderation screens, settings, and details pages.
- `frontend/src/features/*`: reusable product logic grouped by domain, for example auth, chat, notifications, favorites, moderation, and opportunity flows.
- `frontend/src/widgets/*`: larger reusable UI blocks that compose several controls or data sources.
- `frontend/src/entities/*`: domain-facing exports shared across features.
- `frontend/src/shared/*`: low-level reusable building blocks such as API client, config, UI primitives, utilities, and styles.

### Frontend data and session model

- HTTP requests go through `frontend/src/shared/api/client.ts`.
- Access tokens are attached in an Axios request interceptor.
- Expired access tokens are refreshed transparently with the refresh token.
- Unauthorized state clears the local client session.
- React Query handles server-state caching and invalidation.
- Zustand is used for auth/session state.

## Backend structure

### Entry and transport layer

- `backend/src/main.py`: FastAPI application setup, CORS, static avatar hosting, health endpoint, exception handlers, and startup/shutdown hooks.
- `backend/src/api/v1/router.py`: combines all API subrouters.
- `backend/src/api/v1/endpoints/*`: HTTP endpoints grouped by domain.

### Business and persistence layers

- `backend/src/services/*`: domain logic and orchestration.
- `backend/src/repositories/*`: database access helpers and query composition.
- `backend/src/models/*`: SQLAlchemy ORM models.
- `backend/src/schemas/*`: Pydantic request and response schemas.
- `backend/src/enums/*`: domain enums shared across layers.
- `backend/src/utils/*`: common response and error helpers.

### Infrastructure and runtime support

- `backend/src/core/config.py`: environment-backed settings and defaults.
- `backend/src/db/*`: session management, base metadata, and seed utilities.
- `backend/src/realtime/*`: websocket hubs for chat, notifications, and presence.
- `backend/alembic/versions/*`: database schema migrations.
- `backend/src/tests/*`: API and domain regression tests.
- `backend/storage/*`: local development file storage for avatars and verification documents.

## Main domains implemented today

- Authentication and session management
- Employer onboarding and verification
- Opportunity catalog and management
- Applications and employer responses
- Favorites
- Networking and public profiles
- Content moderation and curator tooling
- Notifications
- Encrypted chat and user presence

## Realtime architecture

Realtime behavior is split by concern instead of pushing everything through one websocket channel:

- `backend/src/realtime/chat_hub.py`: chat transport
- `backend/src/realtime/notification_hub.py`: notification events
- `backend/src/realtime/presence_hub.py`: online/offline presence events

On the client side, the related bootstrap and subscription code lives in:

- `frontend/src/features/chat/realtime.ts`
- `frontend/src/features/notifications/use-notifications-realtime.ts`
- `frontend/src/features/presence/realtime.ts`
- `frontend/src/app/providers/index.tsx`

## Persistence and schema changes

- PostgreSQL is the primary database.
- ORM models live in `backend/src/models`.
- Schema evolution happens through Alembic migrations in `backend/alembic/versions`.
- Seed data is managed by `backend/src/db/seeds.py`.
- Longer database notes live in [docs/database/tramplin-db-architecture.md](../database/tramplin-db-architecture.md).

## Practical code navigation rules

- If a change affects page composition or route behavior, start in `frontend/src/pages` and `frontend/src/app/router`.
- If a change affects reusable client behavior, start in `frontend/src/features`.
- If a change affects request/response format, inspect both `frontend/src/shared/api` usage and `backend/src/schemas`.
- If a change affects business rules, start in `backend/src/services`.
- If a change affects database queries, continue into `backend/src/repositories` and `backend/src/models`.
- If a change affects permissions or actor roles, inspect auth/session code on the frontend and auth/dependency/service code on the backend.
