export async function verifyAlgoTx(
  network,
  txHash,
  expectedRecipient,
  expectedAsset,
  expectedAmount,
  expectedAssetId,
  tokenDecimals = 6
) {
  const algodUrl = network.facilitator?.url;
  if (!algodUrl) {
    return { success: false, reason: "Algorand facilitator (algod) URL is not configured." };
  }

  try {
    const response = await fetch(`${algodUrl}/v2/transactions/${txHash}`);
    if (response.status === 404) {
      return { success: false, reason: "Transaction not found on Algorand yet.", pending: true };
    }

    if (!response.ok) {
      return { success: false, reason: `Algod returned HTTP error: ${response.status}` };
    }

    const txData = await response.json();
    const tx = txData.transaction;

    if (!tx) {
      return { success: false, reason: "Transaction data missing from Algod." };
    }

    const nativeSymbol = network.native?.symbol || "ALGO";
    if (expectedAsset === nativeSymbol) {
      if (tx.type !== "pay") {
        return { success: false, reason: `Expected native transfer, got '${tx.type}'.` };
      }

      const receiver = tx["payment-transaction"]?.receiver;
      const amount = tx["payment-transaction"]?.amount;
      const expectedMicro = Math.round(parseFloat(expectedAmount) * 10 ** tokenDecimals);

      if (receiver !== expectedRecipient) {
        return { success: false, reason: `Receiver mismatch. Expected: ${expectedRecipient}` };
      }
      if (amount < expectedMicro) {
        return { success: false, reason: `Amount mismatch for ${expectedAsset}.` };
      }
    } else if (expectedAssetId) {
      if (tx.type !== "axfer") {
        return { success: false, reason: `Expected ASA transfer, got '${tx.type}'.` };
      }

      const txAssetId = tx["asset-transfer-transaction"]?.["asset-id"];
      const receiver = tx["asset-transfer-transaction"]?.receiver;
      const amount = tx["asset-transfer-transaction"]?.amount;
      const expectedMicro = Math.round(parseFloat(expectedAmount) * 10 ** tokenDecimals);

      if (txAssetId !== expectedAssetId) {
        return { success: false, reason: `Asset ID mismatch. Expected: ${expectedAssetId}` };
      }
      if (receiver !== expectedRecipient) {
        return { success: false, reason: `Receiver mismatch. Expected: ${expectedRecipient}` };
      }
      if (amount < expectedMicro) {
        return { success: false, reason: `Amount mismatch for ${expectedAsset}.` };
      }
    } else {
      return { success: false, reason: "Unsupported asset route." };
    }

    const confirmedRound = tx["confirmed-round"];
    if (!confirmedRound || confirmedRound <= 0) {
      return { success: false, reason: "Transaction not yet confirmed in a block.", pending: true };
    }

    return { success: true, round: confirmedRound };
  } catch (err) {
    console.error("Algorand verification error:", err);
    return { success: false, reason: `Verification node error: ${err.message}` };
  }
}
