import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProviderInventoryPage } from './ProviderInventoryPage'
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
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
  builder.then = (resolve) => resolve(result)
  return builder
}

function mockFrom(...results: QueryResult[]) {
  const mocked = vi.mocked(supabase.from)
  for (const result of results) {
    mocked.mockReturnValueOnce(makeBuilder(result) as unknown as ReturnType<typeof supabase.from>)
  }
}

function renderWithAuth() {
  return render(
    <AuthContext.Provider
      value={{
        session: null,
        loading: false,
        profile: {
          id: 'provider-1',
          role: 'provider',
          display_name: 'Provider One',
          company_name: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      }}
    >
      <ProviderInventoryPage />
    </AuthContext.Provider>,
  )
}

describe('ProviderInventoryPage', () => {
  it('lists inventory visible via an approved booking', async () => {
    const inventory: InventoryRow[] = [
      { id: 'i1', product_id: 'p1', warehouse_id: 'w1', quantity: 25, created_at: '2026-01-01T00:00:00Z' },
    ]
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

    mockFrom(
      { data: inventory, error: null },
      { data: [product], error: null },
      { data: [warehouse], error: null },
    )

    renderWithAuth()

    expect(await screen.findByText(/SKU-001 — Widget @ Main Warehouse/)).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('shows an empty state when no inventory is visible yet', async () => {
    mockFrom({ data: [], error: null }, { data: [], error: null }, { data: [], error: null })

    renderWithAuth()

    expect(
      await screen.findByText(/No inventory visible yet/),
    ).toBeInTheDocument()
  })
})
