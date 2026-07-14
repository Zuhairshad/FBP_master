import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableRowLink } from '../components/ui/Table'
import type { Database } from '../types/database'

type PlatformOrder = Database['public']['Tables']['platform_orders']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

function statusTone(status: PlatformOrder['status']) {
  if (status === 'resolved') return 'success'
  if (status === 'unmapped') return 'error'
  return 'neutral'
}

function fulfillmentTone(status: PlatformOrder['fulfillment_status']) {
  if (status === 'delivered') return 'success'
  return 'neutral'
}

/** Shared order-list view reused by each brand marketplace's thin
 * `*OrdersPage` wrapper (pass `platform` to scope the query) and by
 * `ProviderOrdersPage` (omit `platform`, pass `showBrand` — a provider sees
 * orders across every platform for brands they serve, via the
 * approved-booking RLS policy, and needs to see which brand each belongs
 * to). */
export function PlatformOrdersList({
  platform,
  detailBasePath,
  showBrand = false,
  title = 'Orders',
}: {
  platform?: PlatformOrder['platform']
  detailBasePath: string
  showBrand?: boolean
  title?: string
}) {
  const [orders, setOrders] = useState<PlatformOrder[]>([])
  const [brands, setBrands] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      let query = supabase.from('platform_orders').select('*')
      if (platform) {
        query = query.eq('platform', platform)
      }
      const [ordersResult, brandsResult] = await Promise.all([
        query.order('created_at', { ascending: false }),
        showBrand ? supabase.from('profiles').select('*').eq('role', 'brand') : Promise.resolve({ data: [], error: null }),
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

    void loadOrders()
    return () => {
      cancelled = true
    }
  }, [platform, showBrand])

  function brandLabel(brandId: string) {
    const brand = brands.find((candidate) => candidate.id === brandId)
    return brand?.company_name ?? brand?.display_name ?? 'Unknown brand'
  }

  return (
    <DashboardShell title={title}>
      {error && (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {loading && <EmptyState>Loading orders…</EmptyState>}
      {!loading && orders.length === 0 && (
        <EmptyState>
          {showBrand
            ? 'No orders visible yet — this fills in once you approve a booking request for a brand with synced orders.'
            : 'No orders yet — connect a store and sync to see orders here.'}
        </EmptyState>
      )}
      {!loading && orders.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              {showBrand && <TableHead>Brand</TableHead>}
              {!platform && <TableHead>Platform</TableHead>}
              <TableHead>Order ID</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Fulfillment</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id} to={`${detailBasePath}/${order.id}`}>
                {showBrand && <TableCell>{brandLabel(order.brand_id)}</TableCell>}
                {!platform && <TableCell className="capitalize">{order.platform}</TableCell>}
                <TableCell>
                  <TableRowLink to={`${detailBasePath}/${order.id}`} className="font-mono text-xs">
                    #{order.platform_order_id}
                  </TableRowLink>
                </TableCell>
                <TableCell className="font-mono text-xs">{order.resolved_master_sku ?? '—'}</TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={fulfillmentTone(order.fulfillment_status)}>{order.fulfillment_status}</StatusBadge>
                </TableCell>
                <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DashboardShell>
  )
}
