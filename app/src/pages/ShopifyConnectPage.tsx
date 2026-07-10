import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { getShopifyStatus, requestShopifyInstallUrl, triggerShopifySync } from '../lib/worker'
import type { ShopifyStatus } from '../lib/worker'

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
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-slate-500">Loading connection status…</p>}

        {!loading && status?.connected && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Connected to <span className="font-medium">{status.shopDomain}</span>
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Last synced: {status.lastSyncedAt ?? 'never'}
            </p>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleSync()}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-700"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            {syncResult !== null && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Synced {syncResult} order(s).</p>
            )}
          </div>
        )}

        {!loading && !status?.connected && (
          <form onSubmit={(event) => void handleConnect(event)} className="space-y-3">
            <label className="block text-sm">
              Shop domain
              <input
                type="text"
                value={shop}
                onChange={(event) => setShop(event.target.value)}
                placeholder="your-store.myshopify.com"
                required
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <button
              type="submit"
              disabled={connecting}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-700"
            >
              {connecting ? 'Connecting…' : 'Connect Shopify'}
            </button>
          </form>
        )}
      </div>
    </DashboardShell>
  )
}
