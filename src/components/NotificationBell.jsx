import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import { vibrateNotif, playNotificationSound } from "@/lib/vibration";
import { motion, AnimatePresence } from "framer-motion";

export default function NotificationBell({ userEmail }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);

  const loadNotifs = async () => {
    if (!userEmail) return;
    const data = await base44.entities.Notification.filter({ destinataire_email: userEmail }, "-created_date", 20);
    setNotifs(data);
  };

  useEffect(() => {
    loadNotifs();
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.data?.destinataire_email === userEmail) {
        if (event.type === 'create') {
          setNotifs(prev => [event.data, ...prev]);
          playNotificationSound();
          vibrateNotif();
        } else if (event.type === 'update') {
          setNotifs(prev => prev.map(n => n.id === event.id ? event.data : n));
        }
      }
    });
    return unsub;
  }, [userEmail]);

  const unread = notifs.filter(n => !n.lue).length;

  const markAllRead = async () => {
    const unreadOnes = notifs.filter(n => !n.lue);
    for (const n of unreadOnes) {
      await base44.entities.Notification.update(n.id, { lue: true });
    }
    setNotifs(prev => prev.map(n => ({ ...n, lue: true })));
  };

  const TYPE_COLORS = {
    success: "border-l-green-500 bg-green-50",
    info: "border-l-blue-500 bg-blue-50",
    warning: "border-l-amber-500 bg-amber-50",
    danger: "border-l-red-500 bg-red-50",
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open && unread > 0) markAllRead(); }}
        className="relative h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-10 z-50 w-80 max-h-96 overflow-y-auto rounded-xl border bg-card shadow-xl"
            >
              <div className="sticky top-0 bg-card border-b px-4 py-3 flex items-center justify-between">
                <p className="font-semibold text-sm">Notifications</p>
                {notifs.length > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                    Tout marquer lu
                  </button>
                )}
              </div>
              {notifs.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Aucune notification
                </div>
              ) : (
                <div className="divide-y">
                  {notifs.map(n => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 border-l-4 ${TYPE_COLORS[n.type] || 'border-l-muted bg-background'} ${!n.lue ? 'font-medium' : 'opacity-70'}`}
                    >
                      <p className="text-xs font-semibold">{n.titre}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(n.created_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}