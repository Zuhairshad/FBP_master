import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import type { Database } from '../types/database'

type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type BookingRequest = Database['public']['Tables']['booking_requests']['Row']

export function ProviderBookingsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [brands, setBrands] = useState<Profile[]>([])
  const [spaces, setSpaces] = useState<StorageSpace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [bookingsResult, brandsResult, spacesResult] = await Promise.all([
        supabase.from('booking_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'brand'),
        supabase.from('storage_spaces').select('*'),
      ])

      if (cancelled) return

      const fetchError = bookingsResult.error ?? brandsResult.error ?? spacesResult.error
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setBookings(bookingsResult.data ?? [])
        setBrands(brandsResult.data ?? [])
        setSpaces(spacesResult.data ?? [])
      }
      setLoading(false)
    }

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDecision(id: string, status: 'approved' | 'rejected') {
    setError(null)
    setDecidingId(id)

    const { data, error: updateError } = await supabase
      .from('booking_requests')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    setDecidingId(null)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setBookings((current) => current.map((booking) => (booking.id === id ? data : booking)))
  }

  return (
    <DashboardShell title="Booking Requests">
      <div className="mx-auto max-w-2xl">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-slate-500">Loading booking requests…</p>}
        {!loading && bookings.length === 0 && (
          <p className="text-sm text-slate-500">No booking requests yet.</p>
        )}

        <ul className="space-y-3">
          {bookings.map((booking) => {
            const brand = brands.find((b) => b.id === booking.brand_id)
            const space = spaces.find((s) => s.id === booking.storage_space_id)

            return (
              <li
                key={booking.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {brand?.company_name ?? brand?.display_name ?? 'Unknown brand'}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      requesting {space?.name ?? 'a storage space'}
                    </p>
                  </div>
                  <span className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                    {booking.status}
                  </span>
                </div>

                {booking.status === 'pending' && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={decidingId === booking.id}
                      onClick={() => void handleDecision(booking.id, 'approved')}
                      className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={decidingId === booking.id}
                      onClick={() => void handleDecision(booking.id, 'rejected')}
                      className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 disabled:opacity-50 dark:border-red-800"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </DashboardShell>
  )
}
