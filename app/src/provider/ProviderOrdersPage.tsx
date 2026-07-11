import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { SelectField } from '../components/ui/SelectField'
import { StatusBadge } from '../components/ui/StatusBadge'
import { TextField } from '../components/ui/TextField'
import type { Database, OrderFulfillmentStatus } from '../types/database'

type PlatformOrder = Database['public']['Tables']['platform_orders']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

const FULFILLMENT_STATUSES: OrderFulfillmentStatus[] = ['pending', 'processing', 'shipped', 'delivered']

function statusTone(status: PlatformOrder['status']) {
  if (status === 'resolved') return 'success'
  if (status === 'unmapped') return 'error'
  return 'neutral'
}

function fulfillmentTone(status: OrderFulfillmentStatus) {
  return status === 'delivered' ? 'success' : 'neutral'
}

interface Draft {
  fulfillment_status: OrderFulfillmentStatus
  tracking_number: string
}

export function ProviderOrdersPage() {
  const [orders, setOrders] = useState<PlatformOrder[]>([])
  const [brands, setBrands] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [ordersResult, brandsResult] = await Promise.all([
        supabase.from('platform_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'brand'),
      ])

      if (cancelled) return

      const fetchError = ordersResult.error ?? brandsResult.error
      if (fetchError) {
        setError(fetchError.message)
      } else {
        const loadedOrders = ordersResult.data ?? []
        setOrders(loadedOrders)
        setDrafts(
          Object.fromEntries(
            loadedOrders.map((order) => [
              order.id,
              { fulfillment_status: order.fulfillment_status, tracking_number: order.tracking_number ?? '' },
            ]),
          ),
        )
        setBrands(brandsResult.data ?? [])
      }
      setLoading(false)
    }

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  function updateDraft(orderId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [orderId]: { ...current[orderId], ...patch } }))
  }

  async function handleSave(orderId: string) {
    const draft = drafts[orderId]
    if (!draft) return

    setError(null)
    setSavingId(orderId)

    const { data, error: updateError } = await supabase
      .from('platform_orders')
      .update({
        fulfillment_status: draft.fulfillment_status,
        tracking_number: draft.tracking_number.trim() === '' ? null : draft.tracking_number.trim(),
      })
      .eq('id', orderId)
      .select()
      .single()

    setSavingId(null)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setOrders((current) => current.map((order) => (order.id === orderId ? data : order)))
  }

  return (
    <DashboardShell title="Brand Orders">
      <div className="mx-auto max-w-2xl">
        {error && (
          <div className="mb-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {loading && <EmptyState>Loading orders…</EmptyState>}
        {!loading && orders.length === 0 && (
          <EmptyState>
            No orders visible yet — this fills in once you approve a booking request for a brand with synced
            orders.
          </EmptyState>
        )}

        <ul className="space-y-3">
          {orders.map((order) => {
            const brand = brands.find((b) => b.id === order.brand_id)
            const draft = drafts[order.id] ?? { fulfillment_status: order.fulfillment_status, tracking_number: '' }
            const dirty =
              draft.fulfillment_status !== order.fulfillment_status ||
              draft.tracking_number.trim() !== (order.tracking_number ?? '')

            return (
              <li key={order.id} className="rounded-lg border border-hairline bg-surface-1 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">
                      {brand?.company_name ?? brand?.display_name ?? 'Unknown brand'}
                    </p>
                    <p className="text-sm text-ink-subtle">
                      {order.platform} #{order.platform_order_id}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge tone={statusTone(order.status)}>{order.resolved_master_sku ?? order.status}</StatusBadge>
                    <StatusBadge tone={fulfillmentTone(order.fulfillment_status)}>{order.fulfillment_status}</StatusBadge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <SelectField
                    label="Fulfillment status"
                    value={draft.fulfillment_status}
                    onChange={(e) =>
                      updateDraft(order.id, { fulfillment_status: e.target.value as OrderFulfillmentStatus })
                    }
                    className="w-40"
                  >
                    {FULFILLMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Tracking number"
                    value={draft.tracking_number}
                    onChange={(e) => updateDraft(order.id, { tracking_number: e.target.value })}
                    placeholder="e.g. 1Z999AA10123456784"
                    className="w-56"
                  />
                  <Button
                    type="button"
                    disabled={!dirty || savingId === order.id}
                    onClick={() => void handleSave(order.id)}
                    size="sm"
                  >
                    Save
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </DashboardShell>
  )
}
