import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import App from './App.jsx';
import { walletConnectProjectId } from './config/chains.js';
import './styles.css';

const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [
    injected(),
    walletConnect({
      projectId: walletConnectProjectId,
      metadata: {
        name: 'x402Easy Prototype',
        description: 'Minimal multichain x402Easy payment prototype',
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`]
      },
      showQrModal: true
    })
  ],
  transports: {
    [bscTestnet.id]: http()
  }
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
