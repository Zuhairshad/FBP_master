import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { WarehouseDetailPage } from './WarehouseDetailPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type Warehouse = Database['public']['Tables']['warehouses']['Row']
type WarehouseService = Database['public']['Tables']['warehouse_services']['Row']
type StorageSpace = Database['public']['Tables']['storage_spaces']['Row']
type QueryResult = { data: unknown; error: unknown }

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder
  eq: (...args: unknown[]) => MockQueryBuilder
  insert: (...args: unknown[]) => MockQueryBuilder
  single: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.insert = vi.fn(() => builder)
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

const service: WarehouseService = {
  id: 'svc1',
  warehouse_id: 'w1',
  name: 'Pick & Pack',
  description: null,
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
    <MemoryRouter initialEntries={['/provider/warehouses/w1']}>
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
        <Routes>
          <Route path="/provider/warehouses/:warehouseId" element={<WarehouseDetailPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('WarehouseDetailPage', () => {
  it('shows the warehouse with its services and storage spaces', async () => {
    mockFrom({ data: warehouse, error: null }, { data: [service], error: null }, { data: [space], error: null })

    renderWithAuth()

    expect(await screen.findAllByText('Main Warehouse')).toHaveLength(2)
    expect(screen.getByText(/1 Dock Rd/)).toBeInTheDocument()
    expect(screen.getByText('Pick & Pack')).toBeInTheDocument()
    expect(screen.getByText('Pallet Rack A')).toBeInTheDocument()
  })

  it('adds a service from the modal', async () => {
    mockFrom({ data: warehouse, error: null }, { data: [], error: null }, { data: [], error: null })
    mockFrom({ data: { ...service, name: 'Kitting' }, error: null })

    renderWithAuth()
    await screen.findByText('No services yet.')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Add service/ }))
    await user.type(screen.getByLabelText('Name'), 'Kitting')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Kitting')).toBeInTheDocument()
  })
})
