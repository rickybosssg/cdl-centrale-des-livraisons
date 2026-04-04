import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import { vibrateNotif, playNotificationSound } from "@/lib/vibration";
import { requestNotificationPermission, registerFcmToken, onForegroundMessage, sendPushNotification } from "@/lib/pushNotifications";
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
      setNotifs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[NotificationBell] Load error:', err?.message);
    }
  };

  const initFcm = async () => {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    const token = await registerFcmToken();
    if (token) {
      await base44.functions.invoke('saveFcmToken', { token });
      onForegroundMessage((payload) => {
        if (payload.notification) {
          vibrateNotif();
          playNotificationSound();
          showNotification({
            title: payload.notification.title,
            message: payload.notification.body,
            type: 'info',
            autoCloseDuration: 8000,
          });
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
        // Afficher la bannière top in-app
        showNotification({
          title: event.data.titre,
          message: event.data.message,
          type: event.data.type === 'danger' ? 'error' : (event.data.type || 'info'),
          autoCloseDuration: event.data.priority === 'high' ? 12000 : 7000,
        });
        // Envoyer une notification Web native si permission accordée (app en foreground)
        sendPushNotification(event.data.titre, event.data.message);
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