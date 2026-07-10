import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WalmartOrdersPage } from './WalmartOrdersPage'
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
  order: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.then = (resolve) => resolve(result)
  return builder
}

function renderWithAuth() {
  return render(
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
      <WalmartOrdersPage />
    </AuthContext.Provider>,
  )
}

describe('WalmartOrdersPage', () => {
  it('lists synced orders with their resolution status, filtered to the walmart platform', async () => {
    const orders: PlatformOrder[] = [
      {
        id: 'o1',
        brand_id: 'brand-1',
        platform: 'walmart',
        platform_order_id: '1111111111111',
        raw_data: { purchaseOrderId: '1111111111111' },
        resolved_master_sku: 'SKU-001',
        status: 'resolved',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'o2',
        brand_id: 'brand-1',
        platform: 'walmart',
        platform_order_id: '2222222222222',
        raw_data: { purchaseOrderId: '2222222222222' },
        resolved_master_sku: null,
        status: 'unmapped',
        created_at: '2026-01-02T00:00:00Z',
      },
    ]
    const builder = makeBuilder({ data: orders, error: null })
    vi.mocked(supabase.from).mockReturnValueOnce(builder as unknown as ReturnType<typeof supabase.from>)

    renderWithAuth()

    expect(await screen.findByText('walmart #1111111111111')).toBeInTheDocument()
    expect(screen.getByText('SKU-001')).toBeInTheDocument()
    expect(screen.getByText('walmart #2222222222222')).toBeInTheDocument()
    expect(screen.getByText('unmapped')).toBeInTheDocument()
    expect(builder.eq).toHaveBeenCalledWith('platform', 'walmart')
  })

  it('shows an empty state when there are no orders', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText(/No orders yet/)).toBeInTheDocument()
  })
})
