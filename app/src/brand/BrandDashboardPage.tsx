import { useEffect, useState } from 'react'
import { Package, Tags, ClipboardList, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { StatTile } from '../components/ui/StatTile'
import { ErrorText } from '../components/ui/ErrorText'

interface Stats {
  products: number
  skuMappings: number
  pendingBookings: number
  unresolvedOrders: number
}

export function BrandDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStats() {
      const [products, skuMappings, pendingBookings, unresolvedOrders] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('sku_mappings').select('*', { count: 'exact', head: true }),
        supabase.from('booking_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('platform_orders').select('*', { count: 'exact', head: true }).neq('status', 'resolved'),
      ])

      if (cancelled) return

      const fetchError = products.error ?? skuMappings.error ?? pendingBookings.error ?? unresolvedOrders.error
      if (fetchError) {
        setError(fetchError.message)
        return
      }

      setStats({
        products: products.count ?? 0,
        skuMappings: skuMappings.count ?? 0,
        pendingBookings: pendingBookings.count ?? 0,
        unresolvedOrders: unresolvedOrders.count ?? 0,
      })
    }

    void loadStats()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <DashboardShell title="Overview">
      {error && (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Products" value={stats?.products ?? '—'} icon={Package} />
        <StatTile label="SKU mappings" value={stats?.skuMappings ?? '—'} icon={Tags} />
        <StatTile label="Pending bookings" value={stats?.pendingBookings ?? '—'} icon={ClipboardList} />
        <StatTile label="Unresolved orders" value={stats?.unresolvedOrders ?? '—'} icon={ShoppingCart} />
      </div>
    </DashboardShell>
  )
}
