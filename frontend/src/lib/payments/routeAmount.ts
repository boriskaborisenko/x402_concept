import { parseUnits } from 'viem'
import type { PaymentRoute } from '../../types/payment'

type LooseRoute = PaymentRoute & {
  token_address?: string
  asset_id?: number
}

export function normalizePaymentRoute(route: LooseRoute): PaymentRoute {
  const decimalsRaw = route.decimals ?? (route as { Decimals?: number }).Decimals
  const decimals = Number(decimalsRaw)

  return {
    ...route,
    amount: String(route.amount ?? '').trim(),
    decimals: Number.isFinite(decimals) ? decimals : NaN,
    tokenAddress: route.tokenAddress ?? route.token_address,
    assetId: route.assetId ?? route.asset_id
  }
}

function assertRouteAmountFields(route: PaymentRoute, chainLabel: string): void {
  const amount = String(route.amount ?? '').trim()
  if (!amount || !/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(
      `${chainLabel}: invalid amount "${route.amount}" on route ${route.id}. Refresh and try again.`
    )
  }

  if (!Number.isInteger(route.decimals) || route.decimals < 0 || route.decimals > 255) {
    throw new Error(
      `${chainLabel}: invalid decimals on route ${route.id}. Got "${String(route.decimals)}". Refresh the page and retry.`
    )
  }
}

export function toEvmTokenAmount(route: PaymentRoute): bigint {
  const normalized = normalizePaymentRoute(route)
  assertRouteAmountFields(normalized, 'BSC')

  if (!normalized.tokenAddress) {
    throw new Error('USDC token address is missing for BSC route.')
  }

  return parseUnits(normalized.amount, normalized.decimals)
}

export function toAlgoMicroAmount(route: PaymentRoute): number {
  const normalized = normalizePaymentRoute(route)
  assertRouteAmountFields(normalized, 'Algorand')

  const microAmount = Math.round(Number(normalized.amount) * 10 ** normalized.decimals)
  if (!Number.isSafeInteger(microAmount) || microAmount <= 0) {
    throw new Error(
      `Algorand: could not compute payment amount for route ${route.id} (amount=${normalized.amount}, decimals=${normalized.decimals}).`
    )
  }

  return microAmount
}
