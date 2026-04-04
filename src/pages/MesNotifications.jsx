import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Info, AlertTriangle, XCircle } from "lucide-react";
import { resolveNotifRoute, resolveActionLabel } from "@/lib/notificationRouter";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Bell, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";

const TYPE_CFG = {
  success: { bg: "bg-green-50 border-green-200", dot: "bg-green-500", icon: "✅" },
  info:    { bg: "bg-blue-50 border-blue-200",   dot: "bg-blue-500",  icon: "ℹ️" },
  warning: { bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500", icon: "⚠️" },
  danger:  { bg: "bg-red-50 border-red-200",     dot: "bg-red-500",   icon: "❌" },
};

function getNavPath(notif) {
  return resolveNotifRoute(notif);
}

const TYPE_LABELS = {
  success: '✅ Succès',
  info: 'ℹ️ Information',
  warning: '⚠️ Avertissement',
  danger: '🚨 Alerte',
};

function NotifDetailModal({ notif, onClose, onNavigate }) {
  if (!notif) return null;
  const cfg = TYPE_CFG[notif.type] || TYPE_CFG.info;
  const route = getNavPath(notif);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 60, scale: 0.96 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className={`px-5 py-4 border-l-4 ${cfg.bg} flex items-start gap-3`}>
          <span className="text-2xl flex-shrink-0">{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base text-foreground leading-snug">{notif.titre}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {TYPE_LABELS[notif.type] || 'Notification'} · {moment(notif.created_date).format('DD/MM/YYYY à HH:mm')}
            </p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 p-1 rounded-full hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 max-h-64 overflow-y-auto">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{notif.message}</p>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          {route && (
            <button
              onClick={() => onNavigate(route)}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
            >
              {resolveActionLabel(route, notif.destinataire_role)}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-semibold text-muted-foreground">
            Fermer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function MesNotifications() {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | unread
  const [searchQuery, setSearchQuery] = useState('');
  const [detailNotif, setDetailNotif] = useState(null);

  const load = async () => {
    const me = await base44.auth.me();
    const data = await base44.entities.Notification.filter(
      { destinataire_email: me.email },
      "-created_date",
      100
    );
    setNotifs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    let userEmail = null;
    load().then(async () => {
      const me = await base44.auth.me();
      userEmail = me?.email;
    });
    const unsub = base44.entities.Notification.subscribe((event) => {
      // Filtrer uniquement les notifications de l'utilisateur courant
      if (userEmail && event.data?.destinataire_email && event.data.destinataire_email !== userEmail) return;
      if (event.type === "create") setNotifs(prev => [event.data, ...prev]);
      else if (event.type === "update") setNotifs(prev => prev.map(n => n.id === event.id ? event.data : n));
      else if (event.type === "delete") setNotifs(prev => prev.filter(n => n.id !== event.id));
    });
    return unsub;
  }, []);

  const markAllRead = async () => {
    const unread = notifs.filter(n => !n.lue);
    await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { lue: true })));
    setNotifs(prev => prev.map(n => ({ ...n, lue: true })));
    toast.success("Toutes les notifications marquées comme lues");
  };

  const markRead = async (notif) => {
    // Marquer comme lu
    if (!notif.lue) {
      await base44.entities.Notification.update(notif.id, { lue: true });
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, lue: true } : n));
    }
    // Ouvrir la modal détail
    setDetailNotif(notif);
  };

  const handleNavigate = (route) => {
    setDetailNotif(null);
    navigate(route);
  };

  const deleteNotif = async (e, id) => {
    e.stopPropagation();
    await base44.entities.Notification.delete(id);
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const filtered = (filter === "unread" ? notifs.filter(n => !n.lue) : notifs).filter(n => {
    const search = searchQuery.toLowerCase();
    return !search || 
      n.titre?.toLowerCase().includes(search) ||
      n.message?.toLowerCase().includes(search);
  });
  const unreadCount = notifs.filter(n => !n.lue).length;

  return (
    <div className="space-y-4 pb-16">
      <AnimatePresence>
        {detailNotif && (
          <NotifDetailModal
            notif={detailNotif}
            onClose={() => setDetailNotif(null)}
            onNavigate={handleNavigate}
          />
        )}
      </AnimatePresence>
      {/* Header */}
      <div className="flex items-center gap-3 sticky top-0 bg-background z-10 py-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bell className="h-5 w-5" /> Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-xs text-muted-foreground">{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5 text-xs">
            <CheckCheck className="h-3.5 w-3.5" /> Tout lire
          </Button>
        )}
      </div>

      {/* RECHERCHE ET FILTRE */}
      <div className="space-y-3 p-3 rounded-xl bg-muted/40 border">
        <input
          type="text"
          placeholder="Rechercher dans les notifications..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="flex gap-2">
          {["all", "unread"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filter === f
                  ? "bg-primary text-white border-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {f === "all" ? `Toutes (${notifs.length})` : `Non lues (${unreadCount})`}
            </button>
          ))}
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="w-full text-xs font-medium text-primary hover:underline"
          >
            ↻ Réinitialiser recherche
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Vide */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground font-medium">
            {filter === "unread" ? "Aucune notification non lue" : "Aucune notification"}
          </p>
        </div>
      )}

      {/* Liste */}
      <div className="space-y-2">
        {filtered.map(notif => {
          const cfg = TYPE_CFG[notif.type] || TYPE_CFG.info;
          const hasAction = !!getNavPath(notif);
          return (
            <div
              key={notif.id}
              onClick={() => markRead(notif)}
              className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${cfg.bg} ${
                !notif.lue ? "shadow-sm" : "opacity-70"
              } ${hasAction ? "cursor-pointer active:scale-[0.99]" : ""}`}
            >
              {/* Dot non lu */}
              <div className="flex-shrink-0 mt-1 relative">
                <span className="text-xl">{cfg.icon}</span>
                {!notif.lue && (
                  <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ${cfg.dot} border-2 border-white`} />
                )}
              </div>

              {/* Contenu */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${!notif.lue ? "" : "text-muted-foreground"}`}>
                  {notif.titre}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{notif.message}</p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {moment(notif.created_date).fromNow()}
                </p>
              </div>

              {/* Supprimer */}
              <button
                onClick={(e) => deleteNotif(e, notif.id)}
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-black/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}