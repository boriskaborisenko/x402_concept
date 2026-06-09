# x402Easy Minimal Multichain Payment Prototype

This is the first minimal implementation step for the x402Easy concept:

- React frontend
- Node.js backend
- WalletConnect-based EVM wallet connection
- BSC Testnet payment flow
- Algorand Testnet payment flow
- payment receivers moved into backend config
- backend creates payment intents and verifies submitted transactions at a basic level

The current goal is not CCIP/CCTP yet. The current goal is:

> connect wallet → detect chain/type → create payment intent → make testnet payment → submit tx id/hash to backend → backend verifies enough to mark paid.

## Project structure

```txt
frontend/              React + Vite app
backend/               Node.js + Express API
backend/src/config/    payment receiver config
backend/src/services/  chain verification helpers
```

## Setup

Install dependencies:

```bash
npm install
```

Create backend env:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add real testnet receiving addresses:

```env
BSC_TESTNET_RECEIVER=0xYourBscTestnetReceiver
ALGORAND_TESTNET_RECEIVER=YourAlgorandTestnetReceiver
```

The frontend already contains your WalletConnect project id in `frontend/src/config/chains.ts`:

```txt
b3ff0b5fe2c59275fc24684910bab667
```

You can override it with:

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

## Run locally

```bash
npm run dev
```

Frontend:

```txt
http://localhost:5173
```

Backend:

```txt
http://localhost:8787
```

## How payment flow works

### BSC Testnet

1. User connects EVM wallet through WalletConnect / injected wallet.
2. App requires BSC Testnet chain id `97`.
3. Backend creates a payment intent.
4. Frontend sends native test BNB to configured receiver.
5. Frontend submits transaction hash to backend.
6. Backend reads the tx receipt and tx data through BSC testnet RPC.
7. Backend checks:
   - tx success
   - destination address equals configured receiver
   - value is at least required amount

### Algorand Testnet

1. User connects Pera Wallet.
2. Backend creates a payment intent.
3. Frontend builds a native ALGO payment transaction.
4. Pera signs and sends it.
5. Frontend submits tx id to backend.
6. Backend checks the transaction through Algonode indexer.
7. Backend checks:
   - receiver equals configured receiver
   - amount is at least required amount
   - transaction is confirmed

## Important limitations

This is intentionally minimal.

Current version does **not** yet include:

- production x402 protocol implementation
- CCTP settlement
- CCIP messages
- USDC/ASA payments
- real KYC / verify_hash layer
- fiat BUY execution layer
- persistent database
- replay-safe production-grade payment intent storage
- authentication
- refunds
- compliance logic

Current backend keeps payment intents in memory. Restarting backend clears them.

## Next steps

Recommended next steps:

1. Add real receiver addresses in `backend/.env`.
2. Test BSC Testnet native payment.
3. Test Algorand Testnet native payment.
4. Replace in-memory intent storage with SQLite/Postgres.
5. Add `verify_hash` field to intents.
6. Add agent policy checks.
7. Add USDC support.
8. Add CCTP/CCIP settlement experiments.
9. Add vault settlement abstraction.

## Payment config

Payment receivers are intentionally centralized in:

```txt
backend/src/config/paymentConfig.js
```

This is the first step toward routing all chain-specific payment acceptance through config instead of hardcoding addresses in the frontend.
