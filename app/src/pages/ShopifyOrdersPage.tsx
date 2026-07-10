import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import type { Database } from '../types/database'

type PlatformOrder = Database['public']['Tables']['platform_orders']['Row']

export function ShopifyOrdersPage() {
  const [orders, setOrders] = useState<PlatformOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      const { data, error: fetchError } = await supabase
        .from('platform_orders')
        .select('*')
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setOrders(data ?? [])
      }
      setLoading(false)
    }

    void loadOrders()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <DashboardShell title="Orders">
      <div className="mx-auto max-w-2xl">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-slate-500">Loading orders…</p>}
        {!loading && orders.length === 0 && (
          <p className="text-sm text-slate-500">No orders yet — connect a store and sync to see orders here.</p>
        )}

        <ul className="space-y-2">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
            >
              <span className="text-slate-700 dark:text-slate-300">
                {order.platform} #{order.platform_order_id}
              </span>
              <span
                className={
                  order.status === 'resolved'
                    ? 'text-xs font-medium uppercase text-green-600'
                    : order.status === 'unmapped'
                      ? 'text-xs font-medium uppercase text-amber-600'
                      : 'text-xs font-medium uppercase text-slate-500'
                }
              >
                {order.resolved_master_sku ?? order.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
