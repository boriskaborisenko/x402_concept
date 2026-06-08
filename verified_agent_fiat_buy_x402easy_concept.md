# Verified Agent Commerce через x402Easy, KYC-anchor и Fiat BUY Layer

## 0. Короткая суть

Идея: человек проходит KYC один раз в отдельном доверенном процессе. Результат KYC не раскрывает персональные данные в блокчейне, но фиксируется в виде onchain-верификационного якоря, например `verify_hash`.

Дальше человек или его агент может использовать `x402Easy` не только как механизм крипто-оплаты, а как универсальный слой платного вызова/намерения. Если действие требует реальной фиатной покупки, например забронировать отель, купить билет, оплатить подписку или сделать заказ, то агент не получает карту, CVV, банковский логин или другие фиатные credentials.

Вместо этого агент создаёт разрешённое намерение покупки. Отдельный финансовый слой, согласованный с банком, финтехом, платёжной организацией, card issuer, merchant-of-record или другой регулируемой структурой, проверяет KYC-статус, полномочия агента, лимиты, риск и затем сам выполняет реальный fiat BUY.

В блокчейне фиксируются контрольные точки:

```txt
VERIFY -> AGENT_AUTH -> INTENT -> CALL_x402Easy -> FIAT_BUY -> RECEIPT
```

Главный смысл:

> Агент не тратит деньги напрямую. Агент создаёт разрешённые purchase intents. Реальную фиатную покупку выполняет отдельный доверенный financial execution layer. Blockchain фиксирует проверяемые точки прозрачности.

---

## 1. Зачем это нужно

### 1.1 Проблема автономных агентов

AI-агенты становятся способными делать реальные действия:

- искать билеты;
- бронировать отели;
- покупать подписки;
- оплачивать API;
- заказывать услуги;
- резервировать товары;
- взаимодействовать с маркетплейсами;
- управлять рабочими процессами пользователя.

Но у этого есть серьёзная проблема: агенту опасно давать прямой доступ к фиату.

Плохая модель:

```txt
Пользователь даёт агенту карту / банк / логин / CVV
↓
Агент может купить что угодно
↓
Если агент ошибся, взломан или промпт-инжектнут — деньги под угрозой
```

Проблемы такой модели:

- агент может потратить больше, чем разрешено;
- агент может купить не то;
- агент может быть обманут внешним сайтом;
- credentials могут утечь;
- банк не понимает, кто именно инициировал действие;
- сложно доказать исходный intent;
- сложно разграничить разрешённые и запрещённые действия;
- сложно отозвать доступ гранулярно;
- сложно делать compliance, AML, disputes и refunds.

### 1.2 Проблема crypto-to-fiat

Если агент работает в крипто-среде, возникает другой тупик:

```txt
У пользователя есть crypto
↓
Реальный merchant хочет fiat/card payment
↓
Надо менять crypto на fiat
↓
Надо выводить на карту/банк
↓
Надо давать агенту фиатный доступ
```

Это ломает UX и безопасность.

Пользователь не должен каждый раз делать:

```txt
crypto -> exchange -> fiat -> bank/card -> merchant
```

Агент не должен получать:

```txt
card number
CVV
bank login
raw payment credentials
full fiat access
```

### 1.3 Проблема доверия к агентам

Финансовые структуры не будут просто так доверять автономным агентам. Им нужно понимать:

- кто стоит за агентом;
- прошёл ли человек KYC;
- какие полномочия выданы агенту;
- какие лимиты действуют;
- к какой категории относится покупка;
- можно ли отказать;
- можно ли отозвать полномочия;
- есть ли audit trail;
- кто несёт ответственность.

Поэтому нужен контур:

```txt
verified human
+
delegated agent permissions
+
policy checks
+
regulated fiat execution
+
onchain audit checkpoints
```

---

## 2. Главный концепт

Система строится вокруг идеи:

> KYC подтверждает человека. Policy ограничивает агента. x402Easy переносит намерение. Fiat layer выполняет покупку. Chain фиксирует доказательство.

В одной цепочке:

```txt
Human проходит KYC
↓
KYC provider создаёт verify_hash
↓
verify_hash фиксируется в onchain registry
↓
Human выдаёт агенту ограниченные полномочия
↓
Agent вызывает x402Easy с purchase intent
↓
Policy engine проверяет право агента
↓
Fiat execution layer делает реальную покупку за фиат
↓
Receipt/proof фиксируется в chain
```

Это не просто платёжный протокол. Это контур verified agent commerce.

---

## 3. Базовая формула

```txt
VERIFY
  proves that a human passed KYC

AGENT_AUTH
  proves that this human delegated limited authority to an agent

INTENT
  describes what the agent wants to do

x402Easy CALL
  carries the paid/actionable request

POLICY CHECK
  decides whether the action is allowed

FIAT BUY
  executes the real-world purchase through a trusted financial layer

RECEIPT
  proves that the buy happened, without leaking private data
```

