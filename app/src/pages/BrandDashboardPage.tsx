import { Link } from 'react-router'
import { DashboardShell } from '../components/DashboardShell'

export function BrandDashboardPage() {
  return (
    <DashboardShell title="Brand Dashboard">
      <div className="flex flex-col gap-2">
        <Link to="/brand/products" className="text-sm underline">
          Manage products
        </Link>
        <Link to="/brand/bookings" className="text-sm underline">
          Find a provider
        </Link>
        <Link to="/brand/inventory" className="text-sm underline">
          Manage inventory
        </Link>
        <Link to="/brand/sku-mappings" className="text-sm underline">
          Map marketplace SKUs
        </Link>
        <Link to="/brand/shopify" className="text-sm underline">
          Connect Shopify
        </Link>
        <Link to="/brand/shopify/orders" className="text-sm underline">
          View orders
        </Link>
      </div>
    </DashboardShell>
  )
}
