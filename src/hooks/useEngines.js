/**
 * useEngines — Hook React pour brancher les moteurs centraux
 *
 * USAGE PROGRESSIF :
 *   const { user, isAdmin, isOnline, profileType } = useEngines();
 *
 * COMPATIBILITÉ : wraps les moteurs sans modifier les composants existants
 * Brancher progressivement : remplacer les appels directs base44.auth.me()
 * par useEngines().user
 */

import { useState, useEffect, useCallback } from 'react';
import AuthEngine from '@/lib/AuthEngine';
import NetworkEngine from '@/lib/NetworkEngine';


export function useEngines() {
  const [user, setUser] = useState(null);
  const [isOnline, setIsOnline] = useState(NetworkEngine.isOnline());
  const [loading, setLoading] = useState(true);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    AuthEngine.me().then(u => {
      setUser(u);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  // ── Network ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetworkEngine.onStatusChange(({ online }) => setIsOnline(online));
    return unsub;
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await AuthEngine.me(true); // force=true → bypass cache
    setUser(u);
    return u;
  }, []);

  const profileType = AuthEngine.getActiveProfileType(user);
  const isAdmin = AuthEngine.isAdmin(user);
  const permissions = AuthEngine.getPermissions(profileType);

  return {
    // Auth
    user,
    loading,
    isAdmin,
    profileType,
    permissions,
    refreshUser,

    // Network
    isOnline,

  };
}

/**
 * useNetworkStatus — Hook léger pour juste le statut réseau
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(NetworkEngine.isOnline());
  const [latencyMs, setLatencyMs] = useState(NetworkEngine.getLastPingMs());

  useEffect(() => {
    const unsub = NetworkEngine.onStatusChange(({ online }) => {
      setIsOnline(online);
      setLatencyMs(NetworkEngine.getLastPingMs());
    });
    return unsub;
  }, []);

  return { isOnline, latencyMs };
}