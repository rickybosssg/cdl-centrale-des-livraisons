/**
 * DispatchModeContext — SOURCE UNIQUE DE VÉRITÉ pour le mode dispatch
 *
 * Un seul abonnement BDD/realtime pour toute l'app.
 * Tous les composants lisent ici — jamais de useState local pour le mode dispatch.
 *
 * RÈGLE : 'manuel' reste 'manuel' jusqu'à action admin explicite.
 * Ne jamais normaliser vers 'auto' si mode === 'manuel'.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const DispatchModeContext = createContext(null);

function normalizeMode(raw) {
  if (raw === 'manuel' || raw === 'manual') return 'manuel';
  if (raw === 'auto') return 'auto';
  // Valeur inconnue → ne pas écraser, logguer
  console.warn(`[DISPATCH_MODE_REVERT_DETECTED] Valeur inattendue raw="${raw}" — conservée telle quelle, pas de fallback auto`);
  return raw || 'auto';
}

export function DispatchModeProvider({ children }) {
  const [mode, setMode] = useState(null); // null = pas encore chargé
  const [configId, setConfigId] = useState(null);
  const [loading, setLoading] = useState(true);
  // Ref pour détecter les réversions inattendues
  const lastKnownMode = useRef(null);

  const applyMode = useCallback((raw, source, id) => {
    const normalized = normalizeMode(raw);
    const prev = lastKnownMode.current;

    if (prev === 'manuel' && normalized === 'auto') {
      console.warn(`[DISPATCH_MODE_REVERT_DETECTED] ⚠️ Réversion détectée ! ${prev} → ${normalized} | source=${source} | id=${id}`);
      console.warn(`[DISPATCH_MODE_WRITE_SOURCE] Source de la réversion : ${source}`);
    }

    console.log(`[DISPATCH_MODE_CHANGED_FROM_TO] ${prev ?? 'null'} → ${normalized} | source=${source} | id=${id || 'none'}`);
    console.log(`[DISPATCH_MODE_WRITE_SOURCE] mode appliqué=${normalized} | raw=${raw} | source=${source}`);

    lastKnownMode.current = normalized;
    setMode(normalized);
    if (id) setConfigId(id);
  }, []);

  const loadFromDB = useCallback(async () => {
    try {
      const configs = await base44.entities.DispatchConfig.list('-updated_date', 1);
      if (configs.length === 0) {
        console.log('[DISPATCH_MODE_WRITE_SOURCE] source=BDD | aucune config → affichage auto (pas d\'écriture BDD)');
        applyMode('auto', 'BDD_empty', null);
      } else {
        const cfg = configs[0];
        applyMode(cfg.mode, 'BDD_load', cfg.id);
      }
    } catch (e) {
      console.warn('[DispatchModeContext] loadFromDB error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [applyMode]);

  useEffect(() => {
    console.log('[DISPATCH_MODE_WRITE_SOURCE] Context mount — chargement BDD initial...');
    loadFromDB();

    // Abonnement realtime unique — propagé à tous les consommateurs
    const unsub = base44.entities.DispatchConfig.subscribe((event) => {
      if (!event?.data) return;
      const raw = event.data.mode;
      if (!raw) {
        console.warn('[DISPATCH_MODE_REVERT_DETECTED] Realtime event sans mode — ignoré');
        return;
      }
      applyMode(raw, `realtime_${event.type}`, event.data.id);
    });

    return () => unsub();
  }, [loadFromDB, applyMode]);

  // Toggle appelé par n'importe quel composant — résultat propagé à tous via context
  const toggle = useCallback(async () => {
    const previousMode = lastKnownMode.current;
    const newMode = previousMode === 'auto' ? 'manuel' : 'auto';
    console.log(`[DISPATCH_MODE_CHANGED_FROM_TO] toggle optimiste: ${previousMode} → ${newMode}`);
    console.log(`[DISPATCH_MODE_WRITE_SOURCE] source=toggle_admin | newMode=${newMode}`);

    // Optimiste immédiat
    lastKnownMode.current = newMode;
    setMode(newMode);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 5000)
    );

    try {
      const res = await Promise.race([
        base44.functions.invoke('setDispatchMode', { mode: newMode }),
        timeoutPromise,
      ]);

      if (!res.data?.success) throw new Error(res.data?.error || 'setDispatchMode failed');

      const confirmed = res.data?.config?.mode;
      if (confirmed) {
        console.log(`[DISPATCH_MODE_CHANGED_FROM_TO] BDD confirmée: ${newMode} → normalized=${normalizeMode(confirmed)}`);
        console.log(`[DISPATCH_MODE_WRITE_SOURCE] source=setDispatchMode_response | confirmed=${confirmed}`);
        // Ne pas appeler applyMode ici — le subscribe realtime va le faire
        // pour éviter une double mise à jour qui pourrait créer un race condition
      }
    } catch (err) {
      if (err.message === 'TIMEOUT') {
        console.warn(`[DISPATCH_MODE_WRITE_SOURCE] Timeout 5s — mode optimiste conservé=${newMode}, realtime confirmera`);
      } else {
        console.error(`[DISPATCH_MODE_REVERT_DETECTED] Erreur rollback → ${previousMode} | ${err.message}`);
        console.log(`[DISPATCH_MODE_CHANGED_FROM_TO] rollback: ${newMode} → ${previousMode}`);
        lastKnownMode.current = previousMode;
        setMode(previousMode);
      }
    }
  }, []); // Pas de dépendance sur `mode` — on lit via lastKnownMode.current

  const reload = useCallback(async () => {
    console.log('[DISPATCH_MODE_WRITE_SOURCE] reload manuel déclenché');
    await loadFromDB();
  }, [loadFromDB]);

  return (
    <DispatchModeContext.Provider value={{ mode, configId, loading, toggle, reload }}>
      {children}
    </DispatchModeContext.Provider>
  );
}

export function useDispatchMode() {
  const ctx = useContext(DispatchModeContext);
  if (!ctx) throw new Error('useDispatchMode doit être utilisé dans DispatchModeProvider');
  return ctx;
}