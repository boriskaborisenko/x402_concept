# Chain-Agnostic x402: концепт универсальной оплаты с любого чейна

## 0. Короткая суть

Идея:

> **x402 не должен означать “оплати в конкретной сети”.  
> x402 должен означать: “вот цена за ресурс; заплати откуда тебе удобно”.**

Пользователь не должен думать:

- какую сеть принимает API;
- какой токен нужен;
- где лежит USDC;
- есть ли газ;
- надо ли делать bridge;
- сколько ждать cross-chain settlement;
- что такое CCTP, CCIP, attestation, domain, lane и так далее.

Пользователь должен думать только:

> **“Я хочу получить ресурс. У меня где-то есть деньги. Я нажимаю Pay.”**

А система должна сама решить:

- где у пользователя есть средства;
- какой маршрут оплаты дешевле;
- какой маршрут быстрее;
- какой маршрут безопаснее;
- можно ли открыть доступ сразу;
- как потом рассчитаться с продавцом/API;
- нужен ли CCTP;
- нужен ли CCIP;
- нужен ли внутренний баланс;
- нужен ли batch settlement;
- как обработать refund/fail/retry.

Главная формула:

```txt
User pays from anywhere.
Service unlocks instantly.
Merchant settles anywhere.
```

Или по-русски:

```txt
Пользователь платит с любой поддерживаемой сети.
Сервис открывается сразу.
Продавец получает расчёт в удобной ему сети позже.
```

---

## 1. Проблема

Обычный crypto checkout часто устроен так:

```txt
Этот сервис принимает оплату в Polygon USDC.
У тебя USDC на Base.
Сначала сделай bridge.
Потом переключи сеть.
Потом подпиши approve.
Потом оплати.
Потом подожди подтверждение.
```

Это плохой UX.

Особенно если речь про x402, API, AI agents, платные HTTP-ресурсы, микроплатежи или programmatic commerce.

Пользователь или агент не должен заниматься bridge-менеджментом. Он хочет получить ресурс.

Плохая модель:

```txt
API диктует сеть.
Пользователь подстраивается.
```

Правильная модель:

```txt
API выставляет цену.
Пользователь платит из того места, где у него уже есть деньги.
Система маршрутизирует value.
```

---

## 2. Что такое x402 в этом концепте

x402 — это слой, который превращает HTTP `402 Payment Required` в реальный payment flow.

Упрощённо:

```txt
1. Client запрашивает ресурс.
2. Server отвечает: 402 Payment Required.
3. Client получает требования к оплате.
4. Client делает/подписывает платёж.
5. Server/facilitator проверяет платёж.
6. Server отдаёт ресурс.
```

Важная мысль:

> **x402 — это не обязательно “одна сеть”.  
> x402 — это HTTP-native payment interface.**

В этом концепте x402 становится верхним протокольным слоем:

```txt
HTTP resource requires payment
↓
Payment requirements are created
↓
User pays through the best available chain/asset route
↓
Payment proof unlocks resource
```

То есть x402 отвечает на вопрос:

> **“Как HTTP-сервис сообщает, что нужен платёж, и как клиент доказывает, что платёж выполнен?”**

Но x402 сам по себе не обязан решать весь мультичейн. Для этого нужен отдельный routing/settlement layer.

---

## 3. Главный продуктовый принцип

### Не заставлять пользователя платить на chain продавца

Плохой UX:

```txt
Merchant accepts Arbitrum USDC.
You have Base USDC.
Please bridge Base → Arbitrum first.
```

Хороший UX:

```txt
Pay $0.25 from Base USDC.
Access unlocked instantly.
Merchant settlement handled later.
```

### Не показывать пользователю cross-chain кухню

Пользователь не должен видеть:

```txt
CCTP domain
Circle attestation
CCIP lane
bridge route
merchant destination chain
settlement batch
nonce internals
relay transaction
gas sponsorship mechanics
```

Пользователь должен видеть:

```txt
Pay $0.25
Recommended: Base USDC
```

Или ещё проще:

```txt
Pay
```

---

## 4. Ключевое разделение: authorization и settlement

Это самая важная архитектурная мысль.

Есть два разных процесса:

```txt
1. Access authorization
2. Merchant settlement
```

Их нельзя смешивать.

---

### 4.1 Access authorization

Это процесс, который отвечает на вопрос:

> **Можно ли отдать пользователю ресурс прямо сейчас?**

Для этого надо проверить:

```txt
платёж существует
платёж валиден
сумма правильная
токен правильный
сеть поддерживается
получатель правильный
payment proof не использовался раньше
payment proof привязан к конкретному request/resource
платёж не истёк
nonce не использован
```

