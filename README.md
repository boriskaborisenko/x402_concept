# NOT FOR PRODUCTION!!

# x402 Payment Sidecar

## Stripe-like sidecar for HTTP 402 crypto payments.

---

## This is not final payment infrastructure

This repository is a **demonstration** of how [HTTP 402](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/402) can become a **plug-and-play monetization layer** for APIs and AI services: the merchant keeps their **backend clean**, while **crypto payment verification**, **payment routes**, and **unlock logic** are moved into a **separate sidecar**.

Testnet only · in-memory ledger · experimental settlement · demo UI. Do **not** use for real money or mainnet. See [ROADMAP.md](ROADMAP.md).

---

In this PoC, users pay from supported chains; access unlocks **immediately** after on-chain verification; liquidity can be aggregated to a vault later (settlement does not block checkout).

---

## What problem this solves

Typical crypto checkout forces the user onto one network and token. This project inverts that:

- The **API** sets a price in USD.
- The **user** pays from BSC, Algorand, Polygon testnet, etc.
- The **sidecar** verifies the transaction and unlocks the resource.
- The **merchant** receives consolidated funds on a chosen vault chain later.

```
User pays from anywhere  →  Service unlocks instantly  →  Merchant settles on vault chain
```

---

## Current stage (honest)

**Scope:** validate the idea on **testnets**, not ship a payment product.

| Area | Status |
|------|--------|
| Payment intents + multi-chain routes | Demo — testnet only |
| On-chain verify + instant unlock (SSE) | Demo — testnet only |
| Demo UI (`frontend/`) | Demo checkout, not a hosted product |
| Rust sidecar (`x402-module/`) | Preferred runtime for local experiments |
| Node sidecar (`backend/`) | Reference implementation, same API |
| Ledger | In-memory (restart loses state) |
| **BSC → BSC settlement** | **Testnet PoC**: contract treasury → operator `sweepAll` → vault |
| **Cross-chain settlement** (e.g. Algo → BSC vault) | Experimental; ledger often `pending`; bridge worker is a lab script |
| CCTP / CCIP / Wormhole / Allbridge auto-rail | Not wired for testnet checkout tokens |
| Production readiness | **No** — persistence, auth, monitoring, key management, audits: see [ROADMAP.md](ROADMAP.md) |

**Testnet token reality:** checkout uses Circle testnet USDC on Algorand (ASA `10458941`) and a custom BSC test USDC (`0xBC745…`). Public bridges (Allbridge, Wormhole) target **mainnet** USDC addresses — they do not move those test tokens. Full cross-chain E2E on testnet is limited; **same-chain BSC settlement is the reference path that works today.**

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ User wallet │────►│  x402 sidecar    │────►│ Merchant API    │
│ BSC / Algo  │     │  (Rust or Node)  │     │ (your service)  │
└─────────────┘     └────────┬─────────┘     └─────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         Chain RPC      Ledger (RAM)   Settlement worker
         verify tx      audit trail    sweep / bridge → vault
```

| Path | Role |
|------|------|
| [`config/`](config/) | Networks, treasuries, vault, resources, prices — **not** in merchant app code |
| [`x402-module/`](x402-module/) | Rust sidecar (local / testnet experiments) |
| [`backend/`](backend/) | Node reference, same HTTP API |
| [`frontend/`](frontend/) | Optional demo checkout |
| [`contracts/`](contracts/) | `X402Treasury.sol` — testnet treasury pattern (not audited for mainnet) |
| [`bridge-worker/`](bridge-worker/) | Experimental Allbridge script (Algo → BSC); see limitations above |

Run **one** sidecar process (Node **or** Rust), not both on the same port.

---

## Two layers: authorization vs settlement

These are **intentionally separate**.

### 1. Authorization (user-facing, fast)

1. `POST /api/payment-intent` → HTTP 402 + payment routes (per chain/token).
2. User sends USDC (or USDCa) to the **treasury** address in the chosen route.
3. `POST /api/payments/submit` + SSE `GET /api/payments/:id/events`.
4. Sidecar verifies tx on-chain → emits `resource_unlocked`.

User does **not** wait for bridge or settlement.

### 2. Settlement (background, merchant-facing)

After verify, a ledger entry is created:

| Scenario | Ledger | Worker behavior |
|----------|--------|-----------------|
| Pay on BSC, vault on BSC, **contract treasury** | `sweep_pending` → `settled` | Operator calls `sweepAll(USDC)`; gas paid by operator |
| Pay on BSC, vault on BSC, EOA treasury | `pending` → `settled` | Auto-settle (proof = payment tx) |
| Pay on Algo, vault on BSC | `pending` (cross-chain) | No automatic bridge with current test tokens |
| `settlement.mode: mock` | fake `settled` | Demo only |

**EVM treasury pattern (testnet PoC):** deploy [`X402Treasury`](contracts/src/X402Treasury.sol) on a test EVM chain. Users pay the **contract**; a **sponsor operator** calls `sweepAll`. This illustrates separation of user funds and gas — not an audited mainnet deployment guide. See [docs/DEPLOY_BSC_TREASURY.md](docs/DEPLOY_BSC_TREASURY.md).

---

## Quick start (local testnet)

### Requirements

- Node.js 18+
- Rust 1.75+ (for `x402-module`)
- Testnet wallets: BSC (BNB + USDC), Algorand (ALGO + USDCa ASA `10458941`)

### 1. Config

```bash
cp config/config.example.json config/config.json
# Edit treasuries, vault, resources
```

Both runtimes read `config/config.json` (or `X402_CONFIG`).

### 2. Sidecar env (Rust, contract treasury sweep)

```bash
cp x402-module/.env.example x402-module/.env
# SWEEP_OPERATOR_PRIVATE_KEY = operator EOA with testnet BNB
```

### 3. Run sidecar (pick one)

**Rust (for local runs):**

```bash
cd x402-module
cargo run --release
# http://localhost:4000
```

**Node (reference):**

```bash
cd backend && npm install && npm start
# http://localhost:4000 — do not run Rust on the same port
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP port |
| `X402_CONFIG` | `../config/config.json` | Config path |
| `SWEEP_OPERATOR_PRIVATE_KEY` | — | Operator for `sweepAll` on contract treasuries |

