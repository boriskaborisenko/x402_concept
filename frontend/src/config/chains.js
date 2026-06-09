import { PeraWalletConnect } from '@perawallet/connect';

export const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'b3ff0b5fe2c59275fc24684910bab667';

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

export const supportedNetworks = {
  bscTestnet: {
    id: 'bsc-testnet',
    chainId: 97
  },
  algorandTestnet: {
    id: 'algorand-testnet',
    chainId: 'testnet-v1.0'
  }
};

export const peraWallet = new PeraWalletConnect({ chainId: 416002 });
