/**
 * DispatchModeContext — SOURCE UNIQUE DISPATCH MODE
 * Lit/écrit UNIQUEMENT DispatchModeState (entity directe)
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

// Purge des clés legacy au chargement
try {
  ["dispatch_mode", "dispatchMode", "dispatch_config", "cdl_dispatch_mode",
    "cdl_dispatch_config", "dispatch_mode_v2", "dispatchModeV2"].forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
} catch (_) {}

const DispatchModeContext = createContext(null);

export function DispatchModeProvider({ children }) {
  const [mode, setModeState] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState(null);
  const modeRef = useRef(null);

  const loadMode = useCallback(async () => {
    try {
      const rows = await base44.entities.DispatchModeState.list('-updated_date', 1);
      const modeState = rows[0];

      if (!modeState) {
        const created = await base44.entities.DispatchModeState.create({ mode: 'auto' });
        setModeState('auto');
        modeRef.current = 'auto';
        setConfigId(created.id);
        setLoading(false);
        return;
      }

      setModeState(modeState.mode || 'auto');
      modeRef.current = modeState.mode || 'auto';
      setUpdatedAt(modeState.updated_at);
      setUpdatedBy(modeState.updated_by);
      setConfigId(modeState.id);
      setLoading(false);
    } catch (err) {
      setLastError({ message: err.message, ts: new Date().toISOString() });
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMode();

    const unsubscribe = base44.entities.DispatchModeState.subscribe((event) => {
      if ((event.type === "update" || event.type === "create") && event.data) {
        const newMode = event.data.mode;
        modeRef.current = newMode;
        setModeState(newMode);
        setUpdatedAt(event.data.updated_at);
        setUpdatedBy(event.data.updated_by);
        setConfigId(event.id);
      } else if (event.type === "delete") {
        modeRef.current = null;
        setModeState(null);
        setUpdatedAt(null);
        setUpdatedBy(null);
        setConfigId(null);
      }
    });

    return () => unsubscribe();
  }, [loadMode]);

  const setMode = useCallback(async (newMode) => {
    if (!["auto", "manuel"].includes(newMode)) {
      throw new Error(`Mode invalide: "${newMode}"`);
    }

    const now = new Date().toISOString();
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}

    const rows = await base44.entities.DispatchModeState.list('-updated_date', 1);
    let updated;
    if (rows[0]) {
      updated = await base44.entities.DispatchModeState.update(rows[0].id, {
        mode: newMode,
        updated_by: user?.email || 'admin',
        updated_at: now,
      });
    } else {
      updated = await base44.entities.DispatchModeState.create({
        mode: newMode,
        updated_by: user?.email || 'admin',
        updated_at: now,
      });
    }

    modeRef.current = newMode;
    setModeState(newMode);
    setUpdatedAt(now);
    setUpdatedBy(user?.email || 'admin');
    setConfigId(updated.id);

    return { success: true, mode: newMode };
  }, []);

  return (
    <DispatchModeContext.Provider value={{
      mode, updatedAt, updatedBy, configId, loading, lastError, modeRef,
      setMode, refresh: loadMode,
    }}>
      {children}
    </DispatchModeContext.Provider>
  );
}

export function useDispatchMode() {
  const ctx = useContext(DispatchModeContext);
  if (!ctx) throw new Error("useDispatchMode doit être utilisé dans <DispatchModeProvider>");
  return ctx;
}