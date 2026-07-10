import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export function DashboardShell({ title, children }: { title: string; children?: ReactNode }) {
  const { profile } = useAuth()

  return (
    <div className="min-h-svh bg-white dark:bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          {profile && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{profile.display_name}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
        >
          Sign out
        </button>
      </header>
      <main className="p-6">{children ?? <p className="text-sm text-slate-500">Nothing built here yet.</p>}</main>
    </div>
  )
}
