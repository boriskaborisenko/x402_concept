import { type Address } from 'viem'
import { bscTestnet } from '@reown/appkit/networks'
import type { PaymentRoute } from '../../types/payment'
import { normalizePaymentRoute, toEvmTokenAmount } from './routeAmount'

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: 'bool' }]
  }
] as const

type WriteContractAsync = (args: {
  address: Address
  abi: typeof ERC20_TRANSFER_ABI
  functionName: 'transfer'
  args: readonly [Address, bigint]
  chainId: number
}) => Promise<`0x${string}`>

type SwitchChainAsync = (args: { chainId: number }) => Promise<unknown>

export async function payBscUsdc(
  route: PaymentRoute,
  chainId: number | undefined,
  writeContractAsync: WriteContractAsync,
  switchChainAsync: SwitchChainAsync
): Promise<`0x${string}`> {
  const normalized = normalizePaymentRoute(route)

  if (!normalized.tokenAddress) {
    throw new Error('USDC token address is missing for BSC route.')
  }

  if (chainId !== bscTestnet.id) {
    await switchChainAsync({ chainId: bscTestnet.id })
  }

  const amount = toEvmTokenAmount(normalized)

  return writeContractAsync({
    address: normalized.tokenAddress as Address,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [normalized.recipient as Address, amount],
    chainId: bscTestnet.id
  })
}
