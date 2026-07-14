import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { Database } from '../types/database'

type PlatformOrder = Database['public']['Tables']['platform_orders']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

function statusTone(status: PlatformOrder['status']) {
  if (status === 'resolved') return 'success'
  if (status === 'unmapped') return 'error'
  return 'neutral'
}

/** Shared detail view for a single `platform_orders` row, reused by each
 * brand marketplace's thin `*OrderDetailPage` wrapper (pass `platform` to
 * scope the lookup) and by `ProviderOrderDetailPage` (omit `platform`, pass
 * `showBrand` — a provider can see orders across every platform for brands
 * they serve, and needs to see which brand it belongs to). */
export function PlatformOrderDetail({
  platform,
  backTo,
  showBrand = false,
}: {
  platform?: PlatformOrder['platform']
  backTo: string
  showBrand?: boolean
}) {
  const { orderId } = useParams<{ orderId: string }>()
  const [order, setOrder] = useState<PlatformOrder | null>(null)
  const [brand, setBrand] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOrder() {
      let query = supabase.from('platform_orders').select('*').eq('id', orderId ?? '')
      if (platform) {
        query = query.eq('platform', platform)
      }
      const { data, error: fetchError } = await query.single()

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setOrder(data)

      if (showBrand) {
        const { data: brandData } = await supabase.from('profiles').select('*').eq('id', data.brand_id).single()
        if (!cancelled) setBrand(brandData)
      }

      setLoading(false)
    }

    void loadOrder()
    return () => {
      cancelled = true
    }
  }, [orderId, platform, showBrand])

  return (
    <DashboardShell title={order ? `${order.platform} #${order.platform_order_id}` : 'Order'}>
      <div className="mx-auto max-w-2xl">
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-ink-subtle hover:text-ink">
          <ArrowLeft className="size-4" />
          Back to Orders
        </Link>

        {error && (
          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}

        {loading && (
          <div className="mt-4">
            <EmptyState>Loading order…</EmptyState>
          </div>
        )}

        {!loading && order && (
          <div className="mt-4 rounded-lg border border-hairline bg-surface-1 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-ink-subtle">{order.platform}</p>
              <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
            </div>
            <p className="mt-1 font-mono text-sm text-ink">#{order.platform_order_id}</p>
            {showBrand && (
              <p className="mt-1 text-sm text-ink-subtle">
                Brand: {brand?.company_name ?? brand?.display_name ?? 'Unknown brand'}
              </p>
            )}
            {order.resolved_master_sku && (
              <p className="mt-1 text-sm text-ink-subtle">Resolved to master SKU: {order.resolved_master_sku}</p>
            )}

            <h2 className="mt-6 text-sm font-semibold text-ink">Raw order data</h2>
            <dl className="mt-2 divide-y divide-hairline-tertiary rounded-md border border-hairline">
              {Object.entries((order.raw_data as Record<string, unknown>) ?? {}).map(([key, value]) => (
                <div key={key} className="flex gap-4 px-3 py-2 text-sm">
                  <dt className="w-40 shrink-0 font-mono text-xs text-ink-subtle">{key}</dt>
                  <dd className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
