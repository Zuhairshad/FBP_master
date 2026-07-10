import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { InventoryPage } from './InventoryPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type Product = Database['public']['Tables']['products']['Row']
type Warehouse = Database['public']['Tables']['warehouses']['Row']
type InventoryRow = Database['public']['Tables']['inventory']['Row']
type QueryResult = { data: unknown; error: unknown }

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder
  order: (...args: unknown[]) => MockQueryBuilder
  insert: (...args: unknown[]) => MockQueryBuilder
  upsert: (...args: unknown[]) => MockQueryBuilder
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
  builder.upsert = vi.fn(() => builder)
  builder.update = vi.fn(() => builder)
  builder.delete = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
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
  description: null,
  created_at: '2026-01-01T00:00:00Z',
}

const warehouse: Warehouse = {
  id: 'w1',
  provider_id: 'provider-1',
  name: 'Main Warehouse',
  address_line1: '1 Dock Rd',
  city: 'Columbus',
  state: null,
  postal_code: '43215',
  country: 'US',
  created_at: '2026-01-01T00:00:00Z',
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
        <InventoryPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('InventoryPage', () => {
  it('lists existing inventory levels', async () => {
    const inventory: InventoryRow[] = [
      { id: 'i1', product_id: 'p1', warehouse_id: 'w1', quantity: 25, created_at: '2026-01-01T00:00:00Z' },
    ]
    mockFrom(
      { data: [product], error: null },
      { data: [warehouse], error: null },
      { data: inventory, error: null },
    )

    renderWithAuth()

    expect(await screen.findByText(/Widget @ Main Warehouse/)).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('sets an inventory level from the form', async () => {
    mockFrom(
      { data: [product], error: null },
      { data: [warehouse], error: null },
      { data: [], error: null },
    )

    const created: InventoryRow = {
      id: 'i2',
      product_id: 'p1',
      warehouse_id: 'w1',
      quantity: 10,
      created_at: '2026-01-01T00:00:00Z',
    }
    mockFrom({ data: created, error: null })

    renderWithAuth()
    await screen.findByText('No inventory set yet.')

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Product'), 'p1')
    await user.selectOptions(screen.getByLabelText('Warehouse'), 'w1')
    await user.type(screen.getByLabelText('Quantity'), '10')
    await user.click(screen.getByRole('button', { name: 'Save inventory level' }))

    expect(await screen.findByText(/Widget @ Main Warehouse/)).toBeInTheDocument()
  })
})
