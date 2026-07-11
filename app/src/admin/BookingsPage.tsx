import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { Database } from '../types/database'

type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type BookingRequest = Database['public']['Tables']['booking_requests']['Row']

export function BookingsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [spaces, setSpaces] = useState<StorageSpace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [bookingsResult, profilesResult, spacesResult] = await Promise.all([
        supabase.from('booking_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
        supabase.from('storage_spaces').select('*'),
      ])

      if (cancelled) return

      const fetchError = bookingsResult.error ?? profilesResult.error ?? spacesResult.error
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setBookings(bookingsResult.data ?? [])
        setProfiles(profilesResult.data ?? [])
        setSpaces(spacesResult.data ?? [])
      }
      setLoading(false)
    }

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleReject(id: string) {
    setError(null)
    setRejectingId(id)

    const { data, error: updateError } = await supabase
      .from('booking_requests')
      .update({ status: 'rejected' })
      .eq('id', id)
      .select()
      .single()

    setRejectingId(null)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setBookings((current) => current.map((booking) => (booking.id === id ? data : booking)))
  }

  function statusTone(status: BookingRequest['status']) {
    if (status === 'approved') return 'success'
    if (status === 'rejected') return 'error'
    return 'neutral'
  }

  return (
    <DashboardShell title="All Bookings">
      <div className="mx-auto max-w-2xl">
        {error && (
          <div className="mb-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {loading && <EmptyState>Loading bookings…</EmptyState>}
        {!loading && bookings.length === 0 && <EmptyState>No booking requests exist yet.</EmptyState>}

        <ul className="space-y-3">
          {bookings.map((booking) => {
            const brand = profiles.find((p) => p.id === booking.brand_id)
            const provider = profiles.find((p) => p.id === booking.provider_id)
            const space = spaces.find((s) => s.id === booking.storage_space_id)

            return (
              <li key={booking.id} className="rounded-lg border border-hairline bg-surface-1 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-ink">
                      {brand?.company_name ?? brand?.display_name ?? 'Unknown brand'} →{' '}
                      {provider?.company_name ?? provider?.display_name ?? 'Unknown provider'}
                    </p>
                    <p className="text-sm text-ink-subtle">{space?.name ?? 'a storage space'}</p>
                  </div>
                  <StatusBadge tone={statusTone(booking.status)}>{booking.status}</StatusBadge>
                </div>

                {booking.status !== 'rejected' && (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="danger"
                      disabled={rejectingId === booking.id}
                      onClick={() => void handleReject(booking.id)}
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
