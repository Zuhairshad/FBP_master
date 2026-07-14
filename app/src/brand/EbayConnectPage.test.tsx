import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { EbayConnectPage } from './EbayConnectPage'
import { AuthContext } from '../hooks/auth-context'
import { getEbayStatus, requestEbayInstallUrl, triggerEbaySync } from '../lib/worker'

vi.mock('../lib/worker', () => ({
  requestEbayInstallUrl: vi.fn(),
  getEbayStatus: vi.fn(),
  triggerEbaySync: vi.fn(),
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
        <EbayConnectPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('EbayConnectPage', () => {
  it('shows a connect button when no eBay account is connected', async () => {
    vi.mocked(getEbayStatus).mockResolvedValueOnce({ connected: false })

    renderWithAuth()

    expect(await screen.findByRole('button', { name: 'Connect eBay' })).toBeInTheDocument()
  })

  it('navigates to the returned authorize URL on connect', async () => {
    vi.mocked(getEbayStatus).mockResolvedValueOnce({ connected: false })
    vi.mocked(requestEbayInstallUrl).mockResolvedValueOnce({ url: 'https://auth.ebay.com/oauth2/authorize?x=1' })

    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      writable: true,
    })

    renderWithAuth()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Connect eBay' }))

    await waitFor(() => {
      expect(requestEbayInstallUrl).toHaveBeenCalledWith('fake-access-token')
    })
    await waitFor(() => {
      expect(window.location.href).toBe('https://auth.ebay.com/oauth2/authorize?x=1')
    })

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('shows connection status and syncs on demand when already connected', async () => {
    vi.mocked(getEbayStatus).mockResolvedValueOnce({
      connected: true,
      lastSyncedAt: '2026-01-01T00:00:00Z',
    })
    vi.mocked(triggerEbaySync).mockResolvedValueOnce({ syncedCount: 2 })

    renderWithAuth()

    expect(await screen.findByText('Connected')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))

    expect(await screen.findByText('Synced 2 order(s).')).toBeInTheDocument()
  })
})
