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
POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-/opt/homebrew/var/postgresql@15}"
POSTGRES_LOG_FILE="${POSTGRES_LOG_FILE:-/opt/homebrew/var/log/postgresql@15.log}"
STOP_POSTGRES="${STOP_POSTGRES:-0}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

print_banner() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}         Stopping Tramplin stack        ${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo
}

stop_port() {
  local port=$1
  local label=$2
  local pids

  pids=$(lsof -ti:"${port}" || true)
  if [ -z "$pids" ]; then
    echo -e "${YELLOW}${label} is not running on port ${port}${NC}"
    return
  fi

  echo -e "${YELLOW}Stopping ${label} on port ${port}...${NC}"
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    kill "$pid" 2>/dev/null || true
  done <<< "$pids"

  sleep 1

  pids=$(lsof -ti:"${port}" || true)
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}${label} did not stop gracefully, forcing shutdown...${NC}"
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      kill -9 "$pid" 2>/dev/null || true
    done <<< "$pids"
  fi

  echo -e "${GREEN}${label} stopped${NC}"
}

stop_postgres() {
  local pg_ctl_bin

  if [ "${STOP_POSTGRES}" != "1" ]; then
    echo -e "${BLUE}Skipping PostgreSQL shutdown. Set STOP_POSTGRES=1 to stop it too.${NC}"
    return
  fi

  if ! pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" >/dev/null 2>&1; then
    echo -e "${YELLOW}PostgreSQL is not accepting connections on ${POSTGRES_HOST}:${POSTGRES_PORT}${NC}"
    return
  fi

  pg_ctl_bin="$(command -v pg_ctl || true)"
  if [ -z "$pg_ctl_bin" ] && [ -x "/opt/homebrew/opt/postgresql@15/bin/pg_ctl" ]; then
    pg_ctl_bin="/opt/homebrew/opt/postgresql@15/bin/pg_ctl"
  fi

  if [ -z "$pg_ctl_bin" ]; then
    echo -e "${RED}pg_ctl not found. PostgreSQL was left running.${NC}"
    return
  fi

  if [ ! -d "${POSTGRES_DATA_DIR}" ]; then
    echo -e "${RED}PostgreSQL data directory not found at ${POSTGRES_DATA_DIR}. Skipping shutdown.${NC}"
    return
  fi

  echo -e "${YELLOW}Stopping PostgreSQL...${NC}"
  "${pg_ctl_bin}" -D "${POSTGRES_DATA_DIR}" -l "${POSTGRES_LOG_FILE}" stop >/dev/null || true

  if pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" >/dev/null 2>&1; then
    echo -e "${RED}PostgreSQL is still running on ${POSTGRES_HOST}:${POSTGRES_PORT}${NC}"
    return
  fi

  echo -e "${GREEN}PostgreSQL stopped${NC}"
}

main() {
  print_banner
  stop_port "${BACKEND_PORT}" "Backend"
  stop_port "${FRONTEND_PORT}" "Frontend"
  stop_postgres

  echo
  echo -e "${GREEN}Done.${NC}"
}

main
