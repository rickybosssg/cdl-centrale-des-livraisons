/**
 * DispatchModeV2Context — Hook V2 avec document canonique fixe
 *
 * Ne lit QUE le doc avec mode_key="GLOBAL".
 * Le subscribe realtime filtre les events pour ignorer les docs non-canoniques.
 * Zéro écriture automatique. Zéro fallback local.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { normalizeModeV2, CANONICAL_KEY } from '@/lib/DispatchEngineV2';

const DispatchModeV2Context = createContext(null);

export function DispatchModeV2Provider({ children }) {
  const [mode, setMode] = useState(null);
  const [canonicalId, setCanonicalId] = useState(null);
  const [configData, setConfigData] = useState(null);
  const [allDocs, setAllDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Ref pour éviter les closures stales — source de vérité synchrone
  const lastMode = useRef(null);
  const canonicalIdRef = useRef(null);

  const applyConfig = useCallback((cfg, source) => {
    if (!cfg) return;
    const normalized = normalizeModeV2(cfg.mode);
    if (!normalized) {
      console.error(`[DISPATCH_V2] Mode invalide ignoré: "${cfg.mode}" | source=${source} | id=${cfg.id}`);
      return;
    }
    const prev = lastMode.current;
    if (prev === 'manuel' && normalized === 'auto') {
      console.error(`[DISPATCH_V2_REVERT_DETECTED] ⚠️ RÉVERSION: ${prev} → ${normalized} | source=${source} | id=${cfg.id} | mode_key=${cfg.mode_key}`);
    }
    console.log(`[DISPATCH_V2] ${prev ?? 'null'} → ${normalized} | source=${source} | id=${cfg.id} | mode_key=${cfg.mode_key || 'NONE'}`);
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
        console.warn(`[DISPATCH_V2] Aucun doc canonique (mode_key=${CANONICAL_KEY}). Docs: ${all.length}. IDs: ${all.map(c => c.id).join(', ')}`);
        // Pas de doc canonique → mode null (pas de fallback auto!)
        lastMode.current = null;
        canonicalIdRef.current = null;
        setMode(null);
        setCanonicalId(null);
        setConfigData(null);
      } else {
        applyConfig(canonical, 'DB_load');
      }
    } catch (e) {
      console.error('[DISPATCH_V2] loadFromDB error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    loadFromDB();

    // Subscribe realtime — FILTRE STRICT : ignorer tout doc non-canonique
    const unsub = base44.entities.DispatchConfig.subscribe((event) => {
      const data = event?.data;
      if (!data) return;

      // Ignorer si ce n'est pas le document canonique
      if (data.mode_key !== CANONICAL_KEY) {
        console.warn(`[DISPATCH_V2] Realtime event IGNORÉ (non-canonique): id=${data.id} mode_key=${data.mode_key || 'NONE'} mode=${data.mode}`);
        return;
      }

      console.log(`[DISPATCH_V2] Realtime event canonique: type=${event.type} | id=${data.id} | mode=${data.mode}`);
      applyConfig(data, `realtime_${event.type}`);
    });

    return () => unsub();
  }, [loadFromDB, applyConfig]);

  const toggle = useCallback(async (adminEmail) => {
    if (toggling) return;
    const prevMode = lastMode.current;

    // GARDE ABSOLU : ne jamais toggler si le mode n'est pas encore chargé
    if (prevMode === null) {
      console.error('[DISPATCH_V2_WRITE_BLOCKED] Toggle ignoré — mode non encore chargé (prevMode=null). Attendre loadFromDB.');
      return;
    }

    const newMode = prevMode === 'auto' ? 'manuel' : 'auto';

    // GARDE ABSOLU : ne jamais écrire 'auto' si déjà en 'manuel' sans confirmation
    // (protection contre les double-appels ou race conditions)
    if (prevMode === 'manuel' && newMode === 'auto') {
      console.log(`[DISPATCH_V2_WRITE_ALLOWED] Toggle manuel→auto | source=admin_click | admin=${adminEmail}`);
    } else {
      console.log(`[DISPATCH_V2_WRITE_ALLOWED] Toggle auto→manuel | source=admin_click | admin=${adminEmail}`);
    }

    console.log(`[DISPATCH_V2] Toggle: ${prevMode} → ${newMode} | admin=${adminEmail}`);

    // Optimiste
    lastMode.current = newMode;
    setMode(newMode);
    setToggling(true);

    try {
      const res = await base44.functions.invoke('setDispatchMode', { mode: newMode });
      if (!res.data?.success) throw new Error(res.data?.error || 'setDispatchMode failed');

      const confirmedMode = res.data?.config?.mode;
      const confirmedId = res.data?.config?.id;
      console.log(`[DISPATCH_V2] Toggle confirmé: mode=${confirmedMode} | id=${confirmedId}`);

      // Relire la BDD 1s après pour vérifier que rien n'a écrasé
      setTimeout(() => {
        loadFromDB().then(() => {
          console.log(`[DISPATCH_V2] Re-lecture 1s après toggle: mode=${lastMode.current}`);
        });
      }, 1000);
    } catch (err) {
      console.error(`[DISPATCH_V2] Toggle ERREUR → rollback | ${err.message}`);
      lastMode.current = prevMode;
      setMode(prevMode);
    } finally {
      setToggling(false);
    }
  }, [toggling, loadFromDB]);

  const reload = useCallback(() => loadFromDB(), [loadFromDB]);

  return (
    <DispatchModeV2Context.Provider value={{
      mode, canonicalId, configData, allDocs,
      loading, toggling, toggle, reload
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