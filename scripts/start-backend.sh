#!/usr/bin/env bash
SCRIPT_NAME="backend"
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/_lib.sh"
load_env

require_cmd pnpm

cd "$REPO_ROOT/backend"

if [[ ! -d node_modules ]]; then
  log "installing backend deps"
  pnpm install --silent
fi

log "running prisma migrate"
if [[ -d prisma/migrations ]]; then
  pnpm prisma migrate deploy
else
  pnpm prisma db push --skip-generate
fi

log "generating prisma client"
pnpm prisma generate

if [[ "${BACKGROUND:-0}" == "1" ]]; then
  LOG_FILE="$REPO_ROOT/.backend.log"
  PID_FILE="$REPO_ROOT/.backend.pid"
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    log "stopping prior backend pid=$(cat "$PID_FILE")"
    kill "$(cat "$PID_FILE")" || true
    sleep 1
  fi
  : > "$LOG_FILE"
  nohup pnpm start:dev >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  log "backend pid=$(cat "$PID_FILE") log=$LOG_FILE"
  wait_for_http "http://127.0.0.1:${BACKEND_PORT:-3000}/health" "backend" 30
else
  exec pnpm start:dev
fi
