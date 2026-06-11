# Bridge MVP: Algorand → BSC vault

**Rail:** [Allbridge Core](https://docs-core.allbridge.io/) (Algo + BSC, native USDC path).  
One worker, one rail in config — not N custom bridges.

## Why not "1–2 weeks" for this slice

| Scope | Time |
|-------|------|
| Testnet script + settlement hook + manual test | **1–3 days** |
| Retries, idempotency, metrics, prod keys, all corridors | **1–2 weeks** |

## Flow (target)

```
Pay USDCa on Algo treasury (EOA)
  → verify + unlock
  → ledger: pending (cross_chain)
  → bridge-worker: Allbridge send(Algo treasury → BSC vault)
  → verify USDC on 0x70Bb7…
  → ledger: settled
```

## Env (bridge-worker + sidecar)

| Variable | Purpose |
|----------|---------|
| `SWEEP_OPERATOR_PRIVATE_KEY` | BSC operator (sweep; already set) |
| `ALG_TREASURY_MNEMONIC` or `ALG_TREASURY_PRIVATE_KEY` | **Must control Algo treasury** `QWNO77…` — USDCa sits there |
| `ALG_PROVIDER_URL` | `https://testnet-api.algonode.cloud` |

Without Algo treasury key, auto-bridge **cannot** move USDCa off `QWNO77…`.

## Run bridge manually (first test)

```bash
cd bridge-worker
npm install
cp .env.example .env   # fill keys

# After Algo pay $0.25:
npm run bridge:algo-to-bsc -- \
  --amount 250000 \
  --vault 0x70Bb7E5d8FD35e75ea93d025DD91613232c9898f
```

Amount in **micro-USDCa** (6 decimals): $0.25 → `250000`.

## Sidecar hook (next)

`settlement` worker calls `bridge-worker` for `pending` + `source_chain=algorand` + `target=bsc`.

## Acceptance

1. Pay `premium_advice` on Algorand.
2. USDCa on `QWNO77…`.
3. Bridge runs (auto or manual script).
4. BSC vault `0x70Bb7…` gains ~0.25 USDC (BSC token decimals 18 on testnet).
