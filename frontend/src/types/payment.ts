export interface Resource {
  id: string
  name: string
  priceInUsd: string
  description: string
}

export interface PaymentRoute {
  id: string
  chain: string
  asset: string
  amount: string
  decimals: number
  recipient: string
  execution: string
  instantUnlock: boolean
  estimatedFee: string
  recommended: boolean
  tokenAddress?: string
  assetId?: number
}

export interface PaymentIntent {
  id: string
  amount_usd: string
  resource_id: string
  request_hash: string
  expires_at: string
  nonce: string
  routes: PaymentRoute[]
}

export interface PaymentIntentResponse {
  error: string
  status: number
  payment_intent: PaymentIntent
}

export interface ChainConfig {
  name: string
  chainId?: number
  algodUrl?: string
  recipientAddress: string
  usdcAddress?: string
  usdcAssetId?: number
  explorerUrl: string
  nativeSymbol: string
  stableSymbol: string
}

export interface AppConfig {
  chains: Record<string, ChainConfig>
}

export interface ResourceContent {
  type: string
  title: string
  payload: string
}

export interface AccessStatus {
  status: string
  unlockedAt?: string
}

export interface VerifyPaymentResult {
  success: boolean
  message?: string
  access?: AccessStatus
  resourceContent?: ResourceContent
  ledgerEntry?: unknown
  reason?: string
}

export type PaymentEvent =
  | { type: 'payment_submitted'; txHash: string }
  | { type: 'payment_confirming'; confirmations: number }
  | { type: 'payment_verified'; access: string }
  | { type: 'resource_unlocked'; resourceContent: ResourceContent }
  | { type: 'payment_failed'; reason: string }

export type ActiveChain = 'bsc' | 'algorand' | 'polygon-amoy' | string

export type CheckoutPhase = 'idle' | 'confirming' | 'success' | 'failed'
