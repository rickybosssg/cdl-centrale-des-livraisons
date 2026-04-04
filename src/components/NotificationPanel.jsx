import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, Check, User, Truck, Megaphone, ShieldCheck, AlertTriangle, Info, CheckCircle2, XCircle, Package } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate, Link } from "react-router-dom";
import moment from "moment";
import { resolveNotifRoute, resolveActionLabel } from "@/lib/notificationRouter";

moment.locale("fr");

// ─── Config par type de notification ───────────────────────────────────────
const TYPE_CONFIG = {
  success:  { color: "bg-green-50 border-l-green-500",  badge: "bg-green-100 text-green-700",  Icon: CheckCircle2 },
  info:     { color: "bg-blue-50 border-l-blue-500",    badge: "bg-blue-100 text-blue-700",    Icon: Info },
  warning:  { color: "bg-amber-50 border-l-amber-500",  badge: "bg-amber-100 text-amber-700",  Icon: AlertTriangle },
  danger:   { color: "bg-red-50 border-l-red-500",      badge: "bg-red-100 text-red-700",      Icon: XCircle },
};

// Détecte le "sujet" d'une notification pour avoir la bonne icône
function getNotifIcon(notif) {
  const t = (notif.titre || "").toLowerCase();
  if (t.includes("livreur"))    return Truck;
  if (t.includes("commercial")) return Megaphone;
  if (t.includes("client"))     return User;
  if (t.includes("validé") || t.includes("validation")) return ShieldCheck;
  if (t.includes("commande") || t.includes("colis")) return Package;
  return (TYPE_CONFIG[notif.type] || TYPE_CONFIG.info).Icon;
}

// Route de navigation — délègue au router centralisé
function getNavRoute(notif) {
  return resolveNotifRoute(notif);
}

// Formate le message (liste si séparateurs, sinon texte)
function FormatMessage({ message, full = false }) {
  if (!message) return null;
  const parts = message.split(/[|•\n]/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    return (
      <div className="space-y-1">
        {parts.map((p, i) => (
          <p key={i} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
        ))}
      </div>
    );
  }
  return (
    <p className={`text-sm text-muted-foreground leading-relaxed ${full ? '' : 'line-clamp-2'}`}>{message}</p>
  );
}

// Labels lisibles par type
const TYPE_LABELS = {
  success: '✅ Succès',
  info: 'ℹ️ Information',
  warning: '⚠️ Avertissement',
  danger: '🚨 Alerte',
};

// Modal détail notification
function NotifDetailModal({ notif, onClose, onNavigate }) {
  if (!notif) return null;
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
  const Icon = getNotifIcon(notif);
  const route = getNavRoute(notif);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 60, scale: 0.96 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        className="w-full max-w-sm bg-card rounded-3xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header coloré */}
        <div className={`px-5 py-4 border-l-4 ${cfg.color} flex items-start gap-3`}>
          <div className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${cfg.badge}`}>
            <Icon className="h-4 w-4" />
          </div>
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

        {/* Message complet scrollable */}
        <div className="px-5 py-4 max-h-60 overflow-y-auto">
          <FormatMessage message={notif.message} full />
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2">
          {route && (
            <button
              onClick={() => onNavigate(route)}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
            >
              {resolveActionLabel(route, notif.destinataire_role)}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border text-sm font-semibold text-muted-foreground"
          >
            Fermer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function NotificationPanel({ open, onClose, notifs, setNotifs, userEmail }) {
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const [detailNotif, setDetailNotif] = useState(null);

  const unread = notifs.filter(n => !n.lue).length;

  const markAllRead = async () => {
    const unreadOnes = notifs.filter(n => !n.lue);
    await Promise.all(unreadOnes.map(n =>
      base44.entities.Notification.update(n.id, { lue: true })
    ));
    setNotifs(prev => prev.map(n => ({ ...n, lue: true })));
  };

  const handleClick = async (notif) => {
    // Marquer comme lu
    if (!notif.lue) {
      await base44.entities.Notification.update(notif.id, { lue: true });
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, lue: true } : n));
    }
    // Ouvrir la modal détail (pas naviguer directement)
    setDetailNotif(notif);
  };

  const handleNavigate = (route) => {
    setDetailNotif(null);
    onClose();
    navigate(route);
  };

  return (
    <AnimatePresence>
      {detailNotif && (
        <NotifDetailModal
          key="detail"
          notif={detailNotif}
          onClose={() => setDetailNotif(null)}
          onNavigate={handleNavigate}
        />
      )}
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[999] bg-black/40"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed z-[1000] bg-card border shadow-2xl rounded-2xl overflow-hidden flex flex-col"
            style={{
              top: "calc(env(safe-area-inset-top) + 60px)",
              right: "12px",
              left: "12px",
              maxWidth: "420px",
              maxHeight: "70vh",
              margin: "0 auto",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-card sticky top-0 z-10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <span className="font-bold text-sm">Notifications</span>
                {unread > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
               {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                >
                  <Check className="h-3 w-3" />
                  Tout lire
                </button>
               )}
               <Link to="/mes-notifications" onClick={onClose} className="text-xs text-muted-foreground hover:underline">Voir tout</Link>
               <button
                onClick={onClose}
                 className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Liste scrollable */}
            <div className="overflow-y-auto flex-1 overscroll-contain">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 px-4">
                  <Bell className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">Aucune notification</p>
                  <p className="text-xs text-muted-foreground/70 text-center">Vous serez notifié ici en temps réel</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {notifs.map(n => {
                    const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
                    const Icon = getNotifIcon(n);

                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`w-full text-left px-4 py-3 border-l-4 transition-all ${cfg.color} ${
                          !n.lue ? "opacity-100" : "opacity-70"
                        } cursor-pointer hover:brightness-95 active:brightness-90`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center mt-0.5 ${cfg.badge}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1 mb-0.5">
                              <p className={`text-xs leading-snug ${!n.lue ? "font-bold text-foreground" : "font-semibold text-foreground/80"} flex-1 min-w-0`}>
                                {n.titre}
                              </p>
                              {!n.lue && (
                                <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-primary mt-1" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                              {moment(n.created_date).fromNow()}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}