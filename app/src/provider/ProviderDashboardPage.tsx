import { useEffect, useState } from 'react'
import { Warehouse, ClipboardList, Building2, Boxes } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { StatTile } from '../components/ui/StatTile'
import { ErrorText } from '../components/ui/ErrorText'

interface Stats {
  warehouses: number
  pendingBookings: number
  brandsServed: number
  inventoryRows: number
}

export function ProviderDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStats() {
      const [warehouses, pendingBookings, approvedBookings, inventoryRows] = await Promise.all([
        supabase.from('warehouses').select('*', { count: 'exact', head: true }),
        supabase.from('booking_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('booking_requests').select('brand_id').eq('status', 'approved'),
        supabase.from('inventory').select('*', { count: 'exact', head: true }),
      ])

      if (cancelled) return

      const fetchError = warehouses.error ?? pendingBookings.error ?? approvedBookings.error ?? inventoryRows.error
      if (fetchError) {
        setError(fetchError.message)
        return
      }

      const brandsServed = new Set((approvedBookings.data ?? []).map((row) => row.brand_id)).size

      setStats({
        warehouses: warehouses.count ?? 0,
        pendingBookings: pendingBookings.count ?? 0,
        brandsServed,
        inventoryRows: inventoryRows.count ?? 0,
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
        <StatTile label="Warehouses" value={stats?.warehouses ?? '—'} icon={Warehouse} />
        <StatTile label="Pending bookings" value={stats?.pendingBookings ?? '—'} icon={ClipboardList} />
        <StatTile label="Brands served" value={stats?.brandsServed ?? '—'} icon={Building2} />
        <StatTile label="Inventory rows" value={stats?.inventoryRows ?? '—'} icon={Boxes} />
      </div>
    </DashboardShell>
  )
}
