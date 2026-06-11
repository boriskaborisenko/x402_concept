import type { ResourceContent } from '../types/payment'

type CheckoutSuccessProps = {
  txHash: string
  explorerUrl: string | null
  content: ResourceContent
}

export function CheckoutSuccess({ txHash, explorerUrl, content }: CheckoutSuccessProps) {
  return (
    <section className="success-panel">
      <div className="success-badge">Payment confirmed</div>
      <p className="success-lead">Your payment was verified on-chain. Here is your unlocked resource.</p>
      {explorerUrl && (
        <p className="tx-link">
          <a href={explorerUrl} target="_blank" rel="noreferrer">
            View transaction
          </a>
          <span className="mono">{txHash.slice(0, 12)}…{txHash.slice(-8)}</span>
        </p>
      )}
      <div className="unlocked-box">
        {content.type === 'image' ? (
          <>
            <h3>{content.title}</h3>
            <img src={content.payload} alt={content.title} className="unlocked-image" />
          </>
        ) : (
          <>
            <h3>{content.title}</h3>
            <pre className="payload">{content.payload}</pre>
          </>
        )}
      </div>
    </section>
  )
}
