import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
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
  }

  return (
    <DashboardShell title="Inventory">
      <div className="mx-auto max-w-2xl">
        <form
          onSubmit={(event) => void handleSetInventory(event)}
          className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Set inventory level</h2>

          <label className="mt-3 block text-sm">
            Product
            <select
              required
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>
                Select a product
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.master_sku} — {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-sm">
            Warehouse
            <select
              required
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>
                Select a warehouse
              </option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-sm">
            Quantity
            <input
              type="number"
              required
              min={0}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {submitting ? 'Saving…' : 'Save inventory level'}
          </button>
        </form>

        <ul className="mt-6 space-y-2">
          {loading && <li className="text-sm text-slate-500">Loading inventory…</li>}
          {!loading && inventory.length === 0 && (
            <li className="text-sm text-slate-500">No inventory set yet.</li>
          )}
          {inventory.map((row) => {
            const product = products.find((p) => p.id === row.product_id)
            const warehouse = warehouses.find((w) => w.id === row.warehouse_id)
            return (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
              >
                <span className="text-slate-700 dark:text-slate-300">
                  {product?.name ?? 'Unknown product'} @ {warehouse?.name ?? 'Unknown warehouse'}
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
