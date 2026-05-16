import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const DispatchModeContext = createContext(null);

export function DispatchModeProvider({ children }) {
  const [mode, setMode] = useState(null); // "auto" | "manuel" | null (loading)
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Chargement initial + subscription temps réel
  const loadMode = useCallback(async (source = 'init') => {
    try {
      // Vérifier auth d'abord
      const isAuthenticated = await base44.auth.isAuthenticated();
      if (!isAuthenticated) {
        console.log('[DispatchModeContext] loadMode SKIP — not authenticated');
        setMode('auto');
        setLoading(false);
        return;
      }
      
      // Cache buster: ajoute timestamp pour éviter cache HTTP
      console.log(`[DispatchModeContext] loadMode [${source}] START`);
      const res = await base44.functions.invoke('getDispatchMode', { _t: Date.now() });
      const data = res.data;
      console.log(`[DispatchModeContext] loadMode [${source}] SUCCESS | mode=${data.mode} | config_id=${data.config_id} | updated_at=${data.updated_at}`);
      setMode(data.mode);
      setUpdatedAt(data.updated_at);
      setUpdatedBy(data.updated_by);
      setConfigId(data.config_id);
    } catch (err) {
      console.error('[DispatchModeContext] loadMode ERROR:', err.message);
      // Retry une fois après 500ms (token peut être en cours de refresh)
      if (source === 'init') {
        console.log('[DispatchModeContext] loadMode RETRY in 500ms...');
        setTimeout(() => loadMode('retry'), 500);
        return;
      }
      // Fallback safe: auto par défaut si erreur
      setMode('auto');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMode('init');

    // Subscription temps réel aux changements
    const unsubscribe = base44.entities.DispatchModeState.subscribe((event) => {
      console.log('[DispatchModeContext] subscribe event:', event.type, event.data?.mode);
      if ((event.type === 'update' || event.type === 'create') && event.data) {
        setMode(event.data.mode);
        setUpdatedAt(event.data.updated_at);
        setUpdatedBy(event.data.updated_by);
        setConfigId(event.id);
      } else if (event.type === 'delete') {
        // Document supprimé → fallback sur auto (état sûr par défaut)
        console.warn('[DispatchModeContext] DispatchModeState supprimé — fallback mode=auto');
        setMode('auto');
        setUpdatedAt(null);
        setUpdatedBy(null);
        setConfigId(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadMode]);

  // Action: changer le mode (appelle la fonction sécurisée)
  const setModeSecure = useCallback(async (newMode, skipRefresh = false) => {
    if (!['auto', 'manuel'].includes(newMode)) {
      const err = `Mode invalide: ${newMode}`;
      console.error(`[DispatchModeContext] setModeSecure VALIDATION_ERROR | ${err}`);
      throw new Error(err);
    }

    try {
      console.log(`[DispatchModeContext] setModeSecure START | newMode=${newMode} | timestamp=${Date.now()}`);
      
      // Cache buster
      const res = await base44.functions.invoke('setDispatchMode', { mode: newMode, _t: Date.now() });
      console.log(`[DispatchModeContext] setModeSecure RESPONSE | status=${res.status} | data=`, res.data);
      
      if (!res.data?.success) {
        const errMsg = res.data?.error || 'setDispatchMode failed';
        console.error(`[DispatchModeContext] setModeSecure FAILED | ${errMsg}`);
        throw new Error(errMsg);
      }
      
      // Mise à jour immédiate du state
      console.log(`[DispatchModeContext] setModeSecure UPDATING STATE | mode=${newMode}`);
      setMode(newMode);
      setUpdatedAt(res.data.updated_at);
      setUpdatedBy(res.data.updated_by);
      setConfigId(res.data.config_id);
      
      // Refresh immédiat pour confirmer depuis BDD
      if (!skipRefresh) {
        console.log(`[DispatchModeContext] setModeSecure SCHEDULING REFRESH`);
        setTimeout(() => loadMode('post-set'), 500);
      }
      
      return { success: true, mode: newMode };
    } catch (error) {
      console.error('[DispatchModeContext] setModeSecure ERROR:', error.message, error.stack);
      throw error;
    }
  }, [loadMode]);

  const value = {
    mode,
    updatedAt,
    updatedBy,
    configId,
    loading,
    setMode: setModeSecure,
    refresh: loadMode,
  };

  return (
    <DispatchModeContext.Provider value={value}>
      {children}
    </DispatchModeContext.Provider>
  );
}

export function useDispatchMode() {
  const context = useContext(DispatchModeContext);
  if (!context) {
    throw new Error('useDispatchMode must be used within DispatchModeProvider');
  }
  return context;
}