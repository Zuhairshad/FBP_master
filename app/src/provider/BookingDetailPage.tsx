import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { Database } from '../types/database'

type BookingRequest = Database['public']['Tables']['booking_requests']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']
type Warehouse = Database['public']['Tables']['warehouses']['Row']

function statusTone(status: BookingRequest['status']) {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'error'
  return 'neutral'
}

export function BookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>()

  const [booking, setBooking] = useState<BookingRequest | null>(null)
  const [brand, setBrand] = useState<Profile | null>(null)
  const [space, setSpace] = useState<StorageSpace | null>(null)
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deciding, setDeciding] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadBooking() {
      const { data: bookingData, error: bookingError } = await supabase
        .from('booking_requests')
        .select('*')
        .eq('id', bookingId ?? '')
        .single()

      if (cancelled) return

      if (bookingError) {
        setError(bookingError.message)
        setLoading(false)
        return
      }

      setBooking(bookingData)

      const [brandResult, spaceResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', bookingData.brand_id).single(),
        supabase.from('storage_spaces').select('*').eq('id', bookingData.storage_space_id).single(),
      ])

      if (cancelled) return

      if (!brandResult.error) setBrand(brandResult.data)
      if (!spaceResult.error) {
        setSpace(spaceResult.data)
        const { data: warehouseData } = await supabase
          .from('warehouses')
          .select('*')
          .eq('id', spaceResult.data.warehouse_id)
          .single()
        if (!cancelled) setWarehouse(warehouseData)
      }

      setLoading(false)
    }

    void loadBooking()
    return () => {
      cancelled = true
    }
  }, [bookingId])

  async function handleDecision(status: 'approved' | 'rejected') {
    if (!bookingId) return
    setError(null)
    setDeciding(true)

    const { data, error: updateError } = await supabase
      .from('booking_requests')
      .update({ status })
      .eq('id', bookingId)
      .select()
      .single()

    setDeciding(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setBooking(data)
  }

  return (
    <DashboardShell title="Booking request">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/provider/bookings"
          className="inline-flex items-center gap-1.5 text-sm text-ink-subtle hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Back to Booking Requests
        </Link>

        {error && (
          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}

        {loading && (
          <div className="mt-4">
            <EmptyState>Loading booking request…</EmptyState>
          </div>
        )}

        {!loading && booking && (
          <div className="mt-4 rounded-lg border border-hairline bg-surface-1 p-4">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-ink">
                {brand?.company_name ?? brand?.display_name ?? 'Unknown brand'}
              </p>
              <StatusBadge tone={statusTone(booking.status)}>{booking.status}</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-ink-subtle">
              Requesting {space?.name ?? 'a storage space'}
              {warehouse && ` at ${warehouse.name}`}
            </p>
            {space && (
              <p className="mt-1 text-sm text-ink-subtle">
                Capacity: {space.capacity_units} {space.unit_type}
              </p>
            )}
            <p className="mt-1 text-xs text-ink-tertiary">
              Requested {new Date(booking.created_at).toLocaleString()}
            </p>

            {booking.status === 'pending' && (
              <div className="mt-4 flex gap-2">
                <Button type="button" disabled={deciding} onClick={() => void handleDecision('approved')}>
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={deciding}
                  onClick={() => void handleDecision('rejected')}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
