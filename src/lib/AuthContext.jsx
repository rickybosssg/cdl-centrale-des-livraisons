import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

// Helper : injecter le token localStorage dans le SDK avant chaque appel auth
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
    console.log('[AUTH] INIT START');
    setIsLoadingAuth(true);
    setAuthError(null);

    let settled = false;

    // Timeout de sécurité : jamais bloquer l'APK indéfiniment
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn('[AUTH] TIMEOUT — forcing app unblock after', AUTH_TIMEOUT_MS, 'ms');
      setIsAuthenticated(false);
      setUser(null);
      setIsLoadingAuth(false);
    }, AUTH_TIMEOUT_MS);

    try {
      syncTokenToSDK();
      const currentUser = await base44.auth.me();
      if (settled) return; // Timeout déjà déclenché
      settled = true;
      clearTimeout(timeoutId);
      setUser(currentUser);
      setIsAuthenticated(true);
      console.log('[AUTH] INIT SUCCESS | user:', currentUser?.email);
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      setIsAuthenticated(false);
      setUser(null);
      if (error?.data?.extra_data?.reason === 'user_not_registered') {
        setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
      }
      console.warn('[AUTH] INIT ERROR:', error?.message || 'unknown');
    } finally {
      // TOUJOURS débloquer le loading — jamais laisser l'app bloquée
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAppState();
  }, []);

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    try { localStorage.removeItem('base44_access_token'); } catch (_) {}
    try { base44.auth.setToken(null); } catch (_) {}
    window.location.href = '/connexion';
  };

  const navigateToLogin = () => {
    setIsAuthenticated(false);
    setUser(null);
  };

  // Forcer l'état connecté immédiatement après login (sans appel réseau)
  const setLoggedIn = useCallback((userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    setIsLoadingAuth(false);
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