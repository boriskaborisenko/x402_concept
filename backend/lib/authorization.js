import { v4 as uuidv4 } from "uuid";
import { buildPaymentRoutes } from "./networks.js";
import { getNetworkById } from "./networks.js";
import { verifyEvmTx } from "./adapters/evm.js";
import { verifyAlgoTx } from "./adapters/algo.js";

export function computeRequestHash(resourceId, timestamp) {
  return "0x" + Buffer.from(`${resourceId}-${timestamp}`).toString("hex").slice(0, 40);
}

export function createPaymentIntent(config, resourceId) {
  const resource = config.resources.find((r) => r.id === resourceId);
  if (!resource) {
    return { error: "Resource not found", status: 404 };
  }

  const intentId = "pi_" + uuidv4().replace(/-/g, "").slice(0, 16);
  const nonce = "n_" + uuidv4().replace(/-/g, "").slice(0, 12);
  const requestHash = computeRequestHash(resourceId, Date.now());
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const priceUsd = parseFloat(resource.priceInUsd);
  const merchant = config.merchants.m_001;

  const intent = {
    id: intentId,
    status: "created",
    resource: {
      id: resource.id,
      name: resource.name,
      description: resource.description,
      requestHash,
      priceInUsd: resource.priceInUsd
    },
    merchant: {
      id: merchant.id,
      name: merchant.name,
      settlementPreference: merchant.settlement
    },
    constraints: {
      expiresAt,
      nonce
    },
    routes: buildPaymentRoutes(config, priceUsd)
  };

  return { intent };
}

export function getMockResource(resourceId) {
  switch (resourceId) {
    case "premium_advice":
      return {
        type: "advice",
        title: "Strategy Unlocked",
        payload:
          "To expand your agentic network across both EVM and Non-EVM chains, deploy a Payment Intent Router on each. Utilize CCTP for capital efficiency when settling stablecoins, and CCIP to synchronize entitlements across separate testnets."
      };
    case "api_key":
      return {
        type: "api_key",
        title: "Developer Credentials",
        payload: `sk_x402_test_${uuidv4().replace(/-/g, "").slice(0, 24)}`
      };
    case "image_generation":
      return {
        type: "image",
        title: "Art Generation Success",
        payload:
          "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80"
      };
    default:
      return { type: "generic", title: "Unlocked", payload: "Resource Content Unlocked!" };
  }
}

export function buildUserAccessResponse(intent, resourceContent) {
  return {
    success: true,
    message: "Payment verified, resource unlocked successfully!",
    access: {
      status: "unlocked",
      unlockedAt: new Date().toISOString()
    },
    resourceContent
  };
}

export async function verifyRoutePayment(config, state, { intentId, txHash, routeId }) {
  const intent = state.paymentIntents[intentId];
  if (!intent) {
    return { error: "Payment Intent not found.", status: 404 };
  }

  if (intent.status === "payment_verified" || intent.status === "access_unlocked") {
    const existing = state.ledger.find((e) => e.paymentIntentId === intentId);
    return {
      alreadyUnlocked: true,
      response: buildUserAccessResponse(intent, getMockResource(intent.resource.id)),
      ledgerEntry: existing
    };
  }

  const route = intent.routes.find((r) => r.id === routeId);
  if (!route) {
    return { error: "Selected route not found in original intent.", status: 400 };
  }

  const alreadyUsed = state.ledger.some((entry) => entry.payment.sourceTx === txHash);
  if (alreadyUsed) {
    intent.status = "failed";
    return { error: "Transaction hash already used.", status: 400 };
  }

  const network = getNetworkById(config, route.networkId || route.chain);
  if (!network) {
    return { error: "Network configuration not found for route.", status: 400 };
  }

  intent.status = "payment_pending";

  let verificationResult;
  if (network.type === "evm" || network.type === "l2") {
    verificationResult = await verifyEvmTx(
      network,
      txHash,
      route.recipient,
      route.asset,
      route.amount,
      route.tokenAddress,
      route.decimals ?? 18
    );
  } else if (network.type === "algo") {
    verificationResult = await verifyAlgoTx(
      network,
      txHash,
      route.recipient,
      route.asset,
      route.amount,
      route.assetId,
      route.decimals ?? 6
    );
  } else {
    return { error: `Unsupported network type: ${network.type}`, status: 400 };
  }

  if (!verificationResult.success) {
    intent.status = verificationResult.pending ? "payment_pending" : "failed";
    return {
      verificationFailed: true,
      pending: Boolean(verificationResult.pending),
      reason: verificationResult.reason,
      confirmations: verificationResult.confirmations
    };
  }

  intent.status = "payment_verified";

  const unlockedAt = new Date().toISOString();
  const ledgerEntry = {
    paymentIntentId: intentId,
    requestHash: intent.resource.requestHash,
    resourceId: intent.resource.id,
    payer: {
      chain: route.chain,
      asset: route.asset
    },
    merchant: {
      id: intent.merchant.id,
      settlementNetworkId:
        intent.merchant.settlementPreference.networkId || intent.merchant.settlementPreference.chain,
      settlementAsset: intent.merchant.settlementPreference.asset
    },
    payment: {
      sourceChain: route.chain,
      sourceAsset: route.asset,
      sourceTx: txHash,
      amountUsd: intent.resource.priceInUsd,
      cryptoAmount: route.amount,
      settlementRail: route.settlementRail || "manual"
    },
    status: {
      payment: "verified",
      access: "unlocked",
      credit: "credited",
      settlement: "pending"
    },
    security: {
      nonce: intent.constraints.nonce,
      expiresAt: intent.constraints.expiresAt,
      used: true
    },
    timestamps: {
      createdAt: unlockedAt,
      paidAt: unlockedAt,
      unlockedAt
    }
  };

  state.ledger.push(ledgerEntry);
  intent.status = "access_unlocked";

  return {
    success: true,
    response: buildUserAccessResponse(intent, getMockResource(intent.resource.id)),
    ledgerEntry
  };
}
