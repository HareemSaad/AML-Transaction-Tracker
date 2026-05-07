#!/usr/bin/env bash
SCRIPT_NAME="aml-demo"
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/_lib.sh"
load_env

require_cmd curl
require_cmd jq
require_cmd cast

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:${BACKEND_PORT:-3000}}"
RPC="${RPC_URL:-http://127.0.0.1:${ANVIL_PORT:-8545}}"
DEPLOY_FILE="$REPO_ROOT/contracts/deployments/local.json"

[[ -f "$DEPLOY_FILE" ]] || die "$DEPLOY_FILE missing — run scripts/deploy-contracts.sh first"

ONRAMP_ADDRESS="$(jq -r '.onramp' "$DEPLOY_FILE")"
REGISTRY_ADDRESS="$(jq -r '.registry' "$DEPLOY_FILE")"
STABLECOIN_ADDRESS="$(jq -r '.stablecoin' "$DEPLOY_FILE")"
OPERATOR_PK="${DEPLOYER_PK:?DEPLOYER_PK missing in .env}"

# bPKR has 6 decimals. CTR threshold = 2,500,000 PKR.
DEC=1000000
CTR_PKR=2500000

banner() { printf "\n\033[1;35m═══ %s ═══\033[0m\n" "$*"; }
sub()    { printf "\033[1;34m▸\033[0m %s\n" "$*"; }
ok()     { printf "\033[1;32m✓\033[0m %s\n" "$*"; }

# bPKR amount in base units = pkr * 1e6
units() { python3 -c "print(int($1) * $DEC)"; }

# Create a custodial wallet via backend HTTP. Echoes the wallet id (address).
wallet_create() {
  local label="$1" customerId="$2" passport="$3" tier="$4" pep="$5"
  local payload
  payload=$(jq -nc \
    --arg cid "$customerId" \
    --arg name "$label" \
    --arg pass "$passport" \
    --arg tier "$tier" \
    --argjson pep "$pep" \
    '{customerId:$cid, fullName:$name, passportNo:$pass, dob:"1990-01-15",
      nationality:"PK", address:"Karachi, Sindh", occupation:"merchant",
      sourceOfFunds:"business", kycTier:$tier, isPEP:$pep}')
  local resp
  resp=$(curl -fsS -X POST "$BACKEND_URL/wallets" \
    -H 'Content-Type: application/json' -d "$payload")
  echo "$resp" | jq -r '.id'
}

# Mint bPKR to a custodial wallet via the on-ramp.
fund() {
  local addr="$1" amount_pkr="$2"
  local amount_units
  amount_units=$(units "$amount_pkr")
  local fiat_ref
  fiat_ref="0x$(printf "%064d" "$RANDOM")"
  cast send "$ONRAMP_ADDRESS" \
    "mintFor(address,uint256,bytes32)" \
    "$addr" "$amount_units" "$fiat_ref" \
    --private-key "$OPERATOR_PK" --rpc-url "$RPC" >/dev/null
}

# Backend-signed transfer between custodial wallets. Echoes tx hash on success.
transfer() {
  local from_id="$1" to_addr="$2" amount_pkr="$3"
  local amount_units
  amount_units=$(units "$amount_pkr")
  local payload
  payload=$(jq -nc --arg to "$to_addr" --arg amt "$amount_units" '{to:$to, amount:$amt}')
  local resp http_code
  resp=$(curl -sS -o /tmp/aml-demo-resp.json -w '%{http_code}' \
    -X POST "$BACKEND_URL/wallets/$from_id/transfer" \
    -H 'Content-Type: application/json' -d "$payload")
  http_code="$resp"
  if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
    warn "transfer rejected (HTTP $http_code): $(jq -c '.' /tmp/aml-demo-resp.json 2>/dev/null || cat /tmp/aml-demo-resp.json)"
    return 1
  fi
  jq -r '.txHash' /tmp/aml-demo-resp.json
}

advance_day() {
  cast rpc evm_increaseTime 86400 --rpc-url "$RPC" >/dev/null
  cast rpc evm_mine --rpc-url "$RPC" >/dev/null
}

