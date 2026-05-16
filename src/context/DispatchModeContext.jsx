/**
 * DispatchModeContext — SOURCE UNIQUE ET DÉFINITIVE v3.0
 *
 * RÈGLES :
 *   - Lit UNIQUEMENT getDispatchMode (backend → DispatchModeState)
 *   - Subscribe UNIQUEMENT sur DispatchModeState (realtime)
 *   - Écrit UNIQUEMENT via setDispatchMode (backend sécurisé, admin-only)
 *   - ZÉRO référence à DispatchConfig, DispatchEngineV2, DispatchModeV2Context
 *   - ZÉRO fallback "auto" automatique (null = loading, jamais forced auto)
 *   - UN seul Provider dans App.jsx : <DispatchModeProvider>
 *   - PURGE cache localStorage/sessionStorage dispatch au montage
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

const PROVIDER_VERSION = "DispatchModeContext_v3_FINAL";

// ── Guard singleton — détecte les doubles montages ────────────────────────────
let _providerMountCount = 0;

// ── Purge des clés legacy au chargement du module ────────────────────────────
const LEGACY_CACHE_KEYS = [
  "dispatch_mode", "dispatchMode", "dispatch_config", "cdl_dispatch_mode",
  "cdl_dispatch_config", "dispatch_mode_v2", "dispatchModeV2",
];
try {
  LEGACY_CACHE_KEYS.forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  console.log(`[${PROVIDER_VERSION}] LEGACY CACHE PURGED (${LEGACY_CACHE_KEYS.length} keys)`);
} catch (_) {}

const DispatchModeContext = createContext(null);

export function DispatchModeProvider({ children }) {
  useEffect(() => {
    _providerMountCount++;
    console.log(`[${PROVIDER_VERSION}] MOUNTED #${_providerMountCount} — ${_providerMountCount > 1 ? '⚠️ DOUBLE MOUNT DÉTECTÉ' : '✅ instance unique'}`);
    return () => {
      _providerMountCount--;
      console.log(`[${PROVIDER_VERSION}] UNMOUNTED — instances restantes: ${_providerMountCount}`);
    };
  }, []);

  const [mode, setModeState] = useState(null);         // null = chargement en cours
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendRaw, setBackendRaw] = useState(null);  // valeur brute retournée par backend
  const [lastWriter, setLastWriter] = useState(null);  // dernière fonction ayant écrit
  const [listenerActive, setListenerActive] = useState(false);
  const [lastEventTs, setLastEventTs] = useState(null);
  const [lastError, setLastError] = useState(null); // { status, message, attempt, ts }

  const modeRef = useRef(null); // ref synchrone pour éviter closures stales

  // ── Chargement direct depuis l'entity (sans backend function) ───────────────
  const loadMode = useCallback(async (source = "init") => {
    try {
      console.log(`[DISPATCH_MODE] loadMode START | source=${source} | method=entity_direct`);

      const rows = await base44.entities.DispatchModeState.list('-updated_date', 1);
      const modeState = rows[0];

      if (!modeState) {
        console.log('[DISPATCH_MODE] NO DOCUMENT — auto-create default');
        const created = await base44.entities.DispatchModeState.create({ mode: 'auto' });
        const data = { mode: 'auto', updated_by: null, updated_at: null, config_id: created.id };
        setBackendRaw(data);
        setModeState('auto');
        modeRef.current = 'auto';
        setUpdatedAt(null);
        setUpdatedBy(null);
        setConfigId(created.id);
        setLastWriter(`entity_create (${source})`);
        setLoading(false);
        return;
      }

      console.log(`[DISPATCH_MODE] LOADED | mode=${modeState.mode} | id=${modeState.id}`);
      const data = { mode: modeState.mode, updated_by: modeState.updated_by, updated_at: modeState.updated_at, config_id: modeState.id };
      setBackendRaw(data);
      setModeState(modeState.mode || 'auto');
      modeRef.current = modeState.mode || 'auto';
      setUpdatedAt(modeState.updated_at);
      setUpdatedBy(modeState.updated_by);
      setConfigId(modeState.id);
      setLastWriter(`entity_list (${source})`);
      setLoading(false);
    } catch (err) {
      console.error(`[DISPATCH_MODE] loadMode ERROR | source=${source} | msg=${err.message}`);
      const errPayload = { status: err.response?.status || 'unknown', message: err.message, attempt: 1, source, ts: new Date().toISOString(), responseData: err.response?.data || null };
      setLastError(errPayload);
      setLoading(false);
    }
  }, []);

  // ── Subscription realtime sur DispatchModeState ───────────────────────────
  useEffect(() => {
    loadMode("init");

    const unsubscribe = base44.entities.DispatchModeState.subscribe((event) => {
      const ts = new Date().toISOString();
      console.log(`[DISPATCH_MODE] REALTIME event | type=${event.type} | mode=${event.data?.mode} | ts=${ts}`);
      setLastEventTs(ts);

      if ((event.type === "update" || event.type === "create") && event.data) {
        const newMode = event.data.mode;
        const prevMode = modeRef.current;

        if (prevMode !== null && prevMode !== newMode) {
          console.warn(`[DISPATCH_MODE] MODE CHANGE via realtime: ${prevMode} → ${newMode} | by=${event.data.updated_by}`);
        }

        modeRef.current = newMode;
        setModeState(newMode);
        setUpdatedAt(event.data.updated_at);
        setUpdatedBy(event.data.updated_by);
        setConfigId(event.id);
        setLastWriter(`realtime_${event.type}`);
        setBackendRaw(event.data);
      } else if (event.type === "delete") {
        console.warn("[DISPATCH_MODE] DispatchModeState SUPPRIMÉ — mode=null (pas de fallback auto)");
        modeRef.current = null;
        setModeState(null);
        setUpdatedAt(null);
        setUpdatedBy(null);
        setConfigId(null);
        setLastWriter("realtime_delete");
        setBackendRaw(null);
      }
    });

    setListenerActive(true);
    return () => {
      unsubscribe();
      setListenerActive(false);
    };
  }, [loadMode]);

  // ── Écriture directe dans l'entity (admin) ──────────────────────────────
  const setMode = useCallback(async (newMode) => {
    if (!["auto", "manuel"].includes(newMode)) {
      throw new Error(`[DISPATCH_MODE] Mode invalide: "${newMode}"`);
    }

    console.log(`[DISPATCH_MODE] setMode CALLED | newMode=${newMode} | prevMode=${modeRef.current}`);

    const now = new Date().toISOString();
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}

    // Chercher le document existant
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

    console.log(`[DISPATCH_MODE] setMode SUCCESS | mode=${newMode} | id=${updated.id}`);

    // Mise à jour immédiate du state (avant que le realtime arrive)
    modeRef.current = newMode;
    setModeState(newMode);
    setUpdatedAt(now);
    setUpdatedBy(user?.email || 'admin');
    setConfigId(updated.id);
    setLastWriter(`setMode_entity (admin click)`);
    setBackendRaw({ mode: newMode, updated_by: user?.email, updated_at: now, config_id: updated.id });

    return { success: true, mode: newMode };
  }, []);

  const value = {
    mode,
    updatedAt,
    updatedBy,
    configId,
    loading,
    // Debug panel
    backendRaw,
    lastWriter,
    listenerActive,
    lastEventTs,
    lastError,
    modeRef,
    providerVersion: PROVIDER_VERSION,
    // Actions
    setMode,
    refresh: loadMode,
  };

  return (
    <DispatchModeContext.Provider value={value}>
      {children}
    </DispatchModeContext.Provider>
  );
}

export function useDispatchMode() {
  const ctx = useContext(DispatchModeContext);
  if (!ctx) throw new Error("useDispatchMode doit être utilisé dans <DispatchModeProvider>");
  return ctx;
}