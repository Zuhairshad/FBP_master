import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableRowLink } from '../components/ui/Table'
import type { Database } from '../types/database'

type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type BookingRequest = Database['public']['Tables']['booking_requests']['Row']

function statusTone(status: BookingRequest['status']) {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'error'
  return 'neutral'
}

export function ProviderBookingsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [brands, setBrands] = useState<Profile[]>([])
  const [spaces, setSpaces] = useState<StorageSpace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  function brandLabel(brandId: string) {
    const brand = brands.find((candidate) => candidate.id === brandId)
    return brand?.company_name ?? brand?.display_name ?? 'Unknown brand'
  }

  function spaceLabel(spaceId: string) {
    return spaces.find((candidate) => candidate.id === spaceId)?.name ?? 'a storage space'
  }

  return (
    <DashboardShell title="Booking Requests">
      {error && (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {loading && <EmptyState>Loading booking requests…</EmptyState>}
      {!loading && bookings.length === 0 && <EmptyState>No booking requests yet.</EmptyState>}
      {!loading && bookings.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Storage space</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => (
              <TableRow key={booking.id} to={`/provider/bookings/${booking.id}`}>
                <TableCell>
                  <TableRowLink to={`/provider/bookings/${booking.id}`}>{brandLabel(booking.brand_id)}</TableRowLink>
                </TableCell>
                <TableCell>{spaceLabel(booking.storage_space_id)}</TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone(booking.status)}>{booking.status}</StatusBadge>
                </TableCell>
                <TableCell>{new Date(booking.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DashboardShell>
  )
}
