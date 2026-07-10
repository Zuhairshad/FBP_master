import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ProviderBookingsPage } from './ProviderBookingsPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type BookingRequest = Database['public']['Tables']['booking_requests']['Row']
type QueryResult = { data: unknown; error: unknown }

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder
  order: (...args: unknown[]) => MockQueryBuilder
  insert: (...args: unknown[]) => MockQueryBuilder
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

const booking: BookingRequest = {
  id: 'b1',
  brand_id: 'brand-1',
  provider_id: 'provider-1',
  storage_space_id: 's1',
  status: 'pending',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const brand: Profile = {
  id: 'brand-1',
  role: 'brand',
  display_name: 'Brand One',
  company_name: 'Widgets Co',
  created_at: '2026-01-01T00:00:00Z',
}

const space: StorageSpace = {
  id: 's1',
  warehouse_id: 'w1',
  name: 'Pallet Rack A',
  unit_type: 'pallet',
  capacity_units: 50,
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
          id: 'provider-1',
          role: 'provider',
          display_name: 'Provider One',
          company_name: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      }}
    >
      <ProviderBookingsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('ProviderBookingsPage', () => {
  it('lists incoming booking requests with approve/reject actions', async () => {
    mockFrom(
      { data: [booking], error: null },
      { data: [brand], error: null },
      { data: [space], error: null },
    )

    renderWithAuth()

    expect(await screen.findByText('Widgets Co')).toBeInTheDocument()
    expect(screen.getByText(/Pallet Rack A/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('approves a pending booking request', async () => {
    mockFrom(
      { data: [booking], error: null },
      { data: [brand], error: null },
      { data: [space], error: null },
    )
    mockFrom({ data: { ...booking, status: 'approved' }, error: null })

    renderWithAuth()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('approved')).toBeInTheDocument()
  })
})
