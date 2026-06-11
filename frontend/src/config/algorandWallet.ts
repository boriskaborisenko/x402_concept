import {
  NetworkConfigBuilder,
  NetworkId,
  WalletId,
  WalletManager
} from '@txnlab/use-wallet'
import { projectId } from './wagmi'

const networks = new NetworkConfigBuilder()
  .testnet({
    algod: {
      baseServer: 'https://testnet-api.algonode.cloud',
      port: '443',
      token: ''
    }
  })
  .build()

export const algorandWalletManager = new WalletManager({
  wallets: [
    WalletId.PERA,
    WalletId.DEFLY,
    WalletId.EXODUS,
    {
      id: WalletId.WALLETCONNECT,
      options: {
        projectId
      }
    }
  ],
  networks,
  defaultNetwork: NetworkId.TESTNET
})
