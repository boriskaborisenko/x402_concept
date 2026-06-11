import { v4 as uuidv4 } from "uuid";

const SETTLEMENT_INTERVAL_MS = 30_000;

export function startSettlementWorker(ctx) {
  setInterval(() => {
    processPendingSettlements(ctx).catch((err) => {
      console.error("Settlement worker error:", err);
    });
  }, SETTLEMENT_INTERVAL_MS);

  console.log(`Settlement worker started (interval ${SETTLEMENT_INTERVAL_MS}ms).`);
}

export async function processPendingSettlements(ctx) {
  const pending = ctx.state.ledger.filter((entry) => entry.status.settlement === "pending");
  if (pending.length === 0) return { processed: 0 };

  let processed = 0;
  for (const entry of pending) {
    const proof = settleLedgerEntry(entry, ctx.config);
    entry.status.settlement = "settled";
    entry.timestamps.settledAt = new Date().toISOString();
    entry.settlement = proof;
    processed += 1;
    console.log(
      `Settlement mock: ${entry.paymentIntentId} → vault ${ctx.config.settlement?.vault?.address}`
    );
  }

  return { processed };
}

export function settleLedgerEntry(entry, config) {
  const vault = config.settlement?.vault;
  const rail = entry.payment.settlementRail || "manual";
  const isStable =
    entry.payer.asset === "USDC" || entry.payer.asset === "USDCa" || entry.payer.asset === "USDT";
  const protocol = isStable ? "CCTP" : "CCIP";

  return {
    protocol,
    rail,
    vault: vault
      ? {
          networkId: vault.networkId,
          address: vault.address,
          type: vault.type
        }
      : null,
    payoutTx:
      entry.payer.chain === "bsc" || entry.payer.chain === "l2"
        ? "0x" + uuidv4().replace(/-/g, "")
        : "ALGO_MOCK_" + uuidv4().slice(0, 8).toUpperCase(),
    details: isStable
      ? `Mock CCTP burn on ${entry.payer.chain} → mint to vault on ${vault?.networkId || "bsc"}`
      : `Mock CCIP relay to vault on ${vault?.networkId || "bsc"}`
  };
}

export function settleByIntentId(ctx, paymentIntentId) {
  const entry = ctx.state.ledger.find((e) => e.paymentIntentId === paymentIntentId);
  if (!entry) {
    return { error: "Ledger entry not found", status: 404 };
  }
  if (entry.status.settlement === "settled") {
    return { success: false, message: "Already settled.", ledgerEntry: entry };
  }

  const settlementProof = settleLedgerEntry(entry, ctx.config);
  entry.status.settlement = "settled";
  entry.timestamps.settledAt = new Date().toISOString();
  entry.settlement = settlementProof;

  return {
    success: true,
    message: "Asynchronous settlement processed successfully!",
    ledgerEntry: entry,
    settlementProof
  };
}