Если всё хорошо:

```txt
access_status = unlocked
resource is delivered
```

---

### 4.2 Merchant settlement

Это процесс, который отвечает на вопрос:

> **Как и куда продавец получит деньги?**

Это может быть:

```txt
сразу на тот же chain
внутренний merchant balance
daily payout
weekly payout
payout after threshold
CCTP settlement
CCIP-triggered action
manual withdrawal
refund reserve
```

То есть оплата пользователя и расчёт с продавцом — не одно и то же.

Правильный flow:

```txt
User payment verified
↓
Resource unlocked immediately
↓
Merchant balance credited internally
↓
Settlement happens later
```

Плохой flow:

```txt
User payment verified
↓
Wait for cross-chain transfer
↓
Wait for destination chain finality
↓
Wait for merchant settlement
↓
Only then unlock resource
```

Так делать нельзя, потому что это превращает быстрый HTTP payment в медленный bridge UX.

---

## 5. Целевая пользовательская логика

Пользователь заходит к API/сервису:

```txt
Resource price: $0.25
```

Система смотрит кошельки/сети пользователя:

```txt
Base:      10.00 USDC
Solana:     5.00 USDC
Arbitrum:   2.00 USDC
Polygon:    0.10 USDC
Algorand:  20.00 USDCa
Ethereum:  50.00 USDC, but gas is expensive
```

Система показывает:

```txt
Recommended:
Base USDC — low fee, enough balance, instant unlock

Other options:
Solana USDC — fast
Arbitrum USDC — low fee
Algorand USDCa — supported via adapter

Not recommended:
Ethereum USDC — fee too high for $0.25 payment
```

Пользователь выбирает или просто жмёт:

```txt
Pay
```

Дальше:

```txt
payment executed on source chain
↓
payment proof verified
↓
resource unlocked
↓
merchant credited
↓
settlement handled later
```

---

## 6. Что является настоящим ядром системы

Не bridge.  
Не CCTP.  
Не CCIP.  
Не конкретный wallet.  
Не конкретная сеть.

Ядро — это:

> **Payment Intent Router**

То есть слой, который понимает:

```txt
пользователь хочет купить конкретный ресурс
ресурс стоит конкретную сумму
у пользователя есть средства в разных местах
продавец хочет получить value
система выбирает лучший путь оплаты
```

Общая формула:

```txt
x402 = “ресурс требует оплату”
Payment Intent = “пользователь хочет оплатить этот ресурс”
Inventory Engine = “где у пользователя есть средства”
Route Selector = “как лучше оплатить”
Payment Adapter = “как выполнить платёж в конкретной сети”
Ledger = “кому сколько зачесть”
Settlement Engine = “куда и когда вывести”
```

---

## 7. Архитектура верхнего уровня

```txt
┌───────────────────────────────────────┐
│ User / Agent                           │
│ wants paid resource                    │
└───────────────────┬───────────────────┘
                    │
                    v
┌───────────────────────────────────────┐
│ API / Merchant                         │
│ returns HTTP 402 Payment Required      │
└───────────────────┬───────────────────┘
                    │
                    v
┌───────────────────────────────────────┐
│ Payment Intent Layer                   │
│ creates payment intent for resource    │
└───────────────────┬───────────────────┘
                    │
                    v
┌───────────────────────────────────────┐
│ Wallet Inventory Engine                │
│ checks chains, tokens, balances, gas    │
└───────────────────┬───────────────────┘
                    │
                    v
┌───────────────────────────────────────┐
│ Route Selector                         │
│ chooses cheapest/fastest/safest route   │
└───────────────────┬───────────────────┘
                    │
                    v
┌───────────────────────────────────────┐
│ Payment Execution Adapter              │
│ x402 / EVM / Solana / Algorand / etc.   │
└───────────────────┬───────────────────┘
                    │
                    v
┌───────────────────────────────────────┐
│ Payment Verifier                       │
│ verifies proof, nonce, request binding  │
└───────────────────┬───────────────────┘
                    │
                    v
┌───────────────────────────────────────┐
│ Access Unlock                          │
│ delivers paid resource immediately      │
└───────────────────┬───────────────────┘
                    │
                    v
┌───────────────────────────────────────┐
│ Internal Ledger                        │
│ credits merchant balance                │
└───────────────────┬───────────────────┘
                    │
                    v
┌───────────────────────────────────────┐
│ Settlement Engine                      │
│ direct payout / CCTP / CCIP / batch      │
└───────────────────────────────────────┘
```

---

## 8. Payment Intent

Payment Intent — центральная сущность.

Она описывает не “транзакцию”, а намерение:

