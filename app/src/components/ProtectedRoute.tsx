import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return null
  }

  if (!session) {
    return <Navigate to="/sign-in" replace />
  }

  return <Outlet />
}
