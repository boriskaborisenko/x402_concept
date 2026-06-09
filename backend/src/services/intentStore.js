const paymentIntents = new Map();

export const createPaymentIntent = (intent) => {
  paymentIntents.set(intent.id, intent);
  return intent;
};

export const getPaymentIntent = (intentId) => {
  return paymentIntents.get(intentId) || null;
};

export const updatePaymentIntent = (intentId, patch) => {
  const current = getPaymentIntent(intentId);

  if (!current) {
    return null;
  }

  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  paymentIntents.set(intentId, updated);
  return updated;
};
