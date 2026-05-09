import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, CheckCheck, Trash2, ArrowLeft } from "lucide-react";
import { resolveNotifRoute, resolveActionLabel, resolveNotifIcon, resolveNotifPriority, resolveQuickActions } from "@/lib/notificationRouter";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";

// Config par priorité
const PRIORITY_CFG = {
  critical: { bg: "bg-red-50",    bar: "border-l-red-500",    dot: "bg-red-500" },
  normal:   { bg: "bg-amber-50",  bar: "border-l-amber-400",  dot: "bg-amber-400" },
  info:     { bg: "bg-blue-50",   bar: "border-l-blue-400",   dot: "bg-blue-400" },
};

function NotifDetailModal({ notif, onClose, onNavigate }) {
  if (!notif) return null;
  const priority = resolveNotifPriority(notif);
  const pCfg = PRIORITY_CFG[priority] || PRIORITY_CFG.info;
  const icon = resolveNotifIcon(notif);
  const route = resolveNotifRoute(notif);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header coloré avec icône emoji */}
        <div className={`px-5 py-4 border-l-4 ${pCfg.bar} ${pCfg.bg}`}>
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/80 flex items-center justify-center text-2xl shadow-sm flex-shrink-0 border border-border/20">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-base text-foreground leading-snug">{notif.titre}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{moment(notif.created_date).format("DD/MM/YYYY à HH:mm")}</p>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-full bg-black/10 flex items-center justify-center flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Message */}
        <div className="px-5 py-5 max-h-52 overflow-y-auto">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{notif.message}</p>
        </div>
        {/* Actions */}
        <div className="px-5 pb-6 flex gap-3">
          {route && (
            <button onClick={() => onNavigate(route)} className="flex-1 py-3.5 rounded-2xl bg-primary text-white text-sm font-bold shadow-md shadow-primary/25 active:scale-95 transition-all">
              {resolveActionLabel(route, notif.destinataire_role)}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
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
  const [filter, setFilter] = useState("all");
  const [detailNotif, setDetailNotif] = useState(null);

  const load = async () => {
    const me = await base44.auth.me();
    const data = await base44.entities.Notification.filter({ destinataire_email: me.email }, "-created_date", 100);
    setNotifs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    let userEmail = null;
    base44.auth.me().then(me => { userEmail = me?.email; });
    load();
    const unsub = base44.entities.Notification.subscribe((event) => {
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
    if (!notif.lue) {
      await base44.entities.Notification.update(notif.id, { lue: true });
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, lue: true } : n));
    }
    setDetailNotif(notif);
  };

  const handleNavigate = (route) => { setDetailNotif(null); navigate(route); };

  const deleteNotif = async (e, id) => {
    e.stopPropagation();
    await base44.entities.Notification.delete(id);
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const filtered = (() => {
    if (filter === "unread") return notifs.filter(n => !n.lue);
    if (filter === "critical") return notifs.filter(n => resolveNotifPriority(n) === 'critical');
    if (filter === "normal") return notifs.filter(n => resolveNotifPriority(n) === 'normal');
    return notifs;
  })();
  const unreadCount = notifs.filter(n => !n.lue).length;

  return (
    <div className="pb-16 min-h-screen bg-background">
      <AnimatePresence>
        {detailNotif && <NotifDetailModal notif={detailNotif} onClose={() => setDetailNotif(null)} onNavigate={handleNavigate} />}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-gradient-to-br from-[#1E6BFF] to-[#0F2A5C] px-4 pt-5 pb-6 rounded-b-[2rem] text-white shadow-lg">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-extrabold">Notifications</h1>
            <p className="text-xs text-white/60">{unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est à jour ✓"}</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 text-white text-xs font-semibold border border-white/30">
              <CheckCheck className="h-3.5 w-3.5" /> Tout lire
            </button>
          )}
        </div>
      </div>



      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Vide */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 space-y-3 px-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Bell className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-muted-foreground font-semibold">
            {filter === "unread" ? "Aucune notification non lue 🎉" : "Aucune notification"}
          </p>
        </div>
      )}

      {/* Filtre par priorité */}
      <div className="px-4 mt-3 flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "all",      label: `Toutes (${notifs.length})` },
          { key: "unread",   label: `Non lues (${unreadCount})` },
          { key: "critical", label: "⚠️ Critiques" },
          { key: "normal",   label: "🔔 Normales" },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filter === f.key ? "bg-primary text-white border-primary shadow-sm" : "bg-white border-border text-muted-foreground"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="px-4 mt-3 space-y-2">
        <AnimatePresence>
          {filtered.map(notif => {
            const priority = resolveNotifPriority(notif);
            const pCfg = PRIORITY_CFG[priority] || PRIORITY_CFG.info;
            const icon = resolveNotifIcon(notif);
            const hasAction = !!resolveNotifRoute(notif);
            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className={`rounded-2xl border border-l-4 ${pCfg.bar} ${!notif.lue ? pCfg.bg : 'bg-white'} shadow-sm transition-all ${!notif.lue ? "" : "opacity-60"}`}
              >
                {/* Ligne principale */}
                <div
                  onClick={() => markRead(notif)}
                  className={`flex items-start gap-3 p-4 pb-3 ${hasAction ? "cursor-pointer active:scale-[0.99]" : ""}`}
                >
                  {/* Icône emoji + dot non-lu */}
                  <div className="flex-shrink-0 mt-0.5 relative">
                    <div className="h-10 w-10 rounded-xl bg-white/90 border border-border/30 flex items-center justify-center text-xl shadow-sm">
                      {icon}
                    </div>
                    {!notif.lue && (
                      <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${pCfg.dot} border-2 border-white`} />
                    )}
                  </div>
                  {/* Contenu */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold leading-snug ${!notif.lue ? "text-foreground" : "text-muted-foreground"}`}>
                      {notif.titre}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{moment(notif.created_date).fromNow()}</p>
                  </div>
                  {/* Supprimer */}
                  <button onClick={(e) => deleteNotif(e, notif.id)} className="flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                {/* Actions rapides contextuelles */}
                {(() => {
                  const actions = resolveQuickActions(notif);
                  if (!actions.length) return null;
                  return (
                    <div className="px-4 pb-3 flex gap-2">
                      {actions.map((action, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleNavigate(action.route)}
                          className="flex-1 py-2 px-3 rounded-xl bg-primary text-white text-xs font-bold shadow-sm active:scale-95 transition-all text-center"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}