> **“Оплатить конкретный ресурс на конкретных условиях.”**

Пример:

```ts
type PaymentIntent = {
  id: string

  resource: {
    method: "GET" | "POST"
    url: string
    resourceId: string
    requestHash: string
    responsePolicy: "unlock_after_valid_payment"
  }

  merchant: {
    id: string
    recipient: string
    settlementPreference: {
      asset: "USDC"
      chain: "base" | "arbitrum" | "polygon" | "solana" | "algorand"
      payoutMode: "instant" | "daily_batch" | "weekly_batch" | "manual"
    }
  }

  price: {
    amount: string
    currency: "USD"
    acceptedAssets: string[]
  }

  constraints: {
    expiresAt: string
    nonce: string
    maxNetworkFee?: string
    maxSlippage?: string
    allowBridge?: boolean
    allowGasless?: boolean
  }

  status:
    | "created"
    | "route_selected"
    | "payment_pending"
    | "payment_verified"
    | "access_unlocked"
    | "credited"
    | "settlement_pending"
    | "settled"
    | "failed"
    | "refunded"
}
```

---

## 9. Payment Route

Route — это конкретный способ выполнить intent.

```ts
type PaymentRoute = {
  id: string

  source: {
    chain: string
    asset: string
    wallet: string
  }

  destination: {
    mode: "merchant_direct" | "router_treasury" | "escrow" | "internal_balance"
    chain?: string
    asset?: string
    address?: string
  }

  execution: {
    mode:
      | "direct_x402"
      | "evm_eip3009"
      | "evm_permit2"
      | "native_transfer"
      | "solana_transfer"
      | "algorand_asa_transfer"
      | "facilitator_relay"
      | "internal_balance"
      | "bridge_then_pay"
    requiresUserGas: boolean
    requiresApproval: boolean
    supportsInstantUnlock: boolean
  }

  estimate: {
    amount: string
    networkFee: string
    serviceFee: string
    totalCost: string
    estimatedTimeMs: number
  }

  risk: {
    score: number
    reason: string[]
  }

  score: number
}
```

---

## 10. Route scoring

Система должна сама выбрать лучший способ оплаты.

Пример scoring logic:

```ts
function scoreRoute(route: PaymentRoute) {
  return weightedSum({
    userHasEnoughBalance: 40,
    lowNetworkFee: 20,
    fastConfirmation: 15,
    noApprovalNeeded: 10,
    supportsInstantUnlock: 10,
    lowOperationalRisk: 5
  })
}
```

Но для пользователя результат должен быть простой:

```txt
Recommended: Base USDC
Reason: enough balance, low fee, instant unlock
```

Не надо показывать route scoring как technical dashboard, если пользователь сам этого не открыл.

---

## 11. Chain adapters

Чтобы система была chain-agnostic, нужен не один универсальный платёжный метод, а набор адаптеров.

```txt
Payment Intent Layer
        |
        v
Adapter Interface
        |
        |-- EVM x402 adapter
        |-- EVM EIP-3009 adapter
        |-- EVM Permit2 adapter
        |-- Solana USDC adapter
        |-- Algorand ASA adapter
        |-- Lightning adapter
        |-- Cosmos/IBC adapter
        |-- Sui/Aptos/Near adapter
```

Каждый adapter должен уметь:

```txt
estimate payment
create payment payload
execute or relay payment
verify payment proof
normalize result
report failure
support refund if possible
```

Общий interface:

```ts
interface PaymentAdapter {
  chain: string

  getBalances(wallet: string): Promise<Balance[]>

  estimate(intent: PaymentIntent, wallet: string): Promise<PaymentRoute[]>

  createPaymentPayload(
    intent: PaymentIntent,
    route: PaymentRoute
  ): Promise<PaymentPayload>

  verifyPayment(
    intent: PaymentIntent,
    proof: PaymentProof
  ): Promise<VerificationResult>

  refund?(
    intent: PaymentIntent,
    payment: VerifiedPayment
  ): Promise<RefundResult>
}
```

---

## 12. Роль facilitator

Facilitator — это слой, который может помогать серверу:

```txt
проверять платежи
сабмитить транзакции
абстрагировать blockchain-инфраструктуру
поддерживать gasless или relayed flows
снижать сложность для merchant/API
```

В x402 facilitator особенно важен, потому что API не должен обязательно сам быть полноценным blockchain backend.

В мультичейн-концепте facilitator может быть не один:

```txt
EVM facilitator
Solana facilitator
Algorand facilitator
internal facilitator
third-party facilitator
```

Но сверху это должно выглядеть одинаково:

