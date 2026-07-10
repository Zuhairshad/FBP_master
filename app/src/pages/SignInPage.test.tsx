import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SignInPage } from './SignInPage'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
}))

// Only the fields the component actually reads (`error?.message`) matter for
// these tests — the real AuthTokenResponsePassword union requires a full User
// object we have no use for here.
type SignInResult = Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>

describe('SignInPage', () => {
  it('signs in with the entered credentials', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as unknown as SignInResult)

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'brand-a@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'brand-a@example.com',
      password: 'correct-horse-battery-staple',
    })
  })

  it('shows the error message on rejected sign-in', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    } as unknown as SignInResult)

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'brand-a@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
  })
})
