#!/usr/bin/env bash
set -euo pipefail

BASE="${X402_API:-http://localhost:4000}"
ADMIN_HEADER="${ADMIN_HEADER:-X-Merchant-Admin: 1}"

cmd="${1:-balances}"

case "$cmd" in
  balances)
    curl -s -H "$ADMIN_HEADER" "$BASE/admin/balances" | python3 -m json.tool
    ;;
  queue)
    curl -s -H "$ADMIN_HEADER" "$BASE/admin/settlement/queue" | python3 -m json.tool
    ;;
  run)
    curl -s -X POST -H "$ADMIN_HEADER" "$BASE/admin/settlement/run" | python3 -m json.tool
    ;;
  sweep)
    INTENT="${2:?intentId required}"
    curl -s -X POST -H "$ADMIN_HEADER" -H "Content-Type: application/json" \
      -d "{\"intentId\":\"$INTENT\"}" \
      "$BASE/admin/settlement/sweep" | python3 -m json.tool
    ;;
  confirm)
    INTENT="${2:?intentId required}"
    TX="${3:?payoutTx required}"
    curl -s -X POST -H "$ADMIN_HEADER" -H "Content-Type: application/json" \
      -d "{\"intentId\":\"$INTENT\",\"payoutTx\":\"$TX\"}" \
      "$BASE/admin/settlement/confirm" | python3 -m json.tool
    ;;
  *)
    echo "Usage: $0 {balances|queue|run|sweep <intentId>|confirm <intentId> <payoutTx>}"
    exit 1
    ;;
esac