```txt
verify(paymentIntent, paymentProof) -> valid/invalid
```

---

## 13. Роль CCTP

CCTP нужен не для того, чтобы пользователь “делал bridge”.

CCTP нужен как backend settlement rail для USDC.

Правильная роль CCTP:

```txt
User paid USDC on Chain A
↓
Merchant wants USDC on Chain B
↓
System credits merchant internally
↓
Later system settles via CCTP Chain A → Chain B
```

То есть:

```txt
CCTP = native USDC movement between supported chains
```

CCTP особенно хорошо подходит для:

```txt
USDC settlement
merchant payouts
treasury rebalancing
batch settlement
moving liquidity between supported chains
```

Важно:

> **CCTP не должен стоять на critical path пользовательского unlock.**

Пользователь не должен ждать:

```txt
burn
attestation
mint
destination finality
```

Пользователь должен ждать только валидность своей оплаты на source chain.

---

## 14. Роль CCIP

CCIP нужен не просто для “перегнать деньги”.

CCIP полезен, если надо передать cross-chain сообщение или выполнить действие на destination chain.

Примеры:

```txt
активировать подписку в контракте на другой сети
выпустить onchain receipt
обновить entitlement
записать paymentId/requestId в merchant contract
передать metadata вместе с settlement
вызвать callback на destination chain
```

То есть:

```txt
CCTP = move USDC
CCIP = move message/action/state, sometimes with tokens
```

Пример:

```txt
User pays on Base
↓
Access unlocks
↓
Ledger credits merchant
↓
CCIP message to Polygon merchant contract:
  paymentId
  requestHash
  amount
  payer
  timestamp
↓
Merchant contract records entitlement/receipt
```

---

## 15. Internal ledger

Без внутреннего ledger система развалится.

Ledger — это источник правды между:

```txt
HTTP request
payment proof
access unlock
merchant credit
settlement
refund
dispute
retry
```

Минимальная запись:

```ts
type LedgerEntry = {
  paymentIntentId: string
  requestHash: string
  resourceId: string

  payer: {
    wallet: string
    chain: string
  }

  merchant: {
    id: string
    settlementChain: string
    settlementAsset: string
  }

  payment: {
    sourceChain: string
    sourceAsset: string
    sourceTx?: string
    amount: string
    fee?: string
    proofHash: string
  }

  status: {
    payment: "pending" | "verified" | "failed"
    access: "locked" | "unlocked" | "failed"
    credit: "not_credited" | "credited"
    settlement: "not_needed" | "pending" | "sent" | "settled" | "failed"
    refund: "none" | "pending" | "sent" | "failed"
  }

  security: {
    nonce: string
    expiresAt: string
    used: boolean
  }

  timestamps: {
    createdAt: string
    paidAt?: string
    unlockedAt?: string
    creditedAt?: string
    settledAt?: string
  }
}
```

---

## 16. Почему нужен ledger, а не “проверили tx и всё”

Потому что будут edge cases:

```txt
платёж прошёл, но генерация ресурса упала
ресурс отдали, но settlement завис
пользователь заплатил дважды
пользователь пытается переиспользовать proof
пользователь заплатил за дешёвый ресурс и подставил proof к дорогому
merchant поменял settlement chain
CCTP settlement задержался
CCIP message failed
source transaction reorged
destination payout failed
refund невозможен на выбранном rail
```

Ledger позволяет не гадать, а знать:

```txt
что произошло
что надо повторить
что надо вернуть
что надо показать пользователю
что надо показать merchant
что можно считать settled
```

---

## 17. Security: request-bound payment

Платёж обязательно должен быть привязан к конкретному запросу.

Нельзя принимать proof вида:

```txt
payer paid $0.25
```

Надо принимать proof вида:

```txt
payer paid $0.25
for merchant X
for resource Y
for request hash Z
before expiry T
with nonce N
on chain C
using asset A
```

Минимальный binding:

```txt
payment_intent_id
merchant_id
resource_id
request_hash
price
asset
chain
recipient
nonce
expiry
payer
```

Иначе возможны атаки:

```txt
replay
cross-resource substitution
underpayment
paid-but-denied
unpaid-service
race condition
double unlock
merchant substitution
price substitution
```

---

## 18. Replay protection

Каждый payment proof должен использоваться только один раз.

Нужно хранить:

```txt
nonce
payment_intent_id
proof_hash
source_tx_hash
payer
resource_id
```

При повторной попытке:

```txt
if proof_hash already used:
    reject
```

Для параллельных запросов нужен locking:

```txt
lock(payment_intent_id)
verify payment
mark proof as used
unlock resource
release lock
```

