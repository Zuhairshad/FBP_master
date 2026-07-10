import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import type { Database } from '../types/database'

type PlatformOrder = Database['public']['Tables']['platform_orders']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export function ProviderOrdersPage() {
  const [orders, setOrders] = useState<PlatformOrder[]>([])
  const [brands, setBrands] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [ordersResult, brandsResult] = await Promise.all([
        supabase.from('platform_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'brand'),
      ])

      if (cancelled) return

      const fetchError = ordersResult.error ?? brandsResult.error
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setOrders(ordersResult.data ?? [])
        setBrands(brandsResult.data ?? [])
      }
      setLoading(false)
    }

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <DashboardShell title="Brand Orders">
      <div className="mx-auto max-w-2xl">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-slate-500">Loading orders…</p>}
        {!loading && orders.length === 0 && (
          <p className="text-sm text-slate-500">
            No orders visible yet — this fills in once you approve a booking request for a brand
            with synced orders.
          </p>
        )}

        <ul className="space-y-2">
          {orders.map((order) => {
            const brand = brands.find((b) => b.id === order.brand_id)
            return (
              <li
                key={order.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
              >
                <span className="text-slate-700 dark:text-slate-300">
                  {brand?.company_name ?? brand?.display_name ?? 'Unknown brand'} — {order.platform} #
                  {order.platform_order_id}
                </span>
                <span className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                  {order.resolved_master_sku ?? order.status}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </DashboardShell>
  )
}
