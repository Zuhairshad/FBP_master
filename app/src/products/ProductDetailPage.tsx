import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, Link } from 'react-router'
import { ArrowLeft, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogFooter } from '../components/ui/Dialog'
import type { Database } from '../types/database'

type Product = Database['public']['Tables']['products']['Row']
type SkuMapping = Database['public']['Tables']['sku_mappings']['Row']

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const navigate = useNavigate()

  const [product, setProduct] = useState<Product | null>(null)
  const [mappings, setMappings] = useState<SkuMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadProduct() {
      const [productResult, mappingsResult] = await Promise.all([
        supabase.from('products').select('*').eq('id', productId ?? '').single(),
        supabase
          .from('sku_mappings')
          .select('*')
          .eq('product_id', productId ?? '')
          .order('platform', { ascending: true }),
      ])

      if (cancelled) return

      if (productResult.error) {
        setError(productResult.error.message)
      } else {
        setProduct(productResult.data)
        setEditName(productResult.data.name)
        setEditDescription(productResult.data.description ?? '')
      }

      if (!mappingsResult.error) {
        setMappings(mappingsResult.data)
      }

      setLoading(false)
    }

    void loadProduct()
    return () => {
      cancelled = true
    }
  }, [productId])

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault()
    if (!productId) return
    setError(null)
    setSubmitting(true)

    const { data, error: updateError } = await supabase
      .from('products')
      .update({ name: editName, description: editDescription || null })
      .eq('id', productId)
      .select()
      .single()

    setSubmitting(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setProduct(data)
    setDialogOpen(false)
  }

  async function handleDelete() {
    if (!productId) return
    setError(null)
    const { error: deleteError } = await supabase.from('products').delete().eq('id', productId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    navigate('/brand/products')
  }

  return (
    <DashboardShell title={product?.name ?? 'Product'}>
      <div className="mx-auto max-w-2xl">
        <Link to="/brand/products" className="inline-flex items-center gap-1.5 text-sm text-ink-subtle hover:text-ink">
          <ArrowLeft className="size-4" />
          Back to Products
        </Link>

        {error && (
          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}

        {loading && (
          <div className="mt-4">
            <EmptyState>Loading product…</EmptyState>
          </div>
        )}

        {!loading && product && (
          <>
            <div className="mt-4 flex items-start justify-between rounded-lg border border-hairline bg-surface-1 p-4">
              <div>
                <p className="font-mono text-xs text-ink-subtle">{product.master_sku}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{product.name}</p>
                {product.description && <p className="mt-1 text-sm text-ink-subtle">{product.description}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="secondary" size="sm">
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogTitle>Edit product</DialogTitle>
                    <form onSubmit={(event) => void handleSaveEdit(event)}>
                      <div className="mt-4">
                        <TextField
                          label="Name"
                          type="text"
                          required
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                      </div>
                      <div className="mt-3">
                        <TextField
                          label="Description (optional)"
                          type="text"
                          value={editDescription}
                          onChange={(event) => setEditDescription(event.target.value)}
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
                <Button type="button" variant="danger" size="sm" onClick={() => void handleDelete()}>
                  Delete
                </Button>
              </div>
            </div>

            <h2 className="mt-8 text-sm font-semibold text-ink">Marketplace SKU mappings</h2>
            <p className="mt-1 text-sm text-ink-subtle">
              Manage additional mappings from the{' '}
              <Link to="/brand/sku-mappings" className="text-primary hover:text-primary-hover">
                SKU Mappings
              </Link>{' '}
              page.
            </p>

            <div className="mt-3">
              {mappings.length === 0 ? (
                <EmptyState>Not mapped to any marketplace yet.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead>Platform SKU</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((mapping) => (
                      <TableRow key={mapping.id}>
                        <TableCell>
                          <StatusBadge tone="neutral">{mapping.platform}</StatusBadge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{mapping.platform_sku}</TableCell>
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
