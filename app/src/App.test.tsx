import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('sends an unauthenticated visitor to sign-in', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
