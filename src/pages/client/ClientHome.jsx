import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Package, Clock, CheckCircle2, Truck, Store, MessageCircle,
  User, ShoppingBag, Send, RefreshCw, MapPin, Bell,
  Shield, Zap, Headphones, ChevronRight, Navigation, Eye
} from "lucide-react";
import NotationCourse from "../../components/NotationCourse";
import BedouWidget from "../../components/BedouWidget";
import ChatAdmin from "@/components/ChatAdmin";
import PubCDLBanner from "@/components/PubCDLBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link as RouterLink } from "react-router-dom";
import moment from "moment";

const STATUS_CFG = {
  en_attente:        { label: "En attente de livreur", color: "text-amber-700 bg-amber-50 border-amber-200", dot: "bg-amber-500", pulse: true },
  assignee_attente:  { label: "Livreur contacté…",     color: "text-blue-700 bg-blue-50 border-blue-200",   dot: "bg-blue-500",  pulse: true },
  acceptee:          { label: "Livreur en route",       color: "text-green-700 bg-green-50 border-green-200", dot: "bg-green-500", pulse: false },
  en_cours:          { label: "Livraison en cours",     color: "text-primary bg-primary/10 border-primary/30", dot: "bg-primary",  pulse: true },
  livree:            { label: "Livrée ✓",               color: "text-green-700 bg-green-50 border-green-200", dot: "bg-green-500", pulse: false },
  annulee:           { label: "Annulée",                 color: "text-gray-600 bg-gray-50 border-gray-200",   dot: "bg-gray-400",  pulse: false },
  aucun_livreur:     { label: "Aucun livreur dispo",    color: "text-red-700 bg-red-50 border-red-200",      dot: "bg-red-500",   pulse: false },
};

