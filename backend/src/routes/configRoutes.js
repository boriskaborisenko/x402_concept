import { Router } from 'express';
import { paymentConfig } from '../config/paymentConfig.js';

export const configRoutes = Router();

configRoutes.get('/payment-config', (_req, res) => {
  const networks = Object.values(paymentConfig.networks).map((network) => ({
    id: network.id,
    kind: network.kind,
    displayName: network.displayName,
    chainId: network.chainId,
    nativeCurrency: network.nativeCurrency,
    asset: network.asset,
    amount: network.amount,
    receiver: network.receiver,
    isReceiverConfigured:
      network.kind === 'evm'
        ? !/^0x0{40}$/i.test(network.receiver)
        : !network.receiver.startsWith('REPLACE_WITH_')
  }));

  res.json({
    defaultPriceUsd: paymentConfig.defaultPriceUsd,
    networks
  });
});
