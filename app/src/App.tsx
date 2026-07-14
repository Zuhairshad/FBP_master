import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './hooks/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequireRole } from './components/RequireRole'

// Auth pages — eager (needed before any lazy chunk can load)
import { SignUpPage } from './pages/SignUpPage'
import { SignInPage } from './pages/SignInPage'
import { RoleRedirect } from './pages/RoleRedirect'

// All routed pages — lazy (each becomes its own JS chunk)
const BrandDashboardPage    = lazy(() => import('./brand/BrandDashboardPage').then(m => ({ default: m.BrandDashboardPage })))
const ProviderDashboardPage = lazy(() => import('./provider/ProviderDashboardPage').then(m => ({ default: m.ProviderDashboardPage })))
const AdminDashboardPage    = lazy(() => import('./admin/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })))
const ProductsPage          = lazy(() => import('./products/ProductsPage').then(m => ({ default: m.ProductsPage })))
const ProductDetailPage     = lazy(() => import('./products/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })))
const WarehousesPage        = lazy(() => import('./provider/WarehousesPage').then(m => ({ default: m.WarehousesPage })))
const WarehouseDetailPage   = lazy(() => import('./provider/WarehouseDetailPage').then(m => ({ default: m.WarehouseDetailPage })))
const BookingsPage          = lazy(() => import('./brand/BookingsPage').then(m => ({ default: m.BookingsPage })))
const InventoryPage         = lazy(() => import('./brand/InventoryPage').then(m => ({ default: m.InventoryPage })))
const ProviderBookingsPage  = lazy(() => import('./provider/ProviderBookingsPage').then(m => ({ default: m.ProviderBookingsPage })))
const BookingDetailPage     = lazy(() => import('./provider/BookingDetailPage').then(m => ({ default: m.BookingDetailPage })))
const ProviderInventoryPage = lazy(() => import('./provider/ProviderInventoryPage').then(m => ({ default: m.ProviderInventoryPage })))
const SkuMappingsPage       = lazy(() => import('./brand/SkuMappingsPage').then(m => ({ default: m.SkuMappingsPage })))
const ShopifyConnectPage    = lazy(() => import('./brand/ShopifyConnectPage').then(m => ({ default: m.ShopifyConnectPage })))
const ShopifyOrdersPage     = lazy(() => import('./brand/ShopifyOrdersPage').then(m => ({ default: m.ShopifyOrdersPage })))
const ShopifyOrderDetailPage = lazy(() => import('./brand/ShopifyOrderDetailPage').then(m => ({ default: m.ShopifyOrderDetailPage })))
const TiktokConnectPage     = lazy(() => import('./brand/TiktokConnectPage').then(m => ({ default: m.TiktokConnectPage })))
const TiktokOrdersPage      = lazy(() => import('./brand/TiktokOrdersPage').then(m => ({ default: m.TiktokOrdersPage })))
const TiktokOrderDetailPage = lazy(() => import('./brand/TiktokOrderDetailPage').then(m => ({ default: m.TiktokOrderDetailPage })))
const AmazonConnectPage     = lazy(() => import('./brand/AmazonConnectPage').then(m => ({ default: m.AmazonConnectPage })))
const AmazonOrdersPage      = lazy(() => import('./brand/AmazonOrdersPage').then(m => ({ default: m.AmazonOrdersPage })))
const AmazonOrderDetailPage = lazy(() => import('./brand/AmazonOrderDetailPage').then(m => ({ default: m.AmazonOrderDetailPage })))
const EbayConnectPage       = lazy(() => import('./brand/EbayConnectPage').then(m => ({ default: m.EbayConnectPage })))
const EbayOrdersPage        = lazy(() => import('./brand/EbayOrdersPage').then(m => ({ default: m.EbayOrdersPage })))
const EbayOrderDetailPage   = lazy(() => import('./brand/EbayOrderDetailPage').then(m => ({ default: m.EbayOrderDetailPage })))
const WalmartConnectPage    = lazy(() => import('./brand/WalmartConnectPage').then(m => ({ default: m.WalmartConnectPage })))
const WalmartOrdersPage     = lazy(() => import('./brand/WalmartOrdersPage').then(m => ({ default: m.WalmartOrdersPage })))
const WalmartOrderDetailPage = lazy(() => import('./brand/WalmartOrderDetailPage').then(m => ({ default: m.WalmartOrderDetailPage })))
const ProviderOrdersPage    = lazy(() => import('./provider/ProviderOrdersPage').then(m => ({ default: m.ProviderOrdersPage })))
const ProviderOrderDetailPage = lazy(() => import('./provider/ProviderOrderDetailPage').then(m => ({ default: m.ProviderOrderDetailPage })))
const UsersPage             = lazy(() => import('./admin/UsersPage').then(m => ({ default: m.UsersPage })))
const AdminBookingsPage     = lazy(() => import('./admin/BookingsPage').then(m => ({ default: m.AdminBookingsPage })))
const AdminOrdersPage       = lazy(() => import('./admin/OrdersPage').then(m => ({ default: m.OrdersPage })))
const AdminOrderDetailPage  = lazy(() => import('./admin/OrderDetailPage').then(m => ({ default: m.OrderDetailPage })))
const SyncLogsPage          = lazy(() => import('./admin/SyncLogsPage').then(m => ({ default: m.SyncLogsPage })))

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-hairline border-t-primary" />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/sign-in" element={<SignInPage />} />

            <Route element={<ProtectedRoute />}>
              <Route index element={<RoleRedirect />} />

              <Route element={<RequireRole role="brand" />}>
                <Route path="/brand" element={<BrandDashboardPage />} />
                <Route path="/brand/products" element={<ProductsPage />} />
                <Route path="/brand/products/:productId" element={<ProductDetailPage />} />
                <Route path="/brand/bookings" element={<BookingsPage />} />
                <Route path="/brand/inventory" element={<InventoryPage />} />
                <Route path="/brand/sku-mappings" element={<SkuMappingsPage />} />
                <Route path="/brand/shopify" element={<ShopifyConnectPage />} />
                <Route path="/brand/shopify/orders" element={<ShopifyOrdersPage />} />
                <Route path="/brand/shopify/orders/:orderId" element={<ShopifyOrderDetailPage />} />
                <Route path="/brand/tiktok" element={<TiktokConnectPage />} />
                <Route path="/brand/tiktok/orders" element={<TiktokOrdersPage />} />
                <Route path="/brand/tiktok/orders/:orderId" element={<TiktokOrderDetailPage />} />
                <Route path="/brand/amazon" element={<AmazonConnectPage />} />
                <Route path="/brand/amazon/orders" element={<AmazonOrdersPage />} />
                <Route path="/brand/amazon/orders/:orderId" element={<AmazonOrderDetailPage />} />
                <Route path="/brand/ebay" element={<EbayConnectPage />} />
                <Route path="/brand/ebay/orders" element={<EbayOrdersPage />} />
                <Route path="/brand/ebay/orders/:orderId" element={<EbayOrderDetailPage />} />
                <Route path="/brand/walmart" element={<WalmartConnectPage />} />
                <Route path="/brand/walmart/orders" element={<WalmartOrdersPage />} />
                <Route path="/brand/walmart/orders/:orderId" element={<WalmartOrderDetailPage />} />
              </Route>

              <Route element={<RequireRole role="provider" />}>
                <Route path="/provider" element={<ProviderDashboardPage />} />
                <Route path="/provider/warehouses" element={<WarehousesPage />} />
                <Route path="/provider/warehouses/:warehouseId" element={<WarehouseDetailPage />} />
                <Route path="/provider/bookings" element={<ProviderBookingsPage />} />
                <Route path="/provider/bookings/:bookingId" element={<BookingDetailPage />} />
                <Route path="/provider/inventory" element={<ProviderInventoryPage />} />
                <Route path="/provider/orders" element={<ProviderOrdersPage />} />
                <Route path="/provider/orders/:orderId" element={<ProviderOrderDetailPage />} />
              </Route>

              <Route element={<RequireRole role="admin" />}>
                <Route path="/admin" element={<AdminDashboardPage />} />
                <Route path="/admin/users" element={<UsersPage />} />
                <Route path="/admin/bookings" element={<AdminBookingsPage />} />
                <Route path="/admin/orders" element={<AdminOrdersPage />} />
                <Route path="/admin/orders/:orderId" element={<AdminOrderDetailPage />} />
                <Route path="/admin/sync-logs" element={<SyncLogsPage />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
