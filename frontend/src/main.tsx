import './polyfills'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletProvider } from '@txnlab/use-wallet-react'
import { WagmiProvider } from 'wagmi'
import { algorandWalletManager } from './config/algorandWallet'
import { wagmiAdapter } from './config/wagmi'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiAdapter.wagmiConfig as never}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider manager={algorandWalletManager}>
          <App />
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
