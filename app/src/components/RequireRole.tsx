import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../types/database'

/** Renders its route only for the given role; anyone else is bounced to their own dashboard. */
export function RequireRole({ role }: { role: UserRole }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return null
  }

  if (profile?.role !== role) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
