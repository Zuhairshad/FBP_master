import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { SyncLogsPage } from './SyncLogsPage'
import { AuthContext } from '../hooks/auth-context'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

type SyncLog = Database['public']['Tables']['sync_logs']['Row']
type QueryResult = { data: unknown; error: unknown }

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder
  order: (...args: unknown[]) => MockQueryBuilder
  then: (resolve: (value: QueryResult) => void) => void
}

function makeBuilder(result: QueryResult): MockQueryBuilder {
  const builder = {} as MockQueryBuilder
  builder.select = vi.fn(() => builder)
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
            id: 'admin-1',
            role: 'admin',
            display_name: 'Admin One',
            company_name: null,
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
          },
        }}
      >
        <SyncLogsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('SyncLogsPage', () => {
  it('shows ok, failed, and running sync runs', async () => {
    const logs: SyncLog[] = [
      {
        id: 'l1',
        platform: 'shopify',
        started_at: '2026-01-01T00:00:00Z',
        finished_at: '2026-01-01T00:05:00Z',
        success_count: 10,
        failure_count: 0,
        error_message: null,
      },
      {
        id: 'l2',
        platform: 'tiktok',
        started_at: '2026-01-02T00:00:00Z',
        finished_at: '2026-01-02T00:05:00Z',
        success_count: 8,
        failure_count: 2,
        error_message: 'rate limited',
      },
      {
        id: 'l3',
        platform: 'amazon',
        started_at: '2026-01-03T00:00:00Z',
        finished_at: null,
        success_count: 0,
        failure_count: 0,
        error_message: null,
      },
    ]
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: logs, error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText('ok')).toBeInTheDocument()
    expect(screen.getByText('2 failed')).toBeInTheDocument()
    expect(screen.getByText('rate limited')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('shows an empty state when there are no sync runs', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>,
    )

    renderWithAuth()

    expect(await screen.findByText('No sync runs yet.')).toBeInTheDocument()
  })
})
