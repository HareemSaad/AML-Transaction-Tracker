#!/usr/bin/env bash
# Creates and funds a set of demo wallets for the Transfer Portal.
# Usage: ./scripts/seed-wallets.sh
SCRIPT_NAME="seed-wallets"
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
OPERATOR_PK="${DEPLOYER_PK:?DEPLOYER_PK missing in .env}"

DEC=1000000   # bPKR has 6 decimals

banner() { printf "\n\033[1;35m═══ %s ═══\033[0m\n" "$*"; }
sub()    { printf "\033[1;34m▸\033[0m %s\n" "$*"; }
ok()     { printf "\033[1;32m✓\033[0m %s\n" "$*"; }

units() { python3 -c "print(int($1) * $DEC)"; }

# Create a custodial wallet. Echoes the on-chain address.
# Args: fullName customerId passportNo dob nationality occupation sourceOfFunds kycTier isPEP
wallet_create() {
  local name="$1" cid="$2" pass="$3" dob="$4" nat="$5" occ="$6" sof="$7" tier="$8" pep="$9"
  local payload
  payload=$(jq -nc \
    --arg  name "$name" \
    --arg  cid  "$cid"  \
    --arg  pass "$pass" \
    --arg  dob  "$dob"  \
    --arg  nat  "$nat"  \
    --arg  occ  "$occ"  \
    --arg  sof  "$sof"  \
    --arg  tier "$tier" \
    --argjson pep "$pep" \
    '{fullName:$name, customerId:$cid, passportNo:$pass, dob:$dob,
      nationality:$nat, address:"Karachi, Sindh",
      occupation:$occ, sourceOfFunds:$sof, kycTier:$tier, isPEP:$pep}')
  local resp
  resp=$(curl -fsS -X POST "$BACKEND_URL/wallets" \
    -H 'Content-Type: application/json' -d "$payload")
  echo "$resp" | jq -r '.id'
}

# Mint bPKR to a wallet via the on-ramp.
fund() {
  local addr="$1" amount_pkr="$2"
  local amount_units fiat_ref
  amount_units=$(units "$amount_pkr")
  fiat_ref="0x$(openssl rand -hex 32 2>/dev/null || printf "%064d" "$RANDOM")"
  cast send "$ONRAMP_ADDRESS" \
    "mintFor(address,uint256,bytes32)" \
    "$addr" "$amount_units" "$fiat_ref" \
    --private-key "$OPERATOR_PK" --rpc-url "$RPC" >/dev/null
}

# ─────────────────────────────────────────────────────────────────────────────
banner "Preflight"
sub "backend  $BACKEND_URL"
sub "anvil    $RPC"
sub "onramp   $ONRAMP_ADDRESS"
curl -fsS -o /dev/null "$BACKEND_URL/health" \
  || die "backend not reachable — run scripts/up.sh first"
ok "backend healthy"

# ─────────────────────────────────────────────────────────────────────────────
banner "Creating wallets"
SUFFIX="$(date +%s)"

# name | customerId suffix | passport | dob | nationality | occupation | sourceOfFunds | KYC tier | isPEP
ALICE=$(wallet_create  "Alice Khan"     "ALC-$SUFFIX" "PK-A-$SUFFIX" "1985-03-12" "PK" "Merchant"            "Business income"  "CORPORATE" false)
BOB=$(wallet_create    "Bob Ahmed"      "BOB-$SUFFIX" "PK-B-$SUFFIX" "1990-07-22" "PK" "Software Engineer"   "Salary"           "ENHANCED"  false)
CAROL=$(wallet_create  "Carol Iqbal"    "CRL-$SUFFIX" "PK-C-$SUFFIX" "1978-11-05" "PK" "Entrepreneur"        "Business income"  "CORPORATE" false)
DANISH=$(wallet_create "Danish Malik"   "DAN-$SUFFIX" "PK-D-$SUFFIX" "1995-01-30" "PK" "Government Employee" "Salary"           "ENHANCED"  false)
EVA=$(wallet_create    "Eva Chen"       "EVA-$SUFFIX" "CN-E-$SUFFIX" "1988-09-18" "CN" "Importer"            "Trade finance"    "BASIC"     false)
FAISAL=$(wallet_create "Faisal Raza"    "FZL-$SUFFIX" "PK-F-$SUFFIX" "1970-04-04" "PK" "Senator"             "Government"       "ENHANCED"  true)

ok "Alice  $ALICE"
ok "Bob    $BOB"
ok "Carol  $CAROL"
ok "Danish $DANISH"
ok "Eva    $EVA"
ok "Faisal $FAISAL  (PEP)"

# ─────────────────────────────────────────────────────────────────────────────
banner "Funding wallets"

fund "$ALICE"  10000000 && ok "Alice  funded  10,000,000 bPKR"
fund "$BOB"     5000000 && ok "Bob    funded   5,000,000 bPKR"
fund "$CAROL"   8000000 && ok "Carol  funded   8,000,000 bPKR"
fund "$DANISH"  2000000 && ok "Danish funded   2,000,000 bPKR"
fund "$EVA"      500000 && ok "Eva    funded     500,000 bPKR"
fund "$FAISAL"  3000000 && ok "Faisal funded   3,000,000 bPKR"

# ─────────────────────────────────────────────────────────────────────────────
banner "Done — wallet summary"
printf "  %-14s  %-42s  %s\n" "Name" "Address" "Balance (bPKR)"
printf "  %-14s  %-42s  %s\n" "--------------" "------------------------------------------" "--------------"
for row in \
  "Alice:$ALICE:10,000,000" \
  "Bob:$BOB:5,000,000" \
  "Carol:$CAROL:8,000,000" \
  "Danish:$DANISH:2,000,000" \
  "Eva:$EVA:500,000" \
  "Faisal:$FAISAL:3,000,000"
do
  IFS=: read -r name addr bal <<< "$row"
  printf "  %-14s  %-42s  %s\n" "$name" "$addr" "$bal"
done

echo
ok "Open the Transfer Portal at http://localhost:${FRONTEND_PORT:-5173}/transfer"
