import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DashboardShell } from '../../components/DashboardShell'
import { Button } from '../../components/ui/Button'
import { ErrorText } from '../../components/ui/ErrorText'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/ui/StatusBadge'
import type { Database } from '../../types/database'

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
        {error && (
          <div className="mb-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {loading && <EmptyState>Loading booking requests…</EmptyState>}
        {!loading && bookings.length === 0 && <EmptyState>No booking requests yet.</EmptyState>}

        <ul className="space-y-3">
          {bookings.map((booking) => {
            const brand = brands.find((b) => b.id === booking.brand_id)
            const space = spaces.find((s) => s.id === booking.storage_space_id)

            return (
              <li key={booking.id} className="rounded-lg border border-hairline bg-surface-1 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-ink">
                      {brand?.company_name ?? brand?.display_name ?? 'Unknown brand'}
                    </p>
                    <p className="text-sm text-ink-subtle">requesting {space?.name ?? 'a storage space'}</p>
                  </div>
                  <StatusBadge>{booking.status}</StatusBadge>
                </div>

                {booking.status === 'pending' && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      disabled={decidingId === booking.id}
                      onClick={() => void handleDecision(booking.id, 'approved')}
                      className="text-xs"
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={decidingId === booking.id}
                      onClick={() => void handleDecision(booking.id, 'rejected')}
                      className="text-xs"
                    >
                      Reject
                    </Button>
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