### 4. Demo UI (optional)

```bash
cd frontend && npm install && npm run dev
# http://localhost:3000  (proxies /api → :4000)
# ?debug=1 — settlement debug panel
```

### 5. Deploy BSC contract treasury (testnet)

See [docs/DEPLOY_BSC_TREASURY.md](docs/DEPLOY_BSC_TREASURY.md). Summary:

- Deploy `X402Treasury(vault, operator)` on BSC testnet (Remix or Foundry).
- Set `networks[].treasury.type` = `"Contract"` and the deployed address in `config.json`.
- Fund **operator** with testnet BNB (not the treasury contract).

---

## Configuration (`config/`)

| File | Purpose |
|------|---------|
| `config.json` | Active config (treasury addresses, vault, resources) |
| `config.example.json` | Template |
| `config.schema.json` | JSON Schema |

| Section | Purpose |
|---------|---------|
| `networks[]` | Enabled chains, RPC, **treasury**, payment tokens |
| `settlement.vault` | Where liquidity should end up |
| `settlement.targetNetworkId` | Vault chain (e.g. `bsc`) |
| `settlement.mode` | `testnet_hybrid` or `mock` |
| `resources[]` | Sellable items and USD prices |
| `rates` | Demo USD → crypto conversion |

**BSC testnet USDC** in this repo: `0xBC745DB6F5E07f8F9f3E461b9850195e85EDb07f` (**18 decimals**).

**Algorand testnet USDC:** ASA `10458941` (6 decimals). Mainnet USDC is ASA `31566704`.

---

## API (v1)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/resources` | List resources |
| GET | `/api/networks` | Networks + treasuries + tokens |
| POST | `/api/payment-intent` | Create intent (402) |
| POST | `/api/payments/submit` | Submit tx hash (`202`) |
| GET | `/api/payments/:id/events` | SSE: `resource_unlocked` |
| GET | `/api/ledger` | Internal ledger |
| GET | `/admin/balances` | Treasury/vault balances (admin) |
| GET | `/admin/settlement/queue` | Pending settlement (admin) |
| POST | `/admin/settlement/sweep` | Manual sweep (contract treasury) |
| POST | `/admin/settlement/confirm` | Cross-chain payout proof (manual) |

Admin: header `X-Merchant-Admin: 1` or `Authorization: Bearer $ADMIN_TOKEN`.

Merchant integration: [INTEGRATOR.md](INTEGRATOR.md).

---

## Repository layout

```
config/              Module config (chains, treasury, vault, resources)
x402-module/         Rust sidecar (primary)
backend/             Node reference sidecar
frontend/            Demo checkout UI
contracts/           X402Treasury.sol + Foundry deploy
bridge-worker/       Experimental Algo→BSC bridge script
docs/                Settlement, deploy, bridge guides
scripts/             deploy-bsc-treasury.sh, settlement-demo.sh
```

---

## Further reading

| Doc | Topic |
|-----|--------|
| [INTEGRATOR.md](INTEGRATOR.md) | Merchant HTTP integration |
| [ROADMAP.md](ROADMAP.md) | Production blockers |
| [docs/SETTLEMENT_TESTNET.md](docs/SETTLEMENT_TESTNET.md) | Settlement modes and admin API |
| [docs/DEPLOY_BSC_TREASURY.md](docs/DEPLOY_BSC_TREASURY.md) | Contract treasury on BSC testnet |
| [docs/BRIDGE_ALGO_BSC.md](docs/BRIDGE_ALGO_BSC.md) | Bridge experiment + token mismatch |
| [chain_agnostic_x402_concept.md](chain_agnostic_x402_concept.md) | Long-form product concept (legacy filename) |

---

## Docker (local only)

```bash
docker compose up x402-node    # host :4000
docker compose up x402-rust    # host :4001
```

Run **one** sidecar at a time. Mount `./config/config.json`. Not intended as a production deployment recipe.


