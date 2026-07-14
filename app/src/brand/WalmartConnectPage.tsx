import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { connectWalmart, getWalmartStatus, triggerWalmartSync } from '../lib/worker'
import type { WalmartStatus } from '../lib/worker'
import { Wallet, Clock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatTile } from '../components/ui/StatTile'

export function WalmartConnectPage() {
  const { session } = useAuth()
  const [status, setStatus] = useState<WalmartStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      if (!session) return
      try {
        const result = await getWalmartStatus(session.access_token)
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
      await connectWalmart(session.access_token, { clientId, clientSecret })
      setStatus({ connected: true, lastSyncedAt: null })
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
      const result = await triggerWalmartSync(session.access_token)
      setSyncResult(result.syncedCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <DashboardShell title="Connect Walmart">
      <div className="mx-auto max-w-md">
        {error && (
          <div className="mb-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {loading && <EmptyState>Loading connection status…</EmptyState>}

        {!loading && status?.connected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Status" value="Connected" icon={Wallet} />
              <StatTile label="Last synced" value={status.lastSyncedAt ?? 'Never'} icon={Clock} />
            </div>
            <Button type="button" variant="secondary" disabled={syncing} onClick={() => void handleSync()}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            {syncResult !== null && <p className="text-sm text-ink-subtle">Synced {syncResult} order(s).</p>}
          </div>
        )}

        {!loading && !status?.connected && (
          <form onSubmit={(event) => void handleConnect(event)} className="space-y-3">
            <p className="text-sm text-ink-subtle">
              Paste the Client ID and Client Secret generated in your Walmart Seller Center account.
            </p>
            <TextField
              label="Client ID"
              type="text"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              required
            />
            <TextField
              label="Client Secret"
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              required
            />
            <Button type="submit" variant="secondary" disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Walmart'}
            </Button>
          </form>
        )}
      </div>
    </DashboardShell>
  )
}
