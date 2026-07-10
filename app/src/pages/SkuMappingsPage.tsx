import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import type { Database, MarketplacePlatform } from '../types/database'

type SkuMapping = Database['public']['Tables']['sku_mappings']['Row']
type Product = Database['public']['Tables']['products']['Row']

const PLATFORMS: MarketplacePlatform[] = ['amazon', 'tiktok', 'ebay', 'walmart', 'shopify']

export function SkuMappingsPage() {
  const { profile } = useAuth()
  const [mappings, setMappings] = useState<SkuMapping[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [productId, setProductId] = useState('')
  const [platform, setPlatform] = useState<MarketplacePlatform>('amazon')
  const [platformSku, setPlatformSku] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      const [mappingsResult, productsResult] = await Promise.all([
        supabase.from('sku_mappings').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('name', { ascending: true }),
      ])

      if (cancelled) return

      if (mappingsResult.error) {
        setError(mappingsResult.error.message)
      } else {
        setMappings(mappingsResult.data)
      }

      if (productsResult.error) {
        setError(productsResult.error.message)
      } else {
        setProducts(productsResult.data)
        if (productsResult.data.length > 0) {
          setProductId((current) => current || productsResult.data[0].id)
        }
      }

      setLoading(false)
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!profile || !productId) return
    setError(null)
    setSubmitting(true)

    const { data, error: insertError } = await supabase
      .from('sku_mappings')
      .insert({ product_id: productId, platform, platform_sku: platformSku })
      .select()
      .single()

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setMappings((current) => [data, ...current])
    setPlatformSku('')
  }

  async function handleDelete(id: string) {
    setError(null)
    const { error: deleteError } = await supabase.from('sku_mappings').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setMappings((current) => current.filter((mapping) => mapping.id !== id))
  }

  function productLabel(id: string) {
    const product = products.find((candidate) => candidate.id === id)
    return product ? `${product.master_sku} — ${product.name}` : id
  }

  return (
    <DashboardShell title="SKU Mappings">
      <div className="mx-auto max-w-2xl">
        {products.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">Add a product first before mapping marketplace SKUs.</p>
        ) : (
          <form
            onSubmit={(event) => void handleCreate(event)}
            className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add a SKU mapping</h2>

            <label className="mt-3 block text-sm">
              Master SKU
              <select
                required
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.master_sku} — {product.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-sm">
              Platform
              <select
                required
                value={platform}
                onChange={(event) => setPlatform(event.target.value as MarketplacePlatform)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                {PLATFORMS.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-sm">
              Platform SKU
              <input
                type="text"
                required
                value={platformSku}
                onChange={(event) => setPlatformSku(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full rounded bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {submitting ? 'Adding…' : 'Add mapping'}
            </button>
          </form>
        )}

        <ul className="mt-6 space-y-3">
          {loading && <li className="text-sm text-slate-500">Loading SKU mappings…</li>}
          {!loading && mappings.length === 0 && (
            <li className="text-sm text-slate-500">No SKU mappings yet.</li>
          )}
          {mappings.map((mapping) => (
            <li
              key={mapping.id}
              className="flex items-start justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-800"
            >
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">{mapping.platform}</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{mapping.platform_sku}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{productLabel(mapping.product_id)}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(mapping.id)}
                className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 dark:border-red-800"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
