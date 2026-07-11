import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { UsersPage } from './UsersPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import { deactivateUser, reactivateUser } from '../lib/worker'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../lib/worker', () => ({
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
}))

type Profile = Database['public']['Tables']['profiles']['Row']
type QueryResult = { data: unknown; error: unknown }

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder
  order: (...args: unknown[]) => MockQueryBuilder
  neq: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.neq = vi.fn(() => builder)
  builder.then = (resolve) => resolve(result)
  return builder
}

function mockFrom(...results: QueryResult[]) {
  const mocked = vi.mocked(supabase.from)
  for (const result of results) {
    mocked.mockReturnValueOnce(makeBuilder(result) as unknown as ReturnType<typeof supabase.from>)
  }
}

const activeBrand: Profile = {
  id: 'brand-1',
  role: 'brand',
  display_name: 'Brand One',
  company_name: 'Widgets Co',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
}

const deactivatedProvider: Profile = {
  id: 'provider-1',
  role: 'provider',
  display_name: 'Provider One',
  company_name: null,
  is_active: false,
  created_at: '2026-01-01T00:00:00Z',
}

const fakeSession = {
  access_token: 'admin-access-token',
  refresh_token: 'fake-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'admin-1' },
} as unknown as Session

function renderWithAuth() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider
        value={{
          session: fakeSession,
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
        <UsersPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('UsersPage', () => {
  it('lists every brand/provider account with its status', async () => {
    mockFrom({ data: [activeBrand, deactivatedProvider], error: null })

    renderWithAuth()

    expect(await screen.findByText('Widgets Co')).toBeInTheDocument()
    expect(screen.getByText('Provider One')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('deactivated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('deactivates an active account', async () => {
    mockFrom({ data: [activeBrand], error: null })
    vi.mocked(deactivateUser).mockResolvedValueOnce({ deactivated: true })

    renderWithAuth()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))

    expect(deactivateUser).toHaveBeenCalledWith('admin-access-token', 'brand-1')
    expect(await screen.findByText('deactivated')).toBeInTheDocument()
  })

  it('reactivates a deactivated account', async () => {
    mockFrom({ data: [deactivatedProvider], error: null })
    vi.mocked(reactivateUser).mockResolvedValueOnce({ deactivated: false })

    renderWithAuth()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Reactivate' }))

    expect(reactivateUser).toHaveBeenCalledWith('admin-access-token', 'provider-1')
    expect(await screen.findByText('active')).toBeInTheDocument()
  })
})
