import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'

export function DashboardShell({ title, children }: { title: string; children?: ReactNode }) {
  const { profile } = useAuth()

  return (
    <div className="min-h-svh bg-canvas">
      <header className="flex items-center justify-between border-b border-hairline bg-canvas px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {profile && <p className="text-sm text-ink-muted">{profile.display_name}</p>}
        </div>
        <Button variant="secondary" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </Button>
      </header>
      <main className="p-6">{children ?? <EmptyState>Nothing built here yet.</EmptyState>}</main>
    </div>
  )
}
