import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import type { Database } from '../types/database'

type Warehouse = Database['public']['Tables']['warehouses']['Row']
type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type BookingRequest = Database['public']['Tables']['booking_requests']['Row']

export function BookingsPage() {
  const { profile } = useAuth()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [spaces, setSpaces] = useState<StorageSpace[]>([])
  const [providers, setProviders] = useState<Profile[]>([])
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestingSpaceId, setRequestingSpaceId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [warehousesResult, spacesResult, providersResult, bookingsResult] = await Promise.all([
        supabase.from('warehouses').select('*'),
        supabase.from('storage_spaces').select('*'),
        supabase.from('profiles').select('*').eq('role', 'provider'),
        supabase.from('booking_requests').select('*'),
      ])

      if (cancelled) return

      const fetchError =
        warehousesResult.error ?? spacesResult.error ?? providersResult.error ?? bookingsResult.error
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setWarehouses(warehousesResult.data ?? [])
        setSpaces(spacesResult.data ?? [])
        setProviders(providersResult.data ?? [])
        setBookings(bookingsResult.data ?? [])
      }
      setLoading(false)
    }

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRequestBooking(spaceId: string) {
    if (!profile) return
    setError(null)
    setRequestingSpaceId(spaceId)

    const { data, error: insertError } = await supabase
      .from('booking_requests')
      .insert({ brand_id: profile.id, storage_space_id: spaceId })
      .select()
      .single()

    setRequestingSpaceId(null)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setBookings((current) => [data, ...current])
  }

  function bookingForSpace(spaceId: string) {
    return bookings.find((booking) => booking.storage_space_id === spaceId)
  }

  return (
    <DashboardShell title="Find a Provider">
      <div className="mx-auto max-w-2xl">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-slate-500">Loading providers…</p>}
        {!loading && warehouses.length === 0 && (
          <p className="text-sm text-slate-500">No providers available yet.</p>
        )}

        <ul className="space-y-4">
          {warehouses.map((warehouse) => {
            const provider = providers.find((p) => p.id === warehouse.provider_id)
            const warehouseSpaces = spaces.filter((space) => space.warehouse_id === warehouse.id)

            return (
              <li
                key={warehouse.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {provider?.company_name ?? provider?.display_name ?? 'Unknown provider'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {warehouse.name} — {warehouse.city}, {warehouse.country}
                </p>

                <ul className="mt-3 space-y-2">
                  {warehouseSpaces.map((space) => {
                    const existingBooking = bookingForSpace(space.id)
                    return (
                      <li
                        key={space.id}
                        className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 dark:border-slate-800"
                      >
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {space.name} — {space.capacity_units} {space.unit_type}
                        </span>
                        {existingBooking ? (
                          <span className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                            {existingBooking.status}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={requestingSpaceId === space.id}
                            onClick={() => void handleRequestBooking(space.id)}
                            className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-slate-700"
                          >
                            {requestingSpaceId === space.id ? 'Requesting…' : 'Request booking'}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ul>
      </div>
    </DashboardShell>
  )
}