function ActiveCourseCard({ course }) {
  const cfg = STATUS_CFG[course.statut] || STATUS_CFG.en_attente;
  const isConfirmed = ["acceptee", "en_cours"].includes(course.statut);

  return (
    <Link to={`/course/${course.id}`}>
      <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-blue-50 p-4 space-y-3 active:scale-[0.98] transition-all">
        {/* Statut */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${cfg.color}`}>
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
            {cfg.label}
          </div>
          <span className="text-[10px] text-muted-foreground">{moment(course.created_date).fromNow()}</span>
        </div>

        {/* Trajet */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <div className="h-5 w-0.5 bg-border" />
            <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">{course.quartier_depart}</p>
            <p className="text-sm text-muted-foreground">{course.quartier_arrivee}</p>
          </div>
          <div className="text-right">
            <p className="text-base font-extrabold text-primary">{course.prix?.toLocaleString()} F</p>
            <p className="text-[10px] text-muted-foreground">{course.type_colis}</p>
          </div>
        </div>

        {/* Livreur si confirmé */}
        {isConfirmed && course.livreur_name && (
          <div className="flex items-center gap-2 pt-2 border-t border-primary/20">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm">🛵</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{course.livreur_name}</p>
              {course.telephone_livreur && (
                <p className="text-[10px] text-muted-foreground">{course.telephone_livreur}</p>
              )}
            </div>
            <div className="flex items-center gap-1 text-primary text-xs font-bold">
              <Eye className="h-3.5 w-3.5" />
              Suivre
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

export default function ClientHome({ user }) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMessages, setShowMessages] = useState(false);
  const [courseANoter, setCourseANoter] = useState(null);
  const [city, setCity] = useState(null);

  // Géolocalisation + ville — PROTÉGÉ ANTI-CRASH APK
  useEffect(() => {
    if (!user?.email) return;
    // Sur APK Android natif : ne PAS appeler navigator.geolocation au mount
    // car ça peut crasher la WebView si la permission n'est pas encore accordée
    try {
      const proto = window.location?.protocol;
      const isNative = proto === 'capacitor:' || proto === 'file:' ||
        (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true);
      if (isNative) return; // Sur APK : le GPS est géré par GpsLocationManager sur demande explicite
    } catch (_) {}

    try {
      if (!navigator?.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try {
            if (!user?.gps_latitude) {
              base44.auth.updateMe({
                gps_latitude: pos.coords.latitude,
                gps_longitude: pos.coords.longitude,
              }).catch(() => {});
            }
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
              .then(r => r.json())
              .then(d => { try { setCity(d?.address?.city || d?.address?.town || d?.address?.suburb || null); } catch (_) {} })
              .catch(() => {});
          } catch (_) {}
        },
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    } catch (_) {}
  }, [user?.email, user?.id]);

  // Charger courses
  useEffect(() => {
    if (!user?.email) return;
    let isMounted = true;
    const load = async () => {
      if (!isMounted) return;
      try {
        const data = await base44.entities.Course.filter(
          { client_email: user.email },
          "-created_date",
          20
        );
        if (isMounted) setCourses(Array.isArray(data) ? data : []);
      } catch (_) {
        if (isMounted) setCourses([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();

    const unsub = base44.entities.Course.subscribe((event) => {
      if (!isMounted) return;
      if (!event?.data?.client_email || event.data.client_email !== user.email) return;
      if (event.type === "create") {
        setCourses(prev => [event.data, ...prev]);
      } else if (event.type === "update") {
        const updated = event.data;
        setCourses(prev => prev.map(c => c?.id === event.id ? updated : c));
        if (updated?.statut === 'livree' && updated?.livreur_email && !updated?.note_donnee) {
          setCourseANoter(updated);
        }
      } else if (event.type === "delete") {
        setCourses(prev => prev.filter(c => c?.id !== event.id));
      }
    });

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [user?.email]);

  // Détecter courses à noter au chargement
  useEffect(() => {
    if (!loading && courses.length > 0 && !courseANoter) {
      const aNoter = courses.find(c => c?.statut === 'livree' && c?.livreur_email && !c?.note_donnee);
      if (aNoter) setCourseANoter(aNoter);
    }
  }, [loading]);

  if (!user || !user?.email || !user?.id) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-muted-foreground">Profil non chargé</p>
      </div>
    );
  }

  const safeCourses = Array.isArray(courses) ? courses : [];
  const activeCourses = safeCourses.filter(c => !['livree', 'annulee'].includes(c?.statut));
  const completedCourses = safeCourses.filter(c => c?.statut === 'livree');
  const recentCourses = safeCourses.slice(0, 3);
  const prenom = user.full_name?.split(" ")[0] || "Client";

  return (
    <div className="space-y-0 pb-8">

      {/* ── Modal notation ── */}
      {courseANoter && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0">
          <div className="w-full max-w-md bg-background rounded-t-3xl p-6 pb-10 space-y-4 animate-in slide-in-from-bottom-full duration-300">
            <div className="text-center">
              <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">⭐</span>
              </div>
              <p className="text-lg font-extrabold">Notez votre livreur</p>
              <p className="text-sm text-muted-foreground mt-1">
                Course {courseANoter.quartier_depart} → {courseANoter.quartier_arrivee}
              </p>
            </div>
            <NotationCourse
              course={courseANoter}
              onDone={() => {
                setCourses(prev => prev.map(c => c?.id === courseANoter.id ? { ...c, note_donnee: true } : c));
                setCourseANoter(null);
              }}
            />
            <button onClick={() => setCourseANoter(null)} className="w-full text-xs text-muted-foreground underline py-2">
              Pas maintenant
            </button>
          </div>
        </div>
      )}

      {/* ── 1. HEADER ── */}
      <div className="bg-gradient-to-br from-primary to-blue-700 px-4 pt-4 pb-6 rounded-b-3xl text-white">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm text-white/70">Bonjour 👋</p>
            <h1 className="text-2xl font-extrabold tracking-tight">{prenom}</h1>
            {city && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 text-white/70" />
                <span className="text-xs text-white/70">{city}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Link to="/mes-notifications">
              <button className="relative h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
                <Bell className="h-4.5 w-4.5 text-white h-5 w-5" />
                {/* Badge non lu */}
              </button>
            </Link>
          </div>
        </div>

        {/* Bedou widget dans le header */}
        <div className="bg-white/15 rounded-2xl p-3">
          <BedouWidget user={user} compact />
        </div>
      </div>

      <div className="space-y-5 mt-5 px-0">

        {/* ── 2. ACTIONS PRINCIPALES ── */}
        <div className="px-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Que voulez-vous faire ?</p>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/commander">
              <button className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-blue-600 text-white p-5 text-left active:scale-[0.97] transition-all shadow-lg shadow-primary/30">
                <div className="h-10 w-10 rounded-xl bg-white/25 flex items-center justify-center mb-3">
                  <Send className="h-5 w-5 text-white" />
                </div>
                <p className="font-bold text-sm leading-tight">Envoyer</p>
                <p className="text-xs text-white/75 mt-0.5">un colis</p>
                <div className="absolute -bottom-2 -right-2 h-14 w-14 rounded-full bg-white/10" />
              </button>
            </Link>
            <Link to="/commander">
              <button
                className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent to-orange-600 text-white p-5 text-left active:scale-[0.97] transition-all shadow-lg shadow-accent/30"
                onClick={(e) => {
                  // Le type de mission est sélectionné dans CreateCourse
                  // on passe simplement à la page
                }}
              >
                <div className="h-10 w-10 rounded-xl bg-white/25 flex items-center justify-center mb-3">
                  <RefreshCw className="h-5 w-5 text-white" />
                </div>
                <p className="font-bold text-sm leading-tight">Récupérer</p>
                <p className="text-xs text-white/75 mt-0.5">un colis</p>
                <div className="absolute -bottom-2 -right-2 h-14 w-14 rounded-full bg-white/10" />
              </button>
            </Link>
          </div>
        </div>

        {/* ── 3. ACTIONS RAPIDES ── */}
        <div className="px-4">
          <div className="grid grid-cols-3 gap-2">
            <Link to="/mes-courses">
              <div className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-95">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Navigation className="h-4.5 w-4.5 text-primary h-5 w-5" />
                </div>
                <p className="text-[11px] font-semibold text-center leading-tight">Suivre ma course</p>
              </div>
            </Link>
            <Link to="/mes-courses">
              <div className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-95">
                <div className="h-9 w-9 rounded-xl bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <p className="text-[11px] font-semibold text-center leading-tight">Historique</p>
              </div>
            </Link>
            <Link to="/mall">
              <div className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-95">
                <div className="h-9 w-9 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Store className="h-5 w-5 text-purple-600" />
                </div>
                <p className="text-[11px] font-semibold text-center leading-tight">Boutiques</p>
              </div>
            </Link>
          </div>
        </div>

        {/* ── Publicité CDL ── */}
        <div className="px-4">
          <PubCDLBanner placement="dashboard_client" userRole="client" />
        </div>

        {/* ── 4. COURSE(S) ACTIVE(S) ── */}
        {activeCourses.length > 0 && (
          <div className="px-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
                Course en cours
              </p>
              <Link to="/mes-courses" className="text-xs text-primary font-semibold">Tout voir →</Link>
            </div>
            {activeCourses.slice(0, 2).map(course => (
              <ActiveCourseCard key={course.id} course={course} />
            ))}
          </div>
        )}

        {/* ── 5. PRIX STANDARD ── */}
        <div className="px-4">
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-bold">💰 Tarifs indicatifs à Ouagadougou</p>
            <div className="space-y-2">
              {[
                { label: "Course standard", prix: "500 – 1 500 F", icon: "🛵" },
                { label: "Urgente (+30 min)", prix: "+ 500 F", icon: "⚡" },
                { label: "Très urgente (+20 min)", prix: "+ 1 000 F", icon: "🚨" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0 border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{item.icon}</span>
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                  </div>
                  <span className="text-sm font-bold text-primary">{item.prix}</span>
                </div>
              ))}
            </div>
            <Link to="/commander">
              <Button className="w-full h-10 text-sm" size="sm">Commander maintenant</Button>
            </Link>
          </div>
        </div>

        {/* ── 6. ÉLÉMENTS DE CONFIANCE ── */}
        <div className="px-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Zap,         color: "text-amber-600 bg-amber-50",  label: "Rapide",    desc: "En quelques min" },
              { icon: Shield,      color: "text-green-600 bg-green-50",  label: "Vérifiés",  desc: "Livreurs certifiés" },
              { icon: Headphones,  color: "text-blue-600 bg-blue-50",    label: "Support",   desc: "7j/7 disponible" },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-card border border-border text-center">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${item.color}`}>
                    <Icon className="h-4.5 w-4.5 h-5 w-5" />
                  </div>
                  <p className="text-[11px] font-bold">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 7. PROMOTIONS / Parrainage ── */}
        <div className="px-4">
          <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/25 flex items-center justify-center flex-shrink-0 text-2xl">
              🎁
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Invitez vos amis !</p>
              <p className="text-xs text-white/80 mt-0.5">Gagnez des bonus Bedou à chaque parrainage validé</p>
            </div>
            <Link to="/mon-parrainage">
              <button className="px-3 py-1.5 rounded-lg bg-white/25 text-xs font-bold border border-white/30 flex-shrink-0">
                Parrainer
              </button>
            </Link>
          </div>
        </div>

        {/* ── 8. HISTORIQUE ── */}
        {recentCourses.length > 0 && (
          <div className="px-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Dernières courses</p>
              <Link to="/mes-courses" className="text-xs text-primary font-semibold">Tout voir →</Link>
            </div>
            <div className="space-y-2">
              {recentCourses.map(course => {
                const cfg = STATUS_CFG[course.statut] || STATUS_CFG.en_attente;
                return (
                  <Link key={course.id} to={`/course/${course.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 active:scale-[0.98] transition-all">
                      <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{course.quartier_depart} → {course.quartier_arrivee}</p>
                        <p className="text-[10px] text-muted-foreground">{moment(course.created_date).fromNow()} · {course.type_colis}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-bold text-primary">{course.prix?.toLocaleString()} F</p>
                        <p className={`text-[10px] font-medium ${cfg.color.split(' ')[0]}`}>{cfg.label}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Message admin ── */}
        <div className="px-4">
          <button
            onClick={() => setShowMessages(!showMessages)}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors ${
              showMessages ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted"
            }`}
          >
            <MessageCircle className={`h-5 w-5 flex-shrink-0 ${showMessages ? "text-primary" : "text-muted-foreground"}`} />
            <div className="text-left flex-1">
              <p className="font-semibold text-sm">Messages CDL</p>
              <p className="text-xs text-muted-foreground">Discussion avec l'administration</p>
            </div>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showMessages ? "rotate-90" : ""}`} />
          </button>

          {showMessages && (
            <Card className="mt-2">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-3">💬 Discussion</p>
                <ChatAdmin userEmail={user.email} userRole="client" currentUser={user} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Vide state */}
        {safeCourses.length === 0 && !loading && (
          <div className="px-4 text-center py-6 space-y-3">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Truck className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-semibold text-sm">Prêt pour votre première livraison ?</p>
              <p className="text-xs text-muted-foreground mt-1">Commandez en moins de 2 minutes !</p>
            </div>
            <Link to="/commander">
              <Button className="mt-2">🛵 Commander maintenant</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}