import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(),
  },
}))

function Consumer() {
  const { session, profile, loading } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="session">{session ? session.user.id : 'none'}</span>
      <span data-testid="profile">{profile ? profile.role : 'none'}</span>
    </div>
  )
}

describe('AuthProvider', () => {
  it('never reports loading:false with session:null while a new session\'s profile fetch is still in flight', async () => {
    // Reproduces a real race found via e2e/global-setup.ts driving a live
    // sign-up through a real browser: SignUpPage navigates immediately
    // after supabase.auth.signUp() resolves, but the profile fetch
    // triggered by the resulting onAuthStateChange event is a separate
    // network round trip. A route guard reading state during that window
    // must see loading:true, not the stale unauthenticated loading:false.
    let authStateCallback: ((event: string, session: unknown) => void) | undefined

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(((callback: (event: string, session: unknown) => void) => {
      authStateCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }) as unknown as typeof supabase.auth.onAuthStateChange)

    let resolveProfile: (value: { data: unknown; error: null }) => void = () => {}
    const profilePromise = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveProfile = resolve
    })
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => profilePromise),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('session')).toHaveTextContent('none')

    authStateCallback?.('SIGNED_IN', { user: { id: 'user-1' } })

    // Session must be reflected, and loading must flip back to true,
    // synchronously with the auth-state event — before the profile fetch
    // (still pending) resolves.
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('user-1'))
    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('profile')).toHaveTextContent('none')

    resolveProfile({ data: { id: 'user-1', role: 'brand' }, error: null })

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('profile')).toHaveTextContent('brand')
  })
})
