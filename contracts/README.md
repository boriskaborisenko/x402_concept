# x402 Treasury contracts

`X402Treasury` — EVM payment collector. Users send USDC via `transfer(treasury, amount)`. Relayer calls `sweepAll(token)` to move balance to vault.

## Deploy (BSC testnet)

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit 2>/dev/null || true

export VAULT=0xYourVaultEOA
export OPERATOR=0xYourRelayerEOA
export PRIVATE_KEY=0x...

forge script script/DeployTreasury.s.sol:DeployTreasury \
  --rpc-url bsc_testnet \
  --broadcast \
  -vvv
```

Put deployed address in `config/config.json`:

```json
"treasury": {
  "address": "0xDEPLOYED...",
  "type": "Contract",
  "contract": {
    "name": "X402Treasury",
    "version": "1",
    "sweepOperator": "0xOPERATOR..."
  }
}
```

Fund the **operator** wallet with testnet BNB for sweep gas.
