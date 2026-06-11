import { useEffect, useMemo, useState } from 'react'
import { useSwitchChain, useWriteContract } from 'wagmi'
import {
  createPaymentIntent,
  getConfig,
  getResources,
  submitPayment,
  waitForPaymentUnlock
} from './api/client'
import { CheckoutSuccess } from './components/CheckoutSuccess'
import { SettlementDebug } from './components/SettlementDebug'
import { WalletConnectPanel } from './components/WalletConnectPanel'
import { usePaymentWallet } from './hooks/usePaymentWallet'
import { payAlgorandUsdca } from './lib/payments/algorand'
import { payEvmUsdc } from './lib/payments/evm'
import { buildExplorerUrl } from './lib/explorer'
import { normalizePaymentRoute } from './lib/payments/routeAmount'
import type {
  ActiveChain,
  AppConfig,
  CheckoutPhase,
  PaymentIntent,
  Resource,
  ResourceContent
} from './types/payment'

function pickRecommendedRoute(intent: PaymentIntent, chain: ActiveChain) {
  return intent.routes.find((route) => route.chain === chain && route.recommended)
}

function isDebugMode() {
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

export default function App() {
  const debug = isDebugMode()
  const [resources, setResources] = useState<Resource[]>([])
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null)
  const [selectedResourceId, setSelectedResourceId] = useState<string>('')
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const [unlockedContent, setUnlockedContent] = useState<ResourceContent | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<CheckoutPhase>('idle')
  const [statusMessage, setStatusMessage] = useState('')

  const { chain, isConnected, evmAccount, activeAddress, signTransactions, algodClient } =
    usePaymentWallet()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()

  const selectedResource = useMemo(
    () => resources.find((resource) => resource.id === selectedResourceId) ?? null,
    [resources, selectedResourceId]
  )

  const resetCheckout = () => {
    setIntent(null)
    setUnlockedContent(null)
    setTxHash(null)
    setError('')
    setPhase('idle')
    setStatusMessage('')
  }

  useEffect(() => {
    Promise.all([getResources(), getConfig()])
      .then(([loadedResources, loadedConfig]) => {
        setResources(loadedResources)
        setAppConfig(loadedConfig)
        if (loadedResources[0]) {
          setSelectedResourceId(loadedResources[0].id)
        }
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const handlePay = async () => {
    setError('')
    setUnlockedContent(null)
    setTxHash(null)
    setPhase('idle')
    setStatusMessage('')

    if (!selectedResource) {
      setError('Select a resource first.')
      return
    }

    if (!isConnected || !chain) {
      setError('Connect wallet first.')
      return
    }

    setPhase('confirming')
    setStatusMessage('Creating payment intent…')

    try {
      const paymentIntent = await createPaymentIntent(selectedResource.id)
      setIntent(paymentIntent)

      const rawRoute = pickRecommendedRoute(paymentIntent, chain)
      if (!rawRoute) {
        throw new Error(`No recommended route found for ${chain}.`)
      }
      const route = normalizePaymentRoute(rawRoute)

      setStatusMessage('Confirm the transaction in your wallet…')

      let hash: string
      if (chain === 'bsc' || chain === 'polygon-amoy') {
        if (!evmAccount.address) {
          throw new Error('EVM wallet is not connected.')
        }
        hash = await payEvmUsdc(route, evmAccount.chainId, writeContractAsync, switchChainAsync)
      } else {
        if (!activeAddress) {
          throw new Error('Algorand wallet is not connected.')
        }
        hash = await payAlgorandUsdca(route, activeAddress, signTransactions, algodClient)
      }

      setTxHash(hash)
      setStatusMessage('Confirming on-chain…')

      const content = await (async () => {
        const unlockPromise = waitForPaymentUnlock(
          paymentIntent.id,
          hash,
          route.id,
          (event) => {
            if (event.type === 'payment_confirming') {
              setStatusMessage('Confirming on-chain…')
            }
            if (event.type === 'payment_verified') {
              setStatusMessage('Payment verified.')
            }
          }
        )

        await submitPayment(paymentIntent.id, hash, route.id)
        return unlockPromise
      })()

      setUnlockedContent(content)
      setPhase('success')
      setStatusMessage('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed.'
      setError(message)
      setPhase('failed')
      setStatusMessage('')
    }
  }

  const explorerUrl = useMemo(() => {
    if (!txHash || !chain) return null
    return buildExplorerUrl(chain, txHash, appConfig)
  }, [txHash, appConfig, chain])

  const isBusy = phase === 'confirming'

  if (phase === 'success' && unlockedContent && txHash) {
    return (
      <main className="shell">
        <p className="brand">x402 Checkout</p>
        <CheckoutSuccess txHash={txHash} explorerUrl={explorerUrl} content={unlockedContent} />
        <button type="button" className="btn-secondary" style={{ marginTop: 16 }} onClick={resetCheckout}>
          Pay again
        </button>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="brand">x402 Checkout</p>
        <h1>Pay to unlock</h1>
        <p>Connect your wallet, choose a resource, and pay in one step.</p>
      </section>

      <section className="panel">
        <h2>1. Wallet</h2>
        <WalletConnectPanel onReset={resetCheckout} />
      </section>

      <section className="panel">
        <h2>2. Resource</h2>
        <div className="resource-list">
          {resources.map((resource) => (
            <button
              key={resource.id}
              type="button"
              className={resource.id === selectedResourceId ? 'resource selected' : 'resource'}
              onClick={() => {
                setSelectedResourceId(resource.id)
                resetCheckout()
              }}
            >
              <strong>{resource.name}</strong>
              <span className="price">${resource.priceInUsd}</span>
              <small>{resource.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>3. Pay</h2>
        {!isConnected && <p className="muted">Connect a wallet to continue.</p>}
        <button
          type="button"
          className="btn-primary"
          disabled={isBusy || !isConnected}
          onClick={handlePay}
        >
          {isBusy ? 'Processing…' : `Pay $${selectedResource?.priceInUsd ?? '—'}`}
        </button>
        {statusMessage && <p className="status-line">{statusMessage}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      {debug && <SettlementDebug />}

      {debug && intent && (
        <section className="panel">
          <h2>Debug: payment intent</h2>
          <pre className="payload">{JSON.stringify(intent, null, 2)}</pre>
        </section>
      )}
    </main>
  )
}
