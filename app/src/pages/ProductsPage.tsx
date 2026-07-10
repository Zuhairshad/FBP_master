import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
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
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add a product</h2>

          <label className="mt-3 block text-sm">
            Master SKU
            <input
              type="text"
              required
              value={masterSku}
              onChange={(event) => setMasterSku(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <label className="mt-3 block text-sm">
            Name
            <input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <label className="mt-3 block text-sm">
            Description (optional)
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {submitting ? 'Adding…' : 'Add product'}
          </button>
        </form>

        <ul className="mt-6 space-y-3">
          {loading && <li className="text-sm text-slate-500">Loading products…</li>}
          {!loading && products.length === 0 && (
            <li className="text-sm text-slate-500">No products yet.</li>
          )}
          {products.map((product) => (
            <li
              key={product.id}
              className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
            >
              {editingId === product.id ? (
                <div>
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit(product.id)}
                      className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded border border-slate-300 px-3 py-1 text-xs dark:border-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{product.master_sku}</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{product.name}</p>
                    {product.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">{product.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(product)}
                      className="rounded border border-slate-300 px-3 py-1 text-xs dark:border-slate-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(product.id)}
                      className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 dark:border-red-800"
                    >
                      Delete
                    </button>
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
