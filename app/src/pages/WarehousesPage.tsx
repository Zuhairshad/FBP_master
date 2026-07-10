import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import type { Database } from '../types/database'

type Warehouse = Database['public']['Tables']['warehouses']['Row']
type WarehouseService = Database['public']['Tables']['warehouse_services']['Row']
type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']

export function WarehousesPage() {
  const { profile } = useAuth()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [services, setServices] = useState<WarehouseService[]>([])
  const [spaces, setSpaces] = useState<StorageSpace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [serviceNameByWarehouse, setServiceNameByWarehouse] = useState<Record<string, string>>({})
  const [spaceFormByWarehouse, setSpaceFormByWarehouse] = useState<
    Record<string, { name: string; unitType: string; capacityUnits: string }>
  >({})

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [warehousesResult, servicesResult, spacesResult] = await Promise.all([
        supabase.from('warehouses').select('*').order('created_at', { ascending: false }),
        supabase.from('warehouse_services').select('*'),
        supabase.from('storage_spaces').select('*'),
      ])

      if (cancelled) return

      const fetchError =
        warehousesResult.error ?? servicesResult.error ?? spacesResult.error
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setWarehouses(warehousesResult.data ?? [])
        setServices(servicesResult.data ?? [])
        setSpaces(spacesResult.data ?? [])
      }
      setLoading(false)
    }

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreateWarehouse(event: FormEvent) {
    event.preventDefault()
    if (!profile) return
    setError(null)
    setSubmitting(true)

    const { data, error: insertError } = await supabase
      .from('warehouses')
      .insert({
        provider_id: profile.id,
        name,
        address_line1: addressLine1,
        city,
        state: state || null,
        postal_code: postalCode,
        country,
      })
      .select()
      .single()

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setWarehouses((current) => [data, ...current])
    setName('')
    setAddressLine1('')
    setCity('')
    setState('')
    setPostalCode('')
    setCountry('')
  }

  async function handleAddService(warehouseId: string, event: FormEvent) {
    event.preventDefault()
    setError(null)
    const serviceName = serviceNameByWarehouse[warehouseId] ?? ''

    const { data, error: insertError } = await supabase
      .from('warehouse_services')
      .insert({ warehouse_id: warehouseId, name: serviceName })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setServices((current) => [...current, data])
    setServiceNameByWarehouse((current) => ({ ...current, [warehouseId]: '' }))
  }

  async function handleAddSpace(warehouseId: string, event: FormEvent) {
    event.preventDefault()
    setError(null)
    const form = spaceFormByWarehouse[warehouseId] ?? { name: '', unitType: '', capacityUnits: '' }

    const { data, error: insertError } = await supabase
      .from('storage_spaces')
      .insert({
        warehouse_id: warehouseId,
        name: form.name,
        unit_type: form.unitType,
        capacity_units: Number(form.capacityUnits),
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSpaces((current) => [...current, data])
    setSpaceFormByWarehouse((current) => ({
      ...current,
      [warehouseId]: { name: '', unitType: '', capacityUnits: '' },
    }))
  }

  return (
    <DashboardShell title="Warehouse Setup">
      <div className="mx-auto max-w-2xl">
        <Card>
          <form onSubmit={(event) => void handleCreateWarehouse(event)}>
            <h2 className="text-sm font-semibold text-ink">Add a warehouse</h2>

            <div className="mt-3">
              <TextField label="Name" type="text" required value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <div className="mt-3">
              <TextField
                label="Address"
                type="text"
                required
                value={addressLine1}
                onChange={(event) => setAddressLine1(event.target.value)}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <TextField label="City" type="text" required value={city} onChange={(event) => setCity(event.target.value)} />
              <TextField
                label="State (optional)"
                type="text"
                value={state}
                onChange={(event) => setState(event.target.value)}
              />
              <TextField
                label="Postal code"
                type="text"
                required
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
              />
              <TextField
                label="Country"
                type="text"
                required
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              />
            </div>

            {error && (
              <div className="mt-3">
                <ErrorText>{error}</ErrorText>
              </div>
            )}

            <div className="mt-4">
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Adding…' : 'Add warehouse'}
              </Button>
            </div>
          </form>
        </Card>

        <ul className="mt-6 space-y-4">
          {loading && <li><EmptyState>Loading warehouses…</EmptyState></li>}
          {!loading && warehouses.length === 0 && <li><EmptyState>No warehouses yet.</EmptyState></li>}
          {warehouses.map((warehouse) => (
            <li key={warehouse.id} className="rounded-lg border border-hairline bg-surface-1 p-4">
              <p className="font-medium text-ink">{warehouse.name}</p>
              <p className="text-sm text-ink-subtle">
                {warehouse.address_line1}, {warehouse.city} {warehouse.postal_code}, {warehouse.country}
              </p>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase text-ink-subtle">Services</p>
                <ul className="mt-1 space-y-1">
                  {services
                    .filter((service) => service.warehouse_id === warehouse.id)
                    .map((service) => (
                      <li key={service.id} className="text-sm text-ink-muted">
                        {service.name}
                      </li>
                    ))}
                </ul>
                <form
                  onSubmit={(event) => void handleAddService(warehouse.id, event)}
                  className="mt-2 flex gap-2"
                >
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pick & Pack"
                    value={serviceNameByWarehouse[warehouse.id] ?? ''}
                    onChange={(event) =>
                      setServiceNameByWarehouse((current) => ({
                        ...current,
                        [warehouse.id]: event.target.value,
                      }))
                    }
                    className="flex-1 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-sm text-ink"
                  />
                  <Button type="submit" variant="secondary" className="text-xs">
                    Add service
                  </Button>
                </form>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase text-ink-subtle">Storage spaces</p>
                <ul className="mt-1 space-y-1">
                  {spaces
                    .filter((space) => space.warehouse_id === warehouse.id)
                    .map((space) => (
                      <li key={space.id} className="text-sm text-ink-muted">
                        {space.name} — {space.capacity_units} {space.unit_type}
                      </li>
                    ))}
                </ul>
                <form
                  onSubmit={(event) => void handleAddSpace(warehouse.id, event)}
                  className="mt-2 flex flex-wrap gap-2"
                >
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pallet Rack A"
                    value={spaceFormByWarehouse[warehouse.id]?.name ?? ''}
                    onChange={(event) =>
                      setSpaceFormByWarehouse((current) => ({
                        ...current,
                        [warehouse.id]: {
                          name: event.target.value,
                          unitType: current[warehouse.id]?.unitType ?? '',
                          capacityUnits: current[warehouse.id]?.capacityUnits ?? '',
                        },
                      }))
                    }
                    className="flex-1 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-sm text-ink"
                  />
                  <input
                    type="text"
                    required
                    placeholder="unit type (pallet, bin…)"
                    value={spaceFormByWarehouse[warehouse.id]?.unitType ?? ''}
                    onChange={(event) =>
                      setSpaceFormByWarehouse((current) => ({
                        ...current,
                        [warehouse.id]: {
                          name: current[warehouse.id]?.name ?? '',
                          unitType: event.target.value,
                          capacityUnits: current[warehouse.id]?.capacityUnits ?? '',
                        },
                      }))
                    }
                    className="w-36 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-sm text-ink"
                  />
                  <input
                    type="number"
                    required
                    min={0}
                    placeholder="capacity"
                    value={spaceFormByWarehouse[warehouse.id]?.capacityUnits ?? ''}
                    onChange={(event) =>
                      setSpaceFormByWarehouse((current) => ({
                        ...current,
                        [warehouse.id]: {
                          name: current[warehouse.id]?.name ?? '',
                          unitType: current[warehouse.id]?.unitType ?? '',
                          capacityUnits: event.target.value,
                        },
                      }))
                    }
                    className="w-24 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-sm text-ink"
                  />
                  <Button type="submit" variant="secondary" className="text-xs">
                    Add space
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