Иначе два одновременных запроса могут попытаться открыть один ресурс или несколько ресурсов одним proof.

---

## 19. Atomicity problem

В идеальном мире:

```txt
платёж и выдача ресурса атомарны
```

На практике:

```txt
HTTP response
blockchain settlement
offchain generation
merchant accounting
```

живут в разных слоях.

Поэтому нужна не абсолютная atomicity, а чёткая state machine:

```txt
created
↓
route_selected
↓
payment_submitted
↓
payment_verified
↓
access_unlocked
↓
merchant_credited
↓
settlement_pending
↓
settlement_sent
↓
settled
```

Если что-то падает:

```txt
payment_verified but access_failed -> retry delivery or refund
access_unlocked but settlement_failed -> retry settlement, merchant still credited
payment_failed -> no access
duplicate_payment -> credit or refund according to policy
```

---

## 20. State machine

```txt
CREATED
  |
  v
ROUTE_SELECTED
  |
  v
PAYMENT_PENDING
  |
  | payment invalid
  v
FAILED

PAYMENT_PENDING
  |
  | payment valid
  v
PAYMENT_VERIFIED
  |
  v
ACCESS_UNLOCKED
  |
  v
MERCHANT_CREDITED
  |
  v
SETTLEMENT_PENDING
  |
  | direct payout / cctp / ccip / batch
  v
SETTLED
```

Failure branches:

```txt
PAYMENT_VERIFIED -> ACCESS_FAILED -> RETRY_DELIVERY / REFUND_PENDING
SETTLEMENT_PENDING -> SETTLEMENT_FAILED -> RETRY_SETTLEMENT / MANUAL_REVIEW
DUPLICATE_PAYMENT -> CREDIT_EXTRA / REFUND_PENDING
EXPIRED_INTENT -> REJECT_PAYMENT / REFUND_IF_RECEIVED
```

---

## 21. UX для пользователя

### 21.1 Default UX

```txt
Pay $0.25

Recommended:
Base USDC

[Pay]
```

### 21.2 Expanded UX

```txt
Pay $0.25

Recommended:
Base USDC
- low fee
- enough balance
- instant access

Other options:
Solana USDC
Arbitrum USDC
Algorand USDCa

Not recommended:
Ethereum USDC
- network fee too high for this payment
```

### 21.3 Advanced UX

```txt
Route details:
Source chain: Base
Asset: USDC
Execution: gasless EIP-3009 via facilitator
Access: instant after verification
Merchant settlement: internal credit, daily batch payout
```

По умолчанию advanced не показывать.

---

## 22. UX для merchant/API

Merchant не должен думать о том, откуда платит пользователь.

Merchant должен видеть:

```txt
Received: $0.25
Resource: /answer
Status: access unlocked
Merchant credit: +$0.25
Settlement: pending daily payout
Preferred settlement: USDC on Arbitrum
```

Merchant settings:

```txt
Settlement asset: USDC
Settlement chain: Base / Arbitrum / Polygon / Solana / etc.
Payout frequency: instant / daily / weekly / manual
Minimum payout: $10 / $50 / custom
Refund reserve: 0% / 1% / custom
Risk mode: conservative / balanced / aggressive
```

---

## 23. UX для AI agents

Для AI agents это ещё важнее, чем для людей.

Agent не должен размышлять:

```txt
этот API принимает Base?
а у меня USDC на Solana
надо ли bridge?
какой gas?
```

Agent должен иметь policy:

```json
{
  "maxSpendPerRequest": "0.25",
  "maxSpendPerDay": "10.00",
  "preferredAssets": ["USDC"],
  "allowChains": ["base", "arbitrum", "solana", "polygon"],
  "avoidChains": ["ethereum"],
  "allowBridge": false,
  "requireInstantUnlock": true
}
```

И команда:

```txt
Buy this resource using the cheapest valid route.
```

Система сама выбирает route.

---

## 24. Что нельзя делать

### 24.1 Нельзя заставлять пользователя ждать settlement

Плохо:

```txt
payment on Base
wait CCTP to Arbitrum
wait merchant receive funds
unlock resource
```

Хорошо:

```txt
payment on Base verified
unlock resource
settle merchant later
```

---

### 24.2 Нельзя считать “любой чейн” буквально в v1

Правильнее:

```txt
любой поддерживаемый chain через adapter model
```

Сначала:

```txt
Base
Arbitrum
Polygon
Solana
```

Потом:

```txt
Optimism
Avalanche
Ethereum
Algorand
Cosmos
Sui
Aptos
Near
Lightning
```

---

### 24.3 Нельзя делать bridge terminal

Это не должно выглядеть как:

