import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './hooks/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequireRole } from './components/RequireRole'
import { SignUpPage } from './pages/SignUpPage'
import { SignInPage } from './pages/SignInPage'
import { RoleRedirect } from './pages/RoleRedirect'
import { BrandDashboardPage } from './brand/BrandDashboardPage'
import { ProviderDashboardPage } from './provider/ProviderDashboardPage'
import { AdminDashboardPage } from './admin/AdminDashboardPage'
import { ProductsPage } from './products/ProductsPage'
import { ProductDetailPage } from './products/ProductDetailPage'
import { WarehousesPage } from './provider/WarehousesPage'
import { WarehouseDetailPage } from './provider/WarehouseDetailPage'
import { BookingsPage } from './brand/BookingsPage'
import { InventoryPage } from './brand/InventoryPage'
import { ProviderBookingsPage } from './provider/ProviderBookingsPage'
import { BookingDetailPage } from './provider/BookingDetailPage'
import { ProviderInventoryPage } from './provider/ProviderInventoryPage'
import { SkuMappingsPage } from './brand/SkuMappingsPage'
import { ShopifyConnectPage } from './brand/ShopifyConnectPage'
import { ShopifyOrdersPage } from './brand/ShopifyOrdersPage'
import { ShopifyOrderDetailPage } from './brand/ShopifyOrderDetailPage'
import { TiktokConnectPage } from './brand/TiktokConnectPage'
import { TiktokOrdersPage } from './brand/TiktokOrdersPage'
import { TiktokOrderDetailPage } from './brand/TiktokOrderDetailPage'
import { AmazonConnectPage } from './brand/AmazonConnectPage'
import { AmazonOrdersPage } from './brand/AmazonOrdersPage'
import { AmazonOrderDetailPage } from './brand/AmazonOrderDetailPage'
import { EbayConnectPage } from './brand/EbayConnectPage'
import { EbayOrdersPage } from './brand/EbayOrdersPage'
import { EbayOrderDetailPage } from './brand/EbayOrderDetailPage'
import { WalmartConnectPage } from './brand/WalmartConnectPage'
import { WalmartOrdersPage } from './brand/WalmartOrdersPage'
import { WalmartOrderDetailPage } from './brand/WalmartOrderDetailPage'
import { ProviderOrdersPage } from './provider/ProviderOrdersPage'
import { ProviderOrderDetailPage } from './provider/ProviderOrderDetailPage'

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
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
