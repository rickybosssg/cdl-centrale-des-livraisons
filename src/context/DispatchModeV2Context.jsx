/**
 * DispatchModeV2Context — SOURCE UNIQUE DE VÉRITÉ DU MODE DISPATCH
 *
 * RÈGLES ABSOLUES :
 *   1. Ne lit QUE le doc avec mode_key="GLOBAL"
 *   2. Toute écriture passe par setDispatchModeCanonical avec source="admin_click"
 *   3. Zéro fallback vers 'auto' — si mode=null, on affiche null
 *   4. Le toggle ne s'exécute JAMAIS si mode n'est pas encore chargé
 *   5. Le subscribe realtime filtre STRICTEMENT les docs non-canoniques
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const DispatchModeV2Context = createContext(null);

const CANONICAL_KEY = 'GLOBAL';

function normalizeModeStrict(raw) {
  if (raw === 'manuel' || raw === 'manual') return 'manuel';
  if (raw === 'auto') return 'auto';
  return null;
}

export function DispatchModeV2Provider({ children }) {
  const [mode, setMode] = useState(null);
  const [canonicalId, setCanonicalId] = useState(null);
  const [configData, setConfigData] = useState(null);
  const [allDocs, setAllDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Refs synchrones — évite closures stales
  const lastMode = useRef(null);
  const canonicalIdRef = useRef(null);
  const isToggling = useRef(false);

  const applyConfig = useCallback((cfg, source) => {
    if (!cfg) return;
    const normalized = normalizeModeStrict(cfg.mode);
    if (!normalized) {
      console.error(`[DISPATCH_CANONICAL_READ] Mode invalide ignoré: "${cfg.mode}" | source=${source} | id=${cfg.id}`);
      return;
    }

    // DÉTECTION DE RÉVERSION
    const prev = lastMode.current;
    if (prev === 'manuel' && normalized === 'auto') {
      console.error(`[MANUAL_MODE_PROTECTED] ⚠️ RÉVERSION DÉTECTÉE: ${prev} → ${normalized} | source=${source} | id=${cfg.id} | mode_key=${cfg.mode_key}`);
      console.error(`[FUNCTION_TRIED_TO_FORCE_AUTO] source=${source} | oldMode=manuel | newMode=auto | id=${cfg.id} | timestamp=${new Date().toISOString()}`);
    }

    console.log(`[DISPATCH_CANONICAL_READ] ${prev ?? 'null'} → ${normalized} | source=${source} | id=${cfg.id} | mode_key=${cfg.mode_key || 'NONE'}`);
    lastMode.current = normalized;
    canonicalIdRef.current = cfg.id;
    setMode(normalized);
    setCanonicalId(cfg.id);
    setConfigData(cfg);
  }, []);

  const loadFromDB = useCallback(async () => {
    try {
      const all = await base44.entities.DispatchConfig.list('-updated_date', 50);
      setAllDocs(all);

      const canonical = all.find(c => c.mode_key === CANONICAL_KEY);

      if (!canonical) {
        console.warn(`[DISPATCH_CANONICAL_READ] Aucun doc GLOBAL. Docs: ${all.length}. IDs: ${all.map(c => c.id).join(', ')}`);
        // JAMAIS de fallback auto — on reste null
        lastMode.current = null;
        canonicalIdRef.current = null;
        setMode(null);
        setCanonicalId(null);
        setConfigData(null);
      } else {
        applyConfig(canonical, 'DB_load');
      }
    } catch (e) {
      console.error('[DISPATCH_CANONICAL_READ] loadFromDB error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    loadFromDB();

    // Subscribe realtime — FILTRE ABSOLU : ignorer tout doc non-GLOBAL
    const unsub = base44.entities.DispatchConfig.subscribe((event) => {
      const data = event?.data;
      if (!data) return;

      if (data.mode_key !== CANONICAL_KEY) {
        console.warn(`[DISPATCH_CANONICAL_READ] Realtime IGNORÉ (non-canonique): id=${data.id} mode_key=${data.mode_key || 'NONE'} mode=${data.mode}`);
        return;
      }

      console.log(`[DISPATCH_CANONICAL_READ] Realtime canonique: type=${event.type} | id=${data.id} | mode=${data.mode}`);
      applyConfig(data, `realtime_${event.type}`);
    });

    return () => unsub();
  }, [loadFromDB, applyConfig]);

  const toggle = useCallback(async (adminEmail) => {
    // GARDE 1 : ne jamais toggler si déjà en cours
    if (isToggling.current) {
      console.warn('[DISPATCH_CANONICAL_WRITE_BLOCKED] Toggle ignoré — déjà en cours');
      return;
    }

    const prevMode = lastMode.current;

    // GARDE 2 : ne jamais toggler si mode non chargé
    if (prevMode === null) {
      console.error('[DISPATCH_CANONICAL_WRITE_BLOCKED] Toggle ignoré — mode non encore chargé (prevMode=null)');
      return;
    }

    const newMode = prevMode === 'auto' ? 'manuel' : 'auto';
    console.log(`[DISPATCH_CANONICAL_WRITE_ALLOWED] Toggle admin: ${prevMode} → ${newMode} | source=admin_click | admin=${adminEmail}`);

    isToggling.current = true;
    setToggling(true);

    // Optimiste
    lastMode.current = newMode;
    setMode(newMode);

    try {
      // ⚠️ UTILISER setDispatchModeCanonical (nouvelle fonction officielle)
      const res = await base44.functions.invoke('setDispatchModeCanonical', {
        mode: newMode,
        source: 'admin_click',
        reason: `Admin ${adminEmail} → ${newMode} via toggle`,
      });

      if (!res.data?.success) throw new Error(res.data?.error || 'setDispatchModeCanonical failed');

      const confirmedMode = res.data?.config?.mode;
      const confirmedId = res.data?.config?.id;
      console.log(`[DISPATCH_CANONICAL_WRITE_ALLOWED] Toggle confirmé: mode=${confirmedMode} | id=${confirmedId}`);

      // Re-lecture 1s après pour vérifier la persistance
      setTimeout(() => {
        loadFromDB().then(() => {
          console.log(`[DISPATCH_CANONICAL_READ] Re-lecture 1s après toggle: mode=${lastMode.current}`);
        });
      }, 1000);
    } catch (err) {
      console.error(`[DISPATCH_CANONICAL_WRITE_BLOCKED] Toggle ERREUR → rollback | ${err.message}`);
      lastMode.current = prevMode;
      setMode(prevMode);
    } finally {
      isToggling.current = false;
      setToggling(false);
    }
  }, [loadFromDB]);

  const reload = useCallback(() => loadFromDB(), [loadFromDB]);

  return (
    <DispatchModeV2Context.Provider value={{
      mode, canonicalId, configData, allDocs,
      loading, toggling, toggle, reload,
      CANONICAL_KEY,
    }}>
      {children}
    </DispatchModeV2Context.Provider>
  );
}

export function useDispatchModeV2() {
  const ctx = useContext(DispatchModeV2Context);
  if (!ctx) throw new Error('useDispatchModeV2 doit être dans DispatchModeV2Provider');
  return ctx;
}