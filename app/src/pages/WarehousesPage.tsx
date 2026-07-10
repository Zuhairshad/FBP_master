import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
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
        <form
          onSubmit={(event) => void handleCreateWarehouse(event)}
          className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add a warehouse</h2>

          <label className="mt-3 block text-sm">
            Name
            <input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <label className="mt-3 block text-sm">
            Address
            <input
              type="text"
              required
              value={addressLine1}
              onChange={(event) => setAddressLine1(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-sm">
              City
              <input
                type="text"
                required
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block text-sm">
              State (optional)
              <input
                type="text"
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block text-sm">
              Postal code
              <input
                type="text"
                required
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block text-sm">
              Country
              <input
                type="text"
                required
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {submitting ? 'Adding…' : 'Add warehouse'}
          </button>
        </form>

        <ul className="mt-6 space-y-4">
          {loading && <li className="text-sm text-slate-500">Loading warehouses…</li>}
          {!loading && warehouses.length === 0 && (
            <li className="text-sm text-slate-500">No warehouses yet.</li>
          )}
          {warehouses.map((warehouse) => (
            <li
              key={warehouse.id}
              className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
            >
              <p className="font-medium text-slate-900 dark:text-slate-100">{warehouse.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {warehouse.address_line1}, {warehouse.city} {warehouse.postal_code}, {warehouse.country}
              </p>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Services
                </p>
                <ul className="mt-1 space-y-1">
                  {services
                    .filter((service) => service.warehouse_id === warehouse.id)
                    .map((service) => (
                      <li key={service.id} className="text-sm text-slate-700 dark:text-slate-300">
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
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button
                    type="submit"
                    className="rounded border border-slate-300 px-3 py-1 text-xs dark:border-slate-700"
                  >
                    Add service
                  </button>
                </form>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Storage spaces
                </p>
                <ul className="mt-1 space-y-1">
                  {spaces
                    .filter((space) => space.warehouse_id === warehouse.id)
                    .map((space) => (
                      <li key={space.id} className="text-sm text-slate-700 dark:text-slate-300">
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
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
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
                    className="w-36 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
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
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button
                    type="submit"
                    className="rounded border border-slate-300 px-3 py-1 text-xs dark:border-slate-700"
                  >
                    Add space
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
