#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-tramplin}"
POSTGRES_USER="${POSTGRES_USER:-tramplin_user}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-tramplin_password}"
POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-/opt/homebrew/var/postgresql@15}"
POSTGRES_LOG_FILE="${POSTGRES_LOG_FILE:-/opt/homebrew/var/log/postgresql@15.log}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"
BACKEND_PY_BIN="${ROOT_DIR}/backend/.venv/bin/python"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

print_banner() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}         Starting Tramplin stack        ${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo
}

kill_port() {
  local port=$1
  local label=$2
  local pids

  pids=$(lsof -ti:"${port}" || true)
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}Stopping ${label} on port ${port}...${NC}"
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      kill -9 "$pid" 2>/dev/null || true
    done <<< "$pids"
    sleep 1
  fi
}

wait_for_port() {
  local port=$1
  local label=$2
  local attempts=0
  local max_attempts=30

  while [ "$attempts" -lt "$max_attempts" ]; do
    if lsof -ti:"${port}" >/dev/null 2>&1; then
      echo -e "${GREEN}${label} is listening on ${port}${NC}"
      return
    fi
    printf '.'
    sleep 1
    attempts=$((attempts + 1))
  done

  echo
  echo -e "${RED}Failed to start ${label}${NC}"
  case "$label" in
    "Backend")
      [ -f backend.log ] && tail -n 40 backend.log
      ;;
    "Frontend")
      [ -f frontend.log ] && tail -n 40 frontend.log
      ;;
  esac
  exit 1
}

ensure_backend_deps() {
  local py_bin="${BACKEND_PY_BIN}"

  if [ ! -x "$py_bin" ]; then
    if ! command -v python3 >/dev/null 2>&1; then
      echo -e "${RED}python3 is missing. Install Python 3 and retry.${NC}"
      exit 1
    fi

    echo -e "${YELLOW}Creating backend virtual environment...${NC}"
    python3 -m venv backend/.venv
  fi

  if "$py_bin" - <<'PY' >/dev/null 2>&1; then
import importlib
for mod in ("fastapi", "uvicorn", "sqlalchemy", "alembic"):
    importlib.import_module(mod)
PY
    return
  fi

  echo -e "${YELLOW}Installing backend dependencies...${NC}"
  "$py_bin" -m pip install --upgrade pip >/dev/null
  "$py_bin" -m pip install -r backend/requirements.txt
}

ensure_frontend_deps() {
  if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}npm is missing. Install Node.js and retry.${NC}"
    exit 1
  fi

  if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    (cd frontend && npm install)
  fi
}

ensure_postgres() {
  local psql_bin
  local pg_ctl_bin

  if pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" >/dev/null 2>&1; then
    echo -e "${GREEN}PostgreSQL is already accepting connections on ${POSTGRES_HOST}:${POSTGRES_PORT}${NC}"
  else
    pg_ctl_bin="$(command -v pg_ctl || true)"
    if [ -z "$pg_ctl_bin" ] && [ -x "/opt/homebrew/opt/postgresql@15/bin/pg_ctl" ]; then
      pg_ctl_bin="/opt/homebrew/opt/postgresql@15/bin/pg_ctl"
    fi

    if [ -z "$pg_ctl_bin" ]; then
      echo -e "${RED}pg_ctl not found. Start PostgreSQL manually and retry.${NC}"
      exit 1
    fi

    if [ ! -d "${POSTGRES_DATA_DIR}" ]; then
      echo -e "${RED}PostgreSQL data directory not found at ${POSTGRES_DATA_DIR}.${NC}"
      exit 1
    fi

    echo -e "${YELLOW}Starting PostgreSQL...${NC}"
    rm -f "${POSTGRES_DATA_DIR}/postmaster.pid"
    "${pg_ctl_bin}" -D "${POSTGRES_DATA_DIR}" -l "${POSTGRES_LOG_FILE}" start >/dev/null
    sleep 2

    if ! pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" >/dev/null 2>&1; then
      echo -e "${RED}PostgreSQL did not start correctly.${NC}"
      [ -f "${POSTGRES_LOG_FILE}" ] && tail -n 40 "${POSTGRES_LOG_FILE}"
      exit 1
    fi
  fi

  psql_bin="$(command -v psql || true)"
  if [ -z "$psql_bin" ] && [ -x "/opt/homebrew/opt/postgresql@15/bin/psql" ]; then
    psql_bin="/opt/homebrew/opt/postgresql@15/bin/psql"
  fi

  if [ -z "$psql_bin" ]; then
    echo -e "${RED}psql not found. Cannot initialize local PostgreSQL database.${NC}"
    exit 1
  fi

  echo -e "${BLUE}--- Database (${POSTGRES_DB})${NC}"
  if ! PGPASSWORD="${POSTGRES_PASSWORD}" "${psql_bin}" -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" | grep -q 1; then
    echo -e "${RED}Database ${POSTGRES_DB} does not exist. Create it manually before запуском стека.${NC}"
    exit 1
  fi

  echo -e "${GREEN}Database ${POSTGRES_DB} is ready${NC}"
}

start_backend() {
  echo -e "${BLUE}--- Backend (${BACKEND_PORT})${NC}"
  nohup bash -lc "cd backend && API_PORT=${BACKEND_PORT} API_HOST=0.0.0.0 PYTHONPATH=. ${BACKEND_PY_BIN} -m uvicorn src.main:app --host 0.0.0.0 --port ${BACKEND_PORT}" > backend.log 2>&1 &
  BACK_PID=$!
  wait_for_port "${BACKEND_PORT}" "Backend"
}

start_frontend() {
  echo -e "${BLUE}--- Frontend (${FRONTEND_PORT})${NC}"
  nohup bash -lc "cd frontend && VITE_API_BASE_URL=http://localhost:${BACKEND_PORT}/api/v1 npm run dev -- --host 0.0.0.0 --port ${FRONTEND_PORT}" > frontend.log 2>&1 &
  FRONT_PID=$!
  wait_for_port "${FRONTEND_PORT}" "Frontend"
}

main() {
  print_banner

  kill_port "${BACKEND_PORT}" "Backend"
  kill_port "${FRONTEND_PORT}" "Frontend"

  ensure_backend_deps
  ensure_frontend_deps
  ensure_postgres

  start_backend
  start_frontend

  echo
  echo -e "${GREEN}Backend PID: ${BACK_PID}${NC}"
  echo -e "${GREEN}Frontend PID: ${FRONT_PID}${NC}"
  echo -e "${GREEN}Done.${NC}"
}

main
