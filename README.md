# Tramplin

Tramplin is a career platform for students, graduates, curators, and employers.

## Tech Stack
- Frontend: React + Vite
- Backend: FastAPI + SQLAlchemy + Alembic
- Database: PostgreSQL

## Quick Start

Quick start was moved to [QUICKSTART.md](./QUICKSTART.md).

## Useful Commands

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

Stop PostgreSQL in Docker:

```bash
cd infra/docker
docker compose down
```

Remove PostgreSQL data volume too:

```bash
cd infra/docker
docker compose down -v
```

## About

This project is developed for the "Applied Programming if...else" (IT-Planet 2026) competition.
