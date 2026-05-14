/**
 * DispatchModeContext — SOURCE UNIQUE DE VÉRITÉ pour le mode dispatch
 *
 * Un seul abonnement BDD/realtime pour toute l'app.
 * Tous les composants lisent ici — jamais de useState local pour le mode dispatch.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const DispatchModeContext = createContext(null);

export function DispatchModeProvider({ children }) {
  const [mode, setMode] = useState(null); // null = pas encore chargé
  const [configId, setConfigId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadFromDB = useCallback(async () => {
    try {
      const configs = await base44.entities.DispatchConfig.list('-updated_date', 1);
      if (configs.length === 0) {
        console.log('[UI_MODE_RENDERED] source=BDD | aucune config → fallback auto');
        setMode('auto');
        setConfigId(null);
      } else {
        const raw = configs[0].mode;
        const normalized = raw === 'manuel' || raw === 'manual' ? 'manuel' : 'auto';
        console.log(`[UI_MODE_RENDERED] source=BDD | raw=${raw} | normalized=${normalized} | id=${configs[0].id}`);
        setMode(normalized);
        setConfigId(configs[0].id);
      }
    } catch (e) {
      console.warn('[DispatchModeContext] loadFromDB error:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('[UI_MODE_BEFORE_RENDER] Context mount — chargement BDD...');
    loadFromDB();

    // Abonnement realtime unique — propagé à tous les consommateurs
    const unsub = base44.entities.DispatchConfig.subscribe((event) => {
      if (!event?.data) return;
      const raw = event.data.mode;
      if (!raw) return;
      const normalized = raw === 'manuel' || raw === 'manual' ? 'manuel' : 'auto';
      console.log(`[UI_MODE_AFTER_SUBSCRIBE] realtime event=${event.type} | raw=${raw} | normalized=${normalized} | id=${event.data.id}`);
      setMode(normalized);
      setConfigId(event.data.id || null);
    });

    return () => unsub();
  }, []);

  // Toggle appelé par n'importe quel composant — résultat propagé à tous via context
  const toggle = useCallback(async () => {
    const previousMode = mode;
    const newMode = previousMode === 'auto' ? 'manuel' : 'auto';
    console.log(`[UI_MODE_AFTER_TOGGLE] optimistic: ${previousMode} → ${newMode}`);

    // Optimiste immédiat
    setMode(newMode);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 4000)
    );

    try {
      const res = await Promise.race([
        base44.functions.invoke('setDispatchMode', { mode: newMode }),
        timeoutPromise,
      ]);

      if (!res.data?.success) throw new Error(res.data?.error || 'setDispatchMode failed');

      const confirmed = res.data?.config?.mode;
      if (confirmed) {
        const normalizedConfirmed = confirmed === 'manuel' || confirmed === 'manual' ? 'manuel' : 'auto';
        console.log(`[UI_MODE_AFTER_TOGGLE] BDD confirmé=${normalizedConfirmed}`);
        setMode(normalizedConfirmed);
      }
    } catch (err) {
      if (err.message === 'TIMEOUT') {
        // Timeout OK — le realtime va confirmer dans la seconde qui suit
        console.warn(`[UI_MODE_AFTER_TOGGLE] Timeout 4s — mode optimiste conservé=${newMode}`);
      } else {
        console.error(`[UI_MODE_AFTER_TOGGLE] Erreur rollback → ${previousMode} | ${err.message}`);
        setMode(previousMode);
      }
    }
  }, [mode]);

  // Forcer une relecture BDD (après fermeture/réouverture)
  const reload = useCallback(async () => {
    await loadFromDB();
    console.log(`[UI_MODE_AFTER_RELOAD] mode=${mode}`);
  }, [loadFromDB, mode]);

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