```txt
Select bridge
Select source chain
Select destination chain
Select token
Set slippage
Wait 12 minutes
```

Это должно выглядеть как:

```txt
Pay $0.25
```

---

### 24.4 Нельзя строить без accounting

Если нет ledger, невозможно нормально обработать:

```txt
refunds
duplicates
disputes
failed settlements
partial failures
double-spend attempts
race conditions
```

---

## 25. Почему batch settlement важен

Микроплатежи не должны каждый раз превращаться в отдельный cross-chain settlement.

Плохо:

```txt
1000 payments × $0.01
1000 cross-chain transfers
```

Хорошо:

```txt
1000 payments × $0.01
merchant balance = $10
1 batch settlement
```

Batch settlement уменьшает:

```txt
fees
latency
operational noise
failure surface
treasury fragmentation
```

---

## 26. Treasury model

Система может держать ликвидность на нескольких сетях.

Пример:

```txt
Base treasury
Arbitrum treasury
Polygon treasury
Solana treasury
Algorand treasury
```

Если пользователь платит на Base, а merchant хочет Solana:

```txt
merchant balance credited
payout may come from Solana treasury
treasury later rebalances via CCTP/other rail
```

Это ещё лучше для UX, потому что merchant payout может быть быстрым без ожидания конкретного user payment moving cross-chain.

---

## 27. Settlement modes

### 27.1 Direct settlement

```txt
User pays directly to merchant recipient on same chain.
```

Плюсы:

```txt
простота
меньше custody
меньше accounting obligations
```

Минусы:

```txt
merchant должен поддерживать source chain
сложнее refunds
сложнее fees
не всегда возможно instant UX
```

---

### 27.2 Router treasury + internal credit

```txt
User pays router/escrow/treasury.
Merchant gets internal balance.
Settlement later.
```

Плюсы:

```txt
лучший UX
batch settlement
merchant does not care about user chain
easier cross-chain payout
```

Минусы:

```txt
custody/regulatory/accounting complexity
нужна безопасность treasury
нужна политика withdrawal/refund
```

---

### 27.3 Non-custodial escrow

```txt
User pays smart contract escrow.
Merchant can claim.
Router coordinates proof/unlock.
```

Плюсы:

```txt
меньше trust
прозрачность
onchain accounting
```

Минусы:

```txt
сложнее мультичейн
дороже
хуже микроплатежи
сложнее быстрый UX
```

---

### 27.4 Hybrid

На практике лучший вариант может быть hybrid:

```txt
small payments -> internal credit
large payments -> direct/escrow
high-risk merchants -> delayed settlement
trusted merchants -> instant credit
```

---

## 28. Risk modes

### Conservative mode

```txt
только final payments
нет bridge на critical path
нет high-risk chains
unlock only after strong confirmation
```

### Balanced mode

```txt
low-risk chains unlock quickly
ledger absorbs small settlement delays
batch settlement
```

### Aggressive mode

```txt
instant unlock after mempool/soft confirmation
small amounts only
higher fraud/race risk
```

Для x402/API payments чаще всего нужен balanced mode.

---

## 29. Gas problem

Пользователь может иметь USDC, но не иметь gas.

Пример:

```txt
Base: 10 USDC, 0 ETH
```

Если платёж требует gas от пользователя — UX сломан.

Поэтому нужны:

```txt
gasless transfer
facilitator relay
EIP-3009 where available
Permit2 with sponsored approval where possible
account abstraction
paymaster
internal balance
```

Для пользователя это должно выглядеть не как “you need ETH for gas”, а как:

```txt
Pay with USDC
```

---

## 30. Approvals problem

Для ERC-20 платежей плохой UX:

```txt
Approve
Wait
Pay
Wait
```

Лучше:

```txt
sign authorization
facilitator submits transaction
```

Где возможно, использовать flows без отдельного approve.

Если approve нужен, UI должен честно показать:

```txt
This route requires one-time approval.
Recommended alternative: Base USDC gasless.
```

---

## 31. Refund policy

Refund должен быть частью дизайна с первого дня.

Cases:

```txt
payment succeeded, resource delivery failed
duplicate payment
expired intent but payment arrived
wrong amount
settlement failed
merchant rejected
user overpaid
```

Возможные policies:

```txt
automatic refund to source chain
credit to internal user balance
manual review for high value
merchant debit if already credited
refund reserve
```

Refund object:

```ts
type Refund = {
  paymentIntentId: string
  reason:
    | "delivery_failed"
    | "duplicate_payment"
    | "expired_intent"
    | "overpayment"
    | "manual"
  destination: {
    chain: string
    asset: string
    address: string
  }
  amount: string
  status: "pending" | "sent" | "failed" | "manual_review"
}
```

