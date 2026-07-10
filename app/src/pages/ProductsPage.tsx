import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import type { Database } from '../types/database'

type Product = Database['public']['Tables']['products']['Row']

export function ProductsPage() {
  const { profile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [masterSku, setMasterSku] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

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

  function startEdit(product: Product) {
    setEditingId(product.id)
    setEditName(product.name)
    setEditDescription(product.description ?? '')
  }

  async function handleSaveEdit(id: string) {
    setError(null)
    const { data, error: updateError } = await supabase
      .from('products')
      .update({ name: editName, description: editDescription || null })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      setError(updateError.message)
      return
    }

    setProducts((current) => current.map((product) => (product.id === id ? data : product)))
    setEditingId(null)
  }

  return (
    <DashboardShell title="Products">
      <div className="mx-auto max-w-2xl">
        <Card>
          <form onSubmit={(event) => void handleCreate(event)}>
            <h2 className="text-sm font-semibold text-ink">Add a product</h2>

            <div className="mt-3">
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

            <div className="mt-4">
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Adding…' : 'Add product'}
              </Button>
            </div>
          </form>
        </Card>

        <ul className="mt-6 space-y-3">
          {loading && <li><EmptyState>Loading products…</EmptyState></li>}
          {!loading && products.length === 0 && (
            <li><EmptyState>No products yet.</EmptyState></li>
          )}
          {products.map((product) => (
            <li key={product.id} className="rounded-lg border border-hairline bg-surface-1 p-4">
              {editingId === product.id ? (
                <div>
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="w-full rounded-md border border-hairline bg-surface-1 px-2 py-1 text-sm text-ink"
                  />
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className="mt-2 w-full rounded-md border border-hairline bg-surface-1 px-2 py-1 text-sm text-ink"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => void handleSaveEdit(product.id)}
                      className="text-xs"
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditingId(null)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-ink-subtle">{product.master_sku}</p>
                    <p className="font-medium text-ink">{product.name}</p>
                    {product.description && <p className="text-sm text-ink-subtle">{product.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => startEdit(product)} className="text-xs">
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => void handleDelete(product.id)}
                      className="text-xs"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
