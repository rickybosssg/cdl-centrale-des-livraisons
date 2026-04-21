/**
 * CourseTracking — Suivi style Uber
 * Grande carte plein écran + panneau bas glissant avec info livreur
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import TrackingMap from "@/components/TrackingMap";
import AriaButton from "@/components/AriaButton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Phone, MessageCircle, AlertTriangle,
  XCircle, RefreshCw, ChevronDown, ChevronUp, Clock, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import moment from "moment";
import ReportIssueModal from "@/components/ReportIssueModal";
import RatingModal from "@/components/RatingModal";
import ContactCard from "@/components/ContactCard";

const STATUT_CFG = {
  en_attente:       { label: "Recherche d'un livreur…",    color: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50",  emoji: "🔍" },
  assignee_attente: { label: "Livreur contacté…",          color: "bg-blue-500",  text: "text-blue-700",  bg: "bg-blue-50",   emoji: "📲" },
  acceptee:         { label: "En route vers récupération", color: "bg-primary",   text: "text-primary",   bg: "bg-blue-50",   emoji: "🛵" },
  en_cours:         { label: "En route vers vous",         color: "bg-primary",   text: "text-primary",   bg: "bg-blue-50",   emoji: "🚀" },
  livree:           { label: "Course terminée",            color: "bg-green-500", text: "text-green-700", bg: "bg-green-50",  emoji: "✅" },
  annulee:          { label: "Course annulée",             color: "bg-gray-400",  text: "text-gray-600",  bg: "bg-gray-50",   emoji: "❌" },
  aucun_livreur:    { label: "Aucun livreur disponible",   color: "bg-red-500",   text: "text-red-700",   bg: "bg-red-50",    emoji: "😔" },
};

// Annulation gratuite : pas encore de livreur assigné
const FREE_CANCEL = ["en_attente", "assignee_attente", "aucun_livreur"];
// Annulation avec frais 50% : livreur a accepté mais colis non encore récupéré
const FEE_CANCEL  = ["acceptee"];
// en_cours : colis déjà récupéré → plus d'annulation possible côté client

export default function CourseTracking() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [course, setCourse]         = useState(null);
  const [livreur, setLivreur]       = useState(null);
  const [livreurRating, setLivreurRating] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [eta, setEta]               = useState(null);
  const [distance, setDistance]     = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [user, setUser]             = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFees, setCancelFees] = useState(0);
  const [panelOpen, setPanelOpen]   = useState(true);
  const [ratingOpen, setRatingOpen] = useState(false);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const loadCourse = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const list = await base44.entities.Course.filter({ id });
      if (!list?.length) { if (!silent) { toast.error("Course introuvable"); navigate("/mes-courses"); } return; }
      const c = list[0];
      setCourse(c);
      setLastUpdate(new Date());
      if (c.livreur_email) {
        const livs = await base44.entities.User.filter({ email: c.livreur_email });
        if (livs?.length) {
          setLivreur(livs[0]);
          // Charger les notes du livreur
          setLivreurRating({
            note_moyenne: livs[0].note_moyenne || 0,
            nombre_notes: livs[0].nombre_notes || 0,
          });
        }
      }
    } catch (err) { if (!silent) toast.error(err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  useEffect(() => {
    if (!course || ["livree", "annulee"].includes(course.statut)) return;
    const t = setInterval(() => loadCourse(true), 5000);
    return () => clearInterval(t);
  }, [course?.id, course?.statut]);

  useEffect(() => {
    if (!course?.livreur_lat || !course?.latitude_arrivee) return;
    const calc = async () => {
      try {
        const r = await base44.functions.invoke("calculateETA", {
          livreurLat: course.livreur_lat, livreurLng: course.livreur_lng || 0,
          destLat: course.latitude_arrivee, destLng: course.longitude_arrivee || 0,
          courseId: id,
        });
        if (r.data?.success) { setEta(r.data.eta); setDistance(r.data.distanceFormatted); }
      } catch (_) {}
    };
    calc();
    const t = setInterval(calc, 30000);
    return () => clearInterval(t);
  }, [course?.livreur_lat, course?.livreur_lng, id]);

  useEffect(() => {
    if (!id) return;
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.id === id && event.data) {
        setCourse(event.data);
        setLastUpdate(new Date());
      }
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") loadCourse(true); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [loadCourse]);

  const openCancel = () => {
    if (FEE_CANCEL.includes(course.statut)) setCancelFees(Math.round((course.prix || 0) * 0.5));
    else setCancelFees(0);
    setCancelDialog(true);
  };

  const doCancel = async () => {
    setCancelling(true);
    try {
      if (FREE_CANCEL.includes(course.statut)) {
        await base44.entities.Course.update(course.id, {
          statut: "annulee",
          annulee_par: "client",
          frais_annulation: 0,
          date_annulation: new Date().toISOString(),
        });
        // Libérer le livreur s'il était en attente de confirmation
        if (course.livreur_email && course.statut === "assignee_attente") {
          base44.entities.User.filter({ email: course.livreur_email }).then(livs => {
            if (livs?.[0]) {
              base44.entities.User.update(livs[0].id, {
                nombre_courses_actives: Math.max(0, (livs[0].nombre_courses_actives || 1) - 1),
              }).catch(() => {});
            }
          }).catch(() => {});
        }
        toast.success("Course annulée");
        setCourse(c => ({ ...c, statut: "annulee" }));
      } else {
        const r = await base44.functions.invoke("cancelCourseWithFees", { courseId: course.id });
        if (r.data?.success) {
          toast.success(`Annulée. ${cancelFees.toLocaleString()} F prélevés.`);
          setCourse(c => ({ ...c, statut: "annulee", frais_annulation: r.data.fraisAnnulation }));
        } else if (r.data?.error === "insufficient_balance") {
          toast.error("Solde insuffisant.");
        } else {
          toast.error(r.data?.message || r.data?.error || "Erreur d'annulation");
        }
      }
    } catch (err) {
      toast.error(err.message || "Erreur");
    } finally {
      setCancelling(false);
      setCancelDialog(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="text-4xl animate-bounce">🛵</div>
        <p className="text-sm text-muted-foreground font-medium">Chargement du suivi…</p>
      </div>
    </div>
  );

  if (!course) return (
    <div className="p-4 space-y-4">
      <Button variant="ghost" size="icon" onClick={() => navigate("/mes-courses")}><ArrowLeft className="h-5 w-5" /></Button>
      <p className="text-sm text-red-600">Course introuvable</p>
    </div>
  );

  const cfg = STATUT_CFG[course.statut] || STATUT_CFG.en_attente;
  const isAssigned  = !!course.livreur_email && course.statut !== "en_attente";
  const isActive    = !["livree", "annulee"].includes(course.statut);
  const canCancel   = FREE_CANCEL.includes(course.statut) || FEE_CANCEL.includes(course.statut);
  const livreurPhone = livreur?.telephone || course.telephone_livreur;
  const livreurNom   = livreur?.full_name || course.livreur_name || "Livreur";
  const userRole     = user?.role === "admin" ? "admin" : "client";

  const PANEL_OPEN_H  = isAssigned ? 260 : 200;
  const PANEL_CLOSE_H = 80;
  const mapHeight = `calc(100vh - ${panelOpen ? PANEL_OPEN_H : PANEL_CLOSE_H}px - 56px)`;

  return (
    <div className="fixed inset-0 bg-gray-100 flex flex-col" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-100 z-30"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}>
        <button onClick={() => navigate("/mes-courses")}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">{cfg.emoji}</span>
            <span className="text-sm font-bold text-gray-900 truncate">{cfg.label}</span>
            {isActive && <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />}
          </div>
          <p className="text-[10px] text-gray-400 truncate">
            {course.quartier_depart} → {course.quartier_arrivee}
            {lastUpdate && ` · ${moment(lastUpdate).fromNow()}`}
          </p>
        </div>
        <button onClick={() => loadCourse(true)} disabled={refreshing}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform">
          <RefreshCw className={`h-4 w-4 text-gray-600 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Carte plein écran */}
      <div className="flex-1 relative overflow-hidden transition-all duration-300" style={{ height: mapHeight }}>
        {course.livreur_lat ? (
          <TrackingMap
            livreurLat={course.livreur_lat}
            livreurLng={course.livreur_lng || 0}
            clientLat={course.latitude_depart}
            clientLng={course.longitude_depart || 0}
            destinationLat={course.latitude_arrivee}
            destinationLng={course.longitude_arrivee || 0}
            livreurName={livreurNom}
            eta={eta}
            course={course}
            height="100%"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
            <div className="text-center space-y-3 px-6">
              <div className="h-16 w-16 rounded-full bg-white shadow-md flex items-center justify-center mx-auto text-3xl">
                {cfg.emoji}
              </div>
              <p className="font-semibold text-gray-700">{cfg.label}</p>
              <p className="text-xs text-gray-400">
                {isAssigned
                  ? `${livreurNom} partage sa position GPS dans quelques instants`
                  : "La carte apparaîtra dès qu'un livreur prendra la course"}
              </p>
            </div>
          </div>
        )}

        {/* ETA flottant */}
        {eta && isActive && course.livreur_lat && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg border border-white">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-gray-900">{eta}</span>
              {distance && <span className="text-xs text-gray-400">· {distance}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Panneau bas style Uber */}
      <div className="bg-white z-20 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] transition-all duration-300"
        style={{
          height: panelOpen ? PANEL_OPEN_H : PANEL_CLOSE_H,
          borderRadius: "20px 20px 0 0",
          overflow: "hidden",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}>

        {/* Poignée */}
        <div className="flex flex-col items-center pt-3 pb-1 cursor-pointer" onClick={() => setPanelOpen(v => !v)}>
          <div className="w-10 h-1 rounded-full bg-gray-200" />
          <div className="mt-1">
            {panelOpen ? <ChevronDown className="h-4 w-4 text-gray-300" /> : <ChevronUp className="h-4 w-4 text-gray-300" />}
          </div>
        </div>

        <div className="px-4 space-y-3 overflow-hidden">

          {/* Statut pill */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${cfg.bg}`}>
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.color} ${isActive ? "animate-pulse" : ""}`} />
            <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
            {course.frais_annulation > 0 && (
              <span className="ml-auto text-xs font-bold text-red-600">−{(course.frais_annulation).toLocaleString()} F</span>
            )}
          </div>

          {/* Carte contact livreur + bouton notation si livré */}
          {isAssigned && panelOpen && (
            <>
              <ContactCard
                name={livreurNom}
                phone={livreurPhone}
                status={course.statut === "livree" ? `Livré le ${moment(course.date_livraison).format("DD/MM à HH:mm")}` : "En route"}
                rating={livreurRating}
              />
              {course.statut === "livree" && (
                <Button
                  className="w-full gap-2 bg-amber-600 hover:bg-amber-700"
                  onClick={() => setRatingOpen(true)}
                >
                  ⭐ Noter cette livraison
                </Button>
              )}
            </>
          )}

          {/* Trajet résumé */}
          {panelOpen && (
            <div className="flex items-center gap-2 px-1">
              <div className="flex flex-col items-center gap-0.5">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <div className="w-0.5 h-4 bg-gray-200" />
                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">{course.quartier_depart}</p>
                <p className="text-xs text-gray-400 truncate mt-1">{course.quartier_arrivee}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-extrabold text-primary">{(course.prix || 0).toLocaleString()} F</p>
                {distance && <p className="text-[10px] text-gray-400">{distance}</p>}
              </div>
            </div>
          )}

          {/* Actions secondaires */}
          {panelOpen && isActive && (
            <div className="flex gap-2 pb-1">
              {!["livree", "annulee"].includes(course.statut) && (
                <button onClick={() => setReportOpen(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-orange-200 text-orange-600 text-xs font-semibold bg-orange-50 active:scale-95 transition-transform">
                  <AlertTriangle className="h-3.5 w-3.5" /> Signaler
                </button>
              )}
              {canCancel && (
                <button onClick={openCancel}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-semibold bg-red-50 active:scale-95 transition-transform">
                  <XCircle className="h-3.5 w-3.5" /> Annuler
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ARIA — visible même sur cette page hors layout */}
      <AriaButton userRole={userRole} />

      {/* Dialog annulation */}
      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => !cancelling && setCancelDialog(false)}>
          <div className="w-full max-w-md bg-white rounded-t-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold flex items-center gap-2"><XCircle className="h-5 w-5 text-red-500" /> Annuler ?</h2>
            {cancelFees > 0 ? (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm font-semibold text-red-700">⚠️ Frais : {cancelFees.toLocaleString()} F CFA</p>
                <p className="text-xs text-red-600 mt-0.5">Prélevés sur votre Bedou.</p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                <p className="text-sm text-green-700">✅ Annulation gratuite</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setCancelDialog(false)} disabled={cancelling}>Retour</Button>
              <Button variant="destructive" className="flex-1" onClick={doCancel} disabled={cancelling}>
                {cancelling ? "Annulation…" : "Confirmer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ReportIssueModal open={reportOpen} onOpenChange={setReportOpen} course={course} user={user} />
      <RatingModal open={ratingOpen} onOpenChange={setRatingOpen} course={course} user={user} />
    </div>
  );
}