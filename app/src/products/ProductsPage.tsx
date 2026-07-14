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

type Product = Database['public']['Tables']['products']['Row']

export function ProductsPage() {
  const { profile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [masterSku, setMasterSku] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadProducts() {
      const { data, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setProducts(data)
      }
      setLoading(false)
    }

    void loadProducts()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!profile) return
    setError(null)
    setSubmitting(true)

    const { data, error: insertError } = await supabase
      .from('products')
      .insert({
        brand_id: profile.id,
        master_sku: masterSku,
        name,
        description: description || null,
      })
      .select()
      .single()

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setProducts((current) => [data, ...current])
    setMasterSku('')
    setName('')
    setDescription('')
    setDialogOpen(false)
  }

  async function handleDelete(id: string) {
    setError(null)
    const { error: deleteError } = await supabase.from('products').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setProducts((current) => current.filter((product) => product.id !== id))
  }

  return (
    <DashboardShell
      title="Products"
      action={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <Plus className="size-4" />
              New product
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Add a product</DialogTitle>
            <form onSubmit={(event) => void handleCreate(event)}>
              <div className="mt-4">
                <TextField
                  label="Master SKU"
                  type="text"
                  required
                  value={masterSku}
                  onChange={(event) => setMasterSku(event.target.value)}
                />
              </div>

              <div className="mt-3">
                <TextField
                  label="Name"
                  type="text"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="mt-3">
                <TextField
                  label="Description (optional)"
                  type="text"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              {error && (
                <div className="mt-3">
                  <ErrorText>{error}</ErrorText>
                </div>
              )}

              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add product'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {loading && <EmptyState>Loading products…</EmptyState>}
      {!loading && products.length === 0 && <EmptyState>No products yet.</EmptyState>}
      {!loading && products.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Master SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id} to={`/brand/products/${product.id}`}>
                <TableCell className="font-mono text-xs text-ink-subtle">{product.master_sku}</TableCell>
                <TableCell>
                  <TableRowLink to={`/brand/products/${product.id}`}>{product.name}</TableRowLink>
                </TableCell>
                <TableCell>{product.description ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void handleDelete(product.id)}
                  >
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
