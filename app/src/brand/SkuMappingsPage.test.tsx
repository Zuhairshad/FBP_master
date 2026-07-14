import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { SkuMappingsPage } from './SkuMappingsPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type SkuMapping = Database['public']['Tables']['sku_mappings']['Row']
type Product = Database['public']['Tables']['products']['Row']
type QueryResult = { data: unknown; error: unknown }

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder
  order: (...args: unknown[]) => MockQueryBuilder
  insert: (...args: unknown[]) => MockQueryBuilder
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
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
          },
        }}
      >
        <SkuMappingsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const product: Product = {
  id: 'p1',
  brand_id: 'brand-1',
  master_sku: 'SKU-001',
  name: 'Widget',
  description: null,
  created_at: '2026-01-01T00:00:00Z',
}

describe('SkuMappingsPage', () => {
  it('lists existing SKU mappings', async () => {
    const mappings: SkuMapping[] = [
      {
        id: 'm1',
        product_id: 'p1',
        brand_id: 'brand-1',
        platform: 'amazon',
        platform_sku: 'AMZ-001',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: mappings, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [product], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    const skuElement = await screen.findByText('AMZ-001')
    expect(skuElement).toBeInTheDocument()
    expect(skuElement.closest('tr')).toHaveTextContent('SKU-001 — Widget')
  })

  it('creates a SKU mapping from the form', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [product], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    const created: SkuMapping = {
      id: 'm2',
      product_id: 'p1',
      brand_id: 'brand-1',
      platform: 'amazon',
      platform_sku: 'AMZ-002',
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: created, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()
    await screen.findByText('No SKU mappings yet.')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /New mapping/ }))
    await user.type(screen.getByLabelText('Platform SKU'), 'AMZ-002')
    await user.click(screen.getByRole('button', { name: 'Add mapping' }))

    expect(await screen.findByText('AMZ-002')).toBeInTheDocument()
  })
})
