#!/usr/bin/env node
/**
 * Bridge USDC from Algorand → BSC vault via Allbridge Core.
 * Usage: npm run bridge:algo-to-bsc -- --amount 250000 [--vault 0x...]
 *
 * NOT BNB — stablecoin only. BNB is gas on BSC (operator), not bridged.
 */
import 'dotenv/config'
import algosdk from 'algosdk'
import {
  AllbridgeCoreSdk,
  ChainSymbol,
  Messenger,
  nodeRpcUrlsDefault,
} from '@allbridge/bridge-core-sdk'

// x402 demo checkout ASA (config/config.json)
const X402_ALGO_USDCA_ASA = '10458941'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

async function main() {
  const amount = BigInt(arg('--amount', '0'))
  const vault = arg('--vault', process.env.BSC_VAULT_ADDRESS)
  const mnemonic = process.env.ALG_TREASURY_MNEMONIC
  const algUrl = process.env.ALG_PROVIDER_URL || 'https://testnet-api.algonode.cloud'

  if (!amount || amount <= 0n) {
    console.error('Usage: --amount <micro-USDC, 6 decimals>  e.g. 250000 = $0.25')
    process.exit(1)
  }
  if (!vault?.startsWith('0x')) {
    console.error('Set BSC_VAULT_ADDRESS or --vault 0x...')
    process.exit(1)
  }
  if (!mnemonic) {
    console.error('Set ALG_TREASURY_MNEMONIC (controls Algo treasury with USDC)')
    process.exit(1)
  }

  const account = algosdk.mnemonicToSecretKey(mnemonic)
  const fromAddress = account.addr.toString()
  console.log('Algo treasury:', fromAddress)
  console.log('BSC vault:', vault)
  console.log('Amount (6 decimals):', amount.toString())

  const sdk = new AllbridgeCoreSdk({
    ...nodeRpcUrlsDefault,
    ALG: algUrl,
  })

  const chains = await sdk.chainDetailsMap()
  const algChain = chains[ChainSymbol.ALG] ?? chains.ALG
  const bscChain = chains[ChainSymbol.BSC] ?? chains.BSC
  const algTokens = algChain?.tokens ?? []
  const bscTokens = bscChain?.tokens ?? []

  if (!algTokens.length || !bscTokens.length) {
    throw new Error('Allbridge: no ALG or BSC tokens in chainDetailsMap')
  }

  const sourceToken = algTokens.find((t) => t.symbol === 'USDC' || t.symbol === 'USDCa')
  const destinationToken = bscTokens.find((t) => t.symbol === 'USDC')
  if (!sourceToken || !destinationToken) {
    console.error('ALG:', algTokens.map((t) => `${t.symbol}(${t.tokenAddress})`))
    console.error('BSC:', bscTokens.map((t) => `${t.symbol}(${t.tokenAddress})`))
    throw new Error('USDC pair not found on Allbridge')
  }

  console.log('')
  console.log('--- Allbridge tokens (NOT your x402 checkout tokens) ---')
  console.log('Algo USDC ASA:', sourceToken.tokenAddress)
  console.log('BSC USDC contract:', destinationToken.tokenAddress)
  console.log('x402 checkout Algo ASA:', X402_ALGO_USDCA_ASA, '(config)')
  console.log('x402 checkout BSC USDC: 0xBC745DB6F5E07f8F9f3E461b9850195e85EDb07f (config)')
  console.log('')

  if (String(sourceToken.tokenAddress) !== X402_ALGO_USDCA_ASA) {
    console.error(
      'STOP: Payments land as ASA',
      X402_ALGO_USDCA_ASA,
      'but Allbridge only moves ASA',
      sourceToken.tokenAddress,
    )
    console.error(
      'You cannot bridge checkout USDCa until treasury holds Allbridge USDC or we change checkout ASA.',
    )
    process.exit(1)
  }

  console.log('Building bridge tx (USDC, not BNB)...')
  const rawTxs = await sdk.bridge.rawTxBuilder.send({
    amount: amount.toString(),
    fromAccountAddress: fromAddress,
    toAccountAddress: vault,
    sourceToken,
    destinationToken,
    messenger: Messenger.ALLBRIDGE,
  })

  const txns = rawTxs.map((hex) => {
    const bytes = Buffer.from(hex, 'hex')
    return algosdk.decodeUnsignedTransaction(bytes)
  })
  if (!txns.every((t) => t.group?.length)) {
    algosdk.assignGroupID(txns)
  }
  const signed = txns.map((t) => t.signTxn(account.sk))
  const algod = new algosdk.Algodv2('', algUrl, '')
  const { txId } = await algod.sendRawTransaction(signed).do()
  console.log('Bridge tx submitted:', txId)
  console.log('BSC vault will receive USDC at', destinationToken.tokenAddress)
  console.log('Track: https://core.allbridge.io/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
