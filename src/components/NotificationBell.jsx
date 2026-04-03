import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import { vibrateNotif, playNotificationSound } from "@/lib/vibration";
import { requestNotificationPermission, registerFcmToken, onForegroundMessage } from "@/lib/pushNotifications";
import { motion } from "framer-motion";
import NotificationPanel from "./NotificationPanel";

export default function NotificationBell({ userEmail }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const loadTimerRef = useState(null)[0];

  const loadNotifs = async () => {
    if (!userEmail) return;
    try {
      const data = await base44.entities.Notification.filter({ destinataire_email: userEmail }, "-created_date", 30);
      setNotifs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[NotificationBell] Load error:', err?.message);
      // Silently fail, subscription will handle updates
    }
  };

  const initFcm = async () => {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    const token = await registerFcmToken();
    if (token) {
      await base44.functions.invoke('saveFcmToken', { token });
      // Écouter les messages FCM en premier plan
      onForegroundMessage((payload) => {
        if (payload.notification) {
          vibrateNotif();
          playNotificationSound();
        }
      });
    }
  };

  useEffect(() => {
    if (!userEmail) return;
    let isMounted = true;
    
    // Charge les notifs UNE SEULE FOIS au mount (après 500ms de délai)
    const initialTimer = setTimeout(() => {
      if (isMounted) loadNotifs();
    }, 500);
    
    initFcm();
    
    // Recharge toutes les 120 secondes (délai long pour éviter rate limit)
    const interval = setInterval(() => {
      if (isMounted) loadNotifs();
    }, 120000);
    
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (!isMounted || event.data?.destinataire_email !== userEmail) return;
      if (event.type === 'create') {
        setNotifs(prev => [event.data, ...prev]);
        vibrateNotif();
        playNotificationSound();
      } else if (event.type === 'update') {
        setNotifs(prev => prev.map(n => n.id === event.id ? event.data : n));
      }
    });
    
    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
      if (unsub) unsub();
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