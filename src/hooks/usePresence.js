import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const HEARTBEAT_INTERVAL = 30000; // 30s
const OFFLINE_DELAY = 180000; // 3 minutes sans ping → hors ligne

export default function usePresence(userEmail) {
  const intervalRef = useRef(null);

  const ping = () => {
    if (!userEmail) return;
    base44.auth.updateMe({ last_seen: new Date().toISOString() }).catch(() => {});
  };

  const markOffline = () => {
    if (!userEmail) return;
    // On met last_seen à une date ancienne pour le marquer hors ligne immédiatement
    const offlineTime = new Date(Date.now() - OFFLINE_DELAY).toISOString();
    base44.auth.updateMe({ last_seen: offlineTime }).catch(() => {});
  };

  useEffect(() => {
    if (!userEmail) return;

    // Ping immédiat au mount
    ping();

    // Ping régulier
    intervalRef.current = setInterval(ping, HEARTBEAT_INTERVAL);

    // Retour au premier plan → ping immédiat
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        ping();
      } else {
        // Onglet masqué → marquer hors ligne
        markOffline();
      }
    };

    // Fermeture de page → marquer hors ligne
    const onBeforeUnload = () => {
      markOffline();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Marquer hors ligne au démontage
      markOffline();
    };
  }, [userEmail]);
}