import { Link } from 'react-router'
import {
  Package,
  Tags,
  Building2,
  Boxes,
  ShoppingBag,
  Video,
  ShoppingCart,
  Tag,
  Store,
  ChevronRight,
} from 'lucide-react'
import { DashboardShell } from '../components/DashboardShell'
import { cn } from '../lib/utils'

type NavCardProps = {
  icon: React.ReactNode
  title: string
  description: string
  to: string
  className?: string
}

function NavCard({ icon, title, description, to, className }: NavCardProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center gap-5 rounded-lg border border-hairline bg-surface-1 p-5 transition-colors hover:bg-surface-2',
        className,
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-3 text-ink-muted">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-ink-subtle mt-0.5">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

type MarketplaceCardProps = {
  icon: React.ReactNode
  name: string
  connectTo: string
  ordersTo: string
}

function MarketplaceCard({ icon, name, connectTo, ordersTo }: MarketplaceCardProps) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-3 text-ink-muted">
          {icon}
        </div>
        <span className="text-sm font-semibold text-ink">{name}</span>
      </div>
      <div className="flex flex-col gap-2">
        <Link
          to={connectTo}
          className="flex items-center justify-between rounded-md border border-hairline-tertiary bg-surface-2 px-3 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-surface-3 hover:text-primary-hover"
        >
          Connect {name}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          to={ordersTo}
          className="flex items-center justify-between rounded-md border border-hairline-tertiary bg-surface-2 px-3 py-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          View orders
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-ink-tertiary">
      {children}
    </h2>
  )
}

export function BrandDashboardPage() {
  return (
    <DashboardShell title="Brand Dashboard">
      <div className="space-y-10">
        <section>
          <SectionHeading>Catalog</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NavCard
              icon={<Package className="h-6 w-6" />}
              title="Products"
              description="Manage your master SKU catalog"
              to="/brand/products"
            />
            <NavCard
              icon={<Tags className="h-6 w-6" />}
              title="SKU Mappings"
              description="Map marketplace SKUs to master SKUs"
              to="/brand/sku-mappings"
            />
          </div>
        </section>

        <section>
          <SectionHeading>Fulfillment</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NavCard
              icon={<Building2 className="h-6 w-6" />}
              title="Find a Provider"
              description="Browse warehouses and request storage"
              to="/brand/bookings"
            />
            <NavCard
              icon={<Boxes className="h-6 w-6" />}
              title="Inventory"
              description="Set stock levels at your warehouses"
              to="/brand/inventory"
            />
          </div>
        </section>

        <section>
          <SectionHeading>Marketplaces</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MarketplaceCard
              icon={<ShoppingBag className="h-5 w-5" />}
              name="Shopify"
              connectTo="/brand/shopify"
              ordersTo="/brand/shopify/orders"
            />
            <MarketplaceCard
              icon={<Video className="h-5 w-5" />}
              name="TikTok Shop"
              connectTo="/brand/tiktok"
              ordersTo="/brand/tiktok/orders"
            />
            <MarketplaceCard
              icon={<ShoppingCart className="h-5 w-5" />}
              name="Amazon"
              connectTo="/brand/amazon"
              ordersTo="/brand/amazon/orders"
            />
            <MarketplaceCard
              icon={<Tag className="h-5 w-5" />}
              name="eBay"
              connectTo="/brand/ebay"
              ordersTo="/brand/ebay/orders"
            />
            <MarketplaceCard
              icon={<Store className="h-5 w-5" />}
              name="Walmart"
              connectTo="/brand/walmart"
              ordersTo="/brand/walmart/orders"
            />
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}
