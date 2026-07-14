import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { getEbayStatus, requestEbayInstallUrl, triggerEbaySync } from '../lib/worker'
import type { EbayStatus } from '../lib/worker'
import { Gavel, Clock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatTile } from '../components/ui/StatTile'

export function EbayConnectPage() {
  const { session } = useAuth()
  const [status, setStatus] = useState<EbayStatus | null>(null)
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
        const result = await getEbayStatus(session.access_token)
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
      const { url } = await requestEbayInstallUrl(session.access_token)
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
      const result = await triggerEbaySync(session.access_token)
      setSyncResult(result.syncedCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <DashboardShell title="Connect eBay">
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
              <StatTile label="Status" value="Connected" icon={Gavel} />
              <StatTile label="Last synced" value={status.lastSyncedAt ?? 'Never'} icon={Clock} />
            </div>
            <Button type="button" variant="secondary" disabled={syncing} onClick={() => void handleSync()}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            {syncResult !== null && <p className="text-sm text-ink-subtle">Synced {syncResult} order(s).</p>}
          </div>
        )}

        {!loading && !status?.connected && (
          <Button type="button" variant="secondary" disabled={connecting} onClick={() => void handleConnect()}>
            {connecting ? 'Connecting…' : 'Connect eBay'}
          </Button>
        )}
      </div>
    </DashboardShell>
  )
}
