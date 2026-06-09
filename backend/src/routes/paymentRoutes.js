import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getNetworkConfig } from '../config/paymentConfig.js';
import { createPaymentIntent, getPaymentIntent, updatePaymentIntent } from '../services/intentStore.js';
import { verifyAlgorandPayment } from '../services/verifyAlgorand.js';
import { verifyBscPayment } from '../services/verifyBsc.js';

export const paymentRoutes = Router();

const createIntentSchema = z.object({
  networkId: z.string().min(1),
  payer: z.string().min(1),
  resourceId: z.string().min(1).default('demo-resource'),
  verifyHash: z.string().optional(),
  agentId: z.string().optional()
});

const submitPaymentSchema = z.object({
  intentId: z.string().min(1),
  txHash: z.string().min(1),
  payer: z.string().min(1).optional()
});

paymentRoutes.post('/payment-intents', (req, res) => {
  const parsed = createIntentSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  const network = getNetworkConfig(parsed.data.networkId);

  if (!network) {
    return res.status(400).json({
      error: 'unsupported_network',
      message: `Network is not configured: ${parsed.data.networkId}`
    });
  }

  const isReceiverConfigured =
    network.kind === 'evm'
      ? !/^0x0{40}$/i.test(network.receiver)
      : !network.receiver.startsWith('REPLACE_WITH_');

  if (!isReceiverConfigured) {
    return res.status(400).json({
      error: 'receiver_not_configured',
      message: `Set receiver address for ${network.displayName} in backend/.env first.`
    });
  }

  const now = Date.now();
  const intent = createPaymentIntent({
    id: `pi_${nanoid(16)}`,
    status: 'created',
    networkId: network.id,
    networkKind: network.kind,
    resourceId: parsed.data.resourceId,
    payer: parsed.data.payer,
    receiver: network.receiver,
    asset: network.asset,
    amount: network.amount,
    verifyHash: parsed.data.verifyHash || null,
    agentId: parsed.data.agentId || null,
    nonce: nanoid(24),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    txHash: null,
    verification: null
  });

  return res.json({ intent });
});

paymentRoutes.get('/payment-intents/:intentId', (req, res) => {
  const intent = getPaymentIntent(req.params.intentId);

  if (!intent) {
    return res.status(404).json({ error: 'intent_not_found' });
  }

  return res.json({ intent });
});

paymentRoutes.post('/payments/submit', async (req, res) => {
  const parsed = submitPaymentSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  const intent = getPaymentIntent(parsed.data.intentId);

  if (!intent) {
    return res.status(404).json({ error: 'intent_not_found' });
  }

  if (new Date(intent.expiresAt).getTime() < Date.now()) {
    updatePaymentIntent(intent.id, { status: 'expired' });
    return res.status(400).json({ error: 'intent_expired' });
  }

  const network = getNetworkConfig(intent.networkId);

  try {
    const verification =
      network.kind === 'evm'
        ? await verifyBscPayment({ intent, txHash: parsed.data.txHash, network })
        : await verifyAlgorandPayment({ intent, txHash: parsed.data.txHash, network });

    const updatedIntent = updatePaymentIntent(intent.id, {
      status: verification.ok ? 'paid' : 'failed',
      txHash: parsed.data.txHash,
      verification
    });

    return res.json({ intent: updatedIntent });
  } catch (error) {
    const updatedIntent = updatePaymentIntent(intent.id, {
      status: 'verification_error',
      txHash: parsed.data.txHash,
      verification: {
        ok: false,
        reason: error.message
      }
    });

    return res.status(500).json({ error: 'verification_error', intent: updatedIntent });
  }
});
