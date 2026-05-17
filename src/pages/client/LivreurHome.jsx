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
// PROTÉGÉ ANTI-CRASH APK : ne jamais appeler navigator.geolocation au mount sur natif
function isNativePlatform() {
  try {
    const proto = window.location?.protocol;
    return proto === 'capacitor:' || proto === 'file:' ||
      (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true);
  } catch (_) { return false; }
}

function useGPS(userEmail) {
  const [gpsMsg, setGpsMsg] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);

  const request = useCallback(() => {
    try {
      if (!navigator?.geolocation) { setGpsMsg("GPS non disponible"); return; }
      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try {
            setGpsLoading(false);
            setGpsMsg("");
            base44.auth.updateMe({
              gps_latitude: pos.coords.latitude,
              gps_longitude: pos.coords.longitude,
              gps_enabled: true,
            }).catch(() => {});
          } catch (_) { setGpsLoading(false); }
        },
        (err) => {
          try {
            setGpsLoading(false);
            if (err.code === 1) setGpsMsg("Permission GPS refusée.");
            else if (err.code === 2) setGpsMsg("GPS désactivé.");
            else setGpsMsg("Position introuvable.");
            base44.auth.updateMe({ gps_enabled: false }).catch(() => {});
          } catch (_) { setGpsLoading(false); }
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    } catch (_) {
      setGpsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Sur APK natif : NE PAS demander le GPS au mount (crashe WebView Android)
    // Le bouton "Réessayer" dans le UI déclenchera request() explicitement
    if (!userEmail || isNativePlatform()) return;
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
export default function LivreurHome({ user: initialUser }) {
  const [courses, setCourses] = useState([]);
  const [user, setUser] = useState(initialUser); // État User synchronisé temps réel
  const [toggling, setToggling] = useState(false);
  const [alertCourse, setAlertCourse] = useState(null);
  const [showMessages, setShowMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(null); // Alerte désynchronisation

  const { gpsMsg, gpsLoading, requestGPS } = useGPS(user?.email);
  const { bedou, loadingBedou } = useBedou(user?.email);

  // Valeur réelle confirmée en BDD (source unique — jamais optimiste)
  const driverOnlineConfirmed = user?.driver_online === true;

  // ── Re-lecture BDD au mount pour avoir l'état frais (évite valeur périmée du parent) ──
  useEffect(() => {
    if (!initialUser?.email) return;
    base44.auth.me().then(fresh => {
      if (fresh?.email === initialUser.email) setUser(fresh);
    }).catch(() => {});
  }, [initialUser?.email]);

  // ── Subscription temps réel USER (source unique pour driver_online, GPS, profil) ──
  useEffect(() => {
    if (!initialUser?.email) return;
    const unsubUser = base44.entities.User.subscribe((event) => {
      if (!event.data) return;
      // Matcher par email OU par id pour être robuste
      if (event.data?.email === initialUser.email || event.id === initialUser.id) {
        setUser(event.data);
        setSyncError(null);
      }
    });
    return () => { if (unsubUser) unsubUser(); };
  }, [initialUser?.email, initialUser?.id]);

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
      const isForMe = ev.data.livreur_email === user.email;

      if (isForMe) {
        if (ev.type === "create") {
          setCourses(p => [ev.data, ...p]);
          if (ev.data.statut === "assignee_attente") {
            setAlertCourse(ev.data);
          }
        } else if (ev.type === "update") {
          setCourses(p => {
            const exists = p.find(c => c.id === ev.id);
            return exists ? p.map(c => c.id === ev.id ? ev.data : c) : [ev.data, ...p];
          });
          if (ev.data.statut === "assignee_attente") {
            setAlertCourse(ev.data);
          } else {
            setAlertCourse(p => p?.id === ev.id ? null : p);
          }
        }
      } else {
        // Course retirée de ce livreur (reassignée ou refusée)
        setAlertCourse(p => p?.id === ev.id ? null : p);
      }
    });
    return unsub;
  }, [user?.email]);

  // ── Toggle en ligne — Valeur confirmée BDD uniquement ────────────────────────
  const toggleOnline = async () => {
    if (toggling) return; // Anti double-clic
    const next = !driverOnlineConfirmed;
    console.log('[DRIVER_ONLINE_TOGGLE_CLICK]', { from: driverOnlineConfirmed, to: next, email: user?.email });
    setToggling(true);
    try {
      await base44.auth.updateMe({
        driver_online: next,
        disponible: next,
        last_seen: new Date().toISOString(),
      });
      // Relire la BDD pour afficher la vraie valeur confirmée (pas optimiste)
      const fresh = await base44.auth.me();
      if (fresh) setUser(fresh);
      const confirmed = fresh?.driver_online === true;
      console.log('[DRIVER_ONLINE_SAVE_SUCCESS]', { saved: next, confirmed, email: user?.email });
      setSyncError(null);
      toast.success(confirmed ? "🟢 En ligne" : "🔴 Hors ligne");
    } catch (err) {
      console.log('[DRIVER_ONLINE_SAVE_ERROR]', { err: err.message, email: user?.email });
      setSyncError(null);
      toast.error("Impossible de changer votre disponibilité. Réessayez.");
    } finally {
      setToggling(false);
    }
  };

  if (!user?.email) return null;

  const arr = Array.isArray(courses) ? courses : [];
  const activeCourse = arr.find(c => ["acceptee", "en_cours"].includes(c.statut));
  const pendingCourse = arr.find(c => c.statut === "assignee_attente" && c.livreur_email === user.email);
  const today = new Date().toDateString();
  const completedToday = arr.filter(c => c.statut === "livree" && new Date(c.updated_date || c.date_livraison).toDateString() === today);
  const gainsJour = completedToday.reduce((s, c) => s + (c.gain_livreur || 0), 0);
  const totalLivrees = arr.filter(c => c.statut === "livree").length;
  const dispatchable = isDriverDispatchable(user);

  return (
    <div className="space-y-4 pb-24">
      {/* Alerte course */}
      <NewCourseAlert course={alertCourse} onClose={() => setAlertCourse(null)} user={user} />

      {/* Alerte désynchronisation */}
      {syncError && (
        <div className="rounded-xl p-3 bg-red-50 border border-red-200 flex items-center gap-2">
          <span className="text-lg flex-shrink-0">⚠️</span>
          <p className="text-xs text-red-800 flex-1">{syncError}</p>
          <button onClick={() => setSyncError(null)} className="text-xs font-bold text-red-600">Fermer</button>
        </div>
      )}

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

      {/* Bouton EN LIGNE / HORS LIGNE — Valeur BDD confirmée UNIQUEMENT */}
      <button
        onClick={toggleOnline}
        disabled={toggling}
        className={`w-full rounded-2xl p-5 flex items-center justify-between border-2 transition-all active:scale-[0.97] shadow-md ${
          driverOnlineConfirmed
            ? "bg-gradient-to-r from-green-500 to-emerald-600 border-green-500 text-white"
            : "bg-white border-gray-200 text-gray-800"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`h-14 w-14 rounded-full flex items-center justify-center text-3xl shadow-inner ${driverOnlineConfirmed ? "bg-white/20" : "bg-gray-100"}`}>
            {toggling
              ? <div className={`h-7 w-7 border-[3px] rounded-full animate-spin ${driverOnlineConfirmed ? "border-white/30 border-t-white" : "border-gray-300 border-t-gray-600"}`} />
              : driverOnlineConfirmed ? "🟢" : "🔴"
            }
          </div>
          <div className="text-left">
            <p className="text-2xl font-extrabold tracking-tight">{driverOnlineConfirmed ? "EN LIGNE" : "HORS LIGNE"}</p>
            <p className={`text-xs mt-0.5 ${driverOnlineConfirmed ? "text-white/80" : "text-gray-500"}`}>
              {driverOnlineConfirmed
                ? (activeCourse ? "🚀 Course en cours" : "⚡ Prêt à recevoir des courses")
                : "Appuyez pour recevoir des courses"}
            </p>
          </div>
        </div>
        <div className={`h-8 w-14 rounded-full relative transition-all ${driverOnlineConfirmed ? "bg-white/30" : "bg-gray-200"}`}>
          <div className={`absolute top-1 h-6 w-6 rounded-full shadow transition-all ${driverOnlineConfirmed ? "right-1 bg-white" : "left-1 bg-gray-400"}`} />
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
      {!driverOnlineConfirmed && (
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