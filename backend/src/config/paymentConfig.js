const required = (name, fallback = '') => process.env[name] || fallback;

export const paymentConfig = {
  defaultPriceUsd: '0.01',

  networks: {
    bscTestnet: {
      id: 'bsc-testnet',
      kind: 'evm',
      displayName: 'BSC Testnet',
      chainId: 97,
      nativeCurrency: {
        symbol: 'tBNB',
        decimals: 18
      },
      // Minimal prototype uses native test BNB.
      // Later this should move to stablecoin / x402-compatible asset.
      asset: {
        type: 'native',
        symbol: 'tBNB',
        decimals: 18
      },
      amount: '0.0001',
      receiver: required('BSC_TESTNET_RECEIVER', '0x0000000000000000000000000000000000000000'),
      rpcUrl: required('BSC_TESTNET_RPC', 'https://data-seed-prebsc-1-s1.binance.org:8545')
    },

    algorandTestnet: {
      id: 'algorand-testnet',
      kind: 'algorand',
      displayName: 'Algorand Testnet',
      chainId: 'testnet-v1.0',
      nativeCurrency: {
        symbol: 'ALGO',
        decimals: 6
      },
      // Minimal prototype uses native test ALGO.
      // Later this can become USDC ASA or another accepted asset.
      asset: {
        type: 'native',
        symbol: 'ALGO',
        decimals: 6
      },
      amount: '0.001',
      receiver: required('ALGORAND_TESTNET_RECEIVER', 'REPLACE_WITH_ALGORAND_TESTNET_ADDRESS'),
      algodUrl: required('ALGORAND_TESTNET_ALGOD', 'https://testnet-api.algonode.cloud'),
      indexerUrl: required('ALGORAND_TESTNET_INDEXER', 'https://testnet-idx.algonode.cloud')
    }
  }
};

export const getNetworkConfig = (networkId) => {
  return Object.values(paymentConfig.networks).find((network) => network.id === networkId);
};
