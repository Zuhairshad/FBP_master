import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { WarehousesPage } from './WarehousesPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type Warehouse = Database['public']['Tables']['warehouses']['Row']
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
      <WarehousesPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('WarehousesPage', () => {
  it('lists existing warehouses', async () => {
    const warehouses: Warehouse[] = [
      {
        id: 'w1',
        provider_id: 'provider-1',
        name: 'Main Warehouse',
        address_line1: '1 Dock Rd',
        city: 'Columbus',
        state: null,
        postal_code: '43215',
        country: 'US',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    mockFrom(
      { data: warehouses, error: null },
      { data: [], error: null },
      { data: [], error: null },
    )

    renderWithAuth()

    expect(await screen.findByText('Main Warehouse')).toBeInTheDocument()
  })

  it('creates a warehouse from the form', async () => {
    mockFrom({ data: [], error: null }, { data: [], error: null }, { data: [], error: null })

    const created: Warehouse = {
      id: 'w2',
      provider_id: 'provider-1',
      name: 'New Warehouse',
      address_line1: '2 Dock Rd',
      city: 'Columbus',
      state: null,
      postal_code: '43215',
      country: 'US',
      created_at: '2026-01-01T00:00:00Z',
    }
    mockFrom({ data: created, error: null })

    renderWithAuth()
    await screen.findByText('No warehouses yet.')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'New Warehouse')
    await user.type(screen.getByLabelText('Address'), '2 Dock Rd')
    await user.type(screen.getByLabelText('City'), 'Columbus')
    await user.type(screen.getByLabelText('Postal code'), '43215')
    await user.type(screen.getByLabelText('Country'), 'US')
    await user.click(screen.getByRole('button', { name: 'Add warehouse' }))

    expect(await screen.findByText('New Warehouse')).toBeInTheDocument()
  })
})
