import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { SelectField } from '../components/ui/SelectField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogFooter } from '../components/ui/Dialog'
import type { Database } from '../types/database'

type Product = Database['public']['Tables']['products']['Row']
type Warehouse = Database['public']['Tables']['warehouses']['Row']
type InventoryRow = Database['public']['Tables']['inventory']['Row']

export function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [productId, setProductId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [productsResult, warehousesResult, inventoryResult] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('warehouses').select('*'),
        supabase.from('inventory').select('*'),
      ])

      if (cancelled) return

      const fetchError = productsResult.error ?? warehousesResult.error ?? inventoryResult.error
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setProducts(productsResult.data ?? [])
        setWarehouses(warehousesResult.data ?? [])
        setInventory(inventoryResult.data ?? [])
      }
      setLoading(false)
    }

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSetInventory(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const { data, error: upsertError } = await supabase
      .from('inventory')
      .upsert(
        { product_id: productId, warehouse_id: warehouseId, quantity: Number(quantity) },
        { onConflict: 'product_id,warehouse_id' },
      )
      .select()
      .single()

    setSubmitting(false)

    if (upsertError) {
      setError(upsertError.message)
      return
    }

    setInventory((current) => [
      data,
      ...current.filter((row) => !(row.product_id === productId && row.warehouse_id === warehouseId)),
    ])
    setQuantity('')
    setDialogOpen(false)
  }

  return (
    <DashboardShell
      title="Inventory"
      action={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <Plus className="size-4" />
              Set inventory
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Set inventory level</DialogTitle>
            <form onSubmit={(event) => void handleSetInventory(event)}>
              <div className="mt-4">
                <SelectField label="Product" required value={productId} onChange={(event) => setProductId(event.target.value)}>
                  <option value="" disabled>
                    Select a product
                  </option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.master_sku} — {product.name}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="mt-3">
                <SelectField
                  label="Warehouse"
                  required
                  value={warehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                >
                  <option value="" disabled>
                    Select a warehouse
                  </option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="mt-3">
                <TextField
                  label="Quantity"
                  type="number"
                  required
                  min={0}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </div>

              {error && (
                <div className="mt-3">
                  <ErrorText>{error}</ErrorText>
                </div>
              )}

              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save inventory level'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {loading && <EmptyState>Loading inventory…</EmptyState>}
      {!loading && inventory.length === 0 && <EmptyState>No inventory set yet.</EmptyState>}
      {!loading && inventory.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.map((row) => {
              const product = products.find((p) => p.id === row.product_id)
              const warehouse = warehouses.find((w) => w.id === row.warehouse_id)
              return (
                <TableRow key={row.id}>
                  <TableCell>{product ? `${product.master_sku} — ${product.name}` : 'Unknown product'}</TableCell>
                  <TableCell>{warehouse?.name ?? 'Unknown warehouse'}</TableCell>
                  <TableCell className="font-medium text-ink">{row.quantity}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </DashboardShell>
  )
}
