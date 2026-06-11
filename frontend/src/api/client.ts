import { normalizePaymentRoute } from '../lib/payments/routeAmount'
import type {
  AppConfig,
  PaymentEvent,
  PaymentIntent,
  PaymentIntentResponse,
  Resource,
  ResourceContent,
  VerifyPaymentResult
} from '../types/payment'

const API_BASE = '/api'

/** Vite proxy buffers SSE; in dev hit sidecar directly (CORS is open). */
function paymentEventsUrl(intentId: string): string {
  if (import.meta.env.DEV) {
    return `http://localhost:4000/api/payments/${intentId}/events`
  }
  return `${API_BASE}/payments/${intentId}/events`
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      (payload as { message?: string; error?: string; reason?: string }).message ||
      (payload as { message?: string; error?: string; reason?: string }).reason ||
      (payload as { message?: string; error?: string; reason?: string }).error ||
      `Request failed: ${response.status}`
    throw new Error(message)
  }

  return payload as T
}

export async function getResources(): Promise<Resource[]> {
  return fetchJson<Resource[]>('/resources')
}

export async function getConfig(): Promise<AppConfig> {
  return fetchJson<AppConfig>('/config', { cache: 'no-store' })
}

export async function createPaymentIntent(resourceId: string): Promise<PaymentIntent> {
  const response = await fetch(`${API_BASE}/payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resourceId })
  })

  const payload = (await response.json().catch(() => ({}))) as PaymentIntentResponse & {
    error?: string
    message?: string
  }

  if (response.status === 402 && payload.payment_intent) {
    const intent = payload.payment_intent
    return {
      ...intent,
      routes: (intent.routes ?? []).map((route) => normalizePaymentRoute(route))
    }
  }

  const message = payload.message || payload.error || `Request failed: ${response.status}`
  throw new Error(message)
}

export async function submitPayment(
  intentId: string,
  txHash: string,
  routeId: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/payments/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentId, txHash, routeId })
  })

  if (response.status === 202) return

  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  throw new Error(payload.error || `Submit failed: ${response.status}`)
}

export function subscribePaymentEvents(
  intentId: string,
  onEvent: (event: PaymentEvent) => void
): () => void {
  const source = new EventSource(paymentEventsUrl(intentId))

  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as PaymentEvent)
    } catch {
      console.warn('Ignored malformed payment SSE payload')
    }
  }

  return () => source.close()
}

export async function verifyPayment(
  intentId: string,
  txHash: string,
  routeId: string
): Promise<VerifyPaymentResult> {
  return fetchJson<VerifyPaymentResult>('/verify-payment', {
    method: 'POST',
    body: JSON.stringify({ intentId, txHash, routeId })
  })
}

/** If SSE misses an event, sync verify kicks in (not a minimum wait). */
const VERIFY_FALLBACK_MS = 4_000
const HARD_TIMEOUT_MS = 90_000

export function waitForPaymentUnlock(
  intentId: string,
  txHash: string,
  routeId: string,
  onEvent?: (event: PaymentEvent) => void
): Promise<ResourceContent> {
  let settled = false

  return new Promise((resolve, reject) => {
    const closeStream = subscribePaymentEvents(intentId, (event) => {
      onEvent?.(event)
      if (settled) return

      if (event.type === 'resource_unlocked') {
        done()
        resolve(event.resourceContent)
      }
      if (event.type === 'payment_failed') {
        done()
        reject(new Error(event.reason))
      }
    })

    const tryFallbackVerify = async (): Promise<ResourceContent | null> => {
      try {
        const result = await verifyPayment(intentId, txHash, routeId)
        return result.resourceContent ?? null
      } catch {
        return null
      }
    }

    const fallbackTimer = window.setTimeout(() => {
      if (settled) return
      void tryFallbackVerify().then((content) => {
        if (content && !settled) {
          done()
          resolve(content)
        }
      })
    }, VERIFY_FALLBACK_MS)

    const hardTimer = window.setTimeout(() => {
      if (settled) return
      void tryFallbackVerify().then((content) => {
        done()
        if (content) {
          resolve(content)
        } else {
          reject(
            new Error(
              'Payment confirmation timed out. Your transaction may still confirm — refresh or check the explorer.'
            )
          )
        }
      })
    }, HARD_TIMEOUT_MS)

    function done() {
      if (settled) return
      settled = true
      closeStream()
      window.clearTimeout(fallbackTimer)
      window.clearTimeout(hardTimer)
    }
  })
}
