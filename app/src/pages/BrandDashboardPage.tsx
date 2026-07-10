import { Link } from 'react-router'
import { DashboardShell } from '../components/DashboardShell'

export function BrandDashboardPage() {
  return (
    <DashboardShell title="Brand Dashboard">
      <Link to="/brand/products" className="text-sm underline">
        Manage products
      </Link>
    </DashboardShell>
  )
}
