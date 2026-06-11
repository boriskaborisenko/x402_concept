export function getEnabledNetworks(config) {
  return (config.networks || []).filter((network) => network.enabled !== false)
}

export function getNetworkById(config, networkId) {
  return getEnabledNetworks(config).find((network) => network.id === networkId)
}

export function getRate(config, symbol) {
  const rates = config.rates || {}
  return rates[symbol] ?? 1
}

export function buildPaymentRoutes(config, priceUsd) {
  const routes = []

  for (const network of getEnabledNetworks(config)) {
    for (const token of network.paymentTokens || []) {
      const amount = (priceUsd / getRate(config, token.symbol)).toFixed(token.decimals > 6 ? 6 : 2)
      const route = {
        id: `route_${network.id}_${token.id}`,
        networkId: network.id,
        chain: network.id,
        networkType: network.type,
        asset: token.symbol,
        amount,
        decimals: token.decimals,
        recipient: network.treasury.address,
        treasuryType: network.treasury.type,
        execution: token.native
          ? network.type === "algo"
            ? "native_transfer"
            : "native_transfer"
          : network.type === "algo"
            ? "algorand_asa_transfer"
            : "evm_transfer",
        instantUnlock: true,
        recommended: Boolean(token.recommended),
        settlementRail: token.settlementRail || null
      }

      if (token.address) route.tokenAddress = token.address
      if (token.assetId) route.assetId = token.assetId

      route.estimatedFee =
        network.type === "algo" ? `0.001 ${network.native.symbol}` : `0.0008 ${network.native.symbol}`

      routes.push(route)
    }
  }

  return routes
}

export function getPublicNetworks(config) {
  return getEnabledNetworks(config).map((network) => ({
    id: network.id,
    name: network.name,
    type: network.type,
    chainId: network.chainId,
    explorerUrl: network.explorerUrl,
    treasury: {
      address: network.treasury.address,
      type: network.treasury.type
    },
    facilitator: network.facilitator
      ? { type: network.facilitator.type, url: network.facilitator.url }
      : null,
    native: network.native,
    paymentTokens: (network.paymentTokens || []).map((token) => ({
      id: token.id,
      symbol: token.symbol,
      address: token.address,
      assetId: token.assetId,
      decimals: token.decimals,
      native: Boolean(token.native),
      recommended: Boolean(token.recommended),
      settlementRail: token.settlementRail
    }))
  }))
}

/** Legacy shape for existing frontend until it reads /api/networks */
export function getLegacyChainsConfig(config) {
  const publicNetworks = getPublicNetworks(config)
  const chains = {}

  for (const network of publicNetworks) {
    const recommended = network.paymentTokens.find((t) => t.recommended)
    chains[network.id] = {
      name: network.name,
      networkType: network.type,
      chainId: network.chainId,
      algodUrl: network.facilitator?.url,
      recipientAddress: network.treasury.address,
      treasuryType: network.treasury.type,
      usdcAddress: recommended?.address,
      usdcAssetId: recommended?.assetId,
      explorerUrl: network.explorerUrl,
      nativeSymbol: network.native.symbol,
      stableSymbol: recommended?.symbol
    }
  }

  return chains
}