Коротко:

```txt
Human verified.
Agent permissioned.
Intent submitted.
Fiat executed.
Proof anchored.
```

---

## 4. Роли участников

## 4.1 Human

Человек — это субъект ответственности.

Он:

- проходит KYC;
- получает `verify_hash`;
- создаёт или подключает агента;
- задаёт лимиты;
- выдаёт агенту разрешения;
- может отозвать разрешения;
- может подтверждать чувствительные операции;
- видит историю intents, buys и receipts.

Важно: человек не обязан каждый раз вручную платить. Он один раз задаёт правила, в рамках которых агент может действовать.

---

## 4.2 KYC Provider

KYC provider — это отдельный слой. Это может быть:

- банк;
- regulated fintech;
- KYC/AML provider;
- identity provider;
- government-compatible identity service;
- payment institution;
- issuer с правом проводить проверку.

Он делает offchain-проверку:

- документ;
- liveness;
- sanctions screening;
- AML/risk scoring;
- jurisdiction;
- age/eligibility;
- fraud risk;
- expiry/reverification.

На chain не кладутся персональные данные. На chain попадает только верификационный anchor.

---

## 4.3 Onchain Verification Registry

Это registry, где фиксируется факт проверки.

Он не должен хранить:

- имя;
- паспорт;
- адрес;
- email;
- телефон;
- номер карты;
- банковский счёт;
- сырые KYC-документы.

Он хранит проверяемые технические факты:

```txt
verify_hash
issuer_hash
status
scope
expiry
revocation_pointer
credential_type
```

Пример:

```json
{
  "verify_hash": "0xabc123...",
  "issuer_hash": "0xissuer456...",
  "status": "active",
  "scope": ["agent_payments", "fiat_buy", "travel_booking"],
  "expires_at": "2027-01-01T00:00:00Z",
  "revocation_registry": "0xregistry..."
}
```

---

## 4.4 Agent

Агент — это исполнитель намерений пользователя.

Он может:

- найти товар;
- сравнить варианты;
- подготовить покупку;
- вызвать API;
- создать purchase intent;
- запросить fiat execution;
- получить результат.

Но агент не должен иметь прямой доступ к деньгам.

Ключевая формула:

> Agent has permission, not possession.

Агент не получает:

```txt
card number
CVV
bank login
raw payment credentials
private banking tokens
full wallet control
```

Агент получает только право инициировать действия в рамках policy.

---

## 4.5 Policy Engine

Policy engine — это слой контроля полномочий.

Он проверяет:

- активен ли `verify_hash`;
- не отозван ли KYC;
- уполномочен ли агент;
- входит ли действие в разрешённый scope;
- не превышен ли лимит;
- разрешена ли категория;
- нормальный ли merchant;
- нужно ли подтверждение человека;
- есть ли признаки злоупотребления;
- не нарушены ли AML/fraud/risk rules.

Пример policy:

```json
{
  "agent_id_hash": "0xagent...",
  "human_verify_hash": "0xabc123...",
  "permissions": {
    "max_single_purchase_usd": 300,
    "daily_limit_usd": 1000,
    "monthly_limit_usd": 5000,
    "allowed_categories": ["travel", "software", "data_api"],
    "blocked_categories": ["gambling", "weapons", "adult", "crypto_cashout"],
    "requires_human_confirmation_above_usd": 300,
    "allowed_merchants": ["trusted_travel_provider", "approved_api_vendor"],
    "geo_restrictions": ["EU", "US", "UK"]
  },
  "expires_at": "2026-12-31T23:59:59Z",
  "status": "active"
}
```

---

## 4.6 x402Easy Layer

`x402Easy` здесь выполняет не только роль crypto payment layer.

Он становится универсальным call/intention layer:

```txt
хочу оплатить API
хочу получить ресурс
хочу забронировать отель
хочу купить билет
хочу оплатить подписку
хочу вызвать paid action
```

То есть `x402Easy` переносит структурированный intent от пользователя/агента к сервису/финансовому слою.

Простой crypto-flow:

```txt
request -> x402 payment -> proof -> unlock resource
```

Расширенный fiat-buy flow:

```txt
request -> x402Easy intent -> policy check -> fiat execution -> receipt proof
```

---

## 4.7 Fiat Execution Layer

Это тот самый дополнительный слой, согласованный с банком, финтехом или финансовой структурой.

Возможные реализации:

- банк;
- licensed payment institution;
- card issuer;
- payment processor;
- merchant-of-record;
- fintech wallet;
- escrow provider;
- travel payment processor;
- embedded finance partner;
- regulated fiat gateway.

Он:

