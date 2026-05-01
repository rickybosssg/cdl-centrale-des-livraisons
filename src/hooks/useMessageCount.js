import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export function useMessageCount(userEmail, userRole) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userEmail) return;

    let isMounted = true;

    // Détection APK natif
    const isNative = (() => { try { const p = window.location?.protocol; return p === 'capacitor:' || p === 'file:' || (typeof window.Capacitor !== 'undefined'); } catch(_) { return false; } })();

    const loadCount = async () => {
      if (!isMounted) return;
      try {
        if (userRole === "admin") {
          const messages = await base44.entities.MessageAdmin.list("-created_date", 50);
          if (isMounted) setUnreadCount(messages.filter(m => !m.lu_admin).length);
        } else {
          const messages = await base44.entities.MessageAdmin.filter({ livreur_email: userEmail }, "-created_date", 50);
          if (isMounted) setUnreadCount(messages.filter(m => !m.lu_livreur).length);
        }
      } catch (err) {
        console.warn('[useMessageCount] Error (non-fatal):', err?.message);
      }
    };

    // Délai 5s au démarrage pour laisser le dashboard se stabiliser
    const initTimer = setTimeout(() => { if (isMounted) loadCount(); }, 5000);

    // Poll 5min sur natif, pas de poll sur web (WebSocket suffit)
    const interval = isNative ? setInterval(() => { if (isMounted) loadCount(); }, 300000) : null;

    // WebSocket uniquement sur web
    let unsub = null;
    if (!isNative) {
      try {
        unsub = base44.entities.MessageAdmin.subscribe((event) => {
          try {
            if ((event.type === "create" || event.type === "update") && isMounted) {
              loadCount();
            }
          } catch (_) {}
        });
      } catch (err) {
        console.warn('[useMessageCount] subscribe error (non-fatal):', err?.message);
      }
    } else {
      console.log('[useMessageCount] WebSocket SKIPPED on native (polling only)');
    }

    return () => {
      isMounted = false;
      clearTimeout(initTimer);
      if (interval) clearInterval(interval);
      try { if (unsub) unsub(); } catch (_) {}
    };
  }, [userEmail, userRole]);

  return unreadCount > 0;
}