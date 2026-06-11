# Settlement testnet guide

Collect payments into a **single vault** on the chain you choose in `config/config.json`:

```json
"settlement": {
  "targetNetworkId": "bsc",
  "mode": "testnet_hybrid",
  "vault": { "networkId": "bsc", "address": "0x...", "type": "EOA" }
}
```

Change `targetNetworkId` + `vault.networkId` to aggregate on **BSC**, **Polygon Amoy**, **Algorand**, etc.

### Example: vault on Polygon Amoy

```json
"settlement": {
  "targetNetworkId": "polygon-amoy",
  "vault": {
    "networkId": "polygon-amoy",
    "address": "0xYOUR_POLYGON_VAULT",
    "type": "EOA"
  }
}
```

- **Pay on Polygon** (MetaMask → Polygon Amoy, USDC `0x41E94…`) → USDC on your vault → auto `settled`.
- **Pay on BSC or Algorand** → money stays on **that chain’s treasury** → ledger `pending` (cross-chain). You must bridge/send USDC to Polygon vault yourself, then `POST /admin/settlement/confirm` with the Polygon payout tx. **No auto-bridge yet.**

## Modes

| `settlement.mode` | Behaviour |
|-------------------|-----------|
| `testnet_hybrid` | Same-chain EOA → auto-settle; Contract treasury → relayer `sweepAll`; cross-chain → pending until payout proof |
| `mock` | Fake payout tx (legacy demo) |

## EVM contract treasury (recommended)

1. Deploy `contracts/src/X402Treasury.sol` (see [contracts/README.md](../contracts/README.md)).
2. Set `networks[].treasury.type` = `Contract` and treasury address = deployed contract.
3. Set `vault.address` = cold wallet (can differ from treasury).
4. Export on sidecar host:

```bash
export SWEEP_OPERATOR_PRIVATE_KEY=0x...   # must be contract operator
export ADMIN_TOKEN=your-secret            # optional; else X-Merchant-Admin: 1
```

5. Fund **operator** with testnet gas (BNB/ETH).

Users still pay with `USDC.transfer(treasury, amount)`. Relayer calls `sweepAll(USDC)` → vault.

## Admin API (Rust sidecar)

| Method | Path | Auth |
|--------|------|------|
| GET | `/admin/balances` | `Authorization: Bearer $ADMIN_TOKEN` or `X-Merchant-Admin: 1` |
| GET | `/admin/settlement/queue` | same |
| POST | `/admin/settlement/run` | force worker tick |
| POST | `/admin/settlement/sweep` | `{ "intentId": "pi_..." }` — contract treasury |
| POST | `/admin/settlement/confirm` | `{ "intentId", "payoutTx" }` — cross-chain to vault |

## Scenarios

### A — BSC pay, target BSC, EOA treasury

1. Pay resource on BSC (frontend or wallet).
2. `GET /admin/settlement/queue` → entry `settled`, proof = payment tx.
3. `GET /admin/balances` → USDC on treasury/vault.

### B — Algorand pay, target BSC (cross-chain)

1. Pay USDCa on Algorand treasury.
2. Queue: `pending`, details `cross_chain`.
3. Manually send USDC on BSC to `vault.address` (testnet bridge or faucet wallet).
4. `POST /admin/settlement/confirm` with BSC payout tx hash.

### C — BSC pay, Contract treasury + sweep

1. Deploy treasury; pay USDC to contract.
2. Queue: `sweep_pending`.
3. Worker or `POST /admin/settlement/sweep` → `settled`, proof = sweep tx.
4. Balances: contract ≈ 0, vault increased.

### D — Target Algorand

Set `targetNetworkId` / `vault.networkId` to `algorand`. Same-chain Algo payments auto-settle; BSC payments stay `pending` until ASA payout proof (manual / future).

## Faucets

- BSC testnet BNB: public faucets
- BSC testnet USDC: Circle faucet / `0xBC745DB6F5E07f8F9f3E461b9850195e85EDb07f` (18 decimals)
- Algorand USDCa ASA `10458941` + ALGO for fees

## Script

```bash
./scripts/settlement-demo.sh balances
./scripts/settlement-demo.sh queue
```