- хранит или контролирует фиатные credentials;
- принимает purchase intent;
- проверяет policy;
- делает risk check;
- выполняет fiat BUY;
- возвращает confirmation;
- создаёт receipt;
- поддерживает refunds/disputes;
- может запросить human confirmation.

Главная защита:

> Фиатные credentials не покидают financial execution layer.

---

## 4.8 Merchant / Service Provider

Merchant — это внешний сервис, который получает реальную оплату.

Примеры:

- отель;
- авиакомпания;
- SaaS;
- API provider;
- маркетплейс;
- билетная система;
- delivery service;
- real-world vendor.

Merchant может вообще не знать, что покупку инициировал AI-агент. Для него это нормальная fiat/card/bank payment операция через доверенный financial layer.

---

## 4.9 Audit / Receipt Layer

Этот слой создаёт проверяемый след события.

Он фиксирует:

```txt
intent_hash
buy_hash
receipt_hash
status
amount
currency
merchant_hash
time
executor_hash
```

Но не раскрывает приватные детали покупки.

---

# 5. Главный flow

## 5.1 Полный сценарий

```txt
1. Human проходит KYC.
2. KYC provider создаёт verify_hash.
3. verify_hash фиксируется в onchain verification registry.
4. Human создаёт agent authorization policy.
5. Agent получает право действовать в рамках policy.
6. Agent находит нужный товар/услугу/API/resource.
7. Agent вызывает x402Easy с purchase intent.
8. x402Easy проверяет структуру intent.
9. Policy engine проверяет verify_hash, agent auth, limits, category и risk.
10. Fiat execution layer принимает intent.
11. Financial layer выполняет реальный fiat BUY.
12. Merchant подтверждает покупку/бронь/заказ.
13. Receipt hash фиксируется onchain.
14. Human и agent получают результат.
```

---

## 5.2 Flow в виде схемы

```txt
[Human]
   |
   | KYC
   v
[KYC Provider]
   |
   | creates verify_hash
   v
[Onchain Verification Registry]
   |
   | proves verified status
   v
[Agent Authorization Policy]
   |
   | limits/scope/permissions
   v
[Agent]
   |
   | call_x402Easy(intent)
   v
[x402Easy Intent Layer]
   |
   | structured paid/actionable request
   v
[Policy Engine]
   |
   | allow / reject / require confirmation
   v
[Fiat Execution Layer]
   |
   | real fiat BUY
   v
[Merchant]
   |
   | confirmation / booking / receipt
   v
[Receipt Proof Layer]
   |
   | anchor receipt_hash onchain
   v
[Human / Agent]
```

---

# 6. Пример: бронирование отеля

## 6.1 Условия

Пользователь хочет, чтобы агент мог бронировать отели, но безопасно.

Policy:

```txt
Категория: travel
Максимум за одну покупку: €300
Максимум в день: €1000
Только refundable bookings
Только approved travel merchants
Подтверждение человека нужно выше €300
```

## 6.2 Сценарий

```txt
1. Агент ищет отель в Мадриде.
2. Находит номер за €180.
3. Проверяет, что бронь refundable.
4. Создаёт intent:
   "reserve hotel room for €180"
5. x402Easy принимает intent.
6. Policy engine видит:
   - verify_hash активен;
   - агент авторизован;
   - категория travel разрешена;
   - сумма €180 ниже лимита;
   - merchant approved;
   - human confirmation не требуется.
7. Fiat execution layer делает card/bank payment или hold.
8. Отель подтверждает бронь.
9. Система создаёт receipt_hash.
10. receipt_hash фиксируется onchain.
11. Пользователь получает подтверждение.
```

## 6.3 Пример intent

```json
{
  "type": "fiat_buy_intent",
  "intent_id": "intent_001",
  "verify_hash": "0xverify...",
  "agent_id_hash": "0xagent...",
  "action": "reserve_hotel_room",
  "category": "travel",
  "merchant_hash": "0xmerchant...",
  "amount": {
    "currency": "EUR",
    "value": "180.00"
  },
  "constraints": {
    "city": "Madrid",
    "check_in": "2026-07-10",
    "check_out": "2026-07-12",
    "max_price_eur": "200.00",
    "refundable_only": true
  },
  "expires_at": "2026-06-08T22:00:00Z",
  "nonce": "random_nonce_123"
}
```

---

# 7. Что фиксируется в chain

## 7.1 Принцип

В chain фиксируются не данные, а доказуемые контрольные точки.

Нельзя превращать блокчейн в публичное хранилище персональных данных. Chain должен быть audit rail, а не база KYC/банковских данных.

---

## 7.2 VERIFY checkpoint

Фиксирует факт, что человек прошёл проверку у доверенного issuer.

