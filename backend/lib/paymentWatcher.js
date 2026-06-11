import { verifyRoutePayment, getMockResource } from "./authorization.js";

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 40;

const subscribers = new Map();

export function replayUnlockedStateIfReady(state, intentId, res) {
  const intent = state.paymentIntents[intentId];
  if (intent?.status !== "access_unlocked") return;

  const content = getMockResource(intent.resource.id);
  res.write(`data: ${JSON.stringify({ type: "payment_verified", access: "unlocked" })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "resource_unlocked", resourceContent: content })}\n\n`);
}

export function subscribeToPaymentEvents(intentId, res) {
  if (!subscribers.has(intentId)) {
    subscribers.set(intentId, new Set());
  }
  subscribers.get(intentId).add(res);

  res.write("retry: 3000\n\n");

  return () => {
    const set = subscribers.get(intentId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) subscribers.delete(intentId);
  };
}

export function broadcastPaymentEvent(intentId, event) {
  const set = subscribers.get(intentId);
  if (!set) return;

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    res.write(payload);
  }
}

export async function submitPaymentJob(ctx, { intentId, txHash, routeId }) {
  const intent = ctx.state.paymentIntents[intentId];
  if (!intent) {
    return { error: "Payment Intent not found.", status: 404 };
  }

  if (ctx.state.paymentJobs[intentId]?.status === "running") {
    return { accepted: true, intentId };
  }

  ctx.state.paymentJobs[intentId] = {
    intentId,
    txHash,
    routeId,
    status: "running",
    attempts: 0
  };

  broadcastPaymentEvent(intentId, { type: "payment_submitted", txHash });

  startPaymentWatcher(ctx, intentId).catch((err) => {
    console.error(`Payment watcher error for ${intentId}:`, err);
  });

  return { accepted: true, intentId };
}

async function startPaymentWatcher(ctx, intentId) {
  const job = ctx.state.paymentJobs[intentId];
  if (!job) return;

  while (job.attempts < MAX_ATTEMPTS) {
    job.attempts += 1;

    const result = await verifyRoutePayment(ctx.config, ctx.state, {
      intentId,
      txHash: job.txHash,
      routeId: job.routeId
    });

    if (result.alreadyUnlocked || result.success) {
      job.status = "verified";
      broadcastPaymentEvent(intentId, { type: "payment_verified", access: "unlocked" });
      broadcastPaymentEvent(intentId, {
        type: "resource_unlocked",
        resourceContent: result.response.resourceContent
      });
      return;
    }

    if (result.verificationFailed) {
      if (result.pending) {
        broadcastPaymentEvent(intentId, {
          type: "payment_confirming",
          confirmations: result.confirmations ?? 0
        });
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      job.status = "failed";
      broadcastPaymentEvent(intentId, { type: "payment_failed", reason: result.reason });
      return;
    }

    if (result.error) {
      job.status = "failed";
      broadcastPaymentEvent(intentId, { type: "payment_failed", reason: result.error });
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  job.status = "failed";
  broadcastPaymentEvent(intentId, {
    type: "payment_failed",
    reason: "Verification timed out. Transaction may still confirm later."
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
