import { Link } from 'react-router'
import { DashboardShell } from '../components/DashboardShell'

export function ProviderDashboardPage() {
  return (
    <DashboardShell title="Provider Dashboard">
      <div className="flex flex-col gap-2">
        <Link to="/provider/warehouses" className="text-sm underline">
          Manage warehouses
        </Link>
        <Link to="/provider/bookings" className="text-sm underline">
          Booking requests
        </Link>
        <Link to="/provider/inventory" className="text-sm underline">
          Brand inventory
        </Link>
        <Link to="/provider/orders" className="text-sm underline">
          Brand orders
        </Link>
      </div>
    </DashboardShell>
  )
}
