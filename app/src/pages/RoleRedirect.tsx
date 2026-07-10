import { Navigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'

/** Lands an authenticated user on their role's dashboard. */
export function RoleRedirect() {
  const { profile, loading } = useAuth()

  if (loading) {
    return null
  }

  switch (profile?.role) {
    case 'brand':
      return <Navigate to="/brand" replace />
    case 'provider':
      return <Navigate to="/provider" replace />
    case 'admin':
      return <Navigate to="/admin" replace />
    default:
      return <Navigate to="/sign-in" replace />
  }
}