```json
{
  "event_type": "VERIFY",
  "verify_hash": "0xverify...",
  "issuer_hash": "0xissuer...",
  "credential_type": "kyc_level_2",
  "scope_hash": "0xscope...",
  "status": "active",
  "expires_at": "2027-01-01T00:00:00Z",
  "revocation_pointer": "0xrevocation_registry..."
}
```

Что это означает:

```txt
Этот субъект проверен.
Проверка выдана таким-то issuer.
Проверка действует до такой-то даты.
Проверка имеет такой-то scope.
Проверку можно отозвать.
```

---

## 7.3 AGENT_AUTH checkpoint

Фиксирует, что verified human выдал агенту ограниченные полномочия.

```json
{
  "event_type": "AGENT_AUTH",
  "agent_id_hash": "0xagent...",
  "human_verify_hash": "0xverify...",
  "policy_hash": "0xpolicy...",
  "status": "active",
  "expires_at": "2026-12-31T23:59:59Z",
  "revocation_pointer": "0xagent_auth_revocation..."
}
```

Что это означает:

```txt
Этот агент имеет полномочия от этого verified human.
Полномочия описаны policy_hash.
Полномочия активны.
Их можно отозвать.
```

---

## 7.4 INTENT checkpoint

Фиксирует, что агент создал конкретное намерение.

```json
{
  "event_type": "INTENT",
  "intent_hash": "0xintent...",
  "agent_id_hash": "0xagent...",
  "human_verify_hash": "0xverify...",
  "merchant_hash": "0xmerchant...",
  "category_hash": "0xcategory...",
  "amount_hash": "0xamount...",
  "timestamp": "2026-06-08T21:30:00Z",
  "expires_at": "2026-06-08T22:00:00Z"
}
```

Что это означает:

```txt
Агент запросил конкретное действие.
Действие связано с verified human.
Действие имеет сумму/категорию/merchant, но детали скрыты hash-ами.
```

---

## 7.5 BUY checkpoint

Фиксирует, что fiat execution layer сделал реальную покупку.

```json
{
  "event_type": "BUY",
  "buy_hash": "0xbuy...",
  "intent_hash": "0xintent...",
  "fiat_executor_hash": "0xexecutor...",
  "merchant_hash": "0xmerchant...",
  "amount_currency_hash": "0xamount_currency...",
  "status": "completed",
  "timestamp": "2026-06-08T21:31:05Z"
}
```

Что это означает:

```txt
По этому intent была выполнена fiat-покупка.
Покупку выполнил такой-то trusted executor.
Merchant получил оплату или authorization/hold.
```

---

## 7.6 RECEIPT checkpoint

Фиксирует receipt/proof результата.

```json
{
  "event_type": "RECEIPT",
  "receipt_hash": "0xreceipt...",
  "buy_hash": "0xbuy...",
  "status": "issued",
  "refund_status": "none",
  "dispute_status": "none",
  "timestamp": "2026-06-08T21:31:20Z"
}
```

Что это означает:

```txt
По покупке есть receipt.
Receipt можно проверить offchain.
В chain не раскрываются личные данные и детали заказа.
```

---

# 8. Что нельзя хранить в chain

В публичный chain нельзя класть:

```txt
ФИО
паспорт
адрес
email
телефон
номер карты
CVV
bank account
bank login
raw KYC documents
raw receipt
hotel booking number
flight PNR
точный адрес доставки
медицинские покупки
чувствительные категории товара
детали личных поездок
```

Нужно хранить:

```txt
hash
commitment
attestation
proof
status
revocation pointer
issuer reference
policy hash
intent hash
receipt hash
```

---

# 9. Offchain storage

Все чувствительные данные должны храниться offchain.

Возможные варианты:

- encrypted user vault;
- regulated partner vault;
- bank-side storage;
- KYC provider storage;
- merchant receipt storage;
- user-controlled data wallet;
- DID/VC storage;
- selective disclosure credential store.

Chain хранит только проверяемый якорь.

---

# 10. Privacy model

## 10.1 Цель

Цель — доказать, что действие было разрешено и выполнено, не раскрывая лишнего.

Нужно уметь доказать:

```txt
human был verified
agent был authorized
intent был в рамках policy
fiat executor выполнил BUY
receipt существует
```

Но не раскрывать:

```txt
кто именно человек
какой паспорт
какая карта
какой номер бронирования
где человек будет жить
какой exact item куплен
```

---

## 10.2 Selective disclosure

В идеале разные стороны видят разный объём данных.

Human видит всё:

```txt
merchant
amount
booking details
receipt
agent action
```

Fiat executor видит то, что нужно для оплаты и compliance:

```txt
KYC reference
payment method
merchant
amount
risk data
```

Public chain видит только:

```txt
hashes
statuses
timestamps
issuer references
```

Merchant видит только покупателя/платёжные данные в рамках обычного merchant flow.

