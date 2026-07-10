import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './hooks/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequireRole } from './components/RequireRole'
import { SignUpPage } from './pages/SignUpPage'
import { SignInPage } from './pages/SignInPage'
import { RoleRedirect } from './pages/RoleRedirect'
import { BrandDashboardPage } from './pages/BrandDashboardPage'
import { ProviderDashboardPage } from './pages/ProviderDashboardPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { ProductsPage } from './pages/ProductsPage'
import { WarehousesPage } from './pages/WarehousesPage'
import { BookingsPage } from './pages/BookingsPage'
import { InventoryPage } from './pages/InventoryPage'
import { ProviderBookingsPage } from './pages/ProviderBookingsPage'
import { ProviderInventoryPage } from './pages/ProviderInventoryPage'
import { SkuMappingsPage } from './pages/SkuMappingsPage'
import { ShopifyConnectPage } from './pages/ShopifyConnectPage'
import { ShopifyOrdersPage } from './pages/ShopifyOrdersPage'
import { ProviderOrdersPage } from './pages/ProviderOrdersPage'

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
