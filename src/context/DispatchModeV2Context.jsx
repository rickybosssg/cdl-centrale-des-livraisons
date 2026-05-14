/**
 * DispatchModeV2Context — Hook centralisé V2
 *
 * Un seul abonnement BDD par session.
 * Zéro fallback local. Zéro useState("auto").
 * Tous les dashboards branchés ici.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { normalizeModeV2 } from '@/lib/DispatchEngineV2';

const DispatchModeV2Context = createContext(null);

export function DispatchModeV2Provider({ children }) {
  const [mode, setMode] = useState(null);       // null = chargement
  const [configId, setConfigId] = useState(null);
  const [configData, setConfigData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const lastMode = useRef(null); // ref pour éviter les closures stales dans toggle

  // ── Appliquer un mode — avec détection de réversion ────────────────────
  const applyMode = useCallback((raw, source, id, fullConfig) => {
    const normalized = normalizeModeV2(raw);
    if (!normalized) return; // valeur invalide → ignorer

    const prev = lastMode.current;
    if (prev === 'manuel' && normalized === 'auto') {
      console.warn(`[DISPATCH_V2_REVERT_DETECTED] ⚠️ ${prev} → ${normalized} | source=${source} | id=${id}`);
    }

    console.log(`[DISPATCH_V2_MODE_APPLY] ${prev ?? 'null'} → ${normalized} | source=${source} | id=${id || 'none'}`);
    lastMode.current = normalized;
    setMode(normalized);
    if (id) setConfigId(id);
    if (fullConfig) setConfigData(fullConfig);
  }, []);

  // ── Charger depuis BDD ──────────────────────────────────────────────────
  const loadFromDB = useCallback(async () => {
    try {
      const configs = await base44.entities.DispatchConfig.list('-updated_date', 1);
      if (configs.length === 0) {
        console.log('[DISPATCH_V2] Aucune config BDD — mode null jusqu\'à init admin');
        setMode(null);
        setLoading(false);
        return;
      }
      const cfg = configs[0];
      applyMode(cfg.mode, 'DB_load', cfg.id, cfg);
    } catch (e) {
      console.error('[DISPATCH_V2] loadFromDB error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [applyMode]);

  // ── Mount : charge BDD + subscribe realtime ────────────────────────────
  useEffect(() => {
    loadFromDB();

    const unsub = base44.entities.DispatchConfig.subscribe((event) => {
      if (!event?.data?.mode) return;
      applyMode(event.data.mode, `realtime_${event.type}`, event.data.id, event.data);
    });

    return () => unsub();
  }, [loadFromDB, applyMode]);

  // ── Toggle admin (V2) ──────────────────────────────────────────────────
  const toggle = useCallback(async (adminEmail) => {
    if (toggling) return;
    const prevMode = lastMode.current;
    const newMode = prevMode === 'auto' ? 'manuel' : 'auto';

    console.log(`[DISPATCH_V2_MODE_WRITE] toggle: ${prevMode} → ${newMode} | adminEmail=${adminEmail || 'unknown'} | source=admin_toggle`);

    // Optimiste
    lastMode.current = newMode;
    setMode(newMode);
    setToggling(true);

    try {
      const res = await base44.functions.invoke('setDispatchMode', { mode: newMode });
      if (!res.data?.success) throw new Error(res.data?.error || 'setDispatchMode V2 failed');

      const confirmed = res.data?.config?.mode;
      if (confirmed) {
        const n = normalizeModeV2(confirmed);
        if (n && n !== newMode) {
          console.warn(`[DISPATCH_V2_REVERT_DETECTED] BDD a confirmé ${confirmed} ≠ ${newMode} — application BDD`);
          lastMode.current = n;
          setMode(n);
        }
      }
      console.log(`[DISPATCH_V2_MODE_WRITE] oldMode=${prevMode} | newMode=${newMode} | confirmed=${confirmed} | source=admin_toggle | timestamp=${new Date().toISOString()}`);
    } catch (err) {
      // Rollback
      console.error(`[DISPATCH_V2_REVERT_DETECTED] Erreur toggle — rollback ${newMode} → ${prevMode} | ${err.message}`);
      lastMode.current = prevMode;
      setMode(prevMode);
    } finally {
      setToggling(false);
    }
  }, [toggling]);

  const reload = useCallback(() => loadFromDB(), [loadFromDB]);

  return (
    <DispatchModeV2Context.Provider value={{ mode, configId, configData, loading, toggling, toggle, reload }}>
      {children}
    </DispatchModeV2Context.Provider>
  );
}

export function useDispatchModeV2() {
  const ctx = useContext(DispatchModeV2Context);
  if (!ctx) throw new Error('useDispatchModeV2 doit être dans DispatchModeV2Provider');
  return ctx;
}