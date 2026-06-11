import type { ActiveChain, AppConfig } from '../types/payment'

/** Wallet-agnostic Algorand explorer (AlgoKit Lora). */
const LORA_TX_BASE: Record<'testnet' | 'mainnet', string> = {
  testnet: 'https://lora.algokit.io/testnet/transaction/',
  mainnet: 'https://lora.algokit.io/mainnet/transaction/'
}

export function algorandExplorerTxUrl(txId: string, network: 'testnet' | 'mainnet' = 'testnet') {
  return `${LORA_TX_BASE[network]}${txId}`
}

export function buildExplorerUrl(
  chain: ActiveChain,
  txHash: string,
  appConfig: AppConfig | null
): string | null {
  if (!txHash) return null

  if (chain === 'algorand') {
    // Always Lora — config may be stale in the tab or still point at Pera.
    return algorandExplorerTxUrl(txHash, 'testnet')
  }

  const base = appConfig?.chains.bsc.explorerUrl
  return base ? `${base}${txHash}` : null
}
