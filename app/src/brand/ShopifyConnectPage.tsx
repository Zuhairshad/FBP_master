import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { getShopifyStatus, requestShopifyInstallUrl, triggerShopifySync } from '../lib/worker'
import type { ShopifyStatus } from '../lib/worker'
import { ShoppingBag, Clock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatTile } from '../components/ui/StatTile'

export function ShopifyConnectPage() {
  const { session } = useAuth()
  const [status, setStatus] = useState<ShopifyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shop, setShop] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      if (!session) return
      try {
        const result = await getShopifyStatus(session.access_token)
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
      const { url } = await requestShopifyInstallUrl(session.access_token, shop)
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
      const result = await triggerShopifySync(session.access_token)
      setSyncResult(result.syncedCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <DashboardShell title="Connect Shopify">
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
              <StatTile label="Shop domain" value={status.shopDomain ?? '—'} icon={ShoppingBag} />
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
            <TextField
              label="Shop domain"
              type="text"
              value={shop}
              onChange={(event) => setShop(event.target.value)}
              placeholder="your-store.myshopify.com"
              required
            />
            <Button type="submit" variant="secondary" disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Shopify'}
            </Button>
          </form>
        )}
      </div>
    </DashboardShell>
  )
}