---

## 32. Pricing

Ресурс может быть priced в USD, а оплата может быть разными assets.

Лучший v1:

```txt
price denominated in USD
accepted asset: USDC
```

Почему:

```txt
простая бухгалтерия
нет slippage
нет DEX
нет volatile token risk
легко объяснить пользователю
легко зачесть merchant balance
```

Позже можно добавить:

```txt
USDT
EURC
native tokens
swap-to-USDC
loyalty credits
```

Но v1 лучше держать на USDC.

---

## 33. “Любой чейн” через tiers

Технически “любой чейн” нельзя делать сразу. Надо делать tiers.

### Tier 1: direct payment support

```txt
Base
Arbitrum
Polygon
Solana
```

Критерии:

```txt
дешёвые fees
USDC liquidity
хороший wallet support
быстрая finality
подходят для микроплатежей
```

### Tier 2: settlement support

```txt
Ethereum
Optimism
Avalanche
Linea
Unichain
```

Критерии:

```txt
merchant payout
treasury rebalancing
CCTP support where available
```

### Tier 3: adapter support

```txt
Algorand
Cosmos
Sui
Aptos
Near
Bitcoin Lightning
```

Критерии:

```txt
custom payment adapter
custom proof verification
possibly no native x402 SDK
```

Важно:

> Снаружи UX одинаковый. Внутри adapters разные.

---

## 34. Minimal viable architecture

Самый разумный v1:

```txt
1. x402-style payment intent
2. EVM support for Base/Arbitrum/Polygon
3. USDC only
4. Wallet inventory
5. Route recommendation
6. Payment verification
7. Request-bound proof
8. Internal merchant balance
9. Manual or daily payout
10. Basic refund handling
```

Не надо в v1:

```txt
полный CCTP automation
полный CCIP action layer
DEX swaps
любой токен
любой chain
сложные subscriptions
onchain receipts
```

---

## 35. v2

```txt
1. Solana adapter
2. CCTP batch settlement for USDC
3. Merchant settlement preferences
4. Payout thresholds
5. Better route scoring
6. Gasless/sponsored flows
7. API keys for merchants
8. Agent spending policies
```

---

## 36. v3

```txt
1. CCIP messages/actions
2. Onchain receipts
3. Subscription activation
4. Entitlements on destination chain
5. Multi-merchant settlement
6. Risk scoring
7. Treasury rebalancing
8. Dispute/refund dashboard
```

---

## 37. v4

```txt
1. Multi-asset payments
2. Swap-to-USDC
3. Internal user balance
4. Agent wallet policies
5. Payment channels for high-frequency usage
6. Enterprise merchant controls
7. Compliance/risk controls
```

---

## 38. Example full flow

```txt
User requests POST /answer
↓
API responds 402 Payment Required:
  price: $0.25
  resource: /answer
  request_hash: abc123
  accepted_value: USDC
↓
Payment layer creates intent:
  intent_id: pi_001
  nonce: n_001
  expires_at: 2026-06-08T20:00:00Z
↓
Wallet inventory:
  Base USDC: 10
  Arbitrum USDC: 2
  Solana USDC: 5
↓
Route selector:
  recommended = Base USDC
↓
User signs/executes payment
↓
Facilitator/payment verifier checks:
  amount
  token
  recipient
  nonce
  expiry
  request_hash
  proof not used
↓
Payment verified
↓
API unlocks resource
↓
Ledger:
  user paid $0.25
  merchant credited $0.25
  settlement pending
↓
Later:
  merchant daily payout to Arbitrum USDC
  settlement done via CCTP or treasury payout
```

---

## 39. Example API response

```json
{
  "error": "payment_required",
  "status": 402,
  "payment_intent": {
    "id": "pi_001",
    "amount": "0.25",
    "currency": "USD",
    "accepted_assets": ["USDC"],
    "resource_id": "answer_generation",
    "request_hash": "0xabc123",
    "expires_at": "2026-06-08T20:00:00Z",
    "routes_url": "/payment-intents/pi_001/routes"
  }
}
```

Routes:

```json
{
  "payment_intent_id": "pi_001",
  "recommended_route": "route_base_usdc",
  "routes": [
    {
      "id": "route_base_usdc",
      "source_chain": "base",
      "asset": "USDC",
      "amount": "0.25",
      "estimated_fee": "0.001",
      "execution": "evm_eip3009",
      "instant_unlock": true,
      "recommended": true
    },
    {
      "id": "route_solana_usdc",
      "source_chain": "solana",
      "asset": "USDC",
      "amount": "0.25",
      "estimated_fee": "0.0001",
      "execution": "solana_transfer",
      "instant_unlock": true,
      "recommended": false
    }
  ]
}
```

