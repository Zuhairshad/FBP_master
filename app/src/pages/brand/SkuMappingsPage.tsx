import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { DashboardShell } from '../../components/DashboardShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { TextField } from '../../components/ui/TextField'
import { SelectField } from '../../components/ui/SelectField'
import { ErrorText } from '../../components/ui/ErrorText'
import { EmptyState } from '../../components/ui/EmptyState'
import type { Database, MarketplacePlatform } from '../../types/database'

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
          <EmptyState>Add a product first before mapping marketplace SKUs.</EmptyState>
        ) : (
          <Card>
            <form onSubmit={(event) => void handleCreate(event)}>
              <h2 className="text-sm font-semibold text-ink">Add a SKU mapping</h2>

              <div className="mt-3">
                <SelectField label="Master SKU" required value={productId} onChange={(event) => setProductId(event.target.value)}>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.master_sku} — {product.name}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="mt-3">
                <SelectField
                  label="Platform"
                  required
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value as MarketplacePlatform)}
                >
                  {PLATFORMS.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="mt-3">
                <TextField
                  label="Platform SKU"
                  type="text"
                  required
                  value={platformSku}
                  onChange={(event) => setPlatformSku(event.target.value)}
                />
              </div>

              {error && (
                <div className="mt-3">
                  <ErrorText>{error}</ErrorText>
                </div>
              )}

              <div className="mt-4">
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Adding…' : 'Add mapping'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        <ul className="mt-6 space-y-3">
          {loading && <li><EmptyState>Loading SKU mappings…</EmptyState></li>}
          {!loading && mappings.length === 0 && <li><EmptyState>No SKU mappings yet.</EmptyState></li>}
          {mappings.map((mapping) => (
            <li key={mapping.id} className="flex items-start justify-between rounded-lg border border-hairline bg-surface-1 p-4">
              <div>
                <p className="text-xs uppercase text-ink-subtle">{mapping.platform}</p>
                <p className="font-medium text-ink">{mapping.platform_sku}</p>
                <p className="text-sm text-ink-subtle">{productLabel(mapping.product_id)}</p>
              </div>
              <Button type="button" variant="danger" onClick={() => void handleDelete(mapping.id)} className="text-xs">
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
