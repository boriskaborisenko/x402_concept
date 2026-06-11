import { useState } from 'react'
import { useAppKit } from '@reown/appkit/react'
import { useWallet, type Wallet } from '@txnlab/use-wallet-react'
import { useDisconnect } from 'wagmi'
import { usePaymentWallet } from '../hooks/usePaymentWallet'

type WalletConnectPanelProps = {
  onReset?: () => void
}

export function WalletConnectPanel({ onReset }: WalletConnectPanelProps) {
  const { chain, evmAccount, activeWallet } = usePaymentWallet()
  const { wallets, isReady } = useWallet()
  const { open } = useAppKit()
  const { disconnect: disconnectEvm } = useDisconnect()

  const disconnectAll = async () => {
    if (evmAccount.isConnected) {
      disconnectEvm()
    }
    if (activeWallet) {
      await activeWallet.disconnect()
    }
    onReset?.()
  }

  if (chain === 'bsc' && evmAccount.address) {
    return (
      <ConnectedWalletCard
        name="WalletConnect"
        network="BSC Testnet · USDC"
        address={evmAccount.address}
        onDisconnect={disconnectAll}
      />
    )
  }

  if (chain === 'algorand' && activeWallet) {
    return (
      <div className="connected-wallet">
        <div className="wallet-header">
          <img src={activeWallet.metadata.icon} alt="" width={28} height={28} />
          <div>
            <strong>{activeWallet.metadata.name}</strong>
            <p className="muted wallet-network">Algorand Testnet · USDCa</p>
          </div>
        </div>
        {activeWallet.activeAccount && <p className="mono">{activeWallet.activeAccount.address}</p>}
        {activeWallet.accounts.length > 1 && (
          <select
            value={activeWallet.activeAccount?.address ?? ''}
            onChange={(event) => activeWallet.setActiveAccount(event.target.value)}
          >
            {activeWallet.accounts.map((account) => (
              <option key={account.address} value={account.address}>
                {account.name || account.address}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="btn-secondary" onClick={() => disconnectAll()}>
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="wallet-picker">
      <p className="muted">Pick any wallet — the payment route is chosen automatically.</p>
      <div className="wallet-options">
        <EvmWalletOption
          onConnect={async () => {
            if (activeWallet) {
              await activeWallet.disconnect()
            }
            open()
          }}
        />
        {isReady ? (
          wallets.map((wallet) => (
            <AlgorandWalletOption
              key={wallet.walletKey}
              wallet={wallet}
              onBeforeConnect={async () => {
                if (evmAccount.isConnected) {
                  disconnectEvm()
                }
              }}
            />
          ))
        ) : (
          <p className="muted">Loading Algorand wallets...</p>
        )}
      </div>
    </div>
  )
}

function EvmWalletOption({ onConnect }: { onConnect: () => Promise<void> }) {
  const [isConnecting, setIsConnecting] = useState(false)

  return (
    <button
      type="button"
      className="wallet-option"
      disabled={isConnecting}
      onClick={() => {
        setIsConnecting(true)
        onConnect()
          .catch(() => undefined)
          .finally(() => setIsConnecting(false))
      }}
    >
      <span className="wallet-icon wallet-icon-evm">WC</span>
      <span className="wallet-option-text">
        <strong>WalletConnect</strong>
        <small>BSC Testnet · USDC</small>
      </span>
      {isConnecting && <small className="wallet-status">Opening...</small>}
    </button>
  )
}

function AlgorandWalletOption({
  wallet,
  onBeforeConnect
}: {
  wallet: Wallet
  onBeforeConnect: () => Promise<void>
}) {
  const [isConnecting, setIsConnecting] = useState(false)

  return (
    <button
      type="button"
      className="wallet-option"
      disabled={isConnecting}
      onClick={() => {
        setIsConnecting(true)
        onBeforeConnect()
          .then(() => wallet.connect())
          .catch(() => undefined)
          .finally(() => setIsConnecting(false))
      }}
    >
      <img src={wallet.metadata.icon} alt="" width={28} height={28} />
      <span className="wallet-option-text">
        <strong>{wallet.metadata.name}</strong>
        <small>Algorand Testnet · USDCa</small>
      </span>
      {isConnecting && <small className="wallet-status">Connecting...</small>}
    </button>
  )
}

function ConnectedWalletCard({
  name,
  network,
  address,
  onDisconnect
}: {
  name: string
  network: string
  address: string
  onDisconnect: () => void
}) {
  return (
    <div className="connected-wallet">
      <div className="wallet-header">
        <span className="wallet-icon wallet-icon-evm">WC</span>
        <div>
          <strong>{name}</strong>
          <p className="muted wallet-network">{network}</p>
        </div>
      </div>
      <p className="mono">{address}</p>
      <button type="button" className="btn-secondary" onClick={() => onDisconnect()}>
        Disconnect
      </button>
    </div>
  )
}
