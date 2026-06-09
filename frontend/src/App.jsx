import { useEffect, useMemo, useState } from 'react';
import algosdk from 'algosdk';
import { PeraWalletConnect } from '@perawallet/connect';
import { parseEther } from 'viem';
import { useAccount, useConnect, useDisconnect, useSendTransaction, useSwitchChain } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';
import { apiBaseUrl, peraWallet, supportedNetworks } from './config/chains.js';

const formatJson = (value) => JSON.stringify(value, null, 2);

const fetchJson = async (path, options = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed: ${response.status}`);
  }

  return payload;
};

export default function App() {
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [selectedNetworkId, setSelectedNetworkId] = useState('bsc-testnet');
  const [intent, setIntent] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [algoAccounts, setAlgoAccounts] = useState([]);

  const evmAccount = useAccount();
  const { connectors, connect, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const selectedNetwork = useMemo(() => {
    return paymentConfig?.networks?.find((network) => network.id === selectedNetworkId) || null;
  }, [paymentConfig, selectedNetworkId]);

  const isBscSelected = selectedNetworkId === 'bsc-testnet';
  const isAlgorandSelected = selectedNetworkId === 'algorand-testnet';

  useEffect(() => {
    fetchJson('/api/payment-config')
      .then(setPaymentConfig)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    peraWallet
      .reconnectSession()
      .then((accounts) => {
        if (accounts?.length) {
          setAlgoAccounts(accounts);
        }
      })
      .catch(() => undefined);
  }, []);

  const currentPayer = isAlgorandSelected ? algoAccounts[0] : evmAccount.address;

  const createIntent = async () => {
    setError('');
    setLastResult(null);

    if (!selectedNetwork) {
      setError('Network config not loaded yet.');
      return null;
    }

    if (!currentPayer) {
      setError('Connect wallet first.');
      return null;
    }

    setIsBusy(true);

    try {
      const payload = await fetchJson('/api/payment-intents', {
        method: 'POST',
        body: JSON.stringify({
          networkId: selectedNetwork.id,
          payer: currentPayer,
          resourceId: 'demo-resource'
        })
      });

      setIntent(payload.intent);
      return payload.intent;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const submitPayment = async ({ intentId, txHash, payer }) => {
    const payload = await fetchJson('/api/payments/submit', {
      method: 'POST',
      body: JSON.stringify({ intentId, txHash, payer })
    });

    setLastResult(payload.intent);
    setIntent(payload.intent);
  };

  const payWithBsc = async () => {
    setError('');
    setLastResult(null);

    if (!evmAccount.isConnected || !evmAccount.address) {
      setError('Connect EVM wallet first.');
      return;
    }

    setIsBusy(true);

    try {
      if (evmAccount.chainId !== bscTestnet.id) {
        await switchChainAsync({ chainId: bscTestnet.id });
      }

      const activeIntent = intent?.status === 'created' ? intent : await createIntent();

      if (!activeIntent) {
        return;
      }

      const txHash = await sendTransactionAsync({
        to: activeIntent.receiver,
        value: parseEther(activeIntent.amount)
      });

      await submitPayment({ intentId: activeIntent.id, txHash, payer: evmAccount.address });
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const connectAlgorand = async () => {
    setError('');

    try {
      const accounts = await peraWallet.connect();
      setAlgoAccounts(accounts);
    } catch (err) {
      if (err?.data?.type !== 'CONNECT_MODAL_CLOSED') {
        setError(err.message || 'Failed to connect Algorand wallet.');
      }
    }
  };

  const disconnectAlgorand = async () => {
    await peraWallet.disconnect();
    setAlgoAccounts([]);
  };

  const payWithAlgorand = async () => {
    setError('');
    setLastResult(null);

    if (!algoAccounts[0]) {
      setError('Connect Algorand wallet first.');
      return;
    }

    setIsBusy(true);

    try {
      const activeIntent = intent?.status === 'created' ? intent : await createIntent();

      if (!activeIntent) {
        return;
      }

      const paramsResponse = await fetch('https://testnet-api.algonode.cloud/v2/transactions/params');
      const suggestedParams = await paramsResponse.json();
      const amountMicroAlgos = Math.round(Number(activeIntent.amount) * 1_000_000);

      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: algoAccounts[0],
        receiver: activeIntent.receiver,
        amount: amountMicroAlgos,
        suggestedParams
      });

      const txGroups = [{ txn, signers: [algoAccounts[0]] }];
      const signedTxns = await peraWallet.signTransaction([txGroups]);

      const sendResponse = await fetch('https://testnet-api.algonode.cloud/v2/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-binary'
        },
        body: signedTxns[0]
      });

      if (!sendResponse.ok) {
        const text = await sendResponse.text();
        throw new Error(text || 'Failed to submit Algorand transaction.');
      }

      const sendPayload = await sendResponse.json();
      const txHash = sendPayload.txId;

      await submitPayment({ intentId: activeIntent.id, txHash, payer: algoAccounts[0] });
    } catch (err) {
      setError(err.message || 'Algorand payment failed.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">x402Easy prototype</p>
        <h1>Chain-aware payment intent demo</h1>
        <p>
          Minimal first step: connect wallet, select BSC Testnet or Algorand Testnet,
          create payment intent, send testnet payment, and verify it on the backend.
        </p>
      </section>

      <section className="card">
        <h2>1. Select payment network</h2>
        <div className="network-grid">
          {paymentConfig?.networks?.map((network) => (
            <button
              key={network.id}
              className={network.id === selectedNetworkId ? 'network selected' : 'network'}
              onClick={() => {
                setSelectedNetworkId(network.id);
                setIntent(null);
                setLastResult(null);
                setError('');
              }}
            >
              <strong>{network.displayName}</strong>
              <span>
                Pay {network.amount} {network.asset.symbol}
              </span>
              <small>{network.isReceiverConfigured ? 'Receiver configured' : 'Receiver missing'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>2. Connect wallet</h2>

        {isBscSelected && (
          <div className="row-wrap">
            {evmAccount.isConnected ? (
              <>
                <div>
                  <strong>EVM connected</strong>
                  <p>{evmAccount.address}</p>
                  <p>Chain id: {evmAccount.chainId || 'unknown'}</p>
                </div>
                <button onClick={() => disconnect()}>Disconnect EVM</button>
              </>
            ) : (
              connectors.map((connector) => (
                <button
                  key={connector.uid}
                  disabled={isConnectPending}
                  onClick={() => connect({ connector })}
                >
                  Connect {connector.name}
                </button>
              ))
            )}
          </div>
        )}

        {isAlgorandSelected && (
          <div className="row-wrap">
            {algoAccounts[0] ? (
              <>
                <div>
                  <strong>Algorand connected</strong>
                  <p>{algoAccounts[0]}</p>
                </div>
                <button onClick={disconnectAlgorand}>Disconnect Algorand</button>
              </>
            ) : (
              <button onClick={connectAlgorand}>Connect Pera Wallet</button>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>3. Create intent and pay</h2>
        {selectedNetwork && (
          <div className="summary">
            <p>
              <strong>Receiver:</strong> {selectedNetwork.receiver}
            </p>
            <p>
              <strong>Amount:</strong> {selectedNetwork.amount} {selectedNetwork.asset.symbol}
            </p>
          </div>
        )}

        <div className="actions">
          <button disabled={isBusy || !currentPayer} onClick={createIntent}>
            Create payment intent
          </button>
          {isBscSelected && (
            <button disabled={isBusy || !evmAccount.isConnected} onClick={payWithBsc}>
              Pay on BSC Testnet
            </button>
          )}
          {isAlgorandSelected && (
            <button disabled={isBusy || !algoAccounts[0]} onClick={payWithAlgorand}>
              Pay on Algorand Testnet
            </button>
          )}
        </div>

        {isBusy && <p className="muted">Working...</p>}
        {error && <p className="error">{error}</p>}
      </section>

      {intent && (
        <section className="card">
          <h2>Payment intent</h2>
          <pre>{formatJson(intent)}</pre>
        </section>
      )}

      {lastResult && (
        <section className="card success-card">
          <h2>Verification result</h2>
          <pre>{formatJson(lastResult)}</pre>
        </section>
      )}
    </main>
  );
}
