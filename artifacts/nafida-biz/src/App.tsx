import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ProfilePage from "@/pages/profile";
import TaxesPage from "@/pages/taxes";
import FilesPage from "@/pages/files";
import AdminDashboardPage from "@/pages/admin";
import AuthCallbackPage from "@/pages/auth-callback";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminOnlyRoute } from "@/components/AdminOnlyRoute";
import { CompanyProvider } from "@/context/CompanyContext";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/auth/callback" component={AuthCallbackPage} />
      <Route path="/">
        <ProtectedRoute>
          <CompanyProvider>
            <DashboardPage />
          </CompanyProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute>
          <CompanyProvider>
            <ProfilePage />
          </CompanyProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/taxes">
        <ProtectedRoute>
          <CompanyProvider>
            <TaxesPage />
          </CompanyProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/files">
        <ProtectedRoute>
          <CompanyProvider>
            <FilesPage />
          </CompanyProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <CompanyProvider>
          <AdminOnlyRoute>
            <AdminDashboardPage />
          </AdminOnlyRoute>
        </CompanyProvider>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
