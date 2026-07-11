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

function mockFrom(...results: QueryResult[]) {
  const mocked = vi.mocked(supabase.from)
  for (const result of results) {
    mocked.mockReturnValueOnce(makeBuilder(result) as unknown as ReturnType<typeof supabase.from>)
  }
}

const successfulRun: SyncLog = {
  id: 'l1',
  platform: 'shopify',
  started_at: '2026-01-01T00:00:00Z',
  finished_at: '2026-01-01T00:01:00Z',
  success_count: 3,
  failure_count: 0,
  error_message: null,
}

const failedRun: SyncLog = {
  id: 'l2',
  platform: 'amazon',
  started_at: '2026-01-02T00:00:00Z',
  finished_at: '2026-01-02T00:01:00Z',
  success_count: 1,
  failure_count: 2,
  error_message: 'refresh token expired',
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
  it('lists sync runs across every platform with success/failure status', async () => {
    mockFrom({ data: [successfulRun, failedRun], error: null })

    renderWithAuth()

    expect(await screen.findByText('shopify')).toBeInTheDocument()
    expect(screen.getByText('ok')).toBeInTheDocument()
    expect(screen.getByText('amazon')).toBeInTheDocument()
    expect(screen.getByText('2 failed')).toBeInTheDocument()
    expect(screen.getByText('refresh token expired')).toBeInTheDocument()
  })
})
