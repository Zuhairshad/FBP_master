import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import type { Database } from '../types/database'

type BookingRequest = Database['public']['Tables']['booking_requests']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']

function statusTone(status: BookingRequest['status']) {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'error'
  return 'neutral'
}

export function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [spaces, setSpaces] = useState<StorageSpace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

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

  function profileLabel(id: string) {
    const profile = profiles.find((candidate) => candidate.id === id)
    return profile?.company_name ?? profile?.display_name ?? 'Unknown'
  }

  function spaceLabel(id: string) {
    return spaces.find((candidate) => candidate.id === id)?.name ?? 'a storage space'
  }

  async function handleReject(id: string) {
    setError(null)
    setActingId(id)

    const { data, error: updateError } = await supabase
      .from('booking_requests')
      .update({ status: 'rejected' })
      .eq('id', id)
      .select()
      .single()

    setActingId(null)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setBookings((current) => current.map((booking) => (booking.id === id ? data : booking)))
  }

  return (
    <DashboardShell title="Bookings">
      {error && (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {loading && <EmptyState>Loading bookings…</EmptyState>}
      {!loading && bookings.length === 0 && <EmptyState>No bookings yet.</EmptyState>}
      {!loading && bookings.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Storage space</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell>{profileLabel(booking.brand_id)}</TableCell>
                <TableCell>{profileLabel(booking.provider_id)}</TableCell>
                <TableCell>{spaceLabel(booking.storage_space_id)}</TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone(booking.status)}>{booking.status}</StatusBadge>
                </TableCell>
                <TableCell className="text-right">
                  {booking.status !== 'rejected' && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={actingId === booking.id}
                      onClick={() => void handleReject(booking.id)}
                    >
                      Reject
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DashboardShell>
  )
}
