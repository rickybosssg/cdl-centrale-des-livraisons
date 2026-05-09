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
    console.log('[NOTIFICATIONS] init start');
    let isMounted = true;

    // Détection APK natif
    const isNative = (() => { try { const p = window.location?.protocol; return p === 'capacitor:' || p === 'file:' || (typeof window.Capacitor !== 'undefined'); } catch(_) { return false; } })();

    const initialTimer = setTimeout(() => {
      if (isMounted) loadNotifs();
    }, 3000);

    // Sur natif : poll 5min. Sur web : poll 2min
    const interval = setInterval(() => {
      if (isMounted) loadNotifs();
    }, isNative ? 300000 : 120000);

    // WebSocket sur web ET natif — le polling reste en backup
    let unsub = null;
    try {
        unsub = base44.entities.Notification.subscribe((event) => {
          try {
            if (!isMounted || event.data?.destinataire_email !== userEmail) return;
            if (event.type === 'create') {
              const newNotif = event.data;
              setNotifs(prev => [newNotif, ...prev]);
              // Son + vibration différenciés par priorité
              const priority = resolveNotifPriority(newNotif);
              if (priority === 'critical') {
                try { vibrateCritical(); } catch (_) {}
                try { playNotificationSoundCritical(); } catch (_) {}
              } else {
                try { vibrateNotif(); } catch (_) {}
                try { playNotificationSound(); } catch (_) {}
              }
              // Toast in-app
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
    } catch (err) {
      console.warn('[NOTIFICATIONS] subscribe error (non-fatal):', err?.message);
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