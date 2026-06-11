# Production roadmap — x402 sidecar

**Текущий статус (честно):** chain-agnostic **x402 authorization prototype** / demo sidecar.  
**Не** production payment infrastructure. Settlement bridge (CCTP/CCIP) — **mock**.

| Область | Оценка |
|---------|--------|
| Идея / sidecar-модель | сильная |
| Архитектурный скелет | ок для PoC |
| Hackathon / demo | готов |
| Production-readiness | рано |

Подробный инженерный разбор зафиксирован здесь как **исполняемый план**. Агенты и люди: перед production-задачами читать **раздел «Критично»** первым.

---

## 🔴 КРИТИЧНО — без этого нельзя «реальному мерчанту»

Эти пункты — **блокеры**, не nice-to-have. Порядок ниже = рекомендуемая последовательность коммитов.

### 1. Persistent ledger (сейчас in-memory — главный red flag)

**Проблема:** рестарт = потеря состояния, нет горизонтального масштабирования, слабый audit trail, race conditions.

**Минимум:** SQLite (dev/MVP) → PostgreSQL (production target).

**Таблицы:**

- `payment_intents`
- `payment_routes`
- `payment_submissions`
- `payment_events`
- `resource_unlocks`
- `settlement_batches`

**Обязательно:** idempotency key + **unique constraints** на комбинацию  
`tx_hash + chain + recipient + amount + resource_id` (или эквивалентный consumption key).

**Acceptance:** рестарт sidecar не теряет intents/unlocks; два инстанса не double-unlock при shared DB.

---

### 2. Жёсткая привязка платежа к intent / resource (важнее всего в verify)

**Проблема:** проверка только `txHash` открывает replay / cross-resource substitution / temporal gaps (типовые дыры x402).

**Verify должен проверять всё:**

- [ ] tx exists
- [ ] tx finalized enough (receipt / confirmed round + policy confirmations)
- [ ] `chain == route.chain`
- [ ] `asset == route.asset`
- [ ] `recipient == treasury` (route recipient)
- [ ] `amount >= required amount`
- [ ] `sender == claimed payer` (если нужен payer binding)
- [ ] tx block/time **внутри окна intent** (`expires_at`, nonce window)
- [ ] tx **ещё не consumed** (consumption table)
- [ ] intent **не expired**
- [ ] `intent.resource_id ==` запрошенный resource

**Acceptance:** один proof нельзя применить к другому resource/intent; expired intent не unlock; consumed tx reject.

---

### 3. State machine + атомарные переходы (не набор разрозненных endpoints)

**Проблема:** сейчас статусы есть, но переходы не защищены как транзакции БД.

**Целевые состояния:**

```
intent_created
payment_submitted
payment_seen
payment_confirmed
payment_verified
resource_unlocked
settlement_pending
settlement_submitted
settlement_settled
settlement_failed
```

**Паттерн перехода (пример):**

```sql
UPDATE payment_intents
SET status = 'resource_unlocked'
WHERE id = $1
  AND status IN ('payment_verified')
RETURNING *;
```

Пустой `RETURNING` → уже unlock или неверное состояние (идемпотентный no-op / 409).

**Acceptance:** два concurrent `submit` на один intent → один unlock; повторный submit после unlock — идемпотентно.

---

### 4. Idempotency + tx consumption table

**Проблема:** один on-chain tx не должен открыть два ресурса или два intent.

**Нужно:**

- таблица `consumed_transactions` (или unique index на ledger)
- idempotency key на `POST /payments/submit` (header или body)
- повтор submit с тем же key → тот же результат, без дубля в ledger

**Acceptance:** integration test: same tx cannot unlock twice; different resource with same tx → reject.

---

### 5. Admin API изолировать и защитить

**Проблема:** `/api/ledger`, `/api/settle` в публичном `/api`; заголовок `X-Merchant-Admin: 1` — не auth.

**Нужно:**

- перенести в `/admin/ledger`, `/admin/settle` (или отдельный bind/port)
- auth: static admin token / JWT / HMAC из **env** (не хардкод заголовка)
- не документировать admin routes как публичные в INTEGRATOR.md

**Acceptance:** без токена → 401; публичный `/api` не отдаёт ledger.

---

### 6. CORS — не permissive

**Проблема:** Rust `CorsLayer::permissive()`, Node `cors()` без ограничений.

**Нужно:** allowlist origins, methods, headers; явная credentials policy из env/config.

**Acceptance:** запрос с чужого origin в production config → blocked.

---

### 7. Integration tests на payment flow

**Проблема:** нет автоматических тестов на дыры в verify/unlock.

**Минимальный набор:**

- [ ] valid payment unlocks **once**
- [ ] same tx cannot unlock twice
- [ ] wrong amount → reject
- [ ] wrong recipient → reject
- [ ] wrong asset / chain → reject
- [ ] expired intent → reject
- [ ] two concurrent submit → no double-unlock
- [ ] settlement worker idempotent

**Acceptance:** `cargo test` + (опционально) Node parity suite; CI gate.

---

## 🟡 Следующий инженерный слой (после критичного)

Не блокирует демо, но нужно для parity и эксплуатации:

| # | Задача | Зачем |
|---|--------|--------|
| 8 | **OpenAPI spec** одна на Node + Rust | parity, контракт для merchant |
| 9 | **curl happy path** без фронта | интеграторы, smoke, CI |
| 10 | **Честный статус в README** | «MVP testnet prototype; settlement mocked» |
| 11 | **Settlement layer** | реальный bridge proof вместо mock worker (отдельный эпик) |

---

## ✅ Уже сделано (demo / PoC)

- Sidecar-модель: config отдельно, Node reference + Rust target, frontend optional
- Authorization vs settlement разделены (instant unlock, settlement async)
- HTTP 402 intent → submit → SSE → `resource_unlocked`
- EVM verify: receipt + `status=1` + confirmations
- Algorand verify: algod + indexer
- INTEGRATOR.md: proxy, merchant-owned UI

---

## Work log

| Дата | Что |
|------|-----|
| 2026-06-09 | Зафиксирован production roadmap по внешнему инженерному ревью; критичные блокеры вынесены в раздел 🔴 |

**Следующий коммит (рекомендация):** п.1 SQLite ledger + п.4 consumption unique constraint + один integration test (same tx twice).