alerts_for_wallet() {
  local wid lower
  wid="$1"
  lower="$(echo "$wid" | tr '[:upper:]' '[:lower:]')"
  curl -fsS "$BACKEND_URL/alerts" \
    | jq --arg w "$lower" '[.[] | select(.walletId == $w)]'
}

count_by_rule() {
  curl -fsS "$BACKEND_URL/alerts" \
    | jq 'group_by(.ruleId) | map({ruleId: .[0].ruleId, count: length}) | sort_by(.ruleId)'
}

# Wipe poller cursor + alert table so a new demo run isn't filtered out by a
# stale cursor (subgraph keeps flags from previous runs in graph-node's
# postgres, which defeats the in-process chain-reset detection).
reset_aml_state() {
  docker exec infra-postgres-1 psql -U postgres -d aml_backend \
    -c 'DELETE FROM "Alert"; DELETE FROM "SubgraphCursor";' >/dev/null 2>&1 \
    || warn "could not reset cursor/alerts (continuing anyway)"
}

# Poll backend alerts every 2s until a wallet has the requested ruleId, or
# fail after $timeout seconds. Echoes the matched alert(s) on success.
wait_for_rule() {
  local wid lower rule timeout
  wid="$1"; rule="$2"; timeout="${3:-30}"
  lower="$(echo "$wid" | tr '[:upper:]' '[:lower:]')"
  local start now elapsed found
  start=$(date +%s)
  while true; do
    found=$(curl -fsS "$BACKEND_URL/alerts" \
      | jq -c --arg w "$lower" --argjson r "$rule" \
          '[.[] | select(.walletId == $w and .ruleId == $r) | {ruleId, severity, amount, txHash}]')
    if [[ "$found" != "[]" && -n "$found" ]]; then
      now=$(date +%s); elapsed=$((now - start))
      ok "rule $rule fired on $lower after ${elapsed}s"
      echo "$found" | jq '.'
      return 0
    fi
    now=$(date +%s); elapsed=$((now - start))
    if (( elapsed >= timeout )); then
      warn "rule $rule did NOT fire on $lower within ${timeout}s"
      return 1
    fi
    sleep 2
  done
}

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 0  setup"
sub "backend         $BACKEND_URL"
sub "anvil rpc       $RPC"
sub "registry        $REGISTRY_ADDRESS"
sub "stablecoin      $STABLECOIN_ADDRESS"
sub "onramp          $ONRAMP_ADDRESS"
sub "CTR threshold   $CTR_PKR PKR  (=$(units $CTR_PKR) base units)"
curl -fsS -o /dev/null "$BACKEND_URL/health" || die "backend not reachable at $BACKEND_URL — run scripts/up.sh first"
ok "backend healthy"
sub "resetting Alert + SubgraphCursor so this run starts clean…"
reset_aml_state
ok "state reset"

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 1  create 3 custodial wallets"
SUFFIX="$(date +%s)"
ALICE=$(wallet_create "Alice Khan"   "ALC-$SUFFIX-1" "PK-A-$SUFFIX" "CORPORATE" false)
BOB=$(wallet_create   "Bob Ahmed"    "BOB-$SUFFIX-2" "PK-B-$SUFFIX" "CORPORATE" false)
CAROL=$(wallet_create "Carol Iqbal"  "CRL-$SUFFIX-3" "PK-C-$SUFFIX" "CORPORATE" false)
ok "Alice  $ALICE"
ok "Bob    $BOB"
ok "Carol  $CAROL"

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 2  on-ramp 50,000,000 bPKR to each wallet"
fund "$ALICE" 50000000 && ok "Alice funded"
fund "$BOB"   50000000 && ok "Bob funded"
fund "$CAROL" 50000000 && ok "Carol funded"

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 3  HAPPY traffic — small transfers"
sub "Alice → Bob 100,000 PKR"
transfer "$ALICE" "$BOB"   100000 >/dev/null && ok "ok"
sub "Bob → Carol 50,000 PKR"
transfer "$BOB"   "$CAROL" 50000  >/dev/null && ok "ok"
sub "waiting 8s for subgraph + poller…"
sleep 8

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 4  RULE 1 — CTR ≥ 2.5M PKR (Critical)"
sub "Alice → Bob 3,000,000 PKR  (above 2.5M threshold)"
transfer "$ALICE" "$BOB" 3000000 >/dev/null && ok "tx accepted on chain"
wait_for_rule "$ALICE" 1 30 || true

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 5  RULE 2 — Structuring (3× sub-threshold in 24h, sum ≥ CTR)"
sub "Bob → Carol 900,000 PKR  (1/3)"
transfer "$BOB" "$CAROL" 900000 >/dev/null && ok "ok"
sub "Bob → Carol 900,000 PKR  (2/3)"
transfer "$BOB" "$CAROL" 900000 >/dev/null && ok "ok"
sub "Bob → Carol 900,000 PKR  (3/3, sum=2.7M ≥ CTR)"
transfer "$BOB" "$CAROL" 900000 >/dev/null && ok "ok"
wait_for_rule "$BOB" 2 30 || true

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 6  more happy traffic — noise"
transfer "$ALICE" "$CAROL" 50000  >/dev/null && ok "Alice → Carol 50k"
transfer "$CAROL" "$ALICE" 25000  >/dev/null && ok "Carol → Alice 25k"
sleep 5

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 7  RULE 5 baseline — Carol does 6 outgoing tx/day for 7 days"
for day in 1 2 3 4 5 6 7; do
  sub "day $day/7…"
  for i in 1 2 3 4 5 6; do
    if (( i % 2 == 0 )); then
      transfer "$CAROL" "$ALICE" 10000 >/dev/null || warn "day $day tx $i failed"
    else
      transfer "$CAROL" "$BOB" 10000 >/dev/null || warn "day $day tx $i failed"
    fi
  done
  advance_day
