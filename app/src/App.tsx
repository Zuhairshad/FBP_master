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
            </Route>

            <Route element={<RequireRole role="provider" />}>
              <Route path="/provider" element={<ProviderDashboardPage />} />
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
