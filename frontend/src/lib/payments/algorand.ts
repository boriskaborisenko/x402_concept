import algosdk from 'algosdk'
import type { PaymentRoute } from '../../types/payment'
import {
  formatAssetAmount,
  listOtherUsdcHoldings
} from './algorandBalance'
import { normalizePaymentRoute, toAlgoMicroAmount } from './routeAmount'

type SignTransactions = (
  txnGroup: algosdk.Transaction[] | algosdk.Transaction[][]
) => Promise<(Uint8Array | null)[]>

const MIN_ALGO_FOR_FEE_MICRO = 100_000

async function assertAlgorandPaymentBalance(
  algodClient: algosdk.Algodv2,
  sender: string,
  assetId: number,
  assetSymbol: string,
  requiredAmount: number,
  decimals: number
) {
  const account = await algodClient.accountInformation(sender).do()
  const algoBalance = Number(account.amount ?? 0)

  if (algoBalance < MIN_ALGO_FOR_FEE_MICRO) {
    throw new Error(
      `Not enough ALGO for fees on account ${sender.slice(0, 8)}… (need ~0.1 ALGO, have ${(algoBalance / 1e6).toFixed(4)} ALGO).`
    )
  }

  const holding = (account.assets ?? []).find((entry) => Number(entry.assetId ?? 0) === assetId)
  const assetBalance = Number(holding?.amount ?? 0)

  if (assetBalance < requiredAmount) {
    const need = formatAssetAmount(requiredAmount, decimals)
    const have = formatAssetAmount(assetBalance, decimals)
    const others = await listOtherUsdcHoldings(algodClient, sender, assetId)
    const fundedElsewhere = others.find((entry) => entry.amount >= requiredAmount)

    let hint =
      `Checkout uses official testnet USDC ASA ${assetId}. ` +
      `On this account you have ${have} ${assetSymbol} on that ASA (need ${need}).`

    if (fundedElsewhere) {
      hint +=
        ` You also hold ${formatAssetAmount(fundedElsewhere.amount, fundedElsewhere.decimals)} USDC on ASA ${fundedElsewhere.assetId} — ` +
        `that is a different token; Pera may show both as "USDC". Fund or swap into ASA ${assetId}.`
    } else if (others.length > 0) {
      const summary = others
        .slice(0, 3)
        .map((entry) => `ASA ${entry.assetId}: ${formatAssetAmount(entry.amount, entry.decimals)}`)
        .join(', ')
      hint += ` Other USDC ASAs on this account: ${summary}.`
    }

    hint += ` Connected address: ${sender}.`

    throw new Error(hint)
  }
}

export async function payAlgorandUsdca(
  route: PaymentRoute,
  sender: string,
  signTransactions: SignTransactions,
  algodClient: algosdk.Algodv2
): Promise<string> {
  const normalized = normalizePaymentRoute(route)

  if (!normalized.assetId) {
    throw new Error('USDCa asset ID is missing for Algorand route.')
  }

  const amount = toAlgoMicroAmount(normalized)
  await assertAlgorandPaymentBalance(
    algodClient,
    sender,
    normalized.assetId,
    normalized.asset,
    amount,
    normalized.decimals
  )

  const suggestedParams = await algodClient.getTransactionParams().do()

  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender,
    receiver: normalized.recipient,
    amount,
    assetIndex: normalized.assetId,
    suggestedParams
  })

  const signedTxns = await signTransactions([txn])
  const signedTxn = signedTxns[0]

  if (!signedTxn) {
    throw new Error('Transaction signing was cancelled.')
  }

  const response = await algodClient.sendRawTransaction(signedTxn).do()
  return response.txid
}
