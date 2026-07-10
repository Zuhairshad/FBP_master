import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SignUpPage } from './SignUpPage'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
    },
  },
}))

// Only the fields the component actually reads (`error?.message`) matter for
// these tests — the real AuthResponse union requires a full User object we
// have no use for here.
type SignUpResult = Awaited<ReturnType<typeof supabase.auth.signUp>>

describe('SignUpPage', () => {
  it('defaults to the brand role and submits the chosen role', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as unknown as SignUpResult)

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText('Brand')).toBeChecked()

    await user.type(screen.getByLabelText('Name'), 'Jordan')
    await user.type(screen.getByLabelText('Email'), 'jordan@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'jordan@example.com',
      password: 'correct-horse-battery-staple',
      options: {
        data: {
          role: 'brand',
          display_name: 'Jordan',
          company_name: undefined,
        },
      },
    })
  })

  it('submits provider when selected', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as unknown as SignUpResult)

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByLabelText('Fulfillment Provider'))
    await user.type(screen.getByLabelText('Name'), 'Alex')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(supabase.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { data: expect.objectContaining({ role: 'provider' }) },
      }),
    )
  })

  it('shows the error message on rejected sign-up', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    } as unknown as SignUpResult)

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Name'), 'Jordan')
    await user.type(screen.getByLabelText('Email'), 'jordan@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('User already registered')).toBeInTheDocument()
  })
})
