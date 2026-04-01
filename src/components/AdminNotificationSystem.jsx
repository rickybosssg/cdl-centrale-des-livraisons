import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

export default function AdminNotificationSystem() {
  const [notifications, setNotifications] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [adminEmail, setAdminEmail] = useState(null);

  useEffect(() => {
    const init = async () => {
      const me = await base44.auth.me();
      setAdminEmail(me?.email);

      // Charger les notifications existantes
      if (me?.email) {
        const notifs = await base44.entities.Notification.filter({
          destinataire_email: me.email,
          lue: false,
        }, "-created_date", 10);
        setNotifications(notifs || []);
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (!adminEmail) return;

    // S'abonner aux nouvelles notifications
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.data?.destinataire_email === adminEmail && !event.data?.lue) {
        if (event.type === 'create') {
          setNotifications(prev => [event.data, ...prev]);
          // Notification système
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('CDL Alert', {
              body: event.data.message,
              icon: '🔔',
            });
          }
        }
      }
    });

    return unsub;
  }, [adminEmail]);

  const unreadCount = notifications.length;

  const markAsRead = async (notifId) => {
    await base44.entities.Notification.update(notifId, { lue: true });
    setNotifications(prev => prev.filter(n => n.id !== notifId));
  };

  const typeConfig = {
    success: { emoji: '✅', color: 'bg-green-50 border-green-200' },
    warning: { emoji: '⚠️', color: 'bg-amber-50 border-amber-200' },
    info: { emoji: 'ℹ️', color: 'bg-blue-50 border-blue-200' },
    danger: { emoji: '🚨', color: 'bg-red-50 border-red-200' },
  };

  return (
    <div className="relative">
      {/* Badge notification */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panneau notifications */}
      {showPanel && (
        <div className="absolute top-12 right-0 w-80 max-h-96 bg-white rounded-xl border-2 border-border shadow-lg z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
            <p className="font-bold">Notifications</p>
            <Button variant="ghost" size="icon" onClick={() => setShowPanel(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Contenu */}
          {notifications.length === 0 ? (
            <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
              Aucune notification
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 space-y-1 p-2">
              {notifications.map(notif => {
                const cfg = typeConfig[notif.type] || typeConfig.info;
                return (
                  <div key={notif.id} className={`p-3 rounded-lg border ${cfg.color} cursor-pointer hover:opacity-80 transition-opacity`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{notif.titre}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {moment(notif.created_date).fromNow()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(notif.id)}
                        className="text-xs"
                      >
                        ✓
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}