---

## 40. Merchant settlement example

Merchant settings:

```json
{
  "merchant_id": "m_001",
  "settlement": {
    "asset": "USDC",
    "chain": "arbitrum",
    "address": "0xMerchant",
    "frequency": "daily",
    "minimum_payout": "10.00"
  }
}
```

Ledger after user payments:

```json
{
  "merchant_id": "m_001",
  "balance": {
    "currency": "USD",
    "available": "42.75",
    "pending_settlement": "42.75"
  },
  "next_payout": {
    "chain": "arbitrum",
    "asset": "USDC",
    "estimated_amount": "42.75",
    "method": "cctp_or_treasury_payout"
  }
}
```

---

## 41. What the system should hide

Hide from normal users:

```txt
bridge mechanics
settlement routing
merchant destination chain
CCTP attestation
CCIP message
treasury rebalancing
internal fee optimization
gas sponsorship internals
```

Show only if advanced/debug mode:

```txt
source chain
asset
estimated fee
payment status
transaction hash
```

---

## 42. What the system must never hide

Always be clear about:

```txt
amount charged
asset used
source wallet
network fee if paid by user
service fee if any
refund policy
whether access is immediate
whether a route requires approval
```

---

## 43. Why this matters for agentic commerce

For human users, this removes crypto pain.

For AI agents, this is even more important.

An agent cannot efficiently operate if every API has a different payment network requirement.

Agent-friendly model:

```txt
Agent has budget.
Agent has allowed wallets/chains.
Agent requests paid resource.
Payment layer chooses route.
Agent receives result.
```

This turns x402 from:

```txt
pay this specific way
```

into:

```txt
pay according to policy, from available funds, for this resource
```

That is the difference between a crypto payment button and real payment infrastructure for autonomous agents.

---

## 44. Main design principles

```txt
1. User should not care what chain merchant accepts.
2. Merchant should not care what chain user pays from.
3. Access unlock should not wait for cross-chain settlement.
4. Payment proof must be bound to request/resource/price/nonce.
5. Ledger is the source of truth.
6. CCTP is settlement plumbing, not user checkout.
7. CCIP is for cross-chain action/state, not basic UX.
8. Batch settlement is mandatory for micropayments.
9. Gas/approval friction must be minimized.
10. “Any chain” means adapter architecture, not magic.
```

---

## 45. One-sentence concept

> **A chain-agnostic x402 payment layer where users pay from any supported chain, APIs unlock resources immediately after valid payment, and merchants receive settlement later on their preferred chain.**

---

## 46. Even shorter

```txt
x402 says: this resource costs money.
Router says: pay from wherever you already have money.
Ledger says: merchant is credited.
Settlement says: merchant gets funds where they want.
```

---

## 47. Sources / factual anchors

These are the technical facts this concept relies on:

1. x402 has explicit network/token support concepts and can be extended to additional networks.
2. x402 facilitator acts as a verification/settlement helper layer for servers.
3. Coinbase x402 documentation describes EVM support for ERC-20 tokens, including EIP-3009 for USDC/EURC and Permit2 for generic ERC-20 flows.
4. Circle CCTP moves native USDC across supported chains using a burn-and-mint model instead of wrapped liquidity pools.
5. Chainlink CCIP supports cross-chain token transfers, messaging, and programmable token transfers.
6. Recent x402 security research highlights the importance of request binding, replay protection, atomicity/state synchronization, and careful HTTP/payment-layer handling.

---

## 48. Open questions

Before implementation, these decisions must be made:

```txt
1. Custodial or non-custodial merchant balance?
2. Which chains are v1 direct payment support?
3. Is USDC the only v1 asset?
4. Which facilitator model is used?
5. Does the router sponsor gas?
6. How are refunds handled?
7. What confirmation depth is enough for instant unlock?
8. Are merchants paid instantly or in batches?
9. Does merchant settlement happen from treasury or from exact user funds?
10. What risk limits apply to agents?
11. How are duplicate payments handled?
12. How are failed resource deliveries handled?
13. How are pricing changes handled?
14. How is request_hash computed?
15. What metadata is safe to expose to facilitators?
```

---

## 49. Final mental model

Do not think about this as:

```txt
x402 + bridge
```

Think about it as:

```txt
x402 + payment intent routing + internal ledger + async settlement
```

The bridge/CCTP/CCIP part is only infrastructure behind the scenes.

The real concept is:

> **Make paid HTTP resources chain-agnostic for the user.**

