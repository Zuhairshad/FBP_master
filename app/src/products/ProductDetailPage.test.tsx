import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ProductDetailPage } from './ProductDetailPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type Product = Database['public']['Tables']['products']['Row']
type SkuMapping = Database['public']['Tables']['sku_mappings']['Row']
type QueryResult = { data: unknown; error: unknown }

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder
  eq: (...args: unknown[]) => MockQueryBuilder
  order: (...args: unknown[]) => MockQueryBuilder
  update: (...args: unknown[]) => MockQueryBuilder
  delete: (...args: unknown[]) => MockQueryBuilder
  single: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.update = vi.fn(() => builder)
  builder.delete = vi.fn(() => builder)
  builder.single = vi.fn(() => builder)
  builder.then = (resolve) => resolve(result)
  return builder
}

function mockFrom(...results: QueryResult[]) {
  const mocked = vi.mocked(supabase.from)
  for (const result of results) {
    mocked.mockReturnValueOnce(makeBuilder(result) as unknown as ReturnType<typeof supabase.from>)
  }
}

const product: Product = {
  id: 'p1',
  brand_id: 'brand-1',
  master_sku: 'SKU-001',
  name: 'Widget',
  description: 'A fine widget',
  created_at: '2026-01-01T00:00:00Z',
}

const mapping: SkuMapping = {
  id: 'm1',
  product_id: 'p1',
  brand_id: 'brand-1',
  platform: 'amazon',
  platform_sku: 'AMZ-001',
  created_at: '2026-01-01T00:00:00Z',
}

function renderWithAuth() {
  return render(
    <MemoryRouter initialEntries={['/brand/products/p1']}>
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
        <Routes>
          <Route path="/brand/products/:productId" element={<ProductDetailPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('ProductDetailPage', () => {
  it('shows the product and its SKU mappings', async () => {
    mockFrom({ data: product, error: null }, { data: [mapping], error: null })

    renderWithAuth()

    expect(await screen.findAllByText('Widget')).toHaveLength(2)
    expect(screen.getByText('SKU-001')).toBeInTheDocument()
    expect(screen.getByText('A fine widget')).toBeInTheDocument()
    expect(screen.getByText('amazon')).toBeInTheDocument()
    expect(screen.getByText('AMZ-001')).toBeInTheDocument()
  })

  it('edits the product from the modal', async () => {
    mockFrom({ data: product, error: null }, { data: [], error: null })
    mockFrom({ data: { ...product, name: 'Widget Pro' }, error: null })

    renderWithAuth()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Edit/ }))
    const nameField = screen.getByLabelText('Name')
    await user.clear(nameField)
    await user.type(nameField, 'Widget Pro')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findAllByText('Widget Pro')).toHaveLength(2)
  })
})
