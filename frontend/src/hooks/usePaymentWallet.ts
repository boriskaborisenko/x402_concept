import { useMemo } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { useAccount } from 'wagmi'
import type { ActiveChain } from '../types/payment'
import { EVM_CHAIN_IDS } from '../config/chains'

function evmNetworkFromChainId(chainId: number | undefined): ActiveChain | null {
  if (chainId == null) return null
  for (const [networkId, id] of Object.entries(EVM_CHAIN_IDS)) {
    if (id === chainId) return networkId as ActiveChain
  }
  return null
}

export function usePaymentWallet() {
  const evmAccount = useAccount()
  const { activeAddress, isReady, signTransactions, algodClient, activeWallet } = useWallet()

  const chain = useMemo((): ActiveChain | null => {
    if (evmAccount.isConnected) {
      return evmNetworkFromChainId(evmAccount.chainId) ?? 'bsc'
    }
    if (isReady && activeAddress) return 'algorand'
    return null
  }, [evmAccount.isConnected, evmAccount.chainId, isReady, activeAddress])

  return {
    chain,
    isConnected: chain !== null,
    evmAccount,
    activeAddress,
    signTransactions,
    algodClient,
    activeWallet
  }
}
