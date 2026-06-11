import { defineChain } from 'viem'

/** Polygon PoS Amoy testnet (chainId 80002) */
export const polygonAmoy = defineChain({
  id: 80002,
  name: 'Polygon Amoy',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-amoy.polygon.technology'] }
  },
  blockExplorers: {
    default: { name: 'Polygonscan', url: 'https://amoy.polygonscan.com' }
  },
  testnet: true
})

export const EVM_CHAIN_IDS: Record<string, number> = {
  bsc: 97,
  'polygon-amoy': 80002
}

export function evmChainId(networkId: string): number | undefined {
  return EVM_CHAIN_IDS[networkId]
}
