/**
 * useManualDispatchAlert — Hook global temps réel pour alertes dispatch manuel
 *
 * LOGS HORODATÉS :
 * [COURSE_CREATED_AT]       → timestamp ISO de création (created_date depuis ev.data)
 * [REALTIME_EVENT_RECEIVED_AT] → timestamp ISO de réception de l'event subscription
 * [ALERT_STATE_UPDATED_AT]  → timestamp ISO après setPendingCourses
 * [BLOC_VISIBLE_AT]         → timestamp ISO après state flush React
 *
 * Délai max accepté : <1s entre COURSE_CREATED_AT et BLOC_VISIBLE_AT.
 * Si >1s → la cause exacte est loguée.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export function useManualDispatchAlert() {
  const [pendingCourses, setPendingCourses] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [mode, setMode] = useState(null);
  const [modeLoading, setModeLoading] = useState(true);

  // ── Mode dispatch — fetch initial + subscription temps réel ──────────────
  useEffect(() => {
    base44.entities.DispatchModeState.list('-updated_date', 1)
      .then(rows => setMode(rows[0]?.mode || 'auto'))
      .catch(() => setMode('auto'))
      .finally(() => setModeLoading(false));

    const unsub = base44.entities.DispatchModeState.subscribe((ev) => {
      if (ev.data?.mode) setMode(ev.data.mode);
    });
    return () => { if (unsub) unsub(); };
  }, []);

  // ── Subscription Course — SOURCE PRIMAIRE ────────────────────────────────
  useEffect(() => {
    console.log(`[MANUAL_DISPATCH_HOOK] subscription active — waiting for courses | ${new Date().toISOString()}`);

    const unsub = base44.entities.Course.subscribe((ev) => {
      const receivedAt = new Date().toISOString();
      const receivedMs = Date.now();

      if (ev.type === "create") {
        const course = ev.data;
        if (!course) {
          console.warn(`[REALTIME_EVENT_RECEIVED_AT] ${receivedAt} | create sans ev.data — CAUSE DÉLAI: données manquantes`);
          return;
        }

        // Log création
        const createdAt = course.created_date || receivedAt;
        const delayMs = receivedMs - new Date(createdAt).getTime();

        console.log(`[COURSE_CREATED_AT] ${createdAt} | id:${ev.id} | statut:${course.statut}`);
        console.log(`[REALTIME_EVENT_RECEIVED_AT] ${receivedAt} | id:${ev.id} | délai_création_reception:${delayMs}ms`);

        if (delayMs > 1000) {
          console.warn(`[DÉLAI >1s] CAUSE: délai réseau/subscription = ${delayMs}ms | id:${ev.id}`);
        }

        // Afficher si en_attente (peu importe le mode — le mode filtre côté shouldDisplay)
        if (course.statut === "en_attente" && !course.moyen_transport) {
          const stateUpdateAt = new Date().toISOString();
          setPendingCourses(prev => {
            if (prev.find(c => c.id === ev.id)) return prev;

            console.log(`[ALERT_STATE_UPDATED_AT] ${stateUpdateAt} | id:${ev.id}`);

            // Mesure BLOC_VISIBLE_AT après le prochain rendu React
            requestAnimationFrame(() => {
              const blocVisibleAt = new Date().toISOString();
              const totalDelayMs = Date.now() - new Date(createdAt).getTime();
              console.log(`[BLOC_VISIBLE_AT] ${blocVisibleAt} | id:${ev.id} | délai_total:${totalDelayMs}ms`);
              if (totalDelayMs > 1000) {
                console.warn(`[DÉLAI >1s DÉTECTÉ] délai total=${totalDelayMs}ms | réseau=${delayMs}ms | react_render=${totalDelayMs - delayMs}ms`);
              }
            });

            return [course, ...prev];
          });
        } else {
          console.log(`[REALTIME_EVENT_RECEIVED_AT] ${receivedAt} | id:${ev.id} | ignoré (statut:${course.statut} moyen_transport:${course.moyen_transport})`);
        }

      } else if (ev.type === "update") {
        console.log(`[REALTIME_EVENT_RECEIVED_AT] ${receivedAt} | update | id:${ev.id} | statut:${ev.data?.statut}`);

        if (!ev.data || ev.data.statut !== "en_attente") {
          // Course n'est plus en attente → retirer du bloc
          setPendingCourses(prev => prev.filter(c => c.id !== ev.id));
        } else {
          // Mettre à jour les données avec ev.data (pas de fetch)
          setPendingCourses(prev => prev.map(c => c.id === ev.id ? ev.data : c));
        }

      } else if (ev.type === "delete") {
        setPendingCourses(prev => prev.filter(c => c.id !== ev.id));
      }
    });

    // Chargement initial en arrière-plan (ne bloque PAS l'affichage)
    base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 10)
      .then(data => {
        const arr = (data || []).filter(c => !c.is_deleted && !c.moyen_transport);
        console.log(`[MANUAL_DISPATCH_HOOK] initial load: ${arr.length} courses en attente | ${new Date().toISOString()}`);
        // Merge sans écraser les courses déjà reçues via subscription
        setPendingCourses(prev => {
          const ids = new Set(prev.map(c => c.id));
          const newOnes = arr.filter(c => !ids.has(c.id));
          return [...prev, ...newOnes];
        });
      })
      .catch(() => {});

    return () => { if (unsub) unsub(); };
  }, []);

  const handleDismiss = useCallback((id) => {
    setDismissed(prev => new Set([...prev, id]));
  }, []);

  const removeCourse = useCallback((id) => {
    setPendingCourses(prev => prev.filter(c => c.id !== id));
  }, []);

  const visibleCourses = pendingCourses.filter(c => !dismissed.has(c.id));
  const shouldDisplay = !modeLoading && mode === "manuel" && visibleCourses.length > 0;

  return {
    visibleCourses,
    pendingCourses,
    dismissed,
    mode,
    modeLoading,
    shouldDisplay,
    handleDismiss,
    removeCourse,
  };
}