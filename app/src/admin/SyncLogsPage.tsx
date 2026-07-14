import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import type { Database } from '../types/database'

type SyncLog = Database['public']['Tables']['sync_logs']['Row']

function statusFor(log: SyncLog): { tone: 'neutral' | 'success' | 'error'; label: string } {
  if (!log.finished_at) return { tone: 'neutral', label: 'running' }
  if (log.failure_count === 0) return { tone: 'success', label: 'ok' }
  return { tone: 'error', label: `${log.failure_count} failed` }
}

export function SyncLogsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadLogs() {
      const { data, error: fetchError } = await supabase
        .from('sync_logs')
        .select('*')
        .order('started_at', { ascending: false })

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setLogs(data ?? [])
      }
      setLoading(false)
    }

    void loadLogs()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <DashboardShell title="Sync Logs">
      {error && (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {loading && <EmptyState>Loading sync logs…</EmptyState>}
      {!loading && logs.length === 0 && <EmptyState>No sync runs yet.</EmptyState>}
      {!loading && logs.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Finished</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => {
              const status = statusFor(log)
              return (
                <TableRow key={log.id}>
                  <TableCell className="capitalize">{log.platform}</TableCell>
                  <TableCell>{new Date(log.started_at).toLocaleString()}</TableCell>
                  <TableCell>{log.finished_at ? new Date(log.finished_at).toLocaleString() : '—'}</TableCell>
                  <TableCell>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-ink-subtle">{log.error_message ?? '—'}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </DashboardShell>
  )
}
