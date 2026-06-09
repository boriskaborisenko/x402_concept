import algosdk from 'algosdk';

const algoToMicroAlgos = (amount) => Math.round(Number(amount) * 1_000_000);

export const verifyAlgorandPayment = async ({ intent, txHash, network }) => {
  const indexer = new algosdk.Indexer('', network.indexerUrl, '');

  const tx = await indexer.lookupTransactionByID(txHash).do();
  const transaction = tx.transaction;

  if (!transaction) {
    return {
      ok: false,
      reason: 'transaction_not_found'
    };
  }

  const payment = transaction['payment-transaction'];

  if (!payment) {
    return {
      ok: false,
      reason: 'not_a_payment_transaction'
    };
  }

  const receiver = payment.receiver;
  const amount = Number(payment.amount || 0);
  const requiredAmount = algoToMicroAlgos(intent.amount);
  const confirmedRound = transaction['confirmed-round'];

  if (!confirmedRound) {
    return {
      ok: false,
      reason: 'transaction_not_confirmed'
    };
  }

  if (receiver !== intent.receiver) {
    return {
      ok: false,
      reason: 'wrong_receiver',
      expected: intent.receiver,
      actual: receiver
    };
  }

  if (amount < requiredAmount) {
    return {
      ok: false,
      reason: 'amount_too_low',
      expected: requiredAmount,
      actual: amount
    };
  }

  return {
    ok: true,
    chain: network.id,
    txHash,
    receiver,
    amount,
    requiredAmount,
    confirmedRound
  };
};
