import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DashboardShell } from '../../components/DashboardShell'
import { ErrorText } from '../../components/ui/ErrorText'
import { EmptyState } from '../../components/ui/EmptyState'
import { ListRow } from '../../components/ui/ListRow'
import { StatusBadge } from '../../components/ui/StatusBadge'
import type { Database } from '../../types/database'

type PlatformOrder = Database['public']['Tables']['platform_orders']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

function statusTone(status: PlatformOrder['status']) {
  if (status === 'resolved') return 'success'
  if (status === 'unmapped') return 'error'
  return 'neutral'
}

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
        {error && (
          <div className="mb-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {loading && <EmptyState>Loading orders…</EmptyState>}
        {!loading && orders.length === 0 && (
          <EmptyState>
            No orders visible yet — this fills in once you approve a booking request for a brand with synced
            orders.
          </EmptyState>
        )}

        <ul className="space-y-2">
          {orders.map((order) => {
            const brand = brands.find((b) => b.id === order.brand_id)
            return (
              <ListRow key={order.id}>
                <span className="text-ink-muted">
                  {brand?.company_name ?? brand?.display_name ?? 'Unknown brand'} — {order.platform} #
                  {order.platform_order_id}
                </span>
                <StatusBadge tone={statusTone(order.status)}>{order.resolved_master_sku ?? order.status}</StatusBadge>
              </ListRow>
            )
          })}
        </ul>
      </div>
    </DashboardShell>
  )
}
