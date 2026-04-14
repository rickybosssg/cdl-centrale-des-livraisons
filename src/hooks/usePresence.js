import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const HEARTBEAT_INTERVAL = 30000; // 30s

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
    base44.auth.updateMe(buildOnlineFields(true)).catch(() => {});
  };

  const markOffline = () => {
    if (!userEmail) return;
    base44.auth.updateMe(buildOnlineFields(false)).catch(() => {});
  };

  useEffect(() => {
    if (!userEmail) return;

    ping();
    intervalRef.current = setInterval(ping, HEARTBEAT_INTERVAL);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") ping();
      else markOffline();
    };
    const onBeforeUnload = () => markOffline();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      markOffline();
    };
  }, [userEmail, currentRole]);
}