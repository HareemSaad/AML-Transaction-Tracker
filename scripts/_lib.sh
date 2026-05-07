#!/usr/bin/env bash
# Common helpers sourced by other scripts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf "\033[1;36m[%s]\033[0m %s\n" "${SCRIPT_NAME:-script}" "$*"; }
warn() { printf "\033[1;33m[%s]\033[0m %s\n" "${SCRIPT_NAME:-script}" "$*" >&2; }
die()  { printf "\033[1;31m[%s] ERROR:\033[0m %s\n" "${SCRIPT_NAME:-script}" "$*" >&2; exit 1; }

load_env() {
  if [[ -f "$REPO_ROOT/.env" ]]; then
    set -a; # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
  else
    warn ".env not found at $REPO_ROOT/.env — falling back to .env.example defaults"
    if [[ -f "$REPO_ROOT/.env.example" ]]; then
      set -a; # shellcheck disable=SC1091
      source "$REPO_ROOT/.env.example"
      set +a
    fi
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

wait_for_http() {
  local url="$1"
  local label="${2:-$1}"
  local timeout="${3:-60}"
  log "waiting for $label ($url) up to ${timeout}s"
  local i=0
  until curl -fsS -o /dev/null "$url" 2>/dev/null; do
    i=$((i+1))
    if (( i >= timeout )); then die "timed out waiting for $label"; fi
    sleep 1
  done
  log "$label is up"
}

wait_for_port() {
  local host="$1" port="$2" label="${3:-$host:$port}" timeout="${4:-60}"
  log "waiting for $label up to ${timeout}s"
  local i=0
  until (echo > "/dev/tcp/$host/$port") 2>/dev/null; do
    i=$((i+1))
    if (( i >= timeout )); then die "timed out waiting for $label"; fi
    sleep 1
  done
  log "$label is up"
}
