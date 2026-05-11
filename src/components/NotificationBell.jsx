import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import { vibrateNotif, vibrateCritical, playNotificationSound, playNotificationSoundCritical } from "@/lib/vibration";
import { resolveNotifPriority } from "@/lib/notificationRouter";

import { motion } from "framer-motion";
import NotificationPanel from "./NotificationPanel";
import { useTopNotification } from "@/context/TopNotificationContext";

export default function NotificationBell({ userEmail }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const { showNotification } = useTopNotification();

  const loadNotifs = async () => {
    if (!userEmail) return;
    try {
      const data = await base44.entities.Notification.filter({ destinataire_email: userEmail }, "-created_date", 30);
      const notifList = Array.isArray(data) ? data : [];
      setNotifs(notifList);
      // Badge navigateur (PWA)
      const unreadCount = notifList.filter(n => !n.lue).length;
      try {
        if ('setAppBadge' in navigator) navigator.setAppBadge(unreadCount || 0);
      } catch (_) {}
    } catch (err) {
      console.warn('[NotificationBell] Load error:', err?.message);
    }
  };

  useEffect(() => {
    if (!userEmail) return;

    const isNative = (() => { try { const p = window.location?.protocol; return p === 'capacitor:' || p === 'file:' || (typeof window.Capacitor !== 'undefined'); } catch(_) { return false; } })();

    console.log(`[APK_NOTIFICATION_RUNTIME_CHECK] platform=${isNative ? 'capacitor_android' : 'web'} | user=${userEmail} | subscribe_start=true`);

    let isMounted = true;
    let wsActive = false;

    const initialTimer = setTimeout(() => {
      if (isMounted) loadNotifs();
    }, 1500);

    // Sur natif : poll 30s (WebSocket peut être tué par Android en arrière-plan)
    // Sur web : poll 2min (WebSocket suffit)
    const pollInterval = isNative ? 30000 : 120000;
    const interval = setInterval(() => {
      if (isMounted) loadNotifs();
    }, pollInterval);

    console.log(`[APK_NOTIFICATION_RUNTIME_CHECK] poll_interval=${pollInterval}ms | websocket_subscribe_starting=true`);

    // WebSocket — tenté sur web ET natif
    let unsub = null;
    try {
      unsub = base44.entities.Notification.subscribe((event) => {
        try {
          if (!wsActive) {
            wsActive = true;
            console.log(`[APK_NOTIFICATION_RUNTIME_CHECK] websocket_connected=true | first_event_type=${event.type} | platform=${isNative ? 'capacitor' : 'web'}`);
          }
          if (!isMounted || event.data?.destinataire_email !== userEmail) return;
          if (event.type === 'create') {
            const newNotif = event.data;
            console.log(`[APK_NOTIFICATION_RUNTIME_CHECK] last_notification_event_received=${new Date().toISOString()} | titre="${newNotif.titre}" | platform=${isNative ? 'capacitor' : 'web'}`);
            setNotifs(prev => [newNotif, ...prev]);
            const priority = resolveNotifPriority(newNotif);
            if (priority === 'critical') {
              try { vibrateCritical(); } catch (_) {}
              try { playNotificationSoundCritical(); } catch (_) {}
            } else {
              try { vibrateNotif(); } catch (_) {}
              try { playNotificationSound(); } catch (_) {}
            }
            try {
              showNotification({
                title: newNotif.titre,
                message: newNotif.message,
                type: priority === 'critical' ? 'error' : (newNotif.type === 'success' ? 'success' : 'info'),
                autoCloseDuration: priority === 'critical' ? 12000 : 7000,
              });
            } catch (_) {}
          } else if (event.type === 'update') {
            setNotifs(prev => {
              const updated = prev.map(n => n.id === event.id ? event.data : n);
              const unreadCount = updated.filter(n => !n.lue).length;
              try { if ('setAppBadge' in navigator) navigator.setAppBadge(unreadCount || 0); } catch (_) {}
              return updated;
            });
          }
        } catch (err) {
          console.warn('[NOTIFICATIONS] event handler error (non-fatal):', err?.message);
        }
      });
      console.log(`[APK_NOTIFICATION_RUNTIME_CHECK] notification_subscribe_active=true | websocket_started=true`);
    } catch (err) {
      console.warn(`[APK_NOTIFICATION_RUNTIME_CHECK] subscribe_error=${err?.message} | websocket_connected=false`);
    }

    // Sur natif : vérifier le token FCM après 5s
    if (isNative) {
      setTimeout(async () => {
        try {
          const { getFcmTokens } = await import('@/api/base44Client').then(m => ({ getFcmTokens: null }));
          // Log diagnostic token FCM côté APK
          const stored = localStorage.getItem('cdl_fcm_token_saved');
          const lastPush = localStorage.getItem('cdl_last_push_received');
          console.log(`[APK_NOTIFICATION_RUNTIME_CHECK] fcm_token_saved=${!!stored} | last_push_event_received=${lastPush || 'never'} | platform=capacitor_android`);
        } catch (_) {}
      }, 5000);
    }

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
      try { if (unsub) unsub(); } catch (_) {}
    };
  }, [userEmail]);

  const unread = notifs.filter(n => !n.lue).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-3 -m-3 flex items-center justify-center rounded-lg hover:bg-primary/10 transition-colors active:bg-primary/20 press-effect touch-target"
        style={{ minWidth: '44px', minHeight: '44px' }}
      >
        <Bell className={`h-5 w-5 transition-colors ${unread > 0 ? 'text-red-500' : 'text-foreground'}`} />
        {unread > 0 && (
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.6, repeat: Infinity }}
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shadow-lg border border-white"
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </button>

      <NotificationPanel
        open={open}
        onClose={() => setOpen(false)}
        notifs={notifs}
        setNotifs={setNotifs}
        userEmail={userEmail}
      />
    </div>
  );
}