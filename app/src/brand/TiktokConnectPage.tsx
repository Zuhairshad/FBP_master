import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { getTiktokStatus, requestTiktokInstallUrl, triggerTiktokSync } from '../lib/worker'
import type { TiktokStatus } from '../lib/worker'
import { Button } from '../components/ui/Button'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'

export function TiktokConnectPage() {
  const { session } = useAuth()
  const [status, setStatus] = useState<TiktokStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      if (!session) return
      try {
        const result = await getTiktokStatus(session.access_token)
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

  async function handleConnect() {
    if (!session) return
    setError(null)
    setConnecting(true)

    try {
      const { url } = await requestTiktokInstallUrl(session.access_token)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the connection')
      setConnecting(false)
    }
  }

  async function handleSync() {
    if (!session) return
    setError(null)
    setSyncing(true)
    setSyncResult(null)

    try {
      const result = await triggerTiktokSync(session.access_token)
      setSyncResult(result.syncedCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <DashboardShell title="Connect TikTok Shop">
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
              Connected to shop <span className="font-medium text-ink">{status.shopId}</span>
            </p>
            <p className="text-sm text-ink-subtle">Last synced: {status.lastSyncedAt ?? 'never'}</p>
            <Button type="button" variant="secondary" disabled={syncing} onClick={() => void handleSync()}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            {syncResult !== null && <p className="text-sm text-ink-subtle">Synced {syncResult} order(s).</p>}
          </div>
        )}

        {!loading && !status?.connected && (
          <Button type="button" variant="secondary" disabled={connecting} onClick={() => void handleConnect()}>
            {connecting ? 'Connecting…' : 'Connect TikTok Shop'}
          </Button>
        )}
      </div>
    </DashboardShell>
  )
}