Agent видит только то, что нужно для задачи:

```txt
intent status
approved/rejected
confirmation
limited receipt reference
```

---

# 11. Security model

## 11.1 Основной принцип

Агент не должен иметь custody над фиатом.

Правильно:

```txt
agent -> intent -> policy -> financial execution
```

Неправильно:

```txt
agent -> raw card/bank access -> purchase
```

---

## 11.2 Threats

### Prompt injection

Внешний сайт может попытаться заставить агента купить что-то не то.

Защита:

- category allowlist;
- merchant allowlist;
- max amount;
- human confirmation для risk actions;
- intent signing;
- structured action schema;
- no raw free-form execution for purchases.

---

### Agent compromise

Агент может быть взломан.

Защита:

- agent permissions revocable;
- short-lived authorization;
- spending limits;
- merchant/category restrictions;
- daily/monthly caps;
- anomaly detection;
- human approval for unusual flows.

---

### Credential leakage

Фиатные credentials могут утечь, если агент их видит.

Защита:

- agent never sees credentials;
- credentials stay inside fiat execution layer;
- tokenized payment methods;
- scoped payment tokens;
- executor-side payment authorization.

---

### Replay attack

Старый intent могут попытаться использовать повторно.

Защита:

- nonce;
- expiry;
- one-time intent id;
- status transition lock;
- intent hash binding;
- idempotency keys.

---

### Intent substitution

Могут попытаться подменить merchant, amount или category.

Защита:

- signed intent;
- hash binding;
- canonical intent serialization;
- policy check over exact signed fields;
- receipt bound to intent_hash.

---

### Fake BUY proof

Кто-то может попытаться заявить, что покупка была выполнена.

Защита:

- only trusted fiat executor can emit BUY checkpoint;
- executor signature;
- receipt hash;
- merchant confirmation;
- dispute state.

---

### Privacy leakage

По onchain-событиям можно пытаться деанонимизировать пользователя.

Защита:

- hash/commitment only;
- batching;
- rotating identifiers;
- minimal public metadata;
- zero-knowledge proofs where useful;
- avoid exact amounts/categories in public form when sensitive.

---

# 12. State machine

## 12.1 Verification state

```txt
not_verified
pending
verified
expired
revoked
suspended
```

---

## 12.2 Agent authorization state

```txt
created
active
paused
expired
revoked
limited
```

---

## 12.3 Intent state

```txt
created
signed
submitted
policy_checking
approved
rejected
requires_human_confirmation
expired
cancelled
```

---

## 12.4 Fiat execution state

```txt
not_started
accepted_by_executor
payment_authorizing
authorized
captured
completed
failed
refunded
disputed
chargeback
```

---

## 12.5 Receipt state

```txt
not_issued
issued
anchored
updated
voided
```

---

# 13. Data model

## 13.1 VerifyCredential

```ts
type VerifyCredential = {
  verify_hash: string
  issuer_hash: string
  subject_commitment: string
  credential_type: "kyc" | "kyb" | "age" | "jurisdiction" | "risk_level"
  scopes: string[]
  issued_at: string
  expires_at: string
  status: "active" | "expired" | "revoked" | "suspended"
  revocation_pointer: string
}
```

---

## 13.2 AgentAuthorization

```ts
type AgentAuthorization = {
  authorization_id: string
  agent_id_hash: string
  human_verify_hash: string
  policy_hash: string
  issued_at: string
  expires_at: string
  status: "active" | "paused" | "revoked" | "expired"
}
```

---

## 13.3 Policy

```ts
type Policy = {
  max_single_purchase: Money
  daily_limit: Money
  monthly_limit: Money
  allowed_categories: string[]
  blocked_categories: string[]
  allowed_merchants?: string[]
  blocked_merchants?: string[]
  allowed_jurisdictions?: string[]
  requires_human_confirmation_above?: Money
  allowed_actions: string[]
  expires_at: string
}
```

---

## 13.4 PurchaseIntent

```ts
type PurchaseIntent = {
  intent_id: string
  intent_type: "crypto_payment" | "fiat_buy" | "reservation" | "subscription" | "api_access"
  human_verify_hash: string
  agent_id_hash?: string
  resource_or_action: string
  merchant_hash: string
  category: string
  amount: Money
  constraints: Record<string, unknown>
  nonce: string
  expires_at: string
  request_hash: string
  signature: string
}
```

---

## 13.5 FiatBuyExecution

```ts
type FiatBuyExecution = {
  buy_id: string
  buy_hash: string
  intent_hash: string
  fiat_executor_hash: string
  merchant_hash: string
  amount: Money
  status: "authorized" | "captured" | "completed" | "failed" | "refunded" | "disputed"
  created_at: string
  completed_at?: string
  receipt_hash?: string
}
```

---

## 13.6 ReceiptProof

