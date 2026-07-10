import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './hooks/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequireRole } from './components/RequireRole'
import { SignUpPage } from './pages/SignUpPage'
import { SignInPage } from './pages/SignInPage'
import { RoleRedirect } from './pages/RoleRedirect'
import { BrandDashboardPage } from './pages/brand/BrandDashboardPage'
import { ProviderDashboardPage } from './pages/provider/ProviderDashboardPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { ProductsPage } from './pages/brand/ProductsPage'
import { WarehousesPage } from './pages/provider/WarehousesPage'
import { BookingsPage } from './pages/brand/BookingsPage'
import { InventoryPage } from './pages/brand/InventoryPage'
import { ProviderBookingsPage } from './pages/provider/ProviderBookingsPage'
import { ProviderInventoryPage } from './pages/provider/ProviderInventoryPage'
import { SkuMappingsPage } from './pages/brand/SkuMappingsPage'
import { ShopifyConnectPage } from './pages/brand/ShopifyConnectPage'
import { ShopifyOrdersPage } from './pages/brand/ShopifyOrdersPage'
import { TiktokConnectPage } from './pages/brand/TiktokConnectPage'
import { TiktokOrdersPage } from './pages/brand/TiktokOrdersPage'
import { AmazonConnectPage } from './pages/brand/AmazonConnectPage'
import { AmazonOrdersPage } from './pages/brand/AmazonOrdersPage'
import { EbayConnectPage } from './pages/brand/EbayConnectPage'
import { EbayOrdersPage } from './pages/brand/EbayOrdersPage'
import { WalmartConnectPage } from './pages/brand/WalmartConnectPage'
import { WalmartOrdersPage } from './pages/brand/WalmartOrdersPage'
import { ProviderOrdersPage } from './pages/provider/ProviderOrdersPage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/sign-up" element={<SignUpPage />} />
          <Route path="/sign-in" element={<SignInPage />} />

          <Route element={<ProtectedRoute />}>
            <Route index element={<RoleRedirect />} />

            <Route element={<RequireRole role="brand" />}>
              <Route path="/brand" element={<BrandDashboardPage />} />
              <Route path="/brand/products" element={<ProductsPage />} />
              <Route path="/brand/bookings" element={<BookingsPage />} />
              <Route path="/brand/inventory" element={<InventoryPage />} />
              <Route path="/brand/sku-mappings" element={<SkuMappingsPage />} />
              <Route path="/brand/shopify" element={<ShopifyConnectPage />} />
              <Route path="/brand/shopify/orders" element={<ShopifyOrdersPage />} />
              <Route path="/brand/tiktok" element={<TiktokConnectPage />} />
              <Route path="/brand/tiktok/orders" element={<TiktokOrdersPage />} />
              <Route path="/brand/amazon" element={<AmazonConnectPage />} />
              <Route path="/brand/amazon/orders" element={<AmazonOrdersPage />} />
              <Route path="/brand/ebay" element={<EbayConnectPage />} />
              <Route path="/brand/ebay/orders" element={<EbayOrdersPage />} />
              <Route path="/brand/walmart" element={<WalmartConnectPage />} />
              <Route path="/brand/walmart/orders" element={<WalmartOrdersPage />} />
            </Route>

            <Route element={<RequireRole role="provider" />}>
              <Route path="/provider" element={<ProviderDashboardPage />} />
              <Route path="/provider/warehouses" element={<WarehousesPage />} />
              <Route path="/provider/bookings" element={<ProviderBookingsPage />} />
              <Route path="/provider/inventory" element={<ProviderInventoryPage />} />
              <Route path="/provider/orders" element={<ProviderOrdersPage />} />
            </Route>

            <Route element={<RequireRole role="admin" />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
