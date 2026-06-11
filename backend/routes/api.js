import { Router } from "express";
import { getLegacyChainsConfig, getPublicNetworks } from "../lib/networks.js";
import { createPaymentIntent } from "../lib/authorization.js";
import { verifyRoutePayment } from "../lib/authorization.js";
import {
  submitPaymentJob,
  subscribeToPaymentEvents,
  replayUnlockedStateIfReady
} from "../lib/paymentWatcher.js";
import { settleByIntentId } from "../lib/settlement.js";

export function createApiRouter(ctx) {
  const router = Router();

  router.get("/resources", (req, res) => {
    res.json(ctx.config.resources);
  });

  router.get("/networks", (req, res) => {
    res.json({
      version: ctx.config.version,
      settlement: ctx.config.settlement,
      networks: getPublicNetworks(ctx.config)
    });
  });

  router.get("/config", (req, res) => {
    res.json({
      version: ctx.config.version,
      settlement: ctx.config.settlement,
      networks: getPublicNetworks(ctx.config),
      chains: getLegacyChainsConfig(ctx.config)
    });
  });

  router.post("/payment-intent", (req, res) => {
    const { resourceId } = req.body;
    if (!resourceId) {
      return res.status(400).json({ error: "resourceId is required" });
    }

    const result = createPaymentIntent(ctx.config, resourceId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const intent = result.intent;
    ctx.state.paymentIntents[intent.id] = intent;

    return res.status(402).json({
      error: "payment_required",
      status: 402,
      payment_intent: {
        id: intent.id,
        amount_usd: intent.resource.priceInUsd,
        resource_id: intent.resource.id,
        request_hash: intent.resource.requestHash,
        expires_at: intent.constraints.expiresAt,
        nonce: intent.constraints.nonce,
        routes: intent.routes
      }
    });
  });

  router.post("/payments/submit", async (req, res) => {
    const { intentId, txHash, routeId } = req.body;
    if (!intentId || !txHash || !routeId) {
      return res.status(400).json({ error: "intentId, txHash, and routeId are required." });
    }

    const result = await submitPaymentJob(ctx, { intentId, txHash, routeId });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(202).json({ accepted: true, intentId });
  });

  router.get("/payments/:intentId/events", (req, res) => {
    const { intentId } = req.params;
    if (!ctx.state.paymentIntents[intentId]) {
      return res.status(404).json({ error: "Payment Intent not found." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    replayUnlockedStateIfReady(ctx.state, intentId, res);
    const unsubscribe = subscribeToPaymentEvents(intentId, res);
    req.on("close", () => {
      unsubscribe();
      res.end();
    });
  });

  router.post("/verify-payment", async (req, res) => {
    const { intentId, txHash, routeId } = req.body;
    if (!intentId || !txHash || !routeId) {
      return res.status(400).json({ error: "intentId, txHash, and routeId are required." });
    }

    const result = await verifyRoutePayment(ctx.config, ctx.state, { intentId, txHash, routeId });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    if (result.verificationFailed) {
      return res.status(422).json({
        error: "verification_failed",
        message: "The blockchain transaction could not be verified.",
        reason: result.reason
      });
    }

    const body = result.response;
    if (req.headers["x-merchant-admin"] === "1") {
      body.settlement = { status: result.ledgerEntry?.status?.settlement || "pending" };
      body.ledgerEntry = result.ledgerEntry;
    }

    return res.json(body);
  });

  router.get("/ledger", (req, res) => {
    res.json(ctx.state.ledger);
  });

  router.post("/settle", (req, res) => {
    const { paymentIntentId } = req.body;
    const result = settleByIntentId(ctx, paymentIntentId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result);
  });

  return router;
}
