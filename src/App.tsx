import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Profile from "./pages/Profile";
import CompanyDetail from "./pages/CompanyDetail";
import Tenders from "./pages/Tenders";
import Companies from "./pages/Companies";
import CompanyManagement from "./pages/CompanyManagement";
import Consulting from "./pages/Consulting";
import Admin from "./pages/Admin";
import AdminUsers from "./pages/AdminUsers";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <>
      <Toaster />
      <Sonner />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/auth" element={<Auth />} />
        <Route path="/onboarding" element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />
        <Route path="/company/:companyId" element={
          <ProtectedRoute>
            <CompanyDetail />
          </ProtectedRoute>
        } />
        <Route path="/tenders" element={
          <ProtectedRoute>
            <Tenders />
          </ProtectedRoute>
        } />
        <Route path="/companies" element={
          <ProtectedRoute>
            <CompanyManagement />
          </ProtectedRoute>
        } />
        <Route path="/directory" element={
          <ProtectedRoute>
            <Companies />
          </ProtectedRoute>
        } />
        <Route path="/vo" element={
          <ProtectedRoute>
            <Consulting />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute>
            <AdminUsers />
          </ProtectedRoute>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
