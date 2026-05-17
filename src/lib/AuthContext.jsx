import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { installAuthExpiredInterceptor } from '@/lib/authExpiredInterceptor';
import { startSessionPing, silentRefresh, hasCredentials } from '@/lib/sessionManager';

const AuthContext = createContext(null);

function syncTokenToSDK() {
  try {
    const stored = localStorage.getItem('base44_access_token');
    if (stored) base44.auth.setToken(stored);
  } catch (_) {}
}

const AUTH_TIMEOUT_MS = 8000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkAppState = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);

    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      setIsAuthenticated(false);
      setUser(null);
      setIsLoadingAuth(false);
    }, AUTH_TIMEOUT_MS);

    try {
      syncTokenToSDK();
      let currentUser = null;

      try {
        currentUser = await base44.auth.me();
      } catch (firstErr) {
        const errReason = firstErr?.data?.extra_data?.reason || '';
        const isAuthError = firstErr?.status === 403 || firstErr?.status === 401
          || errReason === 'auth_required'
          || firstErr?.message?.includes('logged in');

        if (isAuthError && hasCredentials()) {
          const refreshed = await silentRefresh();
          if (refreshed) {
            syncTokenToSDK();
            currentUser = await base44.auth.me();
          } else {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }

      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      setUser(currentUser);
      setIsAuthenticated(true);
      startSessionPing();
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      setIsAuthenticated(false);
      setUser(null);
      if (error?.data?.extra_data?.reason === 'user_not_registered') {
        setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    installAuthExpiredInterceptor();
    checkAppState();
  }, []);

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    try { localStorage.removeItem('base44_access_token'); } catch (_) {}
    try { base44.auth.setToken(null); } catch (_) {}
    try { localStorage.removeItem('cdl_session_creds'); } catch (_) {}
    window.location.href = '/connexion';
  };

  const navigateToLogin = () => {
    setIsAuthenticated(false);
    setUser(null);
  };

  const setLoggedIn = useCallback((userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    setIsLoadingAuth(false);
    setAuthError(null);
    window.location.replace('/');
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings: null,
      logout,
      navigateToLogin,
      checkAppState,
      setLoggedIn,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};