import { useMemo } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { useAccount } from 'wagmi'
import type { ActiveChain } from '../types/payment'

export function usePaymentWallet() {
  const evmAccount = useAccount()
  const { activeAddress, isReady, signTransactions, algodClient, activeWallet } = useWallet()

  const chain = useMemo((): ActiveChain | null => {
    if (evmAccount.isConnected) return 'bsc'
    if (isReady && activeAddress) return 'algorand'
    return null
  }, [evmAccount.isConnected, isReady, activeAddress])

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
