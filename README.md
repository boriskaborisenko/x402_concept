# Chain-Agnostic x402

**Payment sidecar** для HTTP 402: отдельный модуль, который ставится **за** API любого сервиса (merchant). Пользователь платит из поддерживаемой сети → модуль верифицирует on-chain → **сразу** открывает доступ. Свод ликвидности в vault (CCTP / CCIP) идёт в фоне и не блокирует checkout.

Концепт: [chain_agnostic_x402_concept.md](chain_agnostic_x402_concept.md)  
Интеграция для merchant: [INTEGRATOR.md](INTEGRATOR.md)

## Что это за репозиторий

```
                    ┌─────────────────────┐
  User / Wallet ──► │  frontend/ (demo)   │  опциональный reference UI
                    └──────────┬──────────┘
                               │ /api
                    ┌──────────▼──────────┐
  Merchant API ───► │  x402 payment module │  ← ключевая «приблуда»
  (ваш сервер)      │  Node или Rust       │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         BSC / Algo       ledger            settlement
         verify           (in-memory)       → vault
```

| Часть | Роль |
|-------|------|
| **`config/`** | Единый конфиг **модуля**: сети, treasury, токены, vault, ресурсы, цены. Не живёт в merchant-backend. |
| **`backend/`** | **Reference implementation** на Node — тот же HTTP API, что и Rust. Удобно для разработки и демо. |
| **`x402-module/`** | **Целевой sidecar** на Rust — тот же контракт, для production/deploy. |
| **`frontend/`** | Демо-checkout (connect → pay → unlock). Merchant может использовать свой UI и только API модуля. |

Node **не** «промежуточный сервер merchant'а». Это **вторая реализация payment-модуля**. Merchant поднимает **один** sidecar (Node **или** Rust), проксирует `/api/payments` (или весь `/api` модуля) и отдаёт свой контент после `resource_unlocked`.

### Node и Rust — не оба на :4000

Это **не два сервиса, которые работают вместе**. Это **две замены друг другу** с одним и тем же API:

| Режим | Что запускать | Порт |
|-------|----------------|------|
| Разработка / демо | `backend` **или** `x402-module` | **один** процесс на `:4000` |
| Сравнить Node vs Rust | оба, но на **разных** портах | Node `:4000`, Rust `:4001` |
| Production | обычно только Rust sidecar | `:4000` (или за nginx) |

Два процесса **не могут** слушать один порт → `Address already in use (os error 48)` — ожидаемо, если Node уже на 4000 и ты запускаешь Rust туда же.

**Перед `cargo run`:** останови Node (`Ctrl+C` / `kill`), **или** `PORT=4001 cargo run` и направь фронт на нужный порт.

## Быстрый старт

### Требования

- Node.js 18+
- Rust 1.75+ (опционально)
- Testnet: BSC (BNB + USDC) и/или Algorand (**ALGO** на комиссии + **USDCa** ASA `10458941` на оплату)

### 1. Конфиг модуля

```bash
cp config/config.example.json config/config.json
# treasury, networks, resources — см. config/
```

Оба runtime читают **`config/config.json`** (или путь из `X402_CONFIG`).

### 2. Payment module — выбери **один** runtime

**Node (reference):**

```bash
cd backend
npm install
npm start    # :4000 — не запускай Rust на том же порту
```

**Rust (sidecar):** см. шаг 4 — сначала останови Node, если он уже на `:4000`.

API модуля: `http://localhost:4000` (какой бы runtime ни был запущен).

### 3. Demo UI (опционально)

```bash
cd frontend
npm install
npm run dev
```

UI: `http://localhost:3000` (прокси `/api` → `:4000`).  
`?debug=1` — показать payment intent JSON.

### 4. Payment module — Rust

**`--release` не обязателен**, но рекомендуется для реального запуска:

| Команда | Когда |
|---------|--------|
| `cargo run` | Локальная разработка: быстрая сборка, медленнее runtime, больше бинарник |
| `cargo run --release` | Демо / staging / production: оптимизированный бинарник, дольше первая сборка |
| `cargo build --release` + `./target/release/x402-module` | То же, без пересборки при каждом старте |

```bash
cd x402-module
cargo run              # dev
cargo run --release    # recommended для «как в проде»
```

Переменные:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP port |
| `X402_CONFIG` | `../config/config.json` | Путь к конфигу модуля |

## Поток оплаты

```
POST /api/payment-intent     →  HTTP 402 + routes
On-chain payment
POST /api/payments/submit    →  202, сервер поллит chain
GET  /api/payments/:id/events → SSE → resource_unlocked
[background] settlement worker → vault (mock CCTP/CCIP)
```

**Authorization** (unlock сразу) и **settlement** (async vault) разделены.

## Конфигурация (`config/`)

| Файл | Назначение |
|------|------------|
| `config/config.json` | Рабочий конфиг модуля |
| `config/config.example.json` | Шаблон |
| `config/config.schema.json` | JSON Schema v1 |

| Секция | Назначение |
|--------|------------|
| `networks[]` | Сети и токены оплаты |
| `networks[].treasury` | Куда пользователь шлёт платёж |
| `settlement.vault` | Куда сводится ликвидность после bridge |
| `rates` | USD → crypto (demo) |
| `resources` | Платные ресурсы и цены |

Node перечитывает конфиг при изменении файла (без рестарта). Rust — перезапуск процесса.

USDC BSC testnet `0xBC745…` — **18 decimals** (проверено on-chain).

## API v1

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/resources` | Resources |
| GET | `/api/networks` | Networks + tokens |
| GET | `/api/config` | Networks + legacy `chains` |
| POST | `/api/payment-intent` | Create intent (402) |
| POST | `/api/payments/submit` | Submit tx (`202`) |
| GET | `/api/payments/:intentId/events` | SSE |
| POST | `/api/verify-payment` | Sync verify (legacy) |
| GET | `/api/ledger` | Ledger (ops) |
| POST | `/api/settle` | Manual settlement |

Подробнее: [INTEGRATOR.md](INTEGRATOR.md).

## Структура репозитория

```
config/                 # конфиг payment-модуля (сети, treasury, vault, resources)
backend/                # Node reference implementation
x402-module/            # Rust sidecar (тот же API)
frontend/               # optional demo checkout UI
docker-compose.yml
INTEGRATOR.md
```

## Docker

Для **сравнения** реализаций в compose разные порты снаружи:

```bash
docker compose up x402-node     # :4000
docker compose up x402-rust     # :4001  (внутри контейнера тоже 4000, снаружи 4001)
```

В бою поднимают **один** сервис, не оба. Volume: `./config/config.json`.

## Troubleshooting

### `Address already in use (os error 48)` при `cargo run`

На порту **4000** уже что-то слушает — чаще всего **Node** (`cd backend && npm start`) или предыдущий `x402-module`.

**Вариант A** — только Rust на 4000:

```bash
# узнать, кто держит порт
lsof -i:4000
# остановить (подставь PID из вывода)
kill <PID>
cd x402-module && cargo run
```

**Вариант B** — Node и Rust параллельно:

```bash
# Node оставить на 4000, Rust на 4001
cd x402-module && PORT=4001 cargo run
```

Фронт по умолчанию проксирует на `:4000` — для Rust на 4001 поменяй `proxy` в `frontend/vite.config.ts` или останови Node.

### Algorand: `underflow on subtracting … from sender amount …`

Кошелёк пытается отправить больше USDCa, чем есть на балансе. Пример: ресурс **$0.25** → `250000` micro-USDCa (6 decimals); если в кошельке `16000` micro = **0.016 USDCa**, транзакция отклонится до подписи (после обновления фронта — с понятным текстом).

**Что сделать:** пополнить testnet USDCa (ASA `10458941`) и оставить ~0.1 ALGO на fee; или выбрать более дешёвый ресурс для проверки.
