import { useCallback, useState } from 'react'

const API_BASE = import.meta.env.DEV ? 'http://localhost:4000' : ''

function adminHeaders(): HeadersInit {
  const token = import.meta.env.VITE_ADMIN_TOKEN
  if (token) {
    return { Authorization: `Bearer ${token}` }
  }
  return { 'X-Merchant-Admin': '1' }
}

export function SettlementDebug() {
  const [balances, setBalances] = useState<unknown>(null)
  const [queue, setQueue] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setError('')
    setBusy(true)
    try {
      const [balRes, queueRes] = await Promise.all([
        fetch(`${API_BASE}/admin/balances`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/admin/settlement/queue`, { headers: adminHeaders() })
      ])
      if (!balRes.ok || !queueRes.ok) {
        throw new Error('Admin API failed — set VITE_ADMIN_TOKEN or use X-Merchant-Admin')
      }
      setBalances(await balRes.json())
      setQueue(await queueRes.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settlement data')
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <section className="panel">
      <h2>Debug: settlement</h2>
      <p className="muted">Treasury balances, vault, pending queue (admin API).</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => void refresh()}>
        {busy ? 'Loading…' : 'Refresh settlement'}
      </button>
      {error && <p className="error">{error}</p>}
      {balances != null && (
        <>
          <h3>Balances</h3>
          <pre className="payload">{JSON.stringify(balances, null, 2)}</pre>
        </>
      )}
      {queue != null && (
        <>
          <h3>Queue</h3>
          <pre className="payload">{JSON.stringify(queue, null, 2)}</pre>
        </>
      )}
    </section>
  )
}
