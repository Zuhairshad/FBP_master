import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { deactivateUser, reactivateUser } from '../lib/worker'
import { DashboardShell } from '../components/DashboardShell'
import { Button } from '../components/ui/Button'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import type { Database } from '../types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

export function UsersPage() {
  const { session } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

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
    setActingId(user.id)

    try {
      if (user.is_active) {
        await deactivateUser(session.access_token, user.id)
      } else {
        await reactivateUser(session.access_token, user.id)
      }
      setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, is_active: !u.is_active } : u)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setActingId(null)
    }
  }

  return (
    <DashboardShell title="Users">
      {error && (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {loading && <EmptyState>Loading users…</EmptyState>}
      {!loading && users.length === 0 && <EmptyState>No users yet.</EmptyState>}
      {!loading && users.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.company_name ?? user.display_name}</TableCell>
                <TableCell className="capitalize">{user.role}</TableCell>
                <TableCell>
                  <StatusBadge tone={user.is_active ? 'success' : 'error'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant={user.is_active ? 'danger' : 'secondary'}
                    size="sm"
                    disabled={actingId === user.id}
                    onClick={() => void handleToggle(user)}
                  >
                    {actingId === user.id ? 'Working…' : user.is_active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DashboardShell>
  )
}
