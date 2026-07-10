import { Link } from 'react-router'
import { DashboardShell } from '../../components/DashboardShell'

const NAV_LINK_CLASS = 'rounded-lg border border-hairline bg-surface-1 p-4 text-sm text-primary hover:text-primary-hover'

export function ProviderDashboardPage() {
  return (
    <DashboardShell title="Provider Dashboard">
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        <Link to="/provider/warehouses" className={NAV_LINK_CLASS}>
          Manage warehouses
        </Link>
        <Link to="/provider/bookings" className={NAV_LINK_CLASS}>
          Booking requests
        </Link>
        <Link to="/provider/inventory" className={NAV_LINK_CLASS}>
          Brand inventory
        </Link>
        <Link to="/provider/orders" className={NAV_LINK_CLASS}>
          Brand orders
        </Link>
      </div>
    </DashboardShell>
  )
}
