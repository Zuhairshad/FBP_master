import { Shield } from 'lucide-react'
import { DashboardShell } from '../components/DashboardShell'

export function AdminDashboardPage() {
  return (
    <DashboardShell title="Overview">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-hairline px-4 py-12 text-center">
        <Shield className="size-6 text-ink-tertiary" />
        <div>
          <p className="text-sm font-medium text-ink">Admin panel coming in Phase 12</p>
          <p className="mt-1 max-w-sm text-sm text-ink-subtle">
            Cross-tenant visibility into brands, providers, and orders needs its own authorization
            model first (admin-only RLS policies vs. service-role-backed endpoints) — that's an
            open decision tracked in the roadmap, not yet built.
          </p>
        </div>
      </div>
    </DashboardShell>
  )
}
