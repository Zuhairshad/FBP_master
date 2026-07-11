import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DashboardShell } from '../components/DashboardShell'
import { ErrorText } from '../components/ui/ErrorText'
import { EmptyState } from '../components/ui/EmptyState'
import { ListRow } from '../components/ui/ListRow'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { Database } from '../types/database'

type SyncLog = Database['public']['Tables']['sync_logs']['Row']

function statusTone(log: SyncLog) {
  if (!log.finished_at) return 'neutral'
  return log.failure_count > 0 ? 'error' : 'success'
}

function statusLabel(log: SyncLog) {
  if (!log.finished_at) return 'running'
  return log.failure_count > 0 ? `${log.failure_count} failed` : 'ok'
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
    <DashboardShell title="Sync History">
      <div className="mx-auto max-w-2xl">
        {error && (
          <div className="mb-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {loading && <EmptyState>Loading sync history…</EmptyState>}
        {!loading && logs.length === 0 && <EmptyState>No scheduled sync runs have happened yet.</EmptyState>}

        <ul className="space-y-2">
          {logs.map((log) => (
            <ListRow key={log.id}>
              <span className="text-ink-muted">
                <span className="font-medium capitalize text-ink">{log.platform}</span> — started{' '}
                {new Date(log.started_at).toLocaleString()}
                {log.error_message && <span className="block text-xs text-error">{log.error_message}</span>}
              </span>
              <StatusBadge tone={statusTone(log)}>{statusLabel(log)}</StatusBadge>
            </ListRow>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
