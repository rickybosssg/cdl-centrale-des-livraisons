import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import TrackingMap from "@/components/TrackingMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Phone, MessageCircle, AlertCircle, XCircle, Headphones } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

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
  const [cancelFees, setCancelFees] = useState(null); // null | 0 | amount

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const courses = await base44.entities.Course.filter({ id });
        if (!courses || courses.length === 0) {
          toast.error("Course non trouvée");
          navigate("/mes-courses");
          return;
        }

        const c = courses[0];
        setCourse(c);

        // Charger livreur si assigné
        if (c.livreur_email) {
          const livreurs = await base44.entities.User.filter({ email: c.livreur_email });
          if (livreurs && livreurs.length > 0) {
            setLivreur(livreurs[0]);
          }
        }

        setLoading(false);
      } catch (err) {
        toast.error("Erreur: " + err.message);
        setLoading(false);
      }
    };

    loadCourse();
  }, [id]);

  // Rafraîchir ETA chaque 30 secondes
  useEffect(() => {
    if (!course || !livreur || !course.livreur_lat || !course.latitude_arrivee) return;

    const updateETA = async () => {
      try {
        const response = await base44.functions.invoke("calculateETA", {
          livreurLat: course.livreur_lat,
          livreurLng: course.livreur_lng || 0,
          destLat: course.latitude_arrivee,
          destLng: course.longitude_arrivee || 0,
          courseId: id,
        });

        if (response.data?.success) {
          setEta(response.data.eta);
          setDistance(response.data.distanceFormatted);
        }
      } catch (err) {
        console.error("ETA update error:", err);
      }
    };

    updateETA();
    const interval = setInterval(updateETA, 30000); // Chaque 30 sec

    return () => clearInterval(interval);
  }, [course, id]);

  // Abonnement temps réel aux mises à jour de position
  useEffect(() => {
    if (!id) return;

    const unsubscribe = base44.entities.Course.subscribe((event) => {
      if (event.id === id && event.type === "update") {
        setCourse(event.data);
      }
    });

    return unsubscribe;
  }, [id]);

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
          <CardContent className="p-4">
            <p className="text-sm text-red-700">Course non trouvée</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAssigned = !!livreur && course.statut !== "en_attente";
  const isDelivered = course.statut === "livree";

  // Statuts annulables gratuitement
  const FREE_CANCEL_STATUTS = ["en_attente", "assignee_attente", "aucun_livreur"];
  // Statuts avec frais 50%
  const FEE_CANCEL_STATUTS = ["acceptee"];
  // Statuts trop avancés
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
        // Annulation gratuite
        await base44.entities.Course.update(course.id, {
          statut: "annulee",
          date_annulation: new Date().toISOString(),
          annulee_par: "client",
          frais_annulation: 0,
        });
        // Notifier admin
        try {
          await base44.entities.Notification.create({
            destinataire_email: "admin",
            destinataire_role: "admin",
            titre: "Course annulée par client",
            message: `Course ${course.id?.slice(0,8)} annulée avant assignation.`,
            type: "info",
            course_id: course.id,
          });
        } catch (_) {}
        toast.success("Course annulée avec succès");
        setCancelDialog(false);
        setCourse(prev => ({ ...prev, statut: "annulee", annulee_par: "client", date_annulation: new Date().toISOString() }));
      } else if (canCancelWithFee) {
        // Annulation avec frais 50% via fonction backend
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
          <h1 className="text-lg font-bold">Suivi de livraison</h1>
          <p className="text-xs text-muted-foreground">
            #{course.id?.slice(0, 8)} • {course.quartier_depart} → {course.quartier_arrivee}
          </p>
        </div>
      </div>

      <div className="px-4 space-y-4">

        {/* Bannière annulation */}
        {course.statut === "annulee" && (
          <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-300 space-y-1">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <p className="font-bold text-red-700">Course annulée</p>
            </div>
            {course.date_annulation && (
              <p className="text-xs text-red-600">Le {moment(course.date_annulation).format("DD/MM/YYYY à HH:mm")}</p>
            )}
            {course.annulee_par && (
              <p className="text-xs text-red-600">Par : {course.annulee_par === "client" ? "vous" : course.annulee_par}</p>
            )}
            {course.frais_annulation > 0 && (
              <p className="text-xs font-semibold text-red-700">Frais appliqués : {(course.frais_annulation || 0).toLocaleString()} F CFA</p>
            )}
          </div>
        )}

        {/* Statut course */}
        <Card className="border-2">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Statut</span>
              <span
                className={`text-xs px-2 py-1 rounded-full font-bold ${
                  {
                    livree: "bg-green-100 text-green-700",
                    en_cours: "bg-blue-100 text-blue-700",
                    acceptee: "bg-amber-100 text-amber-700",
                    en_attente: "bg-gray-100 text-gray-700",
                  }[course.statut] || "bg-muted"
                }`}
              >
                {
                  {
                    livree: "✅ Livrée",
                    en_cours: "🚚 En cours",
                    acceptee: "✓ Acceptée",
                    en_attente: "⏳ En attente",
                  }[course.statut] || course.statut
                }
              </span>
            </div>
            {!isDelivered && (
              <p className="text-xs text-muted-foreground">
                {isAssigned
                  ? `Livreur ${livreur?.full_name || "..."} en route`
                  : "En attente d'un livreur"}
              </p>
            )}
            {isDelivered && (
              <p className="text-xs text-green-600">
                Livrée le {moment(course.date_livraison).format("DD/MM/YYYY HH:mm")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Carte si assigné */}
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

            {/* Infos livreur */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Livreur assigné</p>
                  <p className="font-bold text-sm">{livreur?.full_name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{livreur?.telephone}</p>
                </div>
                <div className="flex gap-2">
                  {livreur?.telephone && (
                    <a href={`tel:${livreur.telephone}`} className="flex-1">
                      <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5">
                        <Phone className="h-3.5 w-3.5" /> Appeler
                      </button>
                    </a>
                  )}
                  {livreur?.telephone && (
                    <a
                      href={`https://wa.me/${livreur.telephone?.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1"
                    >
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

        {/* Pas assigné */}
        {!isAssigned && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-amber-900">En attente d'assignation</p>
                <p className="text-xs text-amber-800 mt-1">
                  Un livreur sera assigné à votre course. Revenez d'ici peu.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bouton annulation */}
        {canCancel && (
          <Button
            variant="outline"
            className="w-full border-red-300 text-red-600 hover:bg-red-50 font-semibold"
            onClick={openCancelDialog}
          >
            <XCircle className="h-4 w-4 mr-2" /> Annuler la course
          </Button>
        )}

        {/* Trop avancé pour annuler */}
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

        {/* Détails course */}
        <Card>
          <CardContent className="p-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Distance</span>
              <span className="font-bold">{distance}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant</span>
              <span className="font-bold">{(course.prix || 0).toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mode paiement</span>
              <span className="font-bold">{course.mode_paiement || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Créée le</span>
              <span className="font-bold">{moment(course.created_date).format("DD/MM HH:mm")}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog confirmation annulation */}
      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => !cancelling && setCancelDialog(false)}>
          <div className="w-full max-w-md bg-background rounded-t-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <XCircle className="h-6 w-6 text-red-500" />
              <h2 className="text-lg font-bold">Annuler cette course ?</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Voulez-vous vraiment annuler cette course ? Des frais peuvent s'appliquer selon l'état d'avancement.
            </p>
            {cancelFees > 0 && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm font-semibold text-red-700">
                  ⚠️ Cette annulation entraînera des frais de {cancelFees.toLocaleString()} F CFA
                </p>
                <p className="text-xs text-red-600 mt-0.5">Ces frais seront prélevés sur votre Bedou.</p>
              </div>
            )}
            {cancelFees === 0 && (
              <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                <p className="text-sm text-green-700">✅ Annulation gratuite — aucun frais appliqué.</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setCancelDialog(false)} disabled={cancelling}>
                Retour
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? "Annulation..." : "Confirmer l'annulation"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}