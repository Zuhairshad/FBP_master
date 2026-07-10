import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { ShopifyConnectPage } from './ShopifyConnectPage'
import { AuthContext } from '../../hooks/auth-context'
import { getShopifyStatus, requestShopifyInstallUrl, triggerShopifySync } from '../../lib/worker'

vi.mock('../../lib/worker', () => ({
  getShopifyStatus: vi.fn(),
  requestShopifyInstallUrl: vi.fn(),
  triggerShopifySync: vi.fn(),
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
        <ShopifyConnectPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('ShopifyConnectPage', () => {
  it('shows a connect form when no store is connected', async () => {
    vi.mocked(getShopifyStatus).mockResolvedValueOnce({ connected: false })

    renderWithAuth()

    expect(await screen.findByLabelText('Shop domain')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Shopify' })).toBeInTheDocument()
  })

  it('navigates to the returned install URL on connect', async () => {
    vi.mocked(getShopifyStatus).mockResolvedValueOnce({ connected: false })
    vi.mocked(requestShopifyInstallUrl).mockResolvedValueOnce({
      url: 'https://my-store.myshopify.com/admin/oauth/authorize?client_id=x',
    })

    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      writable: true,
    })

    renderWithAuth()

    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Shop domain'), 'my-store.myshopify.com')
    await user.click(screen.getByRole('button', { name: 'Connect Shopify' }))

    await waitFor(() => {
      expect(requestShopifyInstallUrl).toHaveBeenCalledWith('fake-access-token', 'my-store.myshopify.com')
    })
    await waitFor(() => {
      expect(window.location.href).toBe('https://my-store.myshopify.com/admin/oauth/authorize?client_id=x')
    })

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('shows connection status and syncs on demand when already connected', async () => {
    vi.mocked(getShopifyStatus).mockResolvedValueOnce({
      connected: true,
      shopDomain: 'my-store.myshopify.com',
      lastSyncedAt: '2026-01-01T00:00:00Z',
    })
    vi.mocked(triggerShopifySync).mockResolvedValueOnce({ syncedCount: 3 })

    renderWithAuth()

    expect(await screen.findByText('my-store.myshopify.com')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))

    expect(await screen.findByText('Synced 3 order(s).')).toBeInTheDocument()
  })
})
