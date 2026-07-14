import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import type { Database } from '../types/database'

type Product = Database['public']['Tables']['products']['Row']
type Warehouse = Database['public']['Tables']['warehouses']['Row']
type InventoryRow = Database['public']['Tables']['inventory']['Row']

export function ProviderInventoryPage() {
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      const [inventoryResult, productsResult, warehousesResult] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('products').select('*'),
        supabase.from('warehouses').select('*'),
      ])

      if (cancelled) return

      const fetchError = inventoryResult.error ?? productsResult.error ?? warehousesResult.error
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setInventory(inventoryResult.data ?? [])
        setProducts(productsResult.data ?? [])
        setWarehouses(warehousesResult.data ?? [])
      }
      setLoading(false)
    }

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <DashboardShell title="Brand Inventory">
      {error && (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {loading && <EmptyState>Loading inventory…</EmptyState>}
      {!loading && inventory.length === 0 && (
        <EmptyState>No inventory visible yet — this fills in once you approve a booking request.</EmptyState>
      )}
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
