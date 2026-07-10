import { Link } from 'react-router'
import { DashboardShell } from '../components/DashboardShell'

const NAV_LINK_CLASS = 'rounded-lg border border-hairline bg-surface-1 p-4 text-sm text-primary hover:text-primary-hover'

export function BrandDashboardPage() {
  return (
    <DashboardShell title="Brand Dashboard">
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        <Link to="/brand/products" className={NAV_LINK_CLASS}>
          Manage products
        </Link>
        <Link to="/brand/bookings" className={NAV_LINK_CLASS}>
          Find a provider
        </Link>
        <Link to="/brand/inventory" className={NAV_LINK_CLASS}>
          Manage inventory
        </Link>
        <Link to="/brand/sku-mappings" className={NAV_LINK_CLASS}>
          Map marketplace SKUs
        </Link>
        <Link to="/brand/shopify" className={NAV_LINK_CLASS}>
          Connect Shopify
        </Link>
        <Link to="/brand/shopify/orders" className={NAV_LINK_CLASS}>
          View orders
        </Link>
      </div>
    </DashboardShell>
  )
}
