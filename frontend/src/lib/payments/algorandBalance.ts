import algosdk from 'algosdk'

export const CHECKOUT_USDC_ASA_TESTNET = 10458941

function holdingAssetId(holding: { assetId?: number | bigint }): number {
  return Number(holding.assetId ?? 0)
}

function assetUnitName(params: { unitName?: string }): string {
  return String(params.unitName ?? 'ASA')
}

export type AlgoAssetBalance = {
  assetId: number
  amount: number
  decimals: number
  unitName: string
}

export async function getAlgorandPaymentAssetBalance(
  algodClient: algosdk.Algodv2,
  address: string,
  assetId: number
): Promise<{ algoMicro: number; asset: AlgoAssetBalance | null }> {
  const account = await algodClient.accountInformation(address).do()
  const holding = (account.assets ?? []).find((entry) => holdingAssetId(entry) === assetId)

  if (!holding) {
    return { algoMicro: Number(account.amount ?? 0), asset: null }
  }

  const info = await algodClient.getAssetByID(assetId).do()
  return {
    algoMicro: Number(account.amount ?? 0),
    asset: {
      assetId,
      amount: Number(holding.amount ?? 0),
      decimals: Number(info.params.decimals ?? 6),
      unitName: assetUnitName(info.params)
    }
  }
}

export async function listOtherUsdcHoldings(
  algodClient: algosdk.Algodv2,
  address: string,
  excludeAssetId: number
): Promise<AlgoAssetBalance[]> {
  const account = await algodClient.accountInformation(address).do()
  const results: AlgoAssetBalance[] = []

  for (const holding of account.assets ?? []) {
    const assetId = holdingAssetId(holding)
    if (!assetId || assetId === excludeAssetId) continue

    const info = await algodClient.getAssetByID(assetId).do()
    const unitName = assetUnitName(info.params)
    if (unitName.toUpperCase() !== 'USDC') continue

    results.push({
      assetId,
      amount: Number(holding.amount ?? 0),
      decimals: Number(info.params.decimals ?? 6),
      unitName
    })
  }

  return results.sort((a, b) => b.amount - a.amount)
}

export function formatAssetAmount(amount: number, decimals: number): string {
  return (amount / 10 ** decimals).toFixed(Math.min(decimals, 6))
}
