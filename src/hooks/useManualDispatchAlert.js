/**
 * useManualDispatchAlert — Hook global temps réel pour alertes dispatch manuel
 * 
 * SOURCE UNIQUE : Subscription Course en temps réel
 * Affichage instantané (< 1s) sans polling, sans refresh API
 * 
 * Logs horodatés :
 * - [COURSE_CREATED] → création course
 * - [NOTIFICATION_RECEIVED] → événement subscription
 * - [BLOC_VISIBLE] → bloc affiché
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export function useManualDispatchAlert() {
  const [pendingCourses, setPendingCourses] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [mode, setMode] = useState(null);
  const [modeLoading, setModeLoading] = useState(true);
  const coursesRef = useRef([]);

  // Charger le mode dispatch
  useEffect(() => {
    const loadMode = async () => {
      try {
        const rows = await base44.entities.DispatchModeState.list('-updated_date', 1);
        const currentMode = rows[0]?.mode || 'auto';
        setMode(currentMode);
        setModeLoading(false);
      } catch (e) {
        console.log('[MANUAL_DISPATCH_HOOK] mode load error:', e?.message);
        setModeLoading(false);
      }
    };
    loadMode();

    // Subscription mode temps réel
    const unsubMode = base44.entities.DispatchModeState.subscribe((ev) => {
      if (ev.data?.mode) {
        setMode(ev.data.mode);
      }
    });

    return () => { if (unsubMode) unsubMode(); };
  }, []);

  // Subscription Course — TEMPS RÉEL IMMÉDIAT
  useEffect(() => {
    const unsub = base44.entities.Course.subscribe((ev) => {
      const timestamp = new Date().toISOString();
      
      console.log(`[NOTIFICATION_RECEIVED] ${timestamp} | type: ${ev.type} | id: ${ev.id} | statut: ${ev.data?.statut}`);

      if (ev.type === "create") {
        console.log(`[COURSE_CREATED] ${timestamp} | id: ${ev.id} | statut: ${ev.data?.statut} | mode_assignation: ${ev.data?.mode_assignation}`);
        
        if (ev.data?.statut === "en_attente" && !ev.data?.moyen_transport) {
          const now = Date.now();
          setPendingCourses(prev => {
            if (prev.find(c => c.id === ev.id)) return prev;
            const newCourses = [ev.data, ...prev];
            console.log(`[BLOC_VISIBLE] ${timestamp} | course added to visible list | total: ${newCourses.length} | latency_ms: ${Date.now() - now}`);
            return newCourses;
          });
        }
      } else if (ev.type === "update") {
        if (!ev.data || ev.data.statut !== "en_attente") {
          setPendingCourses(prev => prev.filter(c => c.id !== ev.id));
        } else {
          setPendingCourses(prev => prev.map(c => c.id === ev.id ? ev.data : c));
        }
      } else if (ev.type === "delete") {
        setPendingCourses(prev => prev.filter(c => c.id !== ev.id));
      }
    });

    console.log('[MANUAL_DISPATCH_HOOK] Course subscription active');

    // Charger l'état initial
    base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 10)
      .then(data => {
        const arr = Array.isArray(data) ? data.filter(c => !c.is_deleted && !c.moyen_transport) : [];
        coursesRef.current = arr;
        setPendingCourses(arr);
        console.log('[MANUAL_DISPATCH_HOOK] Initial load:', arr.length, 'pending courses');
      })
      .catch((e) => console.log('[MANUAL_DISPATCH_HOOK] Initial load error:', e?.message));

    return () => { if (unsub) unsub(); };
  }, []);

  const handleDismiss = useCallback((id) => {
    setDismissed(prev => new Set([...prev, id]));
  }, []);

  const clearDismissed = useCallback(() => {
    setDismissed(new Set());
  }, []);

  // Filtrer les courses non dismiss
  const visibleCourses = pendingCourses.filter(c => !dismissed.has(c.id));

  // N'afficher qu'en mode manuel
  const shouldDisplay = !modeLoading && mode === "manuel" && visibleCourses.length > 0;

  return {
    visibleCourses,
    pendingCourses,
    dismissed,
    mode,
    modeLoading,
    shouldDisplay,
    handleDismiss,
    clearDismissed,
  };
}