/**
 * useSafeAsync — Protection anti-crash pour les opérations async dans les composants
 *
 * - Évite setState après unmount (spinner infini)
 * - Timeout configurable (évite les loaders infinis)
 * - Jamais d'écran blanc sur erreur
 * - Pas de boucle realtime si la subscription échoue
 */
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * useSafeState — setState uniquement si le composant est encore monté
 */
export function useSafeState(initial) {
  const mounted = useRef(true);
  const [state, setState] = useState(initial);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const safeSet = useCallback((value) => {
    if (mounted.current) setState(value);
  }, []);

  return [state, safeSet];
}

/**
 * useSafeLoad — Chargement async avec timeout + protection anti-unmount
 *
 * @param {function} fetchFn   - async function qui renvoie les données
 * @param {number}   timeoutMs - timeout avant forcer loading=false (défaut: 10s)
 * @param {Array}    deps      - dépendances pour re-déclencher
 *
 * @returns {{ data, loading, error, reload }}
 */
export function useSafeLoad(fetchFn, { timeoutMs = 10000, deps = [] } = {}) {
  const [data, setData]     = useSafeState(null);
  const [loading, setLoading] = useSafeState(true);
  const [error, setError]   = useSafeState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!mounted.current) return;
    setLoading(true);
    setError(null);

    // Timeout de sécurité — évite spinner infini
    const timer = setTimeout(() => {
      if (mounted.current) {
        setLoading(false);
        console.warn("[useSafeLoad] timeout after", timeoutMs, "ms");
      }
    }, timeoutMs);

    try {
      const result = await fetchFn();
      if (mounted.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) {
        setError(e?.message || "Erreur de chargement");
        console.error("[useSafeLoad] error:", e?.message);
      }
    } finally {
      clearTimeout(timer);
      if (mounted.current) setLoading(false);
    }
  }, deps);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

/**
 * useSafeSubscribe — Subscription realtime avec protection anti-crash/boucle
 *
 * @param {function} subscribeFn  - function(callback) → unsub
 * @param {function} callback     - appelée sur chaque event
 * @param {Array}    deps
 */
export function useSafeSubscribe(subscribeFn, callback, deps = []) {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let unsub = null;

    try {
      unsub = subscribeFn((event) => {
        if (!mounted.current) return;
        try { callback(event); } catch (e) {
          console.warn("[useSafeSubscribe] callback error (non-fatal):", e?.message);
        }
      });
    } catch (e) {
      console.warn("[useSafeSubscribe] subscribe error (non-fatal):", e?.message);
    }

    return () => {
      mounted.current = false;
      try { if (typeof unsub === "function") unsub(); } catch (_) {}
    };
  }, deps);
}

/**
 * useNoSpinner — Force loading=false après un délai max, évite les spinners infinis
 * À utiliser dans les composants qui ont un loading state simple.
 */
export function useNoSpinner(loading, setLoading, maxMs = 8000) {
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      console.warn("[useNoSpinner] forçage loading=false après", maxMs, "ms");
      setLoading(false);
    }, maxMs);
    return () => clearTimeout(t);
  }, [loading, maxMs]);
}