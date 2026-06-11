# x402 Payment Module — Integrator Guide

Standalone payment sidecar for HTTP 402 flows. Mount behind your API reverse proxy; users pay on any configured chain; the module verifies on-chain and unlocks access immediately. Settlement to vault is asynchronous and does not block the user.

## Quick setup

1. Copy `config/config.example.json` → `config/config.json`
2. Set per-network `treasury.address` (where users pay) and `settlement.vault` (where liquidity is aggregated later)
3. Run the module (Node reference or Rust sidecar)
4. Proxy `/api/*` from your merchant app to the module

## Deployment options

### Node (reference)

```bash
cd backend
npm install
npm start
```

Default port: `4000`. Config hot-reloads on file change.

### Rust sidecar

```bash
cd x402-module
cargo run --release
```

Environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP port |
| `X402_CONFIG` | `../config/config.json` | Path to module config |

### Docker

```bash
docker compose up x402-node    # Node on :4000
docker compose up x402-rust    # Rust on :4001
```

Mount your `config.json` as a volume (see `docker-compose.yml`).

## Reverse proxy (nginx)

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:4000/api/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_buffering off;  # required for SSE
}

location /api/payments/ {
  proxy_pass http://127.0.0.1:4000/api/payments/;
  proxy_http_version 1.1;
  proxy_set_header Connection '';
  proxy_buffering off;
  chunked_transfer_encoding off;
}
```

## Integration patterns

### A — Reference checkout UI

Serve `frontend/` behind the same origin or proxy Vite dev server. The UI calls `/api/payment-intent`, signs a chain tx, then `POST /api/payments/submit` + `GET /api/payments/:intentId/events` (SSE).

### B — Merchant-owned UI (API only)

1. `POST /api/payment-intent` with `{ "resourceId": "..." }` → HTTP 402 + routes
2. User pays on-chain using route `recipient`, `amount`, `tokenAddress` / `assetId`
3. `POST /api/payments/submit` with `{ "intentId", "txHash", "routeId" }` → `202 Accepted`
4. `GET /api/payments/:intentId/events` (SSE) until `resource_unlocked`
5. Deliver your resource from `resourceContent` or your own datastore keyed by `intentId`

Legacy synchronous verify (no server poll):

```http
POST /api/verify-payment
```

Returns `access` + `resourceContent` without settlement details (use `X-Merchant-Admin: 1` for ledger/settlement).

### C — Webhook (optional, merchant-implemented)

After `resource_unlocked` on SSE, your BFF can `POST` to your app:

```http
POST https://merchant.example/unlock
X-x402-Secret: <shared-secret>
Content-Type: application/json

{
  "intentId": "pi_...",
  "resourceId": "api_key",
  "txHash": "0x..."
}
```

The module does not ship webhooks yet; listen to SSE or poll `/api/ledger` from your worker.

## API v1 summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/resources` | Sellable resources |
| GET | `/api/networks` | Networks + tokens |
| GET | `/api/config` | Networks + legacy `chains` |
| POST | `/api/payment-intent` | Create intent (402) |
| POST | `/api/payments/submit` | Submit tx for server-side verify |
| GET | `/api/payments/:intentId/events` | SSE payment status |
| POST | `/api/verify-payment` | Sync verify (legacy) |
| GET | `/api/ledger` | In-memory ledger (ops) |
| POST | `/api/settle` | Manual settlement trigger |

### SSE events (user stream)

```json
{ "type": "payment_submitted", "txHash": "0x..." }
{ "type": "payment_confirming", "confirmations": 0 }
{ "type": "payment_verified", "access": "unlocked" }
{ "type": "resource_unlocked", "resourceContent": { ... } }
{ "type": "payment_failed", "reason": "..." }
```

No `settlement_*` events on the user stream.

### Access vs settlement

User responses include:

```json
{
  "success": true,
  "access": { "status": "unlocked", "unlockedAt": "..." },
  "resourceContent": { ... }
}
```

Settlement status lives in `/api/ledger` and merchant admin responses only.

## Config schema

Validate against [`config/config.schema.json`](config/config.schema.json).

Key model:

- **treasury** (per network) — user payment destination (EOA for MVP)
- **vault** (`settlement.vault`) — aggregation target after CCTP/CCIP
- **ledger** — internal credits; `settlement: pending` → worker → `settled`

Settlement worker runs automatically every 30s (mock bridge proof in demo).

## Security notes

- Bind to localhost or private network; expose only via your proxy
- Do not expose `/api/ledger` publicly in production — planned move to `/admin/*` with token auth ([ROADMAP.md](ROADMAP.md) 🔴)
- Use HTTPS in production; SSE requires `proxy_buffering off`
- Rotate treasury keys; use contract treasury when volume requires auto-sweep
- **Production blockers** (persistent ledger, intent binding, replay protection, CORS, tests): [ROADMAP.md](ROADMAP.md)
