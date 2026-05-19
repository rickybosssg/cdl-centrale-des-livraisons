import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const HEARTBEAT_INTERVAL = 60000; // 60s — réduit la charge réseau sur APK

/**
 * usePresence — Heartbeat frontend → driverPresenceEngine (backend).
 *
 * RÔLE : purement visuel + signal périodique.
 * AUCUNE logique métier ici — tout est dans driverPresenceEngine (backend).
 *
 * Architecture :
 *   1. HEARTBEAT toutes les 60s → driverPresenceEngine (last_seen, driver_online)
 *   2. MARK_OFFLINE au beforeunload / visibilitychange → auth.updateMe (direct, rapide)
 *   3. SWEEP_STALE (cron 5min) → driverPresenceEngine.SWEEP_STALE marque hors-ligne
 *      les livreurs sans heartbeat depuis > 5min (détection passive de déconnexion)
 *
 * RÈGLE TIMER : les setInterval/setTimeout ici sont UNIQUEMENT des déclencheurs.
 *   Zéro logique métier dans les callbacks — uniquement des appels backend.
 *
 * @param {string} userEmail
 * @param {string} currentRole - 'client' | 'livreur' | 'commercial' | 'partenaire'
 */
export default function usePresence(userEmail, currentRole) {
  const intervalRef = useRef(null);

  // ── Heartbeat backend — SOURCE UNIQUE BACKEND via driverPresenceEngine ────
  const ping = () => {
    if (!userEmail) return;
    base44.functions.invoke('driverPresenceEngine', {
      action: 'HEARTBEAT',
      email: userEmail,
      role: currentRole || 'client',
    }).catch(() => {
      // Fallback silencieux : mise à jour directe last_seen si fonction indisponible
      base44.auth.updateMe({ last_seen: new Date().toISOString() }).catch(() => {});
    });
  };

  // ── Mise hors-ligne — directe (avant fermeture, pas le temps d'attendre une fonction) ──
  const markOffline = () => {
    if (!userEmail) return;
    // Direct pour la rapidité au beforeunload
    base44.auth.updateMe({
      last_seen: new Date(0).toISOString(), // epoch = stale immédiat pour le sweep
      driver_online: false,
      client_online: false,
      commercial_online: false,
      partner_online: false,
    }).catch(() => {});
  };

  useEffect(() => {
    if (!userEmail) return;

    // Délai 2s avant le premier ping pour laisser le dashboard se stabiliser
    // RÈGLE TIMER : déclencheur uniquement — pas de logique métier ici
    const initTimer = setTimeout(() => { ping(); }, 2000);

    // RÈGLE TIMER : setInterval = déclencheur périodique uniquement
    intervalRef.current = setInterval(() => { ping(); }, HEARTBEAT_INTERVAL);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") ping();
      else markOffline();
    };
    const onBeforeUnload = () => { markOffline(); };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      clearTimeout(initTimer);
      clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      markOffline();
    };
  }, [userEmail, currentRole]);
}