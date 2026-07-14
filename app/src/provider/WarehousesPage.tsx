import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableRowLink } from '../components/ui/Table'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogFooter } from '../components/ui/Dialog'
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

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [warehousesResult, servicesResult, spacesResult] = await Promise.all([
        supabase.from('warehouses').select('*').order('created_at', { ascending: false }),
        supabase.from('warehouse_services').select('*'),
        supabase.from('storage_spaces').select('*'),
      ])

      if (cancelled) return

      const fetchError = warehousesResult.error ?? servicesResult.error ?? spacesResult.error
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
    setDialogOpen(false)
  }

  return (
    <DashboardShell
      title="Warehouses"
      action={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <Plus className="size-4" />
              New warehouse
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Add a warehouse</DialogTitle>
            <form onSubmit={(event) => void handleCreateWarehouse(event)}>
              <div className="mt-4">
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

              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add warehouse'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {loading && <EmptyState>Loading warehouses…</EmptyState>}
      {!loading && warehouses.length === 0 && <EmptyState>No warehouses yet.</EmptyState>}
      {!loading && warehouses.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Services</TableHead>
              <TableHead>Storage spaces</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {warehouses.map((warehouse) => (
              <TableRow key={warehouse.id} to={`/provider/warehouses/${warehouse.id}`}>
                <TableCell>
                  <TableRowLink to={`/provider/warehouses/${warehouse.id}`}>{warehouse.name}</TableRowLink>
                </TableCell>
                <TableCell>
                  {warehouse.address_line1}, {warehouse.city} {warehouse.postal_code}, {warehouse.country}
                </TableCell>
                <TableCell>{services.filter((service) => service.warehouse_id === warehouse.id).length}</TableCell>
                <TableCell>{spaces.filter((space) => space.warehouse_id === warehouse.id).length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DashboardShell>
  )
}
