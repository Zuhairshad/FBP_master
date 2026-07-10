import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ProductsPage } from './ProductsPage'
import { AuthContext } from '../../hooks/auth-context'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type Product = Database['public']['Tables']['products']['Row']
type QueryResult = { data: unknown; error: unknown }

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder
  order: (...args: unknown[]) => MockQueryBuilder
  insert: (...args: unknown[]) => MockQueryBuilder
  update: (...args: unknown[]) => MockQueryBuilder
  delete: (...args: unknown[]) => MockQueryBuilder
  eq: (...args: unknown[]) => MockQueryBuilder
  single: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.insert = vi.fn(() => builder)
  builder.update = vi.fn(() => builder)
  builder.delete = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.single = vi.fn(() => builder)
  builder.then = (resolve) => resolve(result)
  return builder
}

function renderWithAuth() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider
      value={{
        session: null,
        loading: false,
        profile: {
          id: 'brand-1',
          role: 'brand',
          display_name: 'Brand One',
          company_name: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      }}
    >
      <ProductsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('ProductsPage', () => {
  it('lists existing products', async () => {
    const products: Product[] = [
      {
        id: 'p1',
        brand_id: 'brand-1',
        master_sku: 'SKU-001',
        name: 'Widget',
        description: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: products, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('SKU-001')).toBeInTheDocument()
  })

  it('creates a product from the form', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    const created: Product = {
      id: 'p2',
      brand_id: 'brand-1',
      master_sku: 'SKU-002',
      name: 'Gadget',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: created, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()
    await screen.findByText('No products yet.')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Master SKU'), 'SKU-002')
    await user.type(screen.getByLabelText('Name'), 'Gadget')
    await user.click(screen.getByRole('button', { name: 'Add product' }))

    expect(await screen.findByText('Gadget')).toBeInTheDocument()
  })
})