```ts
type ReceiptProof = {
  receipt_hash: string
  buy_hash: string
  issuer_hash: string
  status: "issued" | "voided" | "updated"
  refund_status: "none" | "partial" | "full"
  dispute_status: "none" | "open" | "resolved"
  issued_at: string
}
```

---

# 14. API sketch

## 14.1 Create KYC anchor

```http
POST /verification/anchor
```

```json
{
  "issuer_signature": "0xsig...",
  "verify_hash": "0xverify...",
  "credential_type": "kyc_level_2",
  "scope": ["agent_payments", "fiat_buy"],
  "expires_at": "2027-01-01T00:00:00Z",
  "revocation_pointer": "0xrevocation..."
}
```

---

## 14.2 Create agent authorization

```http
POST /agent-authorizations
```

```json
{
  "human_verify_hash": "0xverify...",
  "agent_id_hash": "0xagent...",
  "policy": {
    "max_single_purchase": { "currency": "EUR", "value": "300.00" },
    "daily_limit": { "currency": "EUR", "value": "1000.00" },
    "allowed_categories": ["travel", "software", "data_api"],
    "blocked_categories": ["gambling", "weapons", "adult"],
    "requires_human_confirmation_above": { "currency": "EUR", "value": "300.00" }
  },
  "expires_at": "2026-12-31T23:59:59Z"
}
```

---

## 14.3 Submit x402Easy fiat intent

```http
POST /x402easy/intents
```

```json
{
  "intent_type": "fiat_buy",
  "human_verify_hash": "0xverify...",
  "agent_id_hash": "0xagent...",
  "action": "reserve_hotel_room",
  "merchant_hash": "0xmerchant...",
  "category": "travel",
  "amount": { "currency": "EUR", "value": "180.00" },
  "constraints": {
    "refundable_only": true,
    "max_price": "200.00"
  },
  "nonce": "nonce_123",
  "expires_at": "2026-06-08T22:00:00Z",
  "signature": "0xsig..."
}
```

---

## 14.4 Policy decision response

```json
{
  "intent_id": "intent_001",
  "decision": "approved",
  "reason": "within_policy",
  "requires_human_confirmation": false,
  "execution_layer": "fiat_executor_001"
}
```

Possible decisions:

```txt
approved
rejected
requires_human_confirmation
expired
insufficient_scope
limit_exceeded
merchant_blocked
category_blocked
kyc_revoked
agent_revoked
risk_review
```

---

## 14.5 Fiat execution response

```json
{
  "buy_id": "buy_001",
  "intent_id": "intent_001",
  "status": "completed",
  "merchant_confirmation": "confirmed",
  "receipt_hash": "0xreceipt...",
  "onchain_anchor_status": "pending"
}
```

---

# 15. Как x402Easy связан с обычным x402

Обычный x402 отвечает на вопрос:

```txt
Как API может потребовать оплату перед выдачей ресурса?
```

Расширенный `x402Easy` в этой концепции отвечает на вопрос:

```txt
Как API, агент или сервис может передать платное намерение, которое либо оплачивается crypto, либо исполняется через fiat execution layer?
```

То есть `x402Easy` может иметь два режима.

## 15.1 Crypto mode

```txt
user/agent pays crypto
↓
payment proof valid
↓
resource unlocks
```

## 15.2 Fiat BUY mode

```txt
agent submits intent
↓
verified human + policy checked
↓
fiat executor buys
↓
receipt anchored
```

Общий интерфейс похожий:

```txt
request
authorization
proof
receipt
```

Разница в том, кто исполняет value transfer.

---

# 16. Чем это отличается от “просто дать агенту карту”

## 16.1 Дать агенту карту

```txt
agent sees credentials
agent can overspend
weak category control
hard to revoke precisely
bad audit trail
high fraud risk
bank does not understand agent context
```

## 16.2 Эта модель

```txt
agent never sees credentials
agent has scoped permissions
policy enforces limits
financial layer executes payment
KYC is anchored
intent is signed
BUY is provable
receipt is anchored
revocation is possible
```

Коротко:

> Агент не получает деньги. Агент получает право просить о покупке в заданных рамках.

---

# 17. Что это даёт пользователю

Пользователь получает:

- возможность использовать агента для реальных покупок;
- отсутствие необходимости гонять crypto в fiat;
- отсутствие необходимости давать агенту карту;
- лимиты;
- категории;
- подтверждение рискованных покупок;
- прозрачный журнал действий;
- возможность отозвать агента;
- onchain proof событий;
- меньше риска от prompt injection и agent compromise.

---

# 18. Что это даёт банку/финтеху

Финансовый партнёр получает не хаотичный доступ агента к карте, а нормальную модель:

```txt
verified human
+
scoped agent authority
+
policy decision
+
structured intent
+
execution control
+
audit trail
```

