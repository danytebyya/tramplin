# Tramplin

Tramplin is a career platform for students, graduates, curators, and employers.

## Tech Stack
- Frontend: React + Vite
- Backend: FastAPI + SQLAlchemy + Alembic
- Database: PostgreSQL

## Quick Start

### 1. Requirements
- Node.js 20+
- Python 3.11+
- Docker Desktop or local PostgreSQL 16+

### 2. Clone and configure env files

From the project root:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp infra/docker/.env.example infra/docker/.env
```

`backend/.env.example` already contains values suitable for local development.

Important:
- `JWT_SECRET_KEY` in `backend/.env` must stay at least 32 characters long.
- `ALLOWED_ORIGINS=http://localhost:5173` is already set for local frontend access.
- `EMAIL_TRANSPORT=log` means emails are not really sent in dev mode; OTP/login emails are written to backend logs.
- `DADATA_API_KEY` is optional. Without it, company lookup features that depend on DaData will not work.
- `VITE_2GIS_MAP_KEY` must be added to `frontend/.env` if you want the home page map to work.

### 3. Start PostgreSQL

Option A: through Docker

```bash
cd infra/docker
docker compose up -d
```

Option B: use your own local PostgreSQL and then make sure credentials in `backend/.env` match it.

### 4. Start backend

In a new terminal:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m src.db.seeds
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available here:
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/api/v1/docs`
- Health check: `http://localhost:8000/health`

The seed step creates the initial admin if it does not already exist:
- Email: `admin@tramplin.local`
- Password: `ChangeMe123`

These values can be changed in `backend/.env` before running `python -m src.db.seeds`.

### 5. Start frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at `http://localhost:5173`.

Important for frontend map:
- `npm install` installs the `@2gis/mapgl` package used by the map widget.
- Add `VITE_2GIS_MAP_KEY=your_key` to `frontend/.env`.
- Without a valid 2GIS key, the map widget will show a fallback state instead of the live map.

## First Run Checklist

If something does not start, check this first:
- PostgreSQL is running on port `5432`
- `backend/.env` exists
- `frontend/.env` exists
- `frontend/.env` contains `VITE_2GIS_MAP_KEY` if you expect the 2GIS map to render
- Alembic migrations were applied with `alembic upgrade head`
- Backend is running on `http://localhost:8000`
- Frontend uses `VITE_API_BASE_URL=http://localhost:8000/api/v1`

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
