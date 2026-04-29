/**
 * CDL — Dashboard Livreur PRO
 * Design optimisé, fluide, temps réel.
 */
import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { isDriverDispatchable } from "@/lib/dispatch";
import {
  MapPin, Package, MessageCircle, Zap, TrendingUp, Wallet, ChevronRight
} from "lucide-react";
import { fmt } from "@/lib/formatMoney";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import NewCourseAlert from "../../components/NewCourseAlert";
import ChatAdmin from "@/components/ChatAdmin";
import PubCDLBanner from "@/components/PubCDLBanner";
import moment from "moment";

// ── GPS ───────────────────────────────────────────────────────────────────────
function useGPS(userEmail) {
  const [gpsMsg, setGpsMsg] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);

  const request = useCallback(() => {
    if (!navigator.geolocation) { setGpsMsg("GPS non disponible"); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        setGpsMsg("");
        base44.auth.updateMe({
          gps_latitude: pos.coords.latitude,
          gps_longitude: pos.coords.longitude,
          gps_enabled: true,
        }).catch(() => {});
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === 1) setGpsMsg("Permission GPS refusée.");
        else if (err.code === 2) setGpsMsg("GPS désactivé.");
        else setGpsMsg("Position introuvable.");
        base44.auth.updateMe({ gps_enabled: false }).catch(() => {});
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    request();
  }, [userEmail]);

  return { gpsMsg, gpsLoading, requestGPS: request };
}