done
ok "7-day baseline built (~6 tx/day for Carol)"

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 8  RULE 5 spike — Carol blasts 25 transfers today"
for i in $(seq 1 25); do
  if (( i % 2 == 0 )); then
    transfer "$CAROL" "$ALICE" 5000 >/dev/null || warn "spike tx $i failed"
  else
    transfer "$CAROL" "$BOB" 5000 >/dev/null || warn "spike tx $i failed"
  fi
done
ok "spike sent (25 > 6×3 = 18 → expect rule 5)"
wait_for_rule "$CAROL" 5 45 || true

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 9  BLACKLIST — block Alice after the CTR violation, then prove her transfers are rejected"

sub "blocking Alice ($ALICE) via compliance endpoint…"
http_code=$(curl -sS -o /tmp/aml-demo-block.json -w '%{http_code}' \
  -X POST "$BACKEND_URL/wallets/$ALICE/block?blocked=true")
if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
  ok "Alice blocked on-chain: $(jq -c '.' /tmp/aml-demo-block.json)"
else
  warn "block call returned HTTP $http_code: $(jq -c '.' /tmp/aml-demo-block.json 2>/dev/null || cat /tmp/aml-demo-block.json)"
fi

sub "attempting Alice → Bob 1,000 PKR  (should be REJECTED — BLOCKED)"
if transfer "$ALICE" "$BOB" 1000 >/dev/null 2>&1; then
  warn "transfer unexpectedly succeeded — blacklist not enforced"
else
  ok "transfer correctly rejected (checkOutgoing returned BLOCKED)"
fi

sub "unblocking Alice to verify the block is reversible…"
http_code=$(curl -sS -o /tmp/aml-demo-unblock.json -w '%{http_code}' \
  -X POST "$BACKEND_URL/wallets/$ALICE/block?blocked=false")
if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
  ok "Alice unblocked: $(jq -c '.' /tmp/aml-demo-unblock.json)"
else
  warn "unblock call returned HTTP $http_code"
fi

sub "retrying Alice → Bob 1,000 PKR  (should succeed after unblock)"
if transfer "$ALICE" "$BOB" 1000 >/dev/null 2>&1; then
  ok "transfer accepted — unblock confirmed"
else
  warn "transfer still rejected after unblock"
fi

# ─────────────────────────────────────────────────────────────────────────────
banner "Phase 10  summary"
sub "alert counts by rule:"
count_by_rule
echo
ok "Watch \033[1;33mtail -f $REPO_ROOT/.backend.log\033[0m for the 🚨 RULE_X lines"
ok "expected: ruleId 1 (CTR), 2 (structuring), 5 (velocity) — plus 12 (new-account) on every tx, since wallets are < 90d old"
