import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ShopifyOrderDetailPage } from './ShopifyOrderDetailPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type PlatformOrder = Database['public']['Tables']['platform_orders']['Row']
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

function renderWithAuth() {
  return render(
    <MemoryRouter initialEntries={['/brand/shopify/orders/o1']}>
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
          <Route path="/brand/shopify/orders/:orderId" element={<ShopifyOrderDetailPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('ShopifyOrderDetailPage', () => {
  it('shows the order status and raw data', async () => {
    const order: PlatformOrder = {
      id: 'o1',
      brand_id: 'brand-1',
      platform: 'shopify',
      platform_order_id: '1001',
      raw_data: { order_number: '1001', financial_status: 'paid' },
      resolved_master_sku: 'SKU-001',
      status: 'resolved',
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: order, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText('#1001')).toBeInTheDocument()
    expect(screen.getByText('resolved')).toBeInTheDocument()
    expect(screen.getByText(/Resolved to master SKU: SKU-001/)).toBeInTheDocument()
    expect(screen.getByText('order_number')).toBeInTheDocument()
    expect(screen.getByText('financial_status')).toBeInTheDocument()
  })
})
