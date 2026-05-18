/**
 * useManualDispatchAlert — Hook global temps réel pour alertes dispatch manuel
 *
 * SOURCE UNIQUE : Course.subscribe() — ev.data utilisé directement, SANS fetch intermédiaire
 * Affichage < 500ms garanti
 *
 * Logs :
 * [COURSE_CREATED] → subscription create reçue
 * [EVENT_RECEIVED] → tout event course
 * [BLOC_VISIBLE]   → course ajoutée à la liste visible (avec timestamp)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export function useManualDispatchAlert() {
  const [pendingCourses, setPendingCourses] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [mode, setMode] = useState(null);
  const [modeLoading, setModeLoading] = useState(true);
  const mountedAt = useRef(Date.now());

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

  // ── Subscription Course — SOURCE PRIMAIRE, ev.data direct, SANS fetch ───
  useEffect(() => {
    const unsub = base44.entities.Course.subscribe((ev) => {
      const ts = new Date().toISOString();
      console.log(`[EVENT_RECEIVED] ${ts} | type:${ev.type} | id:${ev.id} | statut:${ev.data?.statut}`);

      if (ev.type === "create") {
        const course = ev.data;
        if (!course) return;
        console.log(`[COURSE_CREATED] ${ts} | id:${ev.id} | statut:${course.statut} | mode:${course.mode_assignation}`);

        // Afficher si en_attente et pas un déplacement
        if (course.statut === "en_attente" && !course.moyen_transport) {
          const latency = Date.now() - mountedAt.current;
          setPendingCourses(prev => {
            if (prev.find(c => c.id === ev.id)) return prev;
            console.log(`[BLOC_VISIBLE] ${ts} | id:${ev.id} | latency_from_mount:${latency}ms`);
            return [course, ...prev];
          });
        }
      } else if (ev.type === "update") {
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

    console.log('[MANUAL_DISPATCH_HOOK] subscription active — waiting for courses');

    // Chargement initial en arrière-plan (ne bloque pas l'affichage)
    base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 10)
      .then(data => {
        const arr = (data || []).filter(c => !c.is_deleted && !c.moyen_transport);
        console.log(`[MANUAL_DISPATCH_HOOK] initial load: ${arr.length} courses en attente`);
        // Merge : ne pas écraser les courses déjà reçues par subscription
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