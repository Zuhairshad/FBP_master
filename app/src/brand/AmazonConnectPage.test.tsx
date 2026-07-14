import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { AmazonConnectPage } from './AmazonConnectPage'
import { AuthContext } from '../hooks/auth-context'
import { connectAmazon, getAmazonStatus, triggerAmazonSync } from '../lib/worker'

vi.mock('../lib/worker', () => ({
  connectAmazon: vi.fn(),
  getAmazonStatus: vi.fn(),
  triggerAmazonSync: vi.fn(),
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
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
          },
        }}
      >
        <AmazonConnectPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('AmazonConnectPage', () => {
  it('shows a connect form when no seller account is connected', async () => {
    vi.mocked(getAmazonStatus).mockResolvedValueOnce({ connected: false })

    renderWithAuth()

    expect(await screen.findByLabelText('Refresh token')).toBeInTheDocument()
    expect(screen.getByLabelText('Marketplace ID')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Amazon' })).toBeInTheDocument()
  })

  it('submits the refresh token + marketplace id on connect', async () => {
    vi.mocked(getAmazonStatus).mockResolvedValueOnce({ connected: false })
    vi.mocked(connectAmazon).mockResolvedValueOnce({ connected: true })

    renderWithAuth()

    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Refresh token'), 'Atzr|refresh-token')
    await user.type(screen.getByLabelText('Marketplace ID'), 'ATVPDKIKX0DER')
    await user.click(screen.getByRole('button', { name: 'Connect Amazon' }))

    await waitFor(() => {
      expect(connectAmazon).toHaveBeenCalledWith('fake-access-token', {
        refreshToken: 'Atzr|refresh-token',
        marketplaceId: 'ATVPDKIKX0DER',
      })
    })
    expect(await screen.findByText('ATVPDKIKX0DER')).toBeInTheDocument()
  })

  it('shows connection status and syncs on demand when already connected', async () => {
    vi.mocked(getAmazonStatus).mockResolvedValueOnce({
      connected: true,
      marketplaceId: 'ATVPDKIKX0DER',
      lastSyncedAt: '2026-01-01T00:00:00Z',
    })
    vi.mocked(triggerAmazonSync).mockResolvedValueOnce({ syncedCount: 3 })

    renderWithAuth()

    expect(await screen.findByText('ATVPDKIKX0DER')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))

    expect(await screen.findByText('Synced 3 order(s).')).toBeInTheDocument()
  })
})
