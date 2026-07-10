import { Link } from 'react-router'
import { DashboardShell } from '../components/DashboardShell'

export function ProviderDashboardPage() {
  return (
    <DashboardShell title="Provider Dashboard">
      <Link to="/provider/warehouses" className="text-sm underline">
        Manage warehouses
      </Link>
    </DashboardShell>
  )
}
