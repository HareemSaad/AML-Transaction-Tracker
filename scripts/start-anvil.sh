#!/usr/bin/env bash
# Fork mainnet via anvil. Runs in foreground unless BACKGROUND=1.
SCRIPT_NAME="anvil"
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/_lib.sh"
load_env

require_cmd anvil
require_cmd curl

: "${MAINNET_RPC_URL:?set MAINNET_RPC_URL in .env (Alchemy/Infura/QuickNode)}"
: "${ANVIL_PORT:=8545}"
: "${ANVIL_CHAIN_ID:=31337}"
: "${ANVIL_BLOCK_TIME:=0}"
: "${ANVIL_HOST:=0.0.0.0}"

STATE_FILE="$REPO_ROOT/.anvil-state.json"
LOG_FILE="$REPO_ROOT/.anvil.log"
PID_FILE="$REPO_ROOT/.anvil.pid"

# Stop a previously-running anvil if present.
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  log "stopping prior anvil pid=$(cat "$PID_FILE")"
  kill "$(cat "$PID_FILE")" || true
  sleep 1
fi
rm -f "$PID_FILE"

ARGS=(
  --fork-url "$MAINNET_RPC_URL"
  --chain-id "$ANVIL_CHAIN_ID"
  --host "$ANVIL_HOST"
  --port "$ANVIL_PORT"
  --state "$STATE_FILE"
  --accounts 10
  --balance 10000
  --silent
)

# ANVIL_BLOCK_TIME=0 means mine-on-demand (no periodic timer) — omit the flag.
# Any positive value sets a fixed block interval in seconds.
if [[ "${ANVIL_BLOCK_TIME:-0}" != "0" ]]; then
  ARGS+=(--block-time "$ANVIL_BLOCK_TIME")
fi

log "forking mainnet via $MAINNET_RPC_URL on chain-id $ANVIL_CHAIN_ID port $ANVIL_PORT"

if [[ "${BACKGROUND:-0}" == "1" ]]; then
  : > "$LOG_FILE"
  nohup anvil "${ARGS[@]}" >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  log "anvil pid=$(cat "$PID_FILE") log=$LOG_FILE"
  # Anvil only answers JSON-RPC POSTs; poll eth_chainId until it responds.
  i=0
  until curl -fsS -X POST -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
      "http://127.0.0.1:$ANVIL_PORT" >/dev/null 2>&1; do
    i=$((i+1))
    if (( i >= 60 )); then die "anvil RPC not responding after 60s — see $LOG_FILE"; fi
    sleep 1
  done
  log "ready: http://127.0.0.1:$ANVIL_PORT (chainId=$ANVIL_CHAIN_ID)"
else
  exec anvil "${ARGS[@]}"
fi
