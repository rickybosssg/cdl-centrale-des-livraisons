import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import TrackingMap from "@/components/TrackingMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Phone, MessageCircle, AlertCircle, XCircle, Headphones, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";
import ReportIssueModal from "@/components/ReportIssueModal";

export default function CourseTracking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [livreur, setLivreur] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eta, setEta] = useState("Calcul...");
  const [distance, setDistance] = useState("--");
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFees, setCancelFees] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const loadCourse = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const courses = await base44.entities.Course.filter({ id });
      if (!courses || courses.length === 0) {
        if (!silent) { toast.error("Course non trouvée"); navigate("/mes-courses"); }
        return;
      }
      const c = courses[0];
      setCourse(c);
      setLastUpdate(new Date());
      if (c.livreur_email) {
        const livreurs = await base44.entities.User.filter({ email: c.livreur_email });
        if (livreurs && livreurs.length > 0) setLivreur(livreurs[0]);
      }
    } catch (err) {
      if (!silent) toast.error("Erreur: " + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  // Rafraîchir position livreur toutes les 5 secondes si course active
  useEffect(() => {
    if (!course || ["livree", "annulee"].includes(course.statut)) return;
    const interval = setInterval(() => loadCourse(true), 5000);
    return () => clearInterval(interval);
  }, [course?.id, course?.statut]);

  // ETA toutes les 30s
  useEffect(() => {
    if (!course || !course.livreur_lat || !course.latitude_arrivee) return;
    const updateETA = async () => {
      try {
        const response = await base44.functions.invoke("calculateETA", {
          livreurLat: course.livreur_lat, livreurLng: course.livreur_lng || 0,
          destLat: course.latitude_arrivee, destLng: course.longitude_arrivee || 0,
          courseId: id,
        });
        if (response.data?.success) { setEta(response.data.eta); setDistance(response.data.distanceFormatted); }
      } catch (_) {}
    };
    updateETA();
    const interval = setInterval(updateETA, 30000);
    return () => clearInterval(interval);
  }, [course?.livreur_lat, course?.livreur_lng, id]);

  // Abonnement temps réel
  useEffect(() => {
    if (!id) return;
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.id === id && event.type === "update") {
        setCourse(event.data);
        setLastUpdate(new Date());
      }
    });
    return unsub;
  }, [id]);

  // Refetch au retour sur la page
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") loadCourse(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadCourse]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/mes-courses")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Suivi de livraison</h1>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4"><p className="text-sm text-red-700">Course non trouvée</p></CardContent>
        </Card>
      </div>
    );
  }

  // Fix: use livreur_email directly — don't depend on loaded livreur obj which can be null even if assigned
  const isAssigned = !!(course.livreur_email) && course.statut !== "en_attente";
  const isDelivered = course.statut === "livree";

  const FREE_CANCEL_STATUTS = ["en_attente", "assignee_attente", "aucun_livreur"];
  const FEE_CANCEL_STATUTS = ["acceptee"];
  const BLOCKED_CANCEL_STATUTS = ["en_cours", "livree", "annulee", "refusee"];

  const canCancelFree = FREE_CANCEL_STATUTS.includes(course.statut);
  const canCancelWithFee = FEE_CANCEL_STATUTS.includes(course.statut);
  const cancelTooLate = BLOCKED_CANCEL_STATUTS.includes(course.statut);
  const canCancel = canCancelFree || canCancelWithFee;

  const openCancelDialog = () => {
    if (canCancelFree) setCancelFees(0);
    else if (canCancelWithFee) setCancelFees(Math.round((course.prix || 0) * 0.5));
    setCancelDialog(true);
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      if (canCancelFree) {
        await base44.entities.Course.update(course.id, {
          statut: "annulee", date_annulation: new Date().toISOString(),
          annulee_par: "client", frais_annulation: 0,
        });
        try {
          await base44.entities.Notification.create({
            destinataire_email: "admin", destinataire_role: "admin",
            titre: "Course annulée par client",
            message: `Course ${course.id?.slice(0,8)} annulée avant assignation.`,
            type: "info", course_id: course.id,
          });
        } catch (_) {}
        toast.success("Course annulée avec succès");
        setCancelDialog(false);
        setCourse(prev => ({ ...prev, statut: "annulee", annulee_par: "client", date_annulation: new Date().toISOString() }));
      } else if (canCancelWithFee) {
        const res = await base44.functions.invoke("cancelCourseWithFees", { courseId: course.id });
        if (res.data?.success) {
          toast.success(`Course annulée. ${cancelFees.toLocaleString()} F CFA prélevés.`);
          setCancelDialog(false);
          setCourse(prev => ({ ...prev, statut: "annulee", annulee_par: "client", frais_annulation: res.data.fraisAnnulation }));
        } else if (res.data?.error === "insufficient_balance") {
          toast.error(`Solde insuffisant. Rechargez ${(res.data.required - res.data.available).toLocaleString()} F CFA.`);
          setCancelDialog(false);
        } else {
          toast.error(res.data?.message || "Erreur lors de l'annulation");
        }
      }
    } catch (err) {
      toast.error("Erreur : " + err.message);
    }
    setCancelling(false);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate("/mes-courses")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Suivi en direct 🔴</h1>
          <p className="text-xs text-muted-foreground">
            #{course.id?.slice(0, 8)} • {course.quartier_depart} → {course.quartier_arrivee}
          </p>
          {lastUpdate && <p className="text-[10px] text-green-600">🟢 Mis à jour {moment(lastUpdate).fromNow()}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={() => loadCourse(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="px-4 space-y-4">

        {/* Bannière annulation */}
        {course.statut === "annulee" && (
          <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-300 space-y-1">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <p className="font-bold text-red-700">Course annulée</p>
            </div>
            {course.date_annulation && <p className="text-xs text-red-600">Le {moment(course.date_annulation).format("DD/MM/YYYY à HH:mm")}</p>}
            {course.frais_annulation > 0 && <p className="text-xs font-semibold text-red-700">Frais appliqués : {(course.frais_annulation || 0).toLocaleString()} F CFA</p>}
          </div>
        )}

        {/* Statut */}
        <Card className="border-2">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Statut</span>
              <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                { livree: "bg-green-100 text-green-700", en_cours: "bg-blue-100 text-blue-700", acceptee: "bg-amber-100 text-amber-700", en_attente: "bg-gray-100 text-gray-700" }[course.statut] || "bg-muted"
              }`}>
                {{ livree: "✅ Livrée", en_cours: "🚚 En cours", acceptee: "✓ Acceptée", en_attente: "⏳ En attente" }[course.statut] || course.statut}
              </span>
            </div>
            {!isDelivered && <p className="text-xs text-muted-foreground">{isAssigned ? `Livreur ${livreur?.full_name || "..."} en route` : "En attente d'un livreur"}</p>}
            {isDelivered && <p className="text-xs text-green-600">Livrée le {moment(course.date_livraison).format("DD/MM/YYYY HH:mm")}</p>}
          </CardContent>
        </Card>

        {/* Carte si livreur avec position */}
        {isAssigned && course.livreur_lat && (
          <>
            <TrackingMap
              livreurLat={course.livreur_lat}
              livreurLng={course.livreur_lng || 0}
              clientLat={course.latitude_depart}
              clientLng={course.longitude_depart || 0}
              destinationLat={course.latitude_arrivee}
              destinationLng={course.longitude_arrivee || 0}
              livreurName={livreur?.full_name}
              eta={eta}
              course={course}
            />
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Livreur assigné</p>
                  <p className="font-bold text-sm">{livreur?.full_name || course.livreur_name || course.livreur_email?.split('@')[0] || "Livreur"}</p>
                  <p className="text-xs text-muted-foreground">{livreur?.telephone || course.telephone_livreur}</p>
                </div>
                <div className="flex gap-2">
                  {(livreur?.telephone || course.telephone_livreur) && (
                    <a href={`tel:${livreur?.telephone || course.telephone_livreur}`} className="flex-1">
                      <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5">
                        <Phone className="h-3.5 w-3.5" /> Appeler
                      </button>
                    </a>
                  )}
                  {(livreur?.telephone || course.telephone_livreur) && (
                    <a href={`https://wa.me/${(livreur?.telephone || course.telephone_livreur)?.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex-1">
                      <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Assigné mais position indisponible OU livreur en cours de chargement */}
        {isAssigned && !course.livreur_lat && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-blue-900">Position en cours de récupération...</p>
                <p className="text-xs text-blue-700 mt-1">Le livreur {livreur?.full_name || ''} a accepté la course. Sa position GPS arrive dans quelques instants.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pas de livreur */}
        {!isAssigned && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-amber-900">En attente d'assignation</p>
                <p className="text-xs text-amber-800 mt-1">Aucun livreur n'est encore assigné. Le suivi en direct sera disponible dès qu'un livreur prendra la course.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Signaler un problème */}
        {!["livree"].includes(course.statut) && (
          <Button variant="outline" className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 h-10 gap-2"
            onClick={() => setReportOpen(true)}>
            <AlertTriangle className="h-4 w-4" /> Signaler un problème
          </Button>
        )}

        {/* Annulation */}
        {canCancel && (
          <Button variant="outline" className="w-full border-red-300 text-red-600 hover:bg-red-50 font-semibold"
            onClick={openCancelDialog}>
            <XCircle className="h-4 w-4 mr-2" /> Annuler la course
          </Button>
        )}

        {cancelTooLate && !isDelivered && course.statut !== "annulee" && (
          <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 space-y-2">
            <p className="text-xs text-orange-800">La course est déjà trop avancée pour une annulation automatique.</p>
            {livreur?.telephone && (
              <a href={`https://wa.me/${livreur.telephone?.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full border-orange-300 text-orange-700 h-9 text-xs">
                  <Headphones className="h-3.5 w-3.5 mr-2" /> Contacter le support
                </Button>
              </a>
            )}
          </div>
        )}

        {/* Détails */}
        <Card>
          <CardContent className="p-4 space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Distance</span><span className="font-bold">{distance}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Montant</span><span className="font-bold">{(course.prix || 0).toLocaleString()} FCFA</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Mode paiement</span><span className="font-bold">{course.mode_paiement || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Créée le</span><span className="font-bold">{moment(course.created_date).format("DD/MM HH:mm")}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog annulation */}
      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => !cancelling && setCancelDialog(false)}>
          <div className="w-full max-w-md bg-background rounded-t-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <XCircle className="h-6 w-6 text-red-500" />
              <h2 className="text-lg font-bold">Annuler cette course ?</h2>
            </div>
            {cancelFees > 0 && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm font-semibold text-red-700">⚠️ Frais d'annulation : {cancelFees.toLocaleString()} F CFA</p>
                <p className="text-xs text-red-600 mt-0.5">Ces frais seront prélevés sur votre Bedou.</p>
              </div>
            )}
            {cancelFees === 0 && (
              <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                <p className="text-sm text-green-700">✅ Annulation gratuite — aucun frais appliqué.</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setCancelDialog(false)} disabled={cancelling}>Retour</Button>
              <Button variant="destructive" className="flex-1" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? "Annulation..." : "Confirmer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal signalement */}
      <ReportIssueModal open={reportOpen} onOpenChange={setReportOpen} course={course} user={user} />
    </div>
  );
}