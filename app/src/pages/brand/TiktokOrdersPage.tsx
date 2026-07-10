import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DashboardShell } from '../../components/DashboardShell'
import { ErrorText } from '../../components/ui/ErrorText'
import { EmptyState } from '../../components/ui/EmptyState'
import { ListRow } from '../../components/ui/ListRow'
import { StatusBadge } from '../../components/ui/StatusBadge'
import type { Database } from '../../types/database'

type PlatformOrder = Database['public']['Tables']['platform_orders']['Row']

function statusTone(status: PlatformOrder['status']) {
  if (status === 'resolved') return 'success'
  if (status === 'unmapped') return 'error'
  return 'neutral'
}

export function TiktokOrdersPage() {
  const [orders, setOrders] = useState<PlatformOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      const { data, error: fetchError } = await supabase
        .from('platform_orders')
        .select('*')
        .eq('platform', 'tiktok')
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
        {error && (
          <div className="mb-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {loading && <EmptyState>Loading orders…</EmptyState>}
        {!loading && orders.length === 0 && (
          <EmptyState>No orders yet — connect a TikTok Shop and sync to see orders here.</EmptyState>
        )}

        <ul className="space-y-2">
          {orders.map((order) => (
            <ListRow key={order.id}>
              <span className="text-ink-muted">
                {order.platform} #{order.platform_order_id}
              </span>
              <StatusBadge tone={statusTone(order.status)}>{order.resolved_master_sku ?? order.status}</StatusBadge>
            </ListRow>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
