import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  update: (...args: unknown[]) => MockQueryBuilder
  single: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.update = vi.fn(() => builder)
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

const baseOrder: PlatformOrder = {
  id: 'o1',
  brand_id: 'brand-1',
  platform: 'shopify',
  platform_order_id: '1001',
  raw_data: { id: 1001 },
  resolved_master_sku: 'SKU-001',
  status: 'resolved',
  fulfillment_status: 'pending',
  tracking_number: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const baseBrand: Profile = {
  id: 'brand-1',
  role: 'brand',
  display_name: 'Brand One',
  company_name: 'Brand One Co',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
}

describe('ProviderOrdersPage', () => {
  it('lists orders visible via an approved booking, resolved by brand name', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [baseOrder], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [baseBrand], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText('Brand One Co')).toBeInTheDocument()
    expect(screen.getByText('shopify #1001')).toBeInTheDocument()
    expect(screen.getAllByText('pending').length).toBeGreaterThan(0)
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

  it('lets a provider update fulfillment status and tracking number, then saves', async () => {
    const user = userEvent.setup()
    const updated = { ...baseOrder, fulfillment_status: 'shipped', tracking_number: 'TRACK-123' }
    const updateBuilder = makeBuilder({ data: updated, error: null })

    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [baseOrder], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [baseBrand], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )
    vi.mocked(supabase.from).mockReturnValueOnce(updateBuilder as unknown as ReturnType<typeof supabase.from>)

    renderWithAuth()

    expect(await screen.findByText('Brand One Co')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Fulfillment status'), 'shipped')
    await user.type(screen.getByLabelText('Tracking number'), 'TRACK-123')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateBuilder.update).toHaveBeenCalledWith({
      fulfillment_status: 'shipped',
      tracking_number: 'TRACK-123',
    })
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'o1')
  })
})
