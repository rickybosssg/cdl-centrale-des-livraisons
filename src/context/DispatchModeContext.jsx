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

  const modeRef = useRef(null); // ref synchrone pour éviter closures stales

  // ── Chargement depuis backend ─────────────────────────────────────────────
  const loadMode = useCallback(async (source = "init", attempt = 1) => {
    try {
      console.log(`[DISPATCH_MODE] loadMode START | source=${source} | attempt=${attempt}`);

      // Attendre que le token soit réellement prêt via me() — max 8s
      let user = null;
      for (let i = 0; i < 16; i++) {
        try {
          user = await base44.auth.me();
          if (user?.email) break;
        } catch (_) {}
        console.log(`[DISPATCH_MODE] me() not ready, wait 500ms (${i + 1}/16)...`);
        await new Promise(r => setTimeout(r, 500));
      }

      if (!user?.email) {
        console.log("[DISPATCH_MODE] loadMode SKIP — user non disponible après attente");
        setLoading(false);
        return;
      }

      console.log(`[DISPATCH_MODE] auth ready | user=${user.email} | calling getDispatchMode...`);
      const res = await base44.functions.invoke("getDispatchMode", { _t: Date.now() });
      const data = res.data;
      console.log(`[DISPATCH_MODE] loadMode RESPONSE | mode=${data.mode} | config_id=${data.config_id} | updated_by=${data.updated_by} | updated_at=${data.updated_at}`);

      setBackendRaw(data);
      setModeState(data.mode || null);
      modeRef.current = data.mode || null;
      setUpdatedAt(data.updated_at);
      setUpdatedBy(data.updated_by);
      setConfigId(data.config_id);
      setLastWriter(`getDispatchMode (${source})`);
    } catch (err) {
      const httpStatus = err.response?.status || err.status || 'unknown';
      console.error(`[DISPATCH_MODE] loadMode ERROR | source=${source} | attempt=${attempt} | status=${httpStatus} | msg=${err.message}`);
      console.error(`[DISPATCH_MODE] ERROR DETAIL | stack=${err.stack}`);
      console.error(`[DISPATCH_MODE] ERROR PAYLOAD | response=`, JSON.stringify(err.response?.data || err.response || null));

      // Retry sur 403/401 (token pas encore prêt) et sur init — max 5 tentatives
      const is403 = httpStatus === 403 || httpStatus === 401 || err.message?.includes("403") || err.message?.includes("401");
      if (attempt < 5 && (source === "init" || is403)) {
        const delay = attempt * 1000; // 1s, 2s, 3s, 4s
        console.log(`[DISPATCH_MODE] RETRY in ${delay}ms (attempt ${attempt + 1})...`);
        setTimeout(() => loadMode(source, attempt + 1), delay);
        return;
      }
      // Pas de fallback "auto" — on garde l'état précédent
    } finally {
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

  // ── Écriture sécurisée — admin-only via setDispatchMode ──────────────────
  const setMode = useCallback(async (newMode) => {
    if (!["auto", "manuel"].includes(newMode)) {
      throw new Error(`[DISPATCH_MODE] Mode invalide: "${newMode}"`);
    }

    console.log(`[DISPATCH_MODE] setMode CALLED | newMode=${newMode} | prevMode=${modeRef.current}`);

    const res = await base44.functions.invoke("setDispatchMode", { mode: newMode, _t: Date.now() });
    console.log(`[DISPATCH_MODE] setDispatchMode RESPONSE | success=${res.data?.success} | mode=${res.data?.mode}`);

    if (!res.data?.success) {
      throw new Error(res.data?.error || "setDispatchMode a échoué");
    }

    // Mise à jour immédiate du state (avant que le realtime arrive)
    modeRef.current = newMode;
    setModeState(newMode);
    setUpdatedAt(res.data.updated_at);
    setUpdatedBy(res.data.updated_by);
    setConfigId(res.data.config_id);
    setLastWriter(`setDispatchMode (admin click)`);
    setBackendRaw(res.data);

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