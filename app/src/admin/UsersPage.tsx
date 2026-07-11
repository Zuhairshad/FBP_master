import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { ListRow } from '../components/ui/ListRow'
import { StatusBadge } from '../components/ui/StatusBadge'
import { deactivateUser, reactivateUser } from '../lib/worker'
import type { Database } from '../types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

export function UsersPage() {
  const { session } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingOnId, setActingOnId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadUsers() {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .neq('role', 'admin')
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setUsers(data ?? [])
      }
      setLoading(false)
    }

    void loadUsers()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleToggle(user: Profile) {
    if (!session) return
    setError(null)
    setActingOnId(user.id)

    try {
      if (user.is_active) {
        await deactivateUser(session.access_token, user.id)
      } else {
        await reactivateUser(session.access_token, user.id)
      }
      setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, is_active: !u.is_active } : u)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account status')
    } finally {
      setActingOnId(null)
    }
  }

  return (
    <DashboardShell title="Users">
      <div className="mx-auto max-w-2xl">
        {error && (
          <div className="mb-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {loading && <EmptyState>Loading users…</EmptyState>}
        {!loading && users.length === 0 && <EmptyState>No brand or provider accounts yet.</EmptyState>}

        <ul className="space-y-2">
          {users.map((user) => (
            <ListRow key={user.id}>
              <span className="text-ink-muted">
                <span className="font-medium text-ink">{user.company_name ?? user.display_name}</span>{' '}
                <span className="capitalize text-ink-subtle">— {user.role}</span>
              </span>
              <div className="flex items-center gap-3">
                <StatusBadge tone={user.is_active ? 'success' : 'error'}>
                  {user.is_active ? 'active' : 'deactivated'}
                </StatusBadge>
                <Button
                  type="button"
                  variant={user.is_active ? 'danger' : 'secondary'}
                  disabled={actingOnId === user.id}
                  onClick={() => void handleToggle(user)}
                  className="text-xs"
                >
                  {user.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
            </ListRow>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
