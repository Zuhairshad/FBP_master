import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogFooter } from '../components/ui/Dialog'
import type { Database } from '../types/database'

type Warehouse = Database['public']['Tables']['warehouses']['Row']
type WarehouseService = Database['public']['Tables']['warehouse_services']['Row']
type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']

export function WarehouseDetailPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>()

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null)
  const [services, setServices] = useState<WarehouseService[]>([])
  const [spaces, setSpaces] = useState<StorageSpace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [serviceName, setServiceName] = useState('')
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false)
  const [spaceName, setSpaceName] = useState('')
  const [unitType, setUnitType] = useState('')
  const [capacityUnits, setCapacityUnits] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [warehouseResult, servicesResult, spacesResult] = await Promise.all([
        supabase.from('warehouses').select('*').eq('id', warehouseId ?? '').single(),
        supabase.from('warehouse_services').select('*').eq('warehouse_id', warehouseId ?? ''),
        supabase.from('storage_spaces').select('*').eq('warehouse_id', warehouseId ?? ''),
      ])

      if (cancelled) return

      if (warehouseResult.error) {
        setError(warehouseResult.error.message)
      } else {
        setWarehouse(warehouseResult.data)
      }
      setServices(servicesResult.data ?? [])
      setSpaces(spacesResult.data ?? [])
      setLoading(false)
    }

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [warehouseId])

  async function handleAddService(event: FormEvent) {
    event.preventDefault()
    if (!warehouseId) return
    setError(null)
    setSubmitting(true)

    const { data, error: insertError } = await supabase
      .from('warehouse_services')
      .insert({ warehouse_id: warehouseId, name: serviceName })
      .select()
      .single()

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setServices((current) => [...current, data])
    setServiceName('')
    setServiceDialogOpen(false)
  }

  async function handleAddSpace(event: FormEvent) {
    event.preventDefault()
    if (!warehouseId) return
    setError(null)
    setSubmitting(true)

    const { data, error: insertError } = await supabase
      .from('storage_spaces')
      .insert({
        warehouse_id: warehouseId,
        name: spaceName,
        unit_type: unitType,
        capacity_units: Number(capacityUnits),
      })
      .select()
      .single()

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSpaces((current) => [...current, data])
    setSpaceName('')
    setUnitType('')
    setCapacityUnits('')
    setSpaceDialogOpen(false)
  }

  return (
    <DashboardShell title={warehouse?.name ?? 'Warehouse'}>
      <div className="mx-auto max-w-2xl">
        <Link
          to="/provider/warehouses"
          className="inline-flex items-center gap-1.5 text-sm text-ink-subtle hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Back to Warehouses
        </Link>

        {error && (
          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}

        {loading && (
          <div className="mt-4">
            <EmptyState>Loading warehouse…</EmptyState>
          </div>
        )}

        {!loading && warehouse && (
          <>
            <div className="mt-4 rounded-lg border border-hairline bg-surface-1 p-4">
              <p className="text-lg font-semibold text-ink">{warehouse.name}</p>
              <p className="mt-1 text-sm text-ink-subtle">
                {warehouse.address_line1}, {warehouse.city} {warehouse.postal_code}, {warehouse.country}
              </p>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Services</h2>
              <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="secondary" size="sm">
                    <Plus className="size-4" />
                    Add service
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogTitle>Add a service</DialogTitle>
                  <form onSubmit={(event) => void handleAddService(event)}>
                    <div className="mt-4">
                      <TextField
                        label="Name"
                        type="text"
                        required
                        placeholder="e.g. Pick & Pack"
                        value={serviceName}
                        onChange={(event) => setServiceName(event.target.value)}
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? 'Saving…' : 'Save'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="mt-3">
              {services.length === 0 ? (
                <EmptyState>No services yet.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map((service) => (
                      <TableRow key={service.id}>
                        <TableCell>{service.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Storage spaces</h2>
              <Dialog open={spaceDialogOpen} onOpenChange={setSpaceDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="secondary" size="sm">
                    <Plus className="size-4" />
                    Add space
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogTitle>Add a storage space</DialogTitle>
                  <form onSubmit={(event) => void handleAddSpace(event)}>
                    <div className="mt-4">
                      <TextField
                        label="Name"
                        type="text"
                        required
                        placeholder="e.g. Pallet Rack A"
                        value={spaceName}
                        onChange={(event) => setSpaceName(event.target.value)}
                      />
                    </div>
                    <div className="mt-3">
                      <TextField
                        label="Unit type"
                        type="text"
                        required
                        placeholder="pallet, bin…"
                        value={unitType}
                        onChange={(event) => setUnitType(event.target.value)}
                      />
                    </div>
                    <div className="mt-3">
                      <TextField
                        label="Capacity"
                        type="number"
                        required
                        min={0}
                        value={capacityUnits}
                        onChange={(event) => setCapacityUnits(event.target.value)}
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? 'Saving…' : 'Save'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="mt-3">
              {spaces.length === 0 ? (
                <EmptyState>No storage spaces yet.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Capacity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spaces.map((space) => (
                      <TableRow key={space.id}>
                        <TableCell>{space.name}</TableCell>
                        <TableCell>
                          {space.capacity_units} {space.unit_type}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
