import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import TwinPage from './pages/TwinPage.jsx';
import BottomNav from './components/BottomNav.jsx';

/**
 * ProtectedLayout verifies authentication status.
 * Redirects to /login if unauthenticated, and provides bottom dock nav when authenticated.
 */
function ProtectedLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          color: 'var(--color-teal)',
        }}
      >
        <div style={{ fontSize: '2.5rem' }} role="img" aria-label="Loading">
          💧
        </div>
        <div style={{ fontWeight: 600, fontSize: '1rem' }}>Checking authorization...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <main style={{ paddingBottom: 'calc(var(--nav-height) + 24px)' }}>
        <Outlet />
      </main>
      <BottomNav />
    </>
  );
}

/**
 * PublicRoute ensures authenticated users are redirected away from login to dashboard.
 */
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/twin" element={<TwinPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
