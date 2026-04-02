import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const t = (notif.titre || "").toLowerCase();
  const role = notif.destinataire_role || "";
  const id = notif.course_id;

  if (role === "livreur") {
    if (id && (t.includes("attribu") || t.includes("nouvelle course"))) return "/courses-disponibles";
    if (id) return `/course-livreur/${id}`;
    if (t.includes("profil") || t.includes("valid")) return "/settings";
    if (t.includes("gain") || t.includes("commission")) return "/mes-gains";
    return "/courses-disponibles";
  }
  if (role === "client") {
    if (id) return `/course/${id}`;
    return "/mes-courses";
  }
  if (role === "partenaire") {
    if (t.includes("commande")) return "/commandes-partenaire";
    return "/dashboard-partenaire";
  }
  if (role === "admin") {
    if (t.includes("livreur") || t.includes("profil")) return "/gestion-profils";
    if (t.includes("course") || t.includes("bloqu")) return "/gerer-courses";
    return "/admin-dashboard";
  }
  if (id) return `/course/${id}`;
  return null;
}

export default function MesNotifications() {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | unread

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
    load();
    const unsub = base44.entities.Notification.subscribe((event) => {
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
    const path = getNavPath(notif);
    if (path) navigate(path);
  };

  const deleteNotif = async (e, id) => {
    e.stopPropagation();
    await base44.entities.Notification.delete(id);
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const displayed = filter === "unread" ? notifs.filter(n => !n.lue) : notifs;
  const unreadCount = notifs.filter(n => !n.lue).length;

  return (
    <div className="space-y-4 pb-16">
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

      {/* Filtre */}
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

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Vide */}
      {!loading && displayed.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground font-medium">
            {filter === "unread" ? "Aucune notification non lue" : "Aucune notification"}
          </p>
        </div>
      )}

      {/* Liste */}
      <div className="space-y-2">
        {displayed.map(notif => {
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
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{notif.message}</p>
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