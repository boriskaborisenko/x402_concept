import { createAppKit } from '@reown/appkit/react'
import type { AppKitNetwork } from '@reown/appkit-common'
import { bscTestnet } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { polygonAmoy } from './chains'

export const projectId = 'b3ff0b5fe2c59275fc24684910bab667'

export const networks = [bscTestnet, polygonAmoy] as [AppKitNetwork, ...AppKitNetwork[]]

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false
})

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: 'x402 Payment Sidecar — Demo Checkout',
    description: 'Seamless cross-chain payments for human and agentic commerce',
    url: 'http://localhost:3000',
    icons: ['https://avatars.githubusercontent.com/u/1994348']
  },
  themeMode: 'dark'
})
