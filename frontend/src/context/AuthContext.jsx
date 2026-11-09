import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setStoredCsrf, getStoredCsrf } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfTokenState] = useState(getStoredCsrf());
  const [loading, setLoading] = useState(true);

  const setCsrfToken = useCallback((token) => {
    setStoredCsrf(token);
    setCsrfTokenState(token || '');
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      // First try to fetch the current user profile
      const res = await api.get('/api/me');
      if (res.data && res.data.username) {
        setUser({
          username: res.data.username,
          hasTotp: Boolean(res.data.hasTotp),
        });
      } else if (res.data && res.data.user) {
        setUser(res.data.user);
      }

      // Refresh or ensure CSRF token if session exists
      try {
        const csrfRes = await api.get('/api/csrf-token');
        if (csrfRes.data && csrfRes.data.csrfToken) {
          setCsrfToken(csrfRes.data.csrfToken);
        }
      } catch (err) {
        // CSRF endpoint might not be available or already cached
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [setCsrfToken]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username, password, totpCode = '') => {
    try {
      const payload = { username, password };
      if (totpCode) {
        payload.totpCode = totpCode;
      }

      const res = await api.post('/api/login', payload);

      if (res.data && res.data.needsTotp) {
        return { needsTotp: true };
      }

      if (res.data && res.data.csrfToken) {
        setCsrfToken(res.data.csrfToken);
      }

      // Fetch user profile after successful login
      try {
        const meRes = await api.get('/api/me');
        if (meRes.data && meRes.data.username) {
          setUser({
            username: meRes.data.username,
            hasTotp: Boolean(meRes.data.hasTotp),
          });
        } else {
          setUser({ username, hasTotp: false });
        }
      } catch {
        // Fallback user state if /api/me is minimalist
        setUser({ username, hasTotp: false });
      }

      return { success: true };
    } catch (err) {
      const status = err.response ? err.response.status : null;
      const errorMsg = err.response?.data?.error || 'Unable to log in. Please check your network and credentials.';
      return {
        success: false,
        error: errorMsg,
        isLockout: status === 429,
        status,
      };
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/logout');
    } catch (err) {
      console.warn('Logout request failed or already invalidated', err);
    } finally {
      setCsrfToken('');
      setUser(null);
    }
  };

  const value = {
    user,
    setUser,
    csrfToken,
    setCsrfToken,
    login,
    logout,
    checkAuth,
    isAuthenticated: Boolean(user),
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
