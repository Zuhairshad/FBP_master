import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { UsersPage } from './UsersPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import { deactivateUser } from '../lib/worker'
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
  neq: (...args: unknown[]) => MockQueryBuilder
  order: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
  builder.neq = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.then = (resolve) => resolve(result)
  return builder
}

const fakeSession = {
  access_token: 'fake-access-token',
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
  it('lists users with their status', async () => {
    const users: Profile[] = [
      {
        id: 'brand-1',
        role: 'brand',
        display_name: 'Brand One',
        company_name: 'Widgets Co',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: users, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText('Widgets Co')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })

  it('deactivates an active user', async () => {
    const users: Profile[] = [
      {
        id: 'brand-1',
        role: 'brand',
        display_name: 'Brand One',
        company_name: 'Widgets Co',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: users, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )
    vi.mocked(deactivateUser).mockResolvedValueOnce({ deactivated: true })

    renderWithAuth()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))

    expect(deactivateUser).toHaveBeenCalledWith('fake-access-token', 'brand-1')
    expect(await screen.findByText('Inactive')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })
})
