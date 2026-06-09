import { createPublicClient, formatEther, http, isAddressEqual, parseEther } from 'viem';
import { bscTestnet } from 'viem/chains';

export const verifyBscPayment = async ({ intent, txHash, network }) => {
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(network.rpcUrl)
  });

  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: txHash }),
    client.getTransactionReceipt({ hash: txHash })
  ]);

  if (!receipt || receipt.status !== 'success') {
    return {
      ok: false,
      reason: 'transaction_not_successful'
    };
  }

  if (!tx.to) {
    return {
      ok: false,
      reason: 'missing_receiver'
    };
  }

  const expectedReceiver = intent.receiver;
  const actualReceiver = tx.to;

  if (!isAddressEqual(actualReceiver, expectedReceiver)) {
    return {
      ok: false,
      reason: 'wrong_receiver',
      expected: expectedReceiver,
      actual: actualReceiver
    };
  }

  const requiredValue = parseEther(intent.amount);

  if (tx.value < requiredValue) {
    return {
      ok: false,
      reason: 'amount_too_low',
      expected: intent.amount,
      actual: formatEther(tx.value)
    };
  }

  if (intent.payer && tx.from && !isAddressEqual(tx.from, intent.payer)) {
    return {
      ok: false,
      reason: 'wrong_payer',
      expected: intent.payer,
      actual: tx.from
    };
  }

  return {
    ok: true,
    chain: network.id,
    txHash,
    from: tx.from,
    receiver: actualReceiver,
    amount: formatEther(tx.value),
    requiredAmount: intent.amount,
    blockNumber: receipt.blockNumber.toString()
  };
};
