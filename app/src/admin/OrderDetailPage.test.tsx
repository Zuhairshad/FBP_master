import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { OrderDetailPage } from './OrderDetailPage'
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
  eq: (...args: unknown[]) => MockQueryBuilder
  single: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
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

function renderWithAuth() {
  return render(
    <MemoryRouter initialEntries={['/admin/orders/o1']}>
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
        <Routes>
          <Route path="/admin/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('admin OrderDetailPage', () => {
  it('shows the order with its owning brand, no fulfillment edit action', async () => {
    const order: PlatformOrder = {
      id: 'o1',
      brand_id: 'brand-1',
      platform: 'shopify',
      platform_order_id: '1001',
      raw_data: { order_number: '1001' },
      resolved_master_sku: 'SKU-001',
      status: 'resolved',
      fulfillment_status: 'shipped',
      tracking_number: '1Z999',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const brand: Profile = {
      id: 'brand-1',
      role: 'brand',
      display_name: 'Brand One',
      company_name: 'Widgets Co',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    }
    mockFrom({ data: order, error: null }, { data: brand, error: null })

    renderWithAuth()

    expect(await screen.findByText('#1001')).toBeInTheDocument()
    expect(screen.getByText(/Brand: Widgets Co/)).toBeInTheDocument()
    expect(screen.getByText('shipped')).toBeInTheDocument()
    expect(screen.getByText(/Tracking: 1Z999/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Update/ })).not.toBeInTheDocument()
  })
})
