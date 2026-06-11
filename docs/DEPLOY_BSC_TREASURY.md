# BSC contract treasury — deploy & BSC→BSC test

Pay on BSC → USDC on `X402Treasury` → verify + unlock → operator `sweepAll` → USDC on BSC vault.

> **Agent mode:** ask Cursor to apply repo changes (`x402-module/.env.example`, `dotenvy` in `main.rs`, `scripts/deploy-bsc-treasury.sh`). Everything you need is also below to do by hand.

## 0. Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`)
- BSC testnet BNB on **deployer** and **operator** wallets
- Rust sidecar env (see step 1)

## 1. Sidecar `.env`

Create `x402-module/.env` (already gitignored via root `.gitignore`):

```bash
cd x402-module
cat > .env <<'EOF'
SWEEP_OPERATOR_PRIVATE_KEY=0xYOUR_OPERATOR_PRIVATE_KEY
PORT=4000
X402_CONFIG=../config/config.json
EOF
```

Sidecar reads **`SWEEP_OPERATOR_PRIVATE_KEY`** (not `BSC_GAS`). If `.env` is not auto-loaded yet, `export` the same vars before `cargo run`, or add `dotenvy` to `main.rs`.

Operator address:

```bash
cast wallet address --private-key $SWEEP_OPERATOR_PRIVATE_KEY
```

Fund operator with testnet BNB (~0.01 is enough for sweeps).

## 2. Deploy `X402Treasury`

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit 2>/dev/null || true
forge build   # must pass before broadcast
```

Pick **VAULT** = BSC EOA that receives swept USDC (can be the same address as operator).

```bash
export VAULT=0xYourBscVaultEoa          # same as settlement.vault.address in config
export OPERATOR=0xYourOperatorEoa       # must match SWEEP_OPERATOR_PRIVATE_KEY
export PRIVATE_KEY=0xYourDeployerKey    # pays deploy gas (can differ from operator)

forge script script/DeployTreasury.s.sol:DeployTreasury \
  --rpc-url bsc_testnet \
  --broadcast \
  -vvv
```

Note the logged **`X402Treasury`** address.

### Contract check (already in repo)

- Users pay: `USDC.transfer(treasuryContract, amount)` — no contract change needed.
- Operator calls `sweepAll(USDC)` — moves full USDC balance to immutable `vault`.
- Only `operator` or `owner` can sweep; gas paid by `msg.sender` (your operator EOA).

## 3. Update `config/config.json`

**BSC network** — set deployed contract:

```json
"treasury": {
  "address": "0xDEPLOYED_TREASURY",
  "type": "Contract",
  "contract": {
    "name": "X402Treasury",
    "version": "1",
    "sweepOperator": "0xOPERATOR"
  }
}
```

**Settlement** — BSC→BSC (same chain); `vault.address` must equal deploy **`VAULT`**:

```json
"settlement": {
  "targetNetworkId": "bsc",
  "mode": "testnet_hybrid",
  "vault": {
    "networkId": "bsc",
    "address": "0xVAULT_SAME_AS_DEPLOY",
    "type": "EOA"
  }
}
```

**Merchant** (optional, for consistency):

```json
"settlement": {
  "networkId": "bsc",
  "asset": "USDC"
}
```

## 4. Run sidecar

```bash
cd x402-module
cargo run --release
```

## 5. Test BSC→BSC

1. Frontend → pay resource on BSC USDC → **contract treasury address** (from config).
2. Unlock should be instant after confirmations.
3. After ~30s (settlement worker): `GET /admin/settlement/queue` — entry `settled`, proof = sweep tx.
4. `GET /admin/balances` — USDC on vault EOA increased; contract USDC ≈ 0.

Admin auth: `X-Merchant-Admin: 1` or `Authorization: Bearer $ADMIN_TOKEN`.

```bash
./scripts/settlement-demo.sh queue
./scripts/settlement-demo.sh balances
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Sweep never runs | `SWEEP_OPERATOR_PRIVATE_KEY` in `.env`, operator has BNB, `treasury.type` = `Contract` |
| `NotOperator` on-chain | `sweepOperator` in config ≠ contract `operator` |
| Verify ok but sweep fails | `settlement.vault.address` ≠ contract `vault` immutable |
| Pay to old EOA | Frontend uses `treasury.address` from `/api/networks` — must be contract |
