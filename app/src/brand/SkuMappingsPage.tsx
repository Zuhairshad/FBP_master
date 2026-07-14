import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { SelectField } from '../components/ui/SelectField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogFooter } from '../components/ui/Dialog'
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

  const [dialogOpen, setDialogOpen] = useState(false)
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
    setDialogOpen(false)
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

  const canCreate = products.length > 0

  return (
    <DashboardShell
      title="SKU Mappings"
      action={
        canCreate ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button">
                <Plus className="size-4" />
                New mapping
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Add a SKU mapping</DialogTitle>
              <form onSubmit={(event) => void handleCreate(event)}>
                <div className="mt-4">
                  <SelectField
                    label="Master SKU"
                    required
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                  >
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

                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Adding…' : 'Add mapping'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      {!loading && products.length === 0 && (
        <EmptyState>Add a product first before mapping marketplace SKUs.</EmptyState>
      )}

      {loading && <EmptyState>Loading SKU mappings…</EmptyState>}
      {!loading && products.length > 0 && mappings.length === 0 && <EmptyState>No SKU mappings yet.</EmptyState>}
      {!loading && mappings.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Platform SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell>
                  <StatusBadge tone="neutral">{mapping.platform}</StatusBadge>
                </TableCell>
                <TableCell className="font-mono text-xs">{mapping.platform_sku}</TableCell>
                <TableCell>{productLabel(mapping.product_id)}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="danger" size="sm" onClick={() => void handleDelete(mapping.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DashboardShell>
  )
}
