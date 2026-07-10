import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
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
      <div className="mx-auto max-w-2xl">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-slate-500">Loading inventory…</p>}
        {!loading && inventory.length === 0 && (
          <p className="text-sm text-slate-500">
            No inventory visible yet — this fills in once you approve a booking request.
          </p>
        )}

        <ul className="space-y-2">
          {inventory.map((row) => {
            const product = products.find((p) => p.id === row.product_id)
            const warehouse = warehouses.find((w) => w.id === row.warehouse_id)
            return (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
              >
                <span className="text-slate-700 dark:text-slate-300">
                  {product ? `${product.master_sku} — ${product.name}` : 'Unknown product'} @{' '}
                  {warehouse?.name ?? 'Unknown warehouse'}
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{row.quantity}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </DashboardShell>
  )
}
