import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ProviderOrdersPage } from './ProviderOrdersPage'
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

function renderWithAuth() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider
        value={{
          session: null,
          loading: false,
          profile: {
            id: 'provider-1',
            role: 'provider',
            display_name: 'Provider One',
            company_name: null,
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
          },
        }}
      >
        <ProviderOrdersPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('ProviderOrdersPage', () => {
  it('lists orders visible via an approved booking, resolved by brand name', async () => {
    const orders: PlatformOrder[] = [
      {
        id: 'o1',
        brand_id: 'brand-1',
        platform: 'shopify',
        platform_order_id: '1001',
        raw_data: { id: 1001 },
        resolved_master_sku: 'SKU-001',
        status: 'resolved',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    const brands: Profile[] = [
      {
        id: 'brand-1',
        role: 'brand',
        display_name: 'Brand One',
        company_name: 'Brand One Co',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: orders, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: brands, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText(/Brand One Co — shopify #1001/)).toBeInTheDocument()
  })

  it('shows an empty state when no orders are visible yet', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText(/No orders visible yet/)).toBeInTheDocument()
  })
})
