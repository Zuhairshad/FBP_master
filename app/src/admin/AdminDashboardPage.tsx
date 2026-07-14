import { useEffect, useState } from 'react'
import { Building2, Warehouse, ClipboardList, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { StatTile } from '../components/ui/StatTile'
import { ErrorText } from '../components/ui/ErrorText'

interface Stats {
  brands: number
  providers: number
  pendingBookings: number
  unresolvedOrders: number
}

export function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStats() {
      const [brands, providers, pendingBookings, unresolvedOrders] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'brand'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'provider'),
        supabase.from('booking_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('platform_orders').select('*', { count: 'exact', head: true }).neq('status', 'resolved'),
      ])

      if (cancelled) return

      const fetchError = brands.error ?? providers.error ?? pendingBookings.error ?? unresolvedOrders.error
      if (fetchError) {
        setError(fetchError.message)
        return
      }

      setStats({
        brands: brands.count ?? 0,
        providers: providers.count ?? 0,
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
        <StatTile label="Brands" value={stats?.brands ?? '—'} icon={Building2} />
        <StatTile label="Providers" value={stats?.providers ?? '—'} icon={Warehouse} />
        <StatTile label="Pending bookings" value={stats?.pendingBookings ?? '—'} icon={ClipboardList} />
        <StatTile label="Unresolved orders" value={stats?.unresolvedOrders ?? '—'} icon={ShoppingCart} />
      </div>
    </DashboardShell>
  )
}
