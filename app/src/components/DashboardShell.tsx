import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import {
  LayoutDashboard,
  Package,
  Building2,
  Boxes,
  Tags,
  Warehouse,
  ClipboardList,
  ShoppingCart,
  ShoppingBag,
  Video,
  Package2,
  Gavel,
  Wallet,
  Shield,
  Menu,
  ChevronsUpDown,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Profile } from '../hooks/auth-context'
import { cn } from '../lib/utils'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from './ui/Sheet'
import { Avatar, AvatarFallback } from './ui/Avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/DropdownMenu'
import { Separator } from './ui/Separator'
import { EmptyState } from './ui/EmptyState'

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

interface NavGroup {
  label?: string
  items: NavItem[]
}

function navGroupsForRole(role: Profile['role']): NavGroup[] {
  switch (role) {
    case 'brand':
      return [
        { items: [{ label: 'Overview', to: '/brand', icon: LayoutDashboard, end: true }] },
        {
          label: 'Catalog',
          items: [
            { label: 'Products', to: '/brand/products', icon: Package },
            { label: 'SKU mappings', to: '/brand/sku-mappings', icon: Tags },
          ],
        },
        {
          label: 'Fulfillment',
          items: [
            { label: 'Find a provider', to: '/brand/bookings', icon: Building2 },
            { label: 'Inventory', to: '/brand/inventory', icon: Boxes },
          ],
        },
        {
          label: 'Marketplaces',
          items: [
            { label: 'Shopify', to: '/brand/shopify', icon: ShoppingBag },
            { label: 'Shopify orders', to: '/brand/shopify/orders', icon: ShoppingBag },
            { label: 'TikTok Shop', to: '/brand/tiktok', icon: Video },
            { label: 'TikTok orders', to: '/brand/tiktok/orders', icon: Video },
            { label: 'Amazon', to: '/brand/amazon', icon: Package2 },
            { label: 'Amazon orders', to: '/brand/amazon/orders', icon: Package2 },
            { label: 'eBay', to: '/brand/ebay', icon: Gavel },
            { label: 'eBay orders', to: '/brand/ebay/orders', icon: Gavel },
            { label: 'Walmart', to: '/brand/walmart', icon: Wallet },
            { label: 'Walmart orders', to: '/brand/walmart/orders', icon: Wallet },
          ],
        },
      ]
    case 'provider':
      return [
        {
          items: [
            { label: 'Overview', to: '/provider', icon: LayoutDashboard, end: true },
            { label: 'Warehouses', to: '/provider/warehouses', icon: Warehouse },
            { label: 'Booking requests', to: '/provider/bookings', icon: ClipboardList },
            { label: 'Brand inventory', to: '/provider/inventory', icon: Boxes },
            { label: 'Brand orders', to: '/provider/orders', icon: ShoppingCart },
          ],
        },
      ]
    case 'admin':
      return [{ items: [{ label: 'Overview', to: '/admin', icon: Shield, end: true }] }]
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

function SidebarContent({
  groups,
  profile,
  onNavigate,
}: {
  groups: NavGroup[]
  profile: Profile
  onNavigate?: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-semibold text-on-primary">
          F
        </div>
        <span className="text-sm font-semibold text-ink">FBP</span>
      </div>
      <Separator />
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group, index) => (
          <div key={group.label ?? `group-${index}`} className={index > 0 ? 'mt-4' : undefined}>
            {group.label && (
              <p className="px-2.5 pb-1.5 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink',
                        isActive && 'bg-surface-2 font-medium text-ink',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <Separator />
      <div className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2">
            <Avatar>
              <AvatarFallback>{initials(profile.display_name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{profile.display_name}</span>
              <span className="block truncate text-xs capitalize text-ink-subtle">{profile.role}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-subtle" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{profile.display_name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void supabase.auth.signOut()}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function DashboardShell({ title, children }: { title: string; children?: ReactNode }) {
  const { profile } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (!profile) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-canvas">
        <EmptyState>Loading…</EmptyState>
      </div>
    )
  }

  const groups = navGroupsForRole(profile.role)

  return (
    <div className="flex min-h-svh bg-canvas">
      <aside className="hidden w-64 shrink-0 border-r border-hairline bg-surface-1 md:flex md:flex-col">
        <SidebarContent groups={groups} profile={profile} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent className="md:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent groups={groups} profile={profile} onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-hairline bg-canvas px-4 py-4 md:px-6">
            <SheetTrigger asChild>
              <button
                type="button"
                className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink md:hidden"
              >
                <Menu className="size-5" />
                <span className="sr-only">Open menu</span>
              </button>
            </SheetTrigger>
            <h1 className="text-xl font-semibold tracking-tight text-ink md:text-2xl">{title}</h1>
          </header>
          <main className="flex-1 p-4 md:p-6">{children ?? <EmptyState>Nothing built here yet.</EmptyState>}</main>
        </div>
      </Sheet>
    </div>
  )
}