Банк может:

- исполнять только разрешённые intents;
- отклонять suspicious actions;
- требовать human confirmation;
- применять AML/fraud rules;
- отзывать доступ;
- делать dispute/refund flow;
- видеть, что за агентом стоит verified human.

---

# 19. Что это даёт merchant

Merchant получает обычную оплату:

- card payment;
- bank payment;
- payment processor payment;
- merchant-of-record payment;
- hold/reservation;
- subscription setup.

Merchant не обязан поддерживать crypto.

Это важно: концепция не заставляет реальный мир переходить на crypto. Она использует crypto/onchain как слой прозрачности, а fiat layer как слой исполнения.

---

# 20. Что это даёт crypto/onchain слою

Crypto здесь не обязательно заменяет fiat.

Главная роль chain:

```txt
identity verification anchor
agent authorization anchor
intent audit
BUY checkpoint
receipt proof
revocation transparency
```

Крипта становится не только payment rail, но и audit/control rail.

Самый сильный тезис:

> Crypto is not used to replace fiat in every transaction. Crypto is used to make fiat agent-commerce auditable, programmable, and permissioned.

По-русски:

> Крипта тут не обязательно заменяет фиат. Она делает фиатные действия агентов проверяемыми, программируемыми и ограниченными политиками.

---

# 21. Новая точка прозрачности: BUY

В обычной крипто-логике прозрачны в основном:

```txt
ENTRY — деньги вошли
TRANSFER — деньги прошли
EXIT — деньги вышли
```

В этой модели добавляется новая точка:

```txt
BUY — реальная покупка была совершена
```

Это важно, потому что в агентной экономике вопрос не только в том, что деньги куда-то ушли. Вопрос:

```txt
какой агент инициировал действие?
от имени какого verified human?
была ли покупка разрешена?
какой policy её допустил?
какой financial layer её выполнил?
есть ли receipt?
```

Новая прозрачная цепочка:

```txt
VERIFY
↓
AGENT_AUTH
↓
INTENT
↓
POLICY_CHECK
↓
FIAT_BUY
↓
RECEIPT
```

---

# 22. Важные design principles

## 22.1 No raw fiat credentials for agents

Агент никогда не должен видеть карту, CVV, bank login или полноценный payment credential.

---

## 22.2 KYC offchain, proof onchain

Персональные данные остаются offchain. Chain хранит только проверяемый anchor.

---

## 22.3 Intent must be structured

Фиатные покупки нельзя запускать из свободного текста без структуры.

Плохо:

```txt
buy something good for my trip
```

Лучше:

```json
{
  "action": "reserve_hotel_room",
  "city": "Madrid",
  "max_price": "200.00",
  "currency": "EUR",
  "refundable_only": true,
  "merchant_hash": "0xmerchant..."
}
```

---

## 22.4 Policy before execution

Никакой fiat BUY не должен происходить до policy decision.

---

## 22.5 Receipt after execution

Любой BUY должен порождать receipt/proof.

---

## 22.6 Revocation must be first-class

Нужно уметь отозвать:

- KYC credential;
- agent authorization;
- policy;
- merchant permission;
- executor access.

---

## 22.7 Human confirmation for risky actions

Если действие рискованное, дорогое или необычное, система должна запросить подтверждение человека.

---

# 23. MVP-версия

## 23.1 Минимальный рабочий контур

MVP может быть таким:

```txt
1. Mock/offchain KYC provider выдаёт verify_hash.
2. verify_hash записывается в testnet registry.
3. Пользователь создаёт agent policy.
4. Агент создаёт structured fiat_buy_intent.
5. Policy engine проверяет intent.
6. Fiat execution layer пока mock/sandbox.
7. BUY event и receipt_hash фиксируются onchain.
8. UI показывает цепочку VERIFY -> INTENT -> BUY -> RECEIPT.
```

---

## 23.2 Что можно мокнуть

Для первой версии можно мокнуть:

- реальный KYC;
- реальный банк;
- реальный card processor;
- реальный merchant;
- реальный fiat settlement.

Но нельзя мокнуть архитектурную логику:

- verify_hash;
- policy;
- intent hash;
- status transitions;
- receipt hash;
- revocation;
- audit trail.

---

## 23.3 Что обязательно показать

Даже в MVP нужно показать:

```txt
human verified
agent authorized
intent created
policy approved/rejected
fiat buy simulated/executed
receipt anchored
```

---

# 24. Production roadmap

## Phase 1 — Verification + Policy

- KYC provider integration;
- verify_hash creation;
- onchain registry;
- revocation registry;
- agent authorization;
- policy engine.

## Phase 2 — x402Easy Intent Layer

- structured intents;
- signed intents;
- nonce/expiry;
- request hash binding;
- agent identity;
- merchant/category metadata.

