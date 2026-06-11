export async function verifyEvmTx(
  network,
  txHash,
  expectedRecipient,
  expectedAsset,
  expectedAmount,
  tokenAddress,
  tokenDecimals = 18
) {
  const rpcUrl = network.rpcUrl;

  try {
    const txResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionByHash",
        params: [txHash]
      })
    });
    const txResult = await txResponse.json();
    const tx = txResult.result;

    if (!tx) {
      return { success: false, reason: "Transaction not found on chain yet.", pending: true };
    }

    const receiptResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "eth_getTransactionReceipt",
        params: [txHash]
      })
    });
    const receiptResult = await receiptResponse.json();
    const receipt = receiptResult.result;

    if (!receipt) {
      return { success: false, reason: "Transaction is still pending.", pending: true };
    }

    if (receipt.status !== "0x1") {
      return { success: false, reason: "Transaction failed on-chain." };
    }

    const blockNumberResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "eth_blockNumber",
        params: []
      })
    });
    const blockNumberResult = await blockNumberResponse.json();
    const currentBlock = parseInt(blockNumberResult.result, 16);
    const txBlock = parseInt(tx.blockNumber, 16);
    const confirmations = currentBlock - txBlock;

    if (confirmations < 1) {
      return { success: false, reason: "Insufficient block confirmations.", pending: true, confirmations };
    }

    const nativeSymbol = network.native?.symbol;
    if (expectedAsset === nativeSymbol) {
      const recipientMatch = tx.to && tx.to.toLowerCase() === expectedRecipient.toLowerCase();
      const nativeDecimals = network.native?.decimals ?? 18;
      const expectedWei = BigInt(Math.floor(parseFloat(expectedAmount) * 10 ** nativeDecimals));
      const actualWei = BigInt(tx.value);

      if (!recipientMatch) {
        return { success: false, reason: `Recipient mismatch. Expected: ${expectedRecipient}, Got: ${tx.to}` };
      }
      if (actualWei < expectedWei) {
        return { success: false, reason: `Native amount mismatch for ${expectedAsset}.` };
      }
    } else if (tokenAddress) {
      const contractMatch = tx.to && tx.to.toLowerCase() === tokenAddress.toLowerCase();
      if (!contractMatch) {
        return { success: false, reason: `Asset contract mismatch. Expected: ${tokenAddress}, Got: ${tx.to}` };
      }

      const data = tx.input;
      if (!data || !data.startsWith("0xa9059cbb")) {
        return { success: false, reason: "Transaction is not an ERC20 transfer call." };
      }

      const recipientHex = "0x" + data.slice(34, 74);
      const valueHex = "0x" + data.slice(74, 138);
      const recipientMatch = recipientHex.toLowerCase() === expectedRecipient.toLowerCase();
      const tokenScale = BigInt(10 ** tokenDecimals);
      const expectedTokens = BigInt(Math.floor(parseFloat(expectedAmount) * Number(tokenScale)));
      const actualTokens = BigInt(valueHex);

      if (!recipientMatch) {
        return { success: false, reason: `Token recipient mismatch. Expected: ${expectedRecipient}` };
      }
      if (actualTokens < expectedTokens) {
        return {
          success: false,
          reason: `Token amount mismatch. Expected: ${expectedAmount} ${expectedAsset}`
        };
      }
    } else {
      return { success: false, reason: "Unsupported asset route." };
    }

    return { success: true, confirmations };
  } catch (err) {
    console.error("EVM verification error:", err);
    return { success: false, reason: `Verification node error: ${err.message}` };
  }
}
