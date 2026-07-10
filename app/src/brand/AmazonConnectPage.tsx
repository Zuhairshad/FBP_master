import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { connectAmazon, getAmazonStatus, triggerAmazonSync } from '../lib/worker'
import type { AmazonStatus } from '../lib/worker'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'

export function AmazonConnectPage() {
  const { session } = useAuth()
  const [status, setStatus] = useState<AmazonStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState('')
  const [marketplaceId, setMarketplaceId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      if (!session) return
      try {
        const result = await getAmazonStatus(session.access_token)
        if (!cancelled) setStatus(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load connection status')
      }
      if (!cancelled) setLoading(false)
    }

    void loadStatus()
    return () => {
      cancelled = true
    }
  }, [session])

  async function handleConnect(event: FormEvent) {
    event.preventDefault()
    if (!session) return
    setError(null)
    setConnecting(true)

    try {
      await connectAmazon(session.access_token, { refreshToken, marketplaceId })
      setStatus({ connected: true, marketplaceId, lastSyncedAt: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setConnecting(false)
    }
  }

  async function handleSync() {
    if (!session) return
    setError(null)
    setSyncing(true)
    setSyncResult(null)

    try {
      const result = await triggerAmazonSync(session.access_token)
      setSyncResult(result.syncedCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <DashboardShell title="Connect Amazon">
      <div className="mx-auto max-w-md">
        {error && (
          <div className="mb-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {loading && <EmptyState>Loading connection status…</EmptyState>}

        {!loading && status?.connected && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Connected to marketplace <span className="font-medium text-ink">{status.marketplaceId}</span>
            </p>
            <p className="text-sm text-ink-subtle">Last synced: {status.lastSyncedAt ?? 'never'}</p>
            <Button type="button" variant="secondary" disabled={syncing} onClick={() => void handleSync()}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            {syncResult !== null && <p className="text-sm text-ink-subtle">Synced {syncResult} order(s).</p>}
          </div>
        )}

        {!loading && !status?.connected && (
          <form onSubmit={(event) => void handleConnect(event)} className="space-y-3">
            <p className="text-sm text-ink-subtle">
              Paste the refresh token generated in Seller Central's self-authorization flow, along with your
              marketplace id.
            </p>
            <TextField
              label="Refresh token"
              type="text"
              value={refreshToken}
              onChange={(event) => setRefreshToken(event.target.value)}
              required
            />
            <TextField
              label="Marketplace ID"
              type="text"
              value={marketplaceId}
              onChange={(event) => setMarketplaceId(event.target.value)}
              placeholder="ATVPDKIKX0DER"
              required
            />
            <Button type="submit" variant="secondary" disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Amazon'}
            </Button>
          </form>
        )}
      </div>
    </DashboardShell>
  )
}
