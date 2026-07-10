import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { TiktokConnectPage } from './TiktokConnectPage'
import { AuthContext } from '../../hooks/auth-context'
import { getTiktokStatus, requestTiktokInstallUrl, triggerTiktokSync } from '../../lib/worker'

vi.mock('../../lib/worker', () => ({
  getTiktokStatus: vi.fn(),
  requestTiktokInstallUrl: vi.fn(),
  triggerTiktokSync: vi.fn(),
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
        <TiktokConnectPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('TiktokConnectPage', () => {
  it('shows a connect button when no shop is connected', async () => {
    vi.mocked(getTiktokStatus).mockResolvedValueOnce({ connected: false })

    renderWithAuth()

    expect(await screen.findByRole('button', { name: 'Connect TikTok Shop' })).toBeInTheDocument()
  })

  it('navigates to the returned install URL on connect', async () => {
    vi.mocked(getTiktokStatus).mockResolvedValueOnce({ connected: false })
    vi.mocked(requestTiktokInstallUrl).mockResolvedValueOnce({
      url: 'https://auth.tiktok-shops.com/oauth/authorize?app_key=x&state=y',
    })

    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      writable: true,
    })

    renderWithAuth()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Connect TikTok Shop' }))

    await waitFor(() => {
      expect(requestTiktokInstallUrl).toHaveBeenCalledWith('fake-access-token')
    })
    await waitFor(() => {
      expect(window.location.href).toBe('https://auth.tiktok-shops.com/oauth/authorize?app_key=x&state=y')
    })

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('shows connection status and syncs on demand when already connected', async () => {
    vi.mocked(getTiktokStatus).mockResolvedValueOnce({
      connected: true,
      shopId: 'shop-1',
      lastSyncedAt: '2026-01-01T00:00:00Z',
    })
    vi.mocked(triggerTiktokSync).mockResolvedValueOnce({ syncedCount: 3 })

    renderWithAuth()

    expect(await screen.findByText('shop-1')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))

    expect(await screen.findByText('Synced 3 order(s).')).toBeInTheDocument()
  })
})
