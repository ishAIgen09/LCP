import { Navigate, Route, Routes } from "react-router-dom";

import { isAuthenticated } from "@/lib/auth";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { LoginPage } from "@/pages/LoginPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { CafesPage } from "@/pages/CafesPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { BillingPage } from "@/pages/BillingPage";
import { SettingsPage } from "@/pages/SettingsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Reads localStorage each render. Re-evaluated on every route change,
  // which is the behavior we want — logging out from any page immediately
  // bounces the next protected render back to /login.
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {/* Index redirect — landing on `/` after login should feel like
            "open the overview" rather than a blank parent shell. */}
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="cafes" element={<CafesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      {/* Anything else (typo'd URL, stale bookmark) → send to login. The
          guard there will forward authenticated users to /overview. */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
