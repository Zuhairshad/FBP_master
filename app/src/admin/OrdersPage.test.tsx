import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { OrdersPage } from './OrdersPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type PlatformOrder = Database['public']['Tables']['platform_orders']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type QueryResult = { data: unknown; error: unknown }

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder
  order: (...args: unknown[]) => MockQueryBuilder
  eq: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.then = (resolve) => resolve(result)
  return builder
}

function mockFrom(...results: QueryResult[]) {
  const mocked = vi.mocked(supabase.from)
  for (const result of results) {
    mocked.mockReturnValueOnce(makeBuilder(result) as unknown as ReturnType<typeof supabase.from>)
  }
}

const shopifyOrder: PlatformOrder = {
  id: 'o1',
  brand_id: 'brand-1',
  platform: 'shopify',
  platform_order_id: '1001',
  raw_data: {},
  resolved_master_sku: 'SKU-001',
  status: 'resolved',
  created_at: '2026-01-01T00:00:00Z',
}

const walmartOrder: PlatformOrder = {
  id: 'o2',
  brand_id: 'brand-2',
  platform: 'walmart',
  platform_order_id: '2002',
  raw_data: {},
  resolved_master_sku: null,
  status: 'unmapped',
  created_at: '2026-01-02T00:00:00Z',
}

const brand1: Profile = {
  id: 'brand-1',
  role: 'brand',
  display_name: 'Brand One',
  company_name: 'Widgets Co',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
}

const brand2: Profile = {
  id: 'brand-2',
  role: 'brand',
  display_name: 'Brand Two',
  company_name: null,
  is_active: true,
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
            id: 'admin-1',
            role: 'admin',
            display_name: 'Admin One',
            company_name: null,
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
          },
        }}
      >
        <OrdersPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('admin OrdersPage', () => {
  it('lists orders across every brand and platform', async () => {
    mockFrom({ data: [shopifyOrder, walmartOrder], error: null }, { data: [brand1, brand2], error: null })

    renderWithAuth()

    expect(await screen.findByText(/Widgets Co — shopify #1001/)).toBeInTheDocument()
    expect(screen.getByText(/Brand Two — walmart #2002/)).toBeInTheDocument()
  })
})
