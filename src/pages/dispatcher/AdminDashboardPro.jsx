/**
 * CDL — Dashboard Admin PRO
 * Centre de contrôle unique. Temps réel. Compatible données existantes.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { isDriverDispatchable } from "@/lib/dispatch";
import moment from "moment";
import {
  RefreshCw, AlertTriangle, CheckCircle2, XCircle, Clock,
  Package, Users, Truck, TrendingUp, Wallet, Megaphone,
  Zap, Settings, Bell, ChevronRight, Activity,
  ToggleLeft, ToggleRight, MapPin, Star, Radio,
  ShieldCheck, Store, Tag, Eye, Phone, MessageSquare
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────
const TODAY = () => new Date().toDateString();

function timeAgo(d) { return d ? moment(d).fromNow() : "—"; }

function HealthDot({ level }) {
  const cfg = {
    ok:      { cls: "bg-green-500 animate-pulse", label: "Système OK" },
    warning: { cls: "bg-amber-500 animate-pulse", label: "Vigilance" },
    critical:{ cls: "bg-red-500 animate-pulse",   label: "Critique" },
  }[level] || { cls: "bg-green-500", label: "OK" };
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${cfg.cls}`} />
      <span className={`text-xs font-bold ${level === 'critical' ? 'text-red-600' : level === 'warning' ? 'text-amber-600' : 'text-green-600'}`}>
        {cfg.label}
      </span>
    </div>
  );
}

function KpiCard({ label, value, sub, color = "text-foreground", bg = "bg-card", icon: IconComp, to, badge }) {
  const content = (
    <Card className={`${bg} transition-all hover:shadow-md active:scale-95 cursor-pointer`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            {IconComp && <IconComp className={`h-4 w-4 mb-1 ${color}`} />}
            <p className={`text-2xl font-extrabold leading-none ${color}`}>{value ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
            {sub && <p className={`text-[10px] font-medium mt-0.5 ${color}`}>{sub}</p>}
          </div>
          {badge != null && badge > 0 && (
            <span className="h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function AlertBanner({ level, title, desc, action, actionLabel, time }) {
  const cfg = {
    critical: { border: "border-l-red-500 bg-red-50",     icon: "🔴", textColor: "text-red-800",   sub: "text-red-600" },
    warning:  { border: "border-l-amber-500 bg-amber-50", icon: "🟡", textColor: "text-amber-800", sub: "text-amber-600" },
    info:     { border: "border-l-blue-500 bg-blue-50",   icon: "🔵", textColor: "text-blue-800",  sub: "text-blue-600" },
  }[level] || { border: "border-l-gray-400 bg-gray-50", icon: "⚪", textColor: "text-gray-800", sub: "text-gray-600" };
  return (
    <div className={`border-l-4 ${cfg.border} rounded-r-xl p-3 flex items-start justify-between gap-2`}>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold ${cfg.textColor}`}>{cfg.icon} {title}</p>
        <p className={`text-[11px] ${cfg.sub} leading-tight`}>{desc}</p>
        {time && <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(time)}</p>}
      </div>
      {action && actionLabel && (
        <Link to={action}>
          <Button size="sm" variant="outline" className="h-7 text-[11px] flex-shrink-0">
            {actionLabel} <ChevronRight className="h-3 w-3 ml-0.5" />
          </Button>
        </Link>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function AdminDashboardPro() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [dispatchMode, setDispatchMode] = useState("auto");
  const [dispatchConfigId, setDispatchConfigId] = useState(null);
  const [togglingMode, setTogglingMode] = useState(false);

  // Data
  const [courses, setCourses] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [bedouList, setBedouList] = useState([]);
  const [demandesRetrait, setDemandesRetrait] = useState([]);
  const [partenaires, setPartenaires] = useState([]);
  const [publicites, setPublicites] = useState([]);

  const load = useCallback(async () => {
    const [
      coursesRes, usersRes, profilesRes, bedouRes, retraitRes,
      partenaireRes, pubRes, dispatchRes
    ] = await Promise.allSettled([
      base44.entities.Course.list("-created_date", 200),
      base44.entities.User.list("-updated_date", 500),
      base44.entities.UserProfile.filter({ deleted: false }),
      base44.entities.Bedou.list("-updated_date", 500),
      base44.entities.DemandeRetrait.filter({ statut: "en_attente" }),
      base44.entities.Partenaire.list("-created_date", 200),
      base44.entities.Publicite.filter({ deleted: false }),
      base44.entities.DispatchConfig.list("-updated_date", 1),
    ]);

    if (coursesRes.status === "fulfilled") setCourses(coursesRes.value || []);
    if (usersRes.status === "fulfilled") setAllUsers(usersRes.value || []);
    if (profilesRes.status === "fulfilled") setProfiles(profilesRes.value || []);
    if (bedouRes.status === "fulfilled") setBedouList(bedouRes.value || []);
    if (retraitRes.status === "fulfilled") setDemandesRetrait(retraitRes.value || []);
    if (partenaireRes.status === "fulfilled") setPartenaires(partenaireRes.value || []);
    if (pubRes.status === "fulfilled") setPublicites(pubRes.value || []);
    if (dispatchRes.status === "fulfilled" && dispatchRes.value?.length > 0) {
      setDispatchMode(dispatchRes.value[0].mode || "auto");
      setDispatchConfigId(dispatchRes.value[0].id);
    }

    setLastSync(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);

    const unsubCourse = base44.entities.Course.subscribe(ev => {
      if (ev.type === "create") setCourses(p => [ev.data, ...p]);
      else if (ev.type === "update") setCourses(p => p.map(c => c.id === ev.id ? ev.data : c));
    });
    const unsubUser = base44.entities.User.subscribe(ev => {
      if (ev.type === "create") setAllUsers(p => [ev.data, ...p]);
      else if (ev.type === "update") setAllUsers(p => p.map(u => u.id === ev.id ? ev.data : u));
    });
    const unsubProfile = base44.entities.UserProfile.subscribe(ev => {
      if (ev.type === "create" && !ev.data?.deleted) setProfiles(p => [ev.data, ...p]);
      else if (ev.type === "update") setProfiles(p => {
        const filtered = p.filter(x => x.id !== ev.id);
        if (ev.data?.deleted) return filtered;
        return [ev.data, ...filtered];
      });
      else if (ev.type === "delete") setProfiles(p => p.filter(x => x.id !== ev.id));
    });

    return () => { clearInterval(interval); unsubCourse(); unsubUser(); unsubProfile(); };
  }, []);

  // ── Calculs KPIs ────────────────────────────────────────────────────────────
  const today = TODAY();
  const coursesToday   = courses.filter(c => new Date(c.created_date).toDateString() === today);
  const enAttente      = courses.filter(c => ["en_attente", "aucun_livreur", "en_attente_dispatch"].includes(c.statut));
  const enCours        = courses.filter(c => ["assignee_attente", "acceptee", "en_cours"].includes(c.statut));
  const livrees        = courses.filter(c => c.statut === "livree");
  const annulees       = courses.filter(c => c.statut === "annulee");
  const livreesToday   = livrees.filter(c => new Date(c.updated_date).toDateString() === today);
  const aucunLivreur   = courses.filter(c => c.statut === "aucun_livreur");
  const urgentes       = courses.filter(c => c.urgence === "urgent" && ["en_attente","aucun_livreur"].includes(c.statut));
  const tresUrgentes   = courses.filter(c => c.urgence === "tres_urgent" && ["en_attente","aucun_livreur"].includes(c.statut));

  const livreursOnline       = allUsers.filter(u => u.driver_online === true && u.profil_valide === true);
  const livreursDispatchables = allUsers.filter(u => isDriverDispatchable(u));
  const livreursOccupes       = allUsers.filter(u => u.driver_online && (u.nombre_courses_actives || 0) > 0);

  const nonAdminUsers   = allUsers.filter(u => u.role !== "admin");
  const inscritsAujourd = allUsers.filter(u => new Date(u.created_date).toDateString() === today);

  const profilesLivreur    = profiles.filter(p => p.profile_type === "livreur");
  const profilesClient     = profiles.filter(p => p.profile_type === "client");
  const profilesCommercial = profiles.filter(p => p.profile_type === "commercial");
  const profilesPartenaire = profiles.filter(p => p.profile_type === "partenaire");
  const profilesEnAttente  = profiles.filter(p => p.status === "en_attente");
  const profilesIncomplets = profiles.filter(p => p.status === "incomplet");
  const profilesValides    = profiles.filter(p => p.status === "actif");
  const profilesBloqués    = profiles.filter(p => p.status === "bloque" || p.status === "suspendu");

  const commissionJour = livreesToday.reduce((s, c) => s + (c.commission_cdl || 0), 0);
  const bedouSoldeTotal = bedouList.reduce((s, b) => s + (b.solde_disponible || 0), 0);
  const demandesRetraitCount = demandesRetrait.length;

  // ── Calcul santé globale ────────────────────────────────────────────────────
  let healthLevel = "ok";
  if (tresUrgentes.length > 0 || aucunLivreur.length > 2 || livreursDispatchables.length === 0) {
    healthLevel = "critical";
  } else if (urgentes.length > 0 || enAttente.length > 5 || profilesEnAttente.length > 5 || demandesRetraitCount > 3) {
    healthLevel = "warning";
  }

  // ── Alertes auto ───────────────────────────────────────────────────────────
  const alerts = [];
  if (tresUrgentes.length > 0) alerts.push({ level: "critical", title: `${tresUrgentes.length} course(s) TRÈS URGENTE(S) sans livreur`, desc: "Intervention immédiate requise", action: "/dispatch-monitor", actionLabel: "Dispatch" });
  if (livreursDispatchables.length === 0 && enAttente.length > 0) alerts.push({ level: "critical", title: "0 livreur dispatchable — courses bloquées", desc: `${enAttente.length} courses en attente impossible à servir`, action: "/dispatch-monitor", actionLabel: "Voir" });
  if (urgentes.length > 0) alerts.push({ level: "warning", title: `${urgentes.length} course(s) urgente(s) en attente`, desc: "À dispatcher rapidement", action: "/dispatch-monitor", actionLabel: "Dispatch" });
  if (aucunLivreur.length > 0) alerts.push({ level: "warning", title: `${aucunLivreur.length} course(s) sans livreur`, desc: "Aucun livreur disponible trouvé", action: "/dispatch-monitor", actionLabel: "Gérer" });
  if (profilesEnAttente.length > 0) alerts.push({ level: "warning", title: `${profilesEnAttente.length} demande(s) de profil en attente`, desc: "Validation requise", action: "/gestion-profils", actionLabel: "Valider" });
  if (profilesIncomplets.length > 0) alerts.push({ level: "info", title: `${profilesIncomplets.length} profil(s) incomplet(s)`, desc: "Documents ou informations manquants", action: "/gestion-profils", actionLabel: "Voir" });
  if (demandesRetraitCount > 0) alerts.push({ level: "warning", title: `${demandesRetraitCount} retrait(s) Bedou en attente`, desc: "Validation des retraits requise", action: "/gestion-bedou", actionLabel: "Traiter" });
  if (livreursOnline.length < 3 && enAttente.length > 0) alerts.push({ level: "warning", title: `Peu de livreurs en ligne (${livreursOnline.length})`, desc: "Capacité de dispatch réduite", action: "/profils/livreurs", actionLabel: "Voir livreurs" });

  // ── Toggle mode dispatch ────────────────────────────────────────────────────
  const toggleMode = async () => {
    setTogglingMode(true);
    const newMode = dispatchMode === "auto" ? "manuel" : "auto";
    try {
      const res = await base44.functions.invoke("setDispatchMode", { mode: newMode });
      if (res.data?.success) {
        setDispatchMode(newMode);
        toast.success(newMode === "auto" ? "⚡ Mode automatique activé" : "🔧 Mode manuel activé");
      }
    } catch (e) { toast.error("Erreur: " + e.message); }
    setTogglingMode(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isManuel = dispatchMode === "manuel";

  return (
    <div className="space-y-4 pb-24">
      {/* ── EN-TÊTE ── */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold leading-tight">Dashboard CDL</h1>
          <p className="text-[11px] text-muted-foreground">
            {moment().format("ddd D MMM YYYY · HH:mm")}
            {lastSync && ` · Sync ${moment(lastSync).format("HH:mm:ss")}`}
          </p>
          <div className="mt-1"><HealthDot level={healthLevel} /></div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Link to="/parametres">
            <Button size="icon" variant="outline" className="h-8 w-8">
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Link to="/mes-notifications">
            <Button size="icon" variant="outline" className={`h-8 w-8 relative ${alerts.filter(a => a.level === "critical").length > 0 ? "border-red-400" : ""}`}>
              <Bell className="h-3.5 w-3.5" />
              {alerts.filter(a => a.level !== "info").length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-white text-[9px] font-black flex items-center justify-center">
                  {alerts.filter(a => a.level !== "info").length}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>

      {/* ── MODE DISPATCH ── */}
      <div className={`rounded-2xl border-2 p-3 flex items-center justify-between gap-3 ${!isManuel ? "border-green-400 bg-green-50" : "border-amber-400 bg-amber-50"}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${!isManuel ? "bg-green-500 animate-pulse" : "bg-amber-500"}`} />
          <div>
            <p className={`text-xs font-bold ${!isManuel ? "text-green-800" : "text-amber-800"}`}>
              {!isManuel ? "⚡ Dispatch automatique" : "🔧 Dispatch manuel"}
            </p>
            <p className={`text-[10px] ${!isManuel ? "text-green-700" : "text-amber-700"}`}>
              {!isManuel ? `${livreursDispatchables.length} livreur(s) dispatchables` : "Assignation manuelle requise"}
            </p>
          </div>
        </div>
        <button
          onClick={toggleMode}
          disabled={togglingMode}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border-2 transition-all disabled:opacity-50 ${
            !isManuel ? "border-amber-400 text-amber-700 bg-white" : "border-green-400 text-green-700 bg-white"
          }`}
        >
          {!isManuel ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          {togglingMode ? "..." : !isManuel ? "Manuel" : "Auto"}
        </button>
      </div>

      {/* ── ALERTES ── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Alertes ({alerts.length})
          </p>
          {alerts.slice(0, 6).map((a, i) => (
            <AlertBanner key={i} {...a} />
          ))}
        </div>
      )}

      {/* ── KPIs COURSES ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <Package className="h-3.5 w-3.5" /> Courses
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          <KpiCard label="Aujourd'hui" value={coursesToday.length} color="text-primary" bg="bg-primary/5" to="/gerer-courses" />
          <KpiCard label="En attente" value={enAttente.length} color="text-amber-600" bg="bg-amber-50" to="/gerer-courses" badge={enAttente.length} />
          <KpiCard label="En cours" value={enCours.length} color="text-blue-600" bg="bg-blue-50" to="/gerer-courses" />
          <KpiCard label="Livrées" value={livreesToday.length} color="text-green-600" bg="bg-green-50" to="/gerer-courses" />
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-1.5">
          <KpiCard label="Annulées" value={annulees.filter(c => new Date(c.updated_date).toDateString() === today).length} color="text-red-500" to="/gerer-courses" />
          <KpiCard label="Sans livreur" value={aucunLivreur.length} color="text-red-600" bg="bg-red-50" to="/dispatch-monitor" badge={aucunLivreur.length} />
          <KpiCard label="Urgentes" value={urgentes.length} color="text-orange-600" bg={urgentes.length > 0 ? "bg-orange-50" : ""} to="/dispatch-monitor" badge={urgentes.length} />
          <KpiCard label="Très urgentes" value={tresUrgentes.length} color="text-red-700" bg={tresUrgentes.length > 0 ? "bg-red-100" : ""} to="/dispatch-monitor" badge={tresUrgentes.length} />
        </div>
      </div>

      {/* ── KPIs DISPATCH ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <Zap className="h-3.5 w-3.5" /> Dispatch & Livreurs
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <KpiCard label="En ligne" value={livreursOnline.length} color="text-cyan-600" bg="bg-cyan-50" to="/dispatch-monitor" />
          <KpiCard label="Dispatchables" value={livreursDispatchables.length} color="text-green-600" bg="bg-green-50" to="/dispatch-monitor" />
          <KpiCard label="Occupés" value={livreursOccupes.length} color="text-amber-600" to="/dispatch-monitor" />
        </div>
      </div>

      {/* ── KPIs PROFILS ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> Profils
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          <KpiCard label="Livreurs" value={profilesLivreur.length} color="text-blue-600" to="/profils/livreurs" />
          <KpiCard label="Clients" value={profilesClient.length} color="text-orange-600" to="/profils/clients" />
          <KpiCard label="Commerciaux" value={profilesCommercial.length} color="text-purple-600" to="/profils/commerciaux" />
          <KpiCard label="Partenaires" value={profilesPartenaire.length} color="text-green-600" to="/profils/partenaires" />
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          <KpiCard label="En attente" value={profilesEnAttente.length} color="text-amber-600" bg="bg-amber-50" to="/gestion-profils" badge={profilesEnAttente.length} />
          <KpiCard label="Incomplets" value={profilesIncomplets.length} color="text-orange-600" to="/gestion-profils" />
          <KpiCard label="Inscrits auj." value={inscritsAujourd.length} color="text-green-600" to="/audit-utilisateurs" />
        </div>
      </div>

      {/* ── KPIs FINANCES ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <Wallet className="h-3.5 w-3.5" /> Finances Bedou
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <KpiCard label="Commission auj." value={`${commissionJour.toLocaleString()} F`} color="text-green-700" bg="bg-green-50" to="/gestion-transactions" />
          <KpiCard label="Solde Bedou" value={`${Math.round(bedouSoldeTotal / 1000)}k F`} color="text-primary" to="/gestion-bedou" />
          <KpiCard label="Retraits pend." value={demandesRetraitCount} color="text-red-600" bg={demandesRetraitCount > 0 ? "bg-red-50" : ""} to="/gestion-bedou" badge={demandesRetraitCount} />
        </div>
      </div>

      {/* ── DISPATCH TEMPS RÉEL ── */}
      {(enAttente.length > 0 || livreursOnline.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Dispatch temps réel
              </span>
              <Link to="/dispatch-monitor">
                <Button size="sm" variant="ghost" className="h-6 text-xs text-primary">
                  Tout voir <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Courses critiques */}
            {enAttente.slice(0, 3).map(c => {
              const wait = Math.round((Date.now() - new Date(c.created_date).getTime()) / 60000);
              return (
                <div key={c.id} className={`flex items-center gap-2 p-2 rounded-xl border ${c.urgence === "tres_urgent" ? "bg-red-50 border-red-300" : c.urgence === "urgent" ? "bg-orange-50 border-orange-300" : "bg-muted/30"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{c.quartier_depart} → {c.quartier_arrivee}</p>
                    <p className="text-[10px] text-muted-foreground">{c.prix} F · <span className={wait > 15 ? "text-red-600 font-bold" : "text-amber-600"}>{wait}min</span></p>
                  </div>
                  {c.urgence && c.urgence !== "normal" && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.urgence === "tres_urgent" ? "bg-red-200 text-red-800" : "bg-orange-200 text-orange-800"}`}>
                      {c.urgence === "tres_urgent" ? "URGENT" : "Urgent"}
                    </span>
                  )}
                  <Link to="/dispatch-monitor">
                    <Button size="sm" className="h-6 text-[11px] flex-shrink-0"><Zap className="h-3 w-3" /></Button>
                  </Link>
                </div>
              );
            })}
            {/* Livreurs dispo */}
            {livreursDispatchables.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {livreursDispatchables.slice(0, 5).map(l => (
                  <div key={l.id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-[10px] font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {l.full_name?.split(" ")[0]}
                    {l.gps_latitude && <MapPin className="h-2.5 w-2.5" />}
                  </div>
                ))}
                {livreursDispatchables.length > 5 && (
                  <span className="text-[10px] text-muted-foreground px-2 py-1">+{livreursDispatchables.length - 5}</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── ACTIVITÉS EN COURS ── */}
      {enCours.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>🚀 En livraison ({enCours.length})</span>
              <Link to="/gerer-courses"><Button size="sm" variant="ghost" className="h-6 text-xs text-primary">Voir <ChevronRight className="h-3 w-3" /></Button></Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {enCours.slice(0, 4).map(c => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{c.quartier_depart} → {c.quartier_arrivee}</p>
                  <p className="text-muted-foreground">{c.livreur_name || "—"} · {c.prix} F</p>
                </div>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">{c.statut}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── PROFILS À SURVEILLER ── */}
      {(profilesEnAttente.length > 0 || profilesIncomplets.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-500" /> Profils à traiter</span>
              <Link to="/gestion-profils"><Button size="sm" variant="ghost" className="h-6 text-xs text-primary">Gérer <ChevronRight className="h-3 w-3" /></Button></Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {profilesEnAttente.length > 0 && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 border border-amber-200">
                <div>
                  <p className="text-xs font-bold text-amber-800">⏳ {profilesEnAttente.length} en attente de validation</p>
                  <p className="text-[10px] text-amber-600">
                    {profilesEnAttente.filter(p => p.profile_type === "livreur").length} livreurs ·{" "}
                    {profilesEnAttente.filter(p => p.profile_type === "partenaire").length} partenaires ·{" "}
                    {profilesEnAttente.filter(p => p.profile_type === "commercial").length} commerciaux
                  </p>
                </div>
                <Link to="/gestion-profils"><Button size="sm" className="h-7 text-xs">Valider</Button></Link>
              </div>
            )}
            {profilesIncomplets.length > 0 && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-orange-50 border border-orange-200">
                <p className="text-xs font-bold text-orange-800">📋 {profilesIncomplets.length} incomplet(s)</p>
                <Link to="/gestion-profils"><Button size="sm" variant="outline" className="h-7 text-xs">Voir</Button></Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── ACCÈS RAPIDES ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Accès rapides</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { to: "/gerer-courses",    icon: Package,    label: "Courses",    color: "text-primary" },
            { to: "/dispatch-monitor", icon: Zap,        label: "Dispatch",   color: "text-amber-600" },
            { to: "/profils/livreurs", icon: Truck,      label: "Livreurs",   color: "text-blue-600" },
            { to: "/profils/clients",  icon: Users,      label: "Clients",    color: "text-orange-600" },
            { to: "/profils/commerciaux", icon: Tag,    label: "Commerciaux", color: "text-purple-600" },
            { to: "/profils/partenaires", icon: Store,  label: "Partenaires", color: "text-green-600" },
            { to: "/gestion-bedou",    icon: Wallet,     label: "Bedou",      color: "text-teal-600" },
            { to: "/gerer-publicites", icon: Megaphone,  label: "Pubs",       color: "text-pink-600" },
            { to: "/gestion-profils",  icon: ShieldCheck,label: "Validations",color: "text-amber-700" },
            { to: "/statistiques",     icon: TrendingUp, label: "Stats",      color: "text-indigo-600" },
            { to: "/messages-admin",   icon: MessageSquare, label: "Messages",color: "text-primary" },
            { to: "/parametres",       icon: Settings,   label: "Paramètres", color: "text-muted-foreground" },
          ].map(({ to, icon: Icon, label, color }) => (
            <Link key={to} to={to}>
              <Card className="hover:shadow-md transition-all active:scale-95 cursor-pointer">
                <CardContent className="p-2.5 text-center space-y-1">
                  <Icon className={`h-5 w-5 mx-auto ${color}`} />
                  <p className="text-[9px] font-semibold leading-tight">{label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* ── FINANCES BEDOU ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2"><Wallet className="h-4 w-4 text-teal-500" /> Finances Bedou</span>
            <Link to="/gestion-bedou"><Button size="sm" variant="ghost" className="h-6 text-xs text-primary">Détail <ChevronRight className="h-3 w-3" /></Button></Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-green-50 border border-green-200">
              <p className="text-base font-extrabold text-green-700">{commissionJour.toLocaleString()}</p>
              <p className="text-[10px] text-green-600">Commission F (auj.)</p>
            </div>
            <div className="p-2 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-base font-extrabold text-primary">{Math.round(bedouSoldeTotal / 1000)}k</p>
              <p className="text-[10px] text-muted-foreground">Solde Bedou F</p>
            </div>
            <div className={`p-2 rounded-xl border ${demandesRetraitCount > 0 ? "bg-red-50 border-red-200" : "bg-muted border-border"}`}>
              <p className={`text-base font-extrabold ${demandesRetraitCount > 0 ? "text-red-600" : "text-muted-foreground"}`}>{demandesRetraitCount}</p>
              <p className="text-[10px] text-muted-foreground">Retraits pend.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── OUTILS AVANCÉS ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Outils & Diagnostic</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { to: "/admin-diagnostics", label: "🛠️ Diagnostics", icon: Settings, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
            { to: "/health-dashboard", label: "Santé système", icon: Activity, color: "text-teal-600", bg: "bg-teal-50 border-teal-200" },
            { to: "/audit-complet",    label: "Audit complet", icon: Eye,       color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
            { to: "/bedou-audit",      label: "Audit Bedou",  icon: Wallet,    color: "text-green-600", bg: "bg-green-50 border-green-200" },
          ].map(({ to, label, icon: Icon, color, bg }) => (
            <Link key={to} to={to}>
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${bg} hover:shadow-sm transition-all active:scale-95 cursor-pointer`}>
                <Icon className={`h-5 w-5 flex-shrink-0 ${color}`} />
                <p className={`text-xs font-semibold ${color}`}>{label}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}