## Phase 3 — Fiat Execution Sandbox

- sandbox issuer/payment processor;
- mock card/bank execution;
- receipt generation;
- refund/dispute simulation.

## Phase 4 — Real Financial Partner

- bank/fintech/payment institution integration;
- tokenized payment methods;
- real merchant payments;
- compliance workflow;
- fraud/risk monitoring.

## Phase 5 — Advanced Privacy

- selective disclosure;
- DID/VC integration;
- ZK credential proofs;
- private amount/category commitments;
- rotating identifiers.

## Phase 6 — Full Agent Commerce

- agent marketplaces;
- merchant categories;
- subscriptions;
- recurring authorization;
- cross-border flows;
- human-in-the-loop approvals;
- risk-based autonomy.

---

# 25. Open questions

## 25.1 KYC identity model

- Кто является trusted issuer?
- Один issuer или множество?
- Как доверять issuer-ам?
- Нужен ли issuer registry?
- Как делать revocation?
- Как часто нужно re-KYC?

## 25.2 Privacy

- Какие поля можно публиковать?
- Нужно ли скрывать amount?
- Нужно ли скрывать category?
- Нужны ли ZK-proofs?
- Как избежать deanonymization через timestamps?

## 25.3 Agent identity

- Что такое agent_id?
- Агент — это wallet, DID, public key, API key или service identity?
- Можно ли одному человеку иметь много агентов?
- Как отзывать конкретного агента?

## 25.4 Policy language

- Как описывать лимиты?
- Как описывать категории?
- Кто классифицирует merchant category?
- Как обрабатывать ambiguous purchases?
- Как делать human confirmation?

## 25.5 Fiat executor

- Кто держит credentials?
- Кто несёт ответственность за chargeback?
- Как делаются refunds?
- Кто является merchant-of-record?
- Как решать disputes?
- Какие лицензии нужны?

## 25.6 Legal/compliance

- Кто является payment facilitator?
- Кто обязан делать AML monitoring?
- Как трактуется агентная покупка юридически?
- Нужна ли explicit user consent per purchase?
- Какие jurisdiction-specific ограничения?

---

# 26. Критические риски

## 26.1 Compliance risk

Работа с KYC, fiat execution и агентными покупками может требовать лицензий, договоров и compliance-процессов.

Нельзя строить production без юридической проверки.

---

## 26.2 Privacy risk

Публичный chain может нечаянно раскрыть паттерны поведения пользователя.

Нужна минимизация metadata.

---

## 26.3 Agent abuse risk

Агенты могут спамить intents, пытаться обходить policy или использовать social engineering.

Нужны rate limits, risk scoring и confirmation flows.

---

## 26.4 Bank integration risk

Самая сложная часть — договориться с реальным financial execution layer.

Для MVP это можно симулировать, но для production нужен партнёр.

---

## 26.5 False sense of safety

Onchain proof не означает, что покупка была правильной, выгодной или желанной пользователем. Он только доказывает, что определённый процесс был пройден.

Нужны UX, confirmations, cancel/refund flows.

---

# 27. Почему это сильнее обычного x402

Обычный x402:

```txt
API требует оплату
юзер платит crypto
API отдаёт ресурс
```

Расширенная модель:

```txt
verified human существует как accountable subject
agent действует по delegated policy
x402Easy переносит paid/action intent
fiat layer делает реальную покупку
chain фиксирует verify/intent/buy/receipt
```

Это уже не только оплата API. Это infrastructure для agentic commerce.

---

# 28. Самое точное описание

> Это контур для verified agent commerce: человек проходит KYC, агент получает ограниченные полномочия, x402Easy переносит платный intent, финансовый слой исполняет fiat BUY, а blockchain фиксирует verify/intent/buy/receipt checkpoints.

---

# 29. Очень короткая версия для pitch

```txt
Human проходит KYC.
В chain появляется verify_hash.
Human выдаёт агенту ограниченные spending/action permissions.
Agent вызывает x402Easy с purchase intent.
Policy engine проверяет scope, лимиты и risk.
Fiat execution layer, а не агент, делает реальную покупку.
BUY и receipt фиксируются onchain как proof.

Итог:
- агент не получает карту;
- пользователь не гонит crypto в fiat;
- банк видит verified accountable human;
- merchant получает обычный fiat;
- chain даёт прозрачность VERIFY -> INTENT -> BUY -> RECEIPT.
```

---

# 30. One-liner

> Verified humans delegate limited purchase authority to agents; agents submit x402Easy intents; trusted fiat layers execute real-world buys; blockchain anchors the proofs.

По-русски:

> Verified human выдаёт агенту ограниченное право на покупки; агент отправляет intent через x402Easy; доверенный фиатный слой делает реальный BUY; blockchain фиксирует доказательства.

