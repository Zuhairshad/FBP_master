import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AdminDashboardPage } from './AdminDashboardPage'
import { AuthContext } from '../hooks/auth-context'

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
        <AdminDashboardPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('AdminDashboardPage', () => {
  it('links to every admin section', () => {
    renderWithAuth()

    expect(screen.getByRole('link', { name: 'Manage users' })).toHaveAttribute('href', '/admin/users')
    expect(screen.getByRole('link', { name: 'All bookings' })).toHaveAttribute('href', '/admin/bookings')
    expect(screen.getByRole('link', { name: 'All orders' })).toHaveAttribute('href', '/admin/orders')
    expect(screen.getByRole('link', { name: 'View sync history' })).toHaveAttribute('href', '/admin/sync-logs')
  })
})
