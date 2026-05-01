import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const HEARTBEAT_INTERVAL = 60000; // 60s — réduit la charge réseau sur APK

/**
 * usePresence — met à jour last_seen + statut en ligne par rôle actif.
 * @param {string} userEmail
 * @param {string} currentRole - 'client' | 'livreur' | 'commercial' | 'partenaire'
 */
export default function usePresence(userEmail, currentRole) {
  const intervalRef = useRef(null);

  const buildOnlineFields = (online) => {
    const fields = { last_seen: online ? new Date().toISOString() : new Date(0).toISOString() };
    if (!online) {
      // Mise hors ligne : réinitialiser TOUS les statuts en ligne
      fields.driver_online = false;
      fields.client_online = false;
      fields.commercial_online = false;
      fields.partner_online = false;
      // NE PAS effacer current_role — il est géré par switchActiveProfile
    } else {
      // ⚠️ Toujours synchroniser current_role avec le rôle actif lors du heartbeat
      fields.current_role = currentRole;
      if (currentRole === 'livreur') {
        fields.driver_online = true;
      } else if (currentRole === 'client') {
        fields.client_online = true;
      } else if (currentRole === 'commercial') {
        fields.commercial_online = true;
      } else if (currentRole === 'partenaire') {
        fields.partner_online = true;
      }
    }
    return fields;
  };

  const ping = () => {
    if (!userEmail) return;
    try {
      base44.auth.updateMe(buildOnlineFields(true)).catch(() => {});
    } catch (_) {}
  };

  const markOffline = () => {
    if (!userEmail) return;
    try {
      base44.auth.updateMe(buildOnlineFields(false)).catch(() => {});
    } catch (_) {}
  };

  useEffect(() => {
    if (!userEmail) return;

    // Délai 2s avant le premier ping pour laisser le dashboard se stabiliser
    const initTimer = setTimeout(() => {
      try { ping(); } catch (_) {}
    }, 2000);

    intervalRef.current = setInterval(() => {
      try { ping(); } catch (_) {}
    }, HEARTBEAT_INTERVAL);

    const onVisibilityChange = () => {
      try {
        if (document.visibilityState === "visible") ping();
        else markOffline();
      } catch (_) {}
    };
    const onBeforeUnload = () => { try { markOffline(); } catch (_) {} };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      clearTimeout(initTimer);
      clearInterval(intervalRef.current);
      try { document.removeEventListener("visibilitychange", onVisibilityChange); } catch (_) {}
      try { window.removeEventListener("beforeunload", onBeforeUnload); } catch (_) {}
      markOffline();
    };
  }, [userEmail, currentRole]);
}