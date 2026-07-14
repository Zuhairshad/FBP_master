import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { WalmartConnectPage } from './WalmartConnectPage'
import { AuthContext } from '../hooks/auth-context'
import { connectWalmart, getWalmartStatus, triggerWalmartSync } from '../lib/worker'

vi.mock('../lib/worker', () => ({
  connectWalmart: vi.fn(),
  getWalmartStatus: vi.fn(),
  triggerWalmartSync: vi.fn(),
}))

const fakeSession = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'brand-1' },
} as unknown as Session

function renderWithAuth() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider
      value={{
        session: fakeSession,
        loading: false,
        profile: {
          id: 'brand-1',
          role: 'brand',
          display_name: 'Brand One',
          company_name: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      }}
    >
      <WalmartConnectPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('WalmartConnectPage', () => {
  it('shows a connect form when no seller account is connected', async () => {
    vi.mocked(getWalmartStatus).mockResolvedValueOnce({ connected: false })

    renderWithAuth()

    expect(await screen.findByLabelText('Client ID')).toBeInTheDocument()
    expect(screen.getByLabelText('Client Secret')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Walmart' })).toBeInTheDocument()
  })

  it('submits the client id + client secret on connect', async () => {
    vi.mocked(getWalmartStatus).mockResolvedValueOnce({ connected: false })
    vi.mocked(connectWalmart).mockResolvedValueOnce({ connected: true })

    renderWithAuth()

    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Client ID'), 'my-client-id')
    await user.type(screen.getByLabelText('Client Secret'), 'my-client-secret')
    await user.click(screen.getByRole('button', { name: 'Connect Walmart' }))

    await waitFor(() => {
      expect(connectWalmart).toHaveBeenCalledWith('fake-access-token', {
        clientId: 'my-client-id',
        clientSecret: 'my-client-secret',
      })
    })
    expect(await screen.findByText('Connected')).toBeInTheDocument()
  })

  it('shows connection status and syncs on demand when already connected', async () => {
    vi.mocked(getWalmartStatus).mockResolvedValueOnce({
      connected: true,
      lastSyncedAt: '2026-01-01T00:00:00Z',
    })
    vi.mocked(triggerWalmartSync).mockResolvedValueOnce({ syncedCount: 4 })

    renderWithAuth()

    expect(await screen.findByText('Connected')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))

    expect(await screen.findByText('Synced 4 order(s).')).toBeInTheDocument()
  })
})
