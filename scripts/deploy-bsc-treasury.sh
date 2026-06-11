#!/usr/bin/env bash
# Deploy X402Treasury on BSC testnet (chainId 97).
# Usage:
#   export VAULT=0x...
#   export OPERATOR=0x...
#   export PRIVATE_KEY=0x...
#   ./scripts/deploy-bsc-treasury.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

if ! command -v forge >/dev/null 2>&1; then
  echo "forge not found — install Foundry: https://book.getfoundry.sh/getting-started/installation"
  exit 1
fi

for var in VAULT OPERATOR PRIVATE_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing env: $var"
    exit 1
  fi
done

forge install foundry-rs/forge-std --no-commit 2>/dev/null || true
echo "==> forge build"
forge build
echo "==> deploy (BSC testnet)"
forge script script/DeployTreasury.s.sol:DeployTreasury \
  --rpc-url bsc_testnet \
  --broadcast \
  -vvv

echo ""
echo "Next: set config/config.json treasury.address to deployed X402Treasury."
echo "See docs/DEPLOY_BSC_TREASURY.md"
