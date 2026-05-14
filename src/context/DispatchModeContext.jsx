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
      // Cache buster: ajoute timestamp pour éviter cache HTTP
      const res = await base44.functions.invoke('getDispatchMode', { _t: Date.now() });
      const data = res.data;
      console.log(`[DispatchModeContext] loadMode [${source}] | mode=${data.mode} | config_id=${data.config_id} | updated_at=${data.updated_at}`);
      setMode(data.mode);
      setUpdatedAt(data.updated_at);
      setUpdatedBy(data.updated_by);
      setConfigId(data.config_id);
    } catch (err) {
      console.error('[DispatchModeContext] loadMode error:', err);
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
      if (event.type === 'update' && event.data) {
        setMode(event.data.mode);
        setUpdatedAt(event.data.updated_at);
        setUpdatedBy(event.data.updated_by);
        setConfigId(event.id);
      } else if (event.type === 'create' && event.data) {
        setMode(event.data.mode);
        setUpdatedAt(event.data.updated_at);
        setUpdatedBy(event.data.updated_by);
        setConfigId(event.id);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadMode]);

  // Action: changer le mode (appelle la fonction sécurisée)
  const setModeSecure = useCallback(async (newMode, skipRefresh = false) => {
    if (!['auto', 'manuel'].includes(newMode)) {
      throw new Error(`Mode invalide: ${newMode}`);
    }

    try {
      console.log(`[DispatchModeContext] setModeSecure START | newMode=${newMode}`);
      const res = await base44.functions.invoke('setDispatchMode', { mode: newMode });
      console.log(`[DispatchModeContext] setModeSecure RESPONSE | success=${res.data?.success} | mode=${res.data?.mode}`);
      
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'setDispatchMode failed');
      }
      
      // Mise à jour immédiate du state
      setMode(newMode);
      setUpdatedAt(res.data.updated_at);
      setUpdatedBy(res.data.updated_by);
      setConfigId(res.data.config_id);
      
      // Refresh immédiat pour confirmer depuis BDD
      if (!skipRefresh) {
        setTimeout(() => loadMode('post-set'), 500);
      }
      
      return { success: true, mode: newMode };
    } catch (error) {
      console.error('[DispatchModeContext] setModeSecure error:', error);
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