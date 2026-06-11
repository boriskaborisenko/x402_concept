# Agent context — x402_concept

**Читай этот файл первым.** Не пересканивай весь репо без нужды.

## Продукт

Chain-agnostic **payment sidecar** (HTTP 402): intent → on-chain pay → verify → **instant unlock**. Settlement в vault — фон, не блокирует UX.

```
frontend (demo)  →  x402-module (Rust)  →  chains
merchant API     ↘  proxy /api
```

## Что трогать по умолчанию

| Путь | Когда смотреть |
|------|----------------|
| **`config/config.json`** | Сети, treasury, vault, ресурсы, цены |
| **`x402-module/`** | Backend/sidecar — **основная реализация** |
| **`frontend/`** | Demo checkout UI |
| **`INTEGRATOR.md`** | Proxy, docker, merchant integration |
| **`README.md`** | Quick start для человека |

## НЕ трогать / НЕ читать без явной задачи

| Путь | Почему |
|------|--------|
| **`backend/`** | Node = **legacy reference**. Мы **не используем** в dev/prod. Не открывать, не рефакторить, не чинить — только если пользователь **явно** просит Node. |
| **`chain_agnostic_x402_concept.md`** | Длинный концепт, не для каждого фикса |
| **`.cursor/plans/*`** | План; не редактировать |
| **`frontend/dist/`** | Артефакты сборки |

## Runtime

- **Один** sidecar на порту **4000**: Rust **или** Node, не оба.
- Rust: `cd x402-module && cargo run` (или `--release`)
- Env: `X402_CONFIG=../config/config.json`, `PORT=4000`
- Фронт: `cd frontend && npm run dev` → proxy `/api` → `:4000`

## Конфиг

- Канон: **`config/config.json`** (не `backend/config.json` — удалён)
- Schema: `config/config.schema.json`
- USDC BSC testnet `0xBC745…` — **18 decimals** (on-chain)
- Algorand checkout ASA: **`10458941`** (Circle testnet USDC). В кошельке «USDC» может быть **другой ASA** — смотреть Asset ID.
- Algorand explorer в конфиге: **Lora** `https://lora.algokit.io/testnet/transaction/` (не Pera — wallet-agnostic).

## API v1 (Rust = контракт)

```
POST /api/payment-intent          → 402
POST /api/payments/submit         → 202
GET  /api/payments/:id/events     → SSE
POST /api/verify-payment          → legacy sync
GET  /api/resources, /api/config, /api/networks
```

SSE user events: `payment_submitted`, `payment_confirming`, `payment_verified`, `resource_unlocked`, `payment_failed`. **Без** `settlement_*` в user stream.

User response: `access` + `resourceContent`. Settlement — ledger / `X-Merchant-Admin: 1`.

## Frontend pitfalls (уже встречались)

1. **Оба кошелька** (WC BSC + Pera): `usePaymentWallet` отдаёт `bsc`, если EVM connected → неверная сеть. Disconnect лишний перед pay.
2. **NaN / BigInt**: `route.decimals` или `route.amount` битые → нормализация в `frontend/src/lib/payments/routeAmount.ts`.
3. **Algorand underflow 250000 vs 16000**: платим ASA `10458941`, в кошельке USDC на **другом** ASA или другой account.
4. **`?debug=1`** — payment intent JSON в UI.
5. **Кнопка «Processing…» зависает**: SSE через Vite proxy буферизуется → в dev EventSource идёт на `http://localhost:4000` напрямую (`client.ts`). SSE подключается **до** `submit`. Fallback: `verify-payment` через 12s.
6. **Algo verify**: algod `/v2/transactions/{id}` только **pending**; после confirm → **indexer** (`facilitator.indexerUrl`). Rust `adapters/algo.rs` — algod then indexer, поле `tx-type` (не только `type`).
7. **Кошельки Algo**: Pera, Defly, Exodus, WC — всё через `@txnlab/use-wallet`, один код оплаты.
8. **Тайминги**: Rust poller 1.5s (`payment_watcher.rs`); фронт fallback verify 4s / hard fail 90s — fallback не задержка, а страховка если SSE пропустил событие.

## Структура Rust

```
x402-module/src/
  main.rs, config.rs, state.rs
  routes.rs, authorization.rs, payment_watcher.rs, settlement.rs
  adapters/evm.rs, adapters/algo.rs
```

## Docker

- `docker compose up x402-rust` → host **4001** (Node service в compose — legacy, не default)

## Правила для агента

1. Не читать `backend/` если задача про sidecar/UI/config.
2. Не создавать коммиты без запроса.
3. Не редактировать plan-файлы.
4. Минимальный diff; не раздувать код.
5. После правок в `frontend/` или `x402-module/` — сборка/compile по смыслу.

## Changelog (кратко)

- Config перенесён в `config/`
- Node deprecated; Rust = primary sidecar
- SSE вместо frontend retry
- Light UI, Stack Sans Notch, `CheckoutSuccess`
