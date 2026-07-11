import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { TiktokOrdersPage } from './TiktokOrdersPage'
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
        <TiktokOrdersPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('TiktokOrdersPage', () => {
  it('lists synced orders with their resolution status, filtered to the tiktok platform', async () => {
    const orders: PlatformOrder[] = [
      {
        id: 'o1',
        brand_id: 'brand-1',
        platform: 'tiktok',
        platform_order_id: '1001',
        raw_data: { id: '1001' },
        resolved_master_sku: 'SKU-001',
        status: 'resolved',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'o2',
        brand_id: 'brand-1',
        platform: 'tiktok',
        platform_order_id: '1002',
        raw_data: { id: '1002' },
        resolved_master_sku: null,
        status: 'unmapped',
        created_at: '2026-01-02T00:00:00Z',
      },
    ]
    const builder = makeBuilder({ data: orders, error: null })
    vi.mocked(supabase.from).mockReturnValueOnce(builder as unknown as ReturnType<typeof supabase.from>)

    renderWithAuth()

    expect(await screen.findByText('tiktok #1001')).toBeInTheDocument()
    expect(screen.getByText('SKU-001')).toBeInTheDocument()
    expect(screen.getByText('tiktok #1002')).toBeInTheDocument()
    expect(screen.getByText('unmapped')).toBeInTheDocument()
    expect(builder.eq).toHaveBeenCalledWith('platform', 'tiktok')
  })

  it('shows an empty state when there are no orders', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText(/No orders yet/)).toBeInTheDocument()
  })
})