// ── Bedou ─────────────────────────────────────────────────────────────────────
function useBedou(userEmail) {
  const [bedou, setBedou] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userEmail) return;
    base44.functions.invoke("bedouEngine", { action: "get_bedou" })
      .then(res => setBedou(res?.data?.bedou || null))
      .catch(() => {})
      .finally(() => setLoading(false));

    const unsub = base44.entities.Bedou.subscribe(ev => {
      if (ev.data?.user_email === userEmail) setBedou(ev.data);
    });
    return unsub;
  }, [userEmail]);

  return { bedou, loadingBedou: loading };
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function LivreurHome({ user }) {
  const [courses, setCourses] = useState([]);
  const [disponible, setDisponible] = useState(user?.disponible !== false);
  const [toggling, setToggling] = useState(false);
  const [alertCourse, setAlertCourse] = useState(null);
  const [showMessages, setShowMessages] = useState(false);
  const [loading, setLoading] = useState(true);

  const { gpsMsg, gpsLoading, requestGPS } = useGPS(user?.email);
  const { bedou, loadingBedou } = useBedou(user?.email);

  // ── Chargement courses ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.email) return;
    base44.entities.Course.filter({ livreur_email: user.email }, "-created_date", 20)
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setCourses(arr);
        const pending = arr.find(c => c.statut === "assignee_attente" && c.livreur_email === user.email);
        if (pending) setAlertCourse(pending);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const unsub = base44.entities.Course.subscribe(ev => {
      if (!ev.data) return;
      if (ev.data.livreur_email === user.email) {
        if (ev.type === "create") {
          setCourses(p => [ev.data, ...p]);
          if (ev.data.statut === "assignee_attente") setAlertCourse(ev.data);
        } else if (ev.type === "update") {
          setCourses(p => p.map(c => c.id === ev.id ? ev.data : c));
          if (ev.data.statut === "assignee_attente") setAlertCourse(ev.data);
          else setAlertCourse(p => p?.id === ev.id ? null : p);
        }
      } else {
        setAlertCourse(p => p?.id === ev.id ? null : p);
      }
    });
    return unsub;
  }, [user?.email]);

  // ── Toggle en ligne ─────────────────────────────────────────────────────────
  const toggleOnline = async () => {
    const next = !disponible;
    setToggling(true);
    setDisponible(next);
    try {
      await base44.auth.updateMe({
        disponible: next,
        driver_online: next,
        last_seen: new Date().toISOString(),
      });
      toast.success(next ? "🟢 Vous êtes en ligne" : "🔴 Vous êtes hors ligne");
    } catch {
      setDisponible(!next);
      toast.error("Erreur de mise à jour");
    }
    setToggling(false);
  };

  if (!user?.email) return null;

  const arr = Array.isArray(courses) ? courses : [];
  const activeCourse = arr.find(c => ["acceptee", "en_cours"].includes(c.statut));
  const pendingCourse = arr.find(c => c.statut === "assignee_attente" && c.livreur_email === user.email);
  const today = new Date().toDateString();
  const completedToday = arr.filter(c => c.statut === "livree" && new Date(c.updated_date || c.date_livraison).toDateString() === today);
  const gainsJour = completedToday.reduce((s, c) => s + (c.gain_livreur || 0), 0);
  const totalLivrees = arr.filter(c => c.statut === "livree").length;
  const dispatchable = isDriverDispatchable({ ...user, disponible });

  return (
    <div className="space-y-4 pb-24">
      {/* Alerte course */}
      <NewCourseAlert course={alertCourse} onClose={() => setAlertCourse(null)} user={user} />

      {/* Bandeau GPS */}
      {gpsMsg && (
        <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-800 flex-1">{gpsMsg}</p>
          <button onClick={requestGPS} disabled={gpsLoading}
            className="text-xs font-bold text-amber-700 border border-amber-300 px-2 py-1 rounded-lg bg-white disabled:opacity-50">
            {gpsLoading ? "…" : "Réessayer"}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-xs text-gray-400">Bienvenue,</p>
          <h1 className="text-2xl font-extrabold leading-tight">{user.full_name?.split(" ")[0]} 👋</h1>
        </div>
        <Link to="/settings">
          <div className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow">
            <span className="text-lg font-extrabold text-white">{user.full_name?.charAt(0)?.toUpperCase()}</span>
          </div>
        </Link>
      </div>

      {/* Bouton EN LIGNE / HORS LIGNE */}
      <button
        onClick={toggleOnline}
        disabled={toggling}
        className={`w-full rounded-2xl p-5 flex items-center justify-between border-2 transition-all active:scale-[0.97] shadow-md ${
          disponible
            ? "bg-gradient-to-r from-green-500 to-emerald-600 border-green-500 text-white"
            : "bg-white border-gray-200 text-gray-800"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`h-14 w-14 rounded-full flex items-center justify-center text-3xl shadow-inner ${disponible ? "bg-white/20" : "bg-gray-100"}`}>
            {toggling
              ? <div className={`h-7 w-7 border-[3px] rounded-full animate-spin ${disponible ? "border-white/30 border-t-white" : "border-gray-300 border-t-gray-600"}`} />
              : disponible ? "🟢" : "🔴"
            }
          </div>
          <div className="text-left">
            <p className="text-2xl font-extrabold tracking-tight">{disponible ? "EN LIGNE" : "HORS LIGNE"}</p>
            <p className={`text-xs mt-0.5 ${disponible ? "text-white/80" : "text-gray-500"}`}>
              {disponible
                ? (activeCourse ? "🚀 Course en cours" : "⚡ Prêt à recevoir des courses")
                : "Appuyez pour recevoir des courses"}
            </p>
          </div>
        </div>
        <div className={`h-8 w-14 rounded-full relative transition-all ${disponible ? "bg-white/30" : "bg-gray-200"}`}>
          <div className={`absolute top-1 h-6 w-6 rounded-full shadow transition-all ${disponible ? "right-1 bg-white" : "left-1 bg-gray-400"}`} />
        </div>
      </button>

      {/* Stats du jour — gains + nombre de courses */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-green-50 border border-green-100 p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Gains aujourd'hui</p>
          <p className="text-2xl font-extrabold text-green-700">{fmt(gainsJour)}</p>
        </div>
        <div className="rounded-2xl bg-white border p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Courses du jour</p>
          <p className="text-2xl font-extrabold text-gray-900">{completedToday.length}</p>
        </div>
      </div>

      {/* Course en cours ou en attente */}
      {activeCourse && (
        <Link to={`/course-livreur/${activeCourse.id}`}>
          <div className="rounded-2xl border-2 border-primary bg-primary/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-bold text-primary">Course active</span>
              </div>
              <span className="text-sm font-bold text-primary">{(activeCourse.prix || 0).toLocaleString()} F</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                <span>{activeCourse.quartier_depart}</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <div className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
                <span>{activeCourse.quartier_arrivee}</span>
              </div>
            </div>
            <p className="text-xs text-primary font-bold text-right">Gérer →</p>
          </div>
        </Link>
      )}

      {!activeCourse && pendingCourse && (
        <Link to={`/course-livreur/${pendingCourse.id}`}>
          <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 p-4 space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-600 animate-bounce" />
              <p className="text-sm font-bold text-orange-800">Nouvelle course — répondez !</p>
            </div>
            <p className="text-sm text-orange-700">{pendingCourse.quartier_depart} → {pendingCourse.quartier_arrivee}</p>
            <p className="text-xl font-extrabold text-orange-900">{(pendingCourse.prix || 0).toLocaleString()} F CFA</p>
          </div>
        </Link>
      )}

      {/* Bedou */}
      {loadingBedou ? (
        <div className="rounded-2xl bg-gray-100 animate-pulse h-24" />
      ) : bedou ? (
        <Link to="/mon-bedou">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 p-4 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                <p className="text-xs font-bold text-white/90">Mon Bedou</p>
              </div>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">Voir tout →</span>
            </div>
            <p className="text-3xl font-extrabold">{fmt(bedou.solde_disponible || 0)}</p>
          </div>
        </Link>
      ) : null}

      {/* Message si hors ligne */}
      {!disponible && (
        <div className="rounded-2xl p-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-center">
          <p className="font-extrabold">💰 Passez en ligne pour recevoir des courses !</p>
        </div>
      )}

      {/* Navigation rapide */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { to: "/courses-disponibles", icon: Package, label: "Courses dispo.", sub: "Voir & accepter", color: "text-accent", border: "border-l-accent" },
          { to: "/mes-livraisons", icon: MapPin, label: "Mes livraisons", sub: "Historique", color: "text-primary", border: "border-l-primary" },
          { to: "/mes-gains", icon: TrendingUp, label: "Mes gains", sub: "Commissions", color: "text-green-600", border: "border-l-green-500" },
          { to: "/mon-bedou", icon: Wallet, label: "Mon Bedou", sub: "Portefeuille", color: "text-blue-600", border: "border-l-blue-500" },
        ].map(({ to, icon: Icon, label, sub, color, border }) => (
          <Link to={to} key={to}>
            <Card className={`border-l-4 ${border} hover:shadow-md transition-shadow active:scale-95 cursor-pointer`}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`h-7 w-7 flex-shrink-0 ${color}`} />
                <div>
                  <p className="text-sm font-bold">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{sub}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Messages CDL */}
      <div>
        <button
          onClick={() => setShowMessages(v => !v)}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${showMessages ? "border-primary bg-primary/5" : "border-border bg-card"}`}
        >
          <MessageCircle className={`h-5 w-5 ${showMessages ? "text-primary" : "text-muted-foreground"}`} />
          <div className="text-left flex-1">
            <p className="font-semibold text-sm">Messages CDL</p>
            <p className="text-xs text-muted-foreground">Support & administration</p>
          </div>
          <ChevronRight className={`h-4 w-4 transition-transform ${showMessages ? "rotate-90" : ""} text-muted-foreground`} />
        </button>
        {showMessages && (
          <Card className="mt-2 border-t-0 rounded-t-none">
            <CardContent className="p-4">
              <ChatAdmin userEmail={user.email} userRole="livreur" currentUser={user} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}