import { Link } from 'react-router'
import { DashboardShell } from '../components/DashboardShell'

const NAV_LINK_CLASS = 'rounded-lg border border-hairline bg-surface-1 p-4 text-sm text-primary hover:text-primary-hover'

export function AdminDashboardPage() {
  return (
    <DashboardShell title="Admin Dashboard">
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        <Link to="/admin/users" className={NAV_LINK_CLASS}>
          Manage users
        </Link>
        <Link to="/admin/bookings" className={NAV_LINK_CLASS}>
          All bookings
        </Link>
        <Link to="/admin/orders" className={NAV_LINK_CLASS}>
          All orders
        </Link>
        <Link to="/admin/sync-logs" className={NAV_LINK_CLASS}>
          View sync history
        </Link>
      </div>
    </DashboardShell>
  )
}
