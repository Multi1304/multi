import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';
import { Toaster } from 'react-hot-toast';
import { Suspense, lazy } from 'react';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Profiles = lazy(() => import('./pages/Profiles'));
const Automation = lazy(() => import('./pages/Automation'));
const Billing = lazy(() => import('./pages/Billing'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Team = lazy(() => import('./pages/Team'));
const BulkProvisioning = lazy(() => import('./pages/BulkProvisioning'));
const LiveOps = lazy(() => import('./pages/LiveOps'));
const Settings = lazy(() => import('./pages/Settings'));
const AuditViewer = lazy(() => import('./pages/AuditViewer'));
const TaskBuilder = lazy(() => import('./pages/TaskBuilder'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const OnboardingWizard = lazy(() => import('./pages/OnboardingWizard'));
const NetworkSettings = lazy(() => import('./pages/NetworkSettings'));
const FlowBuilder = lazy(() => import('./pages/FlowBuilder'));
const SecurityDashboard = lazy(() => import('./pages/SecurityDashboard'));
const ClusterDashboard = lazy(() => import('./pages/ClusterDashboard'));
const BanAnalysis = lazy(() => import('./pages/BanAnalysis'));

function AppFallback() {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}

function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{
        style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' }
      }} />
      <BrowserRouter>
        <Suspense fallback={<AppFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route path="/onboarding" element={
              <ProtectedRoute>
                <OnboardingWizard />
              </ProtectedRoute>
            } />

            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="profiles" element={<Profiles />} />
              <Route path="automation" element={<Automation />} />
              <Route path="flows/builder/:id" element={<FlowBuilder />} />
              <Route path="tasks" element={<TaskBuilder />} />
              <Route path="billing" element={<Billing />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="team" element={<Team />} />
              <Route path="bulk" element={<BulkProvisioning />} />
              <Route path="live-ops" element={<LiveOps />} />
              <Route path="settings" element={<Settings />} />
              <Route path="audit" element={<AuditViewer />} />
              <Route path="admin" element={<AdminPanel />} />
              <Route path="network" element={<NetworkSettings />} />
              <Route path="security" element={<SecurityDashboard />} />
              <Route path="cluster" element={<ClusterDashboard />} />
              <Route path="ban-analysis" element={<BanAnalysis />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </>
  );
}

export default App;
