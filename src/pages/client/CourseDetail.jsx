import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MapPin, Phone, Package, Navigation, Map, AlertTriangle, RefreshCw } from "lucide-react";
import NotationCourse from "../../components/NotationCourse";
import MiniChat from "../../components/MiniChat";
import MapSuivi from "../../components/MapSuivi";
import CancelCourseDialog from "../../components/CancelCourseDialog";
import ReportIssueModal from "../../components/ReportIssueModal";
import PaiementMobile from "../../components/PaiementMobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "../../components/StatusBadge";
import moment from "moment";

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nouveauPrix, setNouveauPrix] = useState("");
  const [relancant, setRelancant] = useState(false);
  const [relancantSeul, setRelancantSeul] = useState(false);
  const [showPrixForm, setShowPrixForm] = useState(false);
  const [prixErreur, setPrixErreur] = useState("");
  const [cancelDialog, setCancelDialog] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const load = useCallback(async (silent = false) => {
    if (!id || id === ':id') { setLoading(false); return; }
    if (!silent) setLoading(true); else setRefreshing(true);
    const courses = await base44.entities.Course.filter({ id });
    if (courses.length > 0) setCourse(courses[0]);
    if (!silent) setLoading(false); else setRefreshing(false);
  }, [id]);

  useEffect(() => {
    load();
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.id === id && event.data) setCourse(event.data);
    });
    const onVisible = () => { if (document.visibilityState === "visible") load(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { unsub(); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const relancerSeul = async () => {
    setRelancantSeul(true);
    await base44.entities.Course.update(course.id, { statut: 'en_attente', nombre_tentatives: 0 });
    try { await base44.functions.invoke('autoDispatch', { course_id: course.id }); } catch (_) {}
    setCourse(prev => ({ ...prev, statut: 'en_attente' }));
    setRelancantSeul(false);
  };

  const relancerAvecNouveauPrix = async () => {
    const px = parseInt(nouveauPrix, 10);
    if (!px || px <= 0) { setPrixErreur("Prix invalide"); return; }
    if (px <= (course.prix || 0)) { setPrixErreur(`Le nouveau prix doit être supérieur à ${course.prix} FCFA`); return; }
    setPrixErreur("");
    setRelancant(true);
    await base44.entities.Course.update(course.id, {
      prix: px,
      montant_total: px,
      commission_cdl: Math.round(px * 0.2),
      gain_livreur: Math.round(px * 0.8),
      statut: "en_attente",
      nombre_tentatives: 0,
    });
    try { await base44.functions.invoke('autoDispatch', { course_id: course.id }); } catch (_) {}
    setCourse(prev => ({ ...prev, prix: px, statut: "en_attente" }));
    setNouveauPrix("");
    setShowPrixForm(false);
    setRelancant(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const STATUT_CLIENT = {
    en_attente: { label: "🔍 Recherche d’un livreur en cours...", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", pulse: true },
    assignee_attente: { label: "🛵 Un livreur a été trouvé ! En attente de confirmation...", color: "text-blue-600", bg: "bg-blue-50 border-blue-200", pulse: true },
    acceptee: { label: "✅ Votre course a été acceptée ! Le livreur arrive...", color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200", pulse: true },
    en_cours: { label: "📦 Votre colis est en route !", color: "text-purple-600", bg: "bg-purple-50 border-purple-200", pulse: true },
    livree: { label: "🎉 Votre colis a été livré !", color: "text-green-600", bg: "bg-green-50 border-green-200", pulse: false },
    annulee: { label: "❌ Course annulée", color: "text-red-600", bg: "bg-red-50 border-red-200", pulse: false },
    aucun_livreur: { label: "⏳ Aucun livreur disponible pour le moment. Nous continuons de chercher...", color: "text-red-600", bg: "bg-red-50 border-red-200", pulse: true },
  };

  if (!course) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Course introuvable</p>
      </div>
    );
  }

  const statutInfo = STATUT_CLIENT[course.statut] || STATUT_CLIENT.en_attente;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Suivi de la course</h1>
          <p className="text-xs text-muted-foreground">#{course.id?.slice(0, 8)}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
        <StatusBadge statut={course.statut} />
      </div>

      {/* Bannière statut client */}
      <div className={`rounded-xl border p-4 ${statutInfo.bg} flex items-center gap-3`}>
        {statutInfo.pulse && (
          <div className="relative flex-shrink-0">
            <div className={`h-3 w-3 rounded-full ${statutInfo.color.replace('text-', 'bg-')}`} />
            <div className={`absolute inset-0 h-3 w-3 rounded-full ${statutInfo.color.replace('text-', 'bg-')} animate-ping opacity-75`} />
          </div>
        )}
        <p className={`text-sm font-semibold ${statutInfo.color}`}>{statutInfo.label}</p>
      </div>

      {/* Itinerary */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-1">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <div className="h-10 w-0.5 bg-muted" />
              <div className="h-3 w-3 rounded-full bg-red-500" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Départ</p>
                <p className="font-medium">{course.quartier_depart}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Arrivée</p>
                <p className="font-medium">{course.quartier_arrivee}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Package className="h-4 w-4 text-accent" />
            <div>
              <p className="text-xs text-muted-foreground">Type de colis</p>
              <p className="text-sm font-medium">{course.type_colis}</p>
            </div>
          </div>
          {course.description && (
            <p className="text-sm text-muted-foreground pl-7">{course.description}</p>
          )}
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Expéditeur</p>
              <p className="text-sm font-medium">{course.telephone_expediteur}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Destinataire</p>
              <p className="text-sm font-medium">{course.telephone_destinataire}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bouton suivi live toujours visible si livreur assigné */}
      {course.livreur_email && ["acceptee","en_cours","assignee_attente"].includes(course.statut) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Navigation className="h-4 w-4 text-primary" />
              Suivi GPS en temps réel
            </p>
            {course.livreur_lat && course.livreur_lng && (
              <MapSuivi livreurLat={course.livreur_lat} livreurLng={course.livreur_lng} />
            )}
            <Button
              className="w-full bg-primary hover:bg-primary/90 gap-2 font-bold"
              onClick={() => navigate(`/course/${id}/track`)}
            >
              <Map className="h-4 w-4" /> 🔴 Suivre en direct sur la carte
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Livreur */}
      {course.livreur_name && (
        <Card className="border-indigo-200 bg-indigo-50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Votre livreur</p>
            <div className="flex items-center gap-3">
              {course.livreur_photo ? (
                <img src={course.livreur_photo} alt="" className="h-12 w-12 rounded-full object-cover border-2 border-indigo-300" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-indigo-200 flex items-center justify-center text-xl font-bold text-indigo-700">
                  {course.livreur_name?.charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-sm">{course.livreur_name}</p>
                {course.livreur_note_semaine != null ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    {[1,2,3,4,5].map(s => (
                      <span key={s} className={`text-base ${s <= Math.round(course.livreur_note_semaine) ? (course.livreur_note_semaine < 3 ? 'text-red-500' : 'text-amber-400') : 'text-muted-foreground'}`}>★</span>
                    ))}
                    <span className={`text-xs font-semibold ml-1 ${course.livreur_note_semaine < 3 ? 'text-red-600' : 'text-amber-600'}`}>
                      {course.livreur_note_semaine.toFixed(1)}/5
                    </span>
                    <span className="text-xs text-muted-foreground">(7 derniers jours)</span>
                  </div>
                ) : course.livreur_note_moyenne != null ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    {[1,2,3,4,5].map(s => (
                      <span key={s} className={`text-base ${s <= Math.round(course.livreur_note_moyenne) ? 'text-amber-400' : 'text-muted-foreground'}`}>★</span>
                    ))}
                    <span className="text-xs font-semibold ml-1 text-amber-600">{course.livreur_note_moyenne.toFixed(1)}/5</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Pas encore de note</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium">Historique</p>
          <div className="space-y-2">
            <TimelineItem
              label="Créée"
              date={course.created_date}
              active
            />
            {course.date_acceptation && (
              <TimelineItem label="Acceptée" date={course.date_acceptation} active />
            )}
            {course.date_recuperation && (
              <TimelineItem label="Colis récupéré" date={course.date_recuperation} active />
            )}
            {course.date_livraison && (
              <TimelineItem label="Livrée" date={course.date_livraison} active />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Price */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center justify-between">
          <span className="font-medium">Prix total</span>
          <span className="text-2xl font-bold text-primary">{course.prix} FCFA</span>
        </CardContent>
      </Card>

      {/* Paiement mobile */}
      {course.mode_paiement && course.mode_paiement !== "Paiement à la livraison" && course.statut_paiement === "en_attente" && (  
        <PaiementMobile course={course} onConfirmed={() => setCourse(prev => ({ ...prev, statut_paiement: "paye" }))} />
      )}

      {/* Appel livreur */}
      {course.livreur_email && ["acceptee", "en_cours"].includes(course.statut) && course.telephone_livreur && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Appeler le livreur</p>
                <p className="font-medium">{course.livreur_name}</p>
              </div>
            </div>
            <a href={`tel:${course.telephone_livreur}`}>
              <Button size="sm" className="bg-primary">
                <Phone className="h-4 w-4 mr-1" /> Appeler
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* Mini Chat - uniquement si course active et livreur assigné */}
      {course.livreur_email && ["acceptee", "en_cours"].includes(course.statut) && (
        <MiniChat course={course} user={{ email: course.client_email, full_name: course.client_name, user_type: "client" }} />
      )}

      {/* Suggestion augmenter le prix si aucun livreur */}
      {course.statut === "aucun_livreur" && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-5 space-y-4">
            <div className="text-center space-y-1">
              <p className="text-base font-bold text-red-800">😔 Aucun livreur disponible</p>
              <p className="text-xs text-red-700">Aucun livreur n'est disponible pour le moment.</p>
              {course.nombre_tentatives > 0 && (
                <p className="text-xs text-red-600">{course.nombre_tentatives} tentative(s) effectuée(s)</p>
              )}
            </div>

            <div className="p-3 rounded-lg bg-white/70 border border-red-200 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Prix actuel proposé</span>
              <span className="font-bold text-primary text-lg">{course.prix?.toLocaleString()} FCFA</span>
            </div>

            {!showPrixForm ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100 text-xs h-11"
                  onClick={relancerSeul}
                  disabled={relancantSeul}
                >
                  {relancantSeul ? "⏳ Relance..." : "🔄 Relancer la recherche"}
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700 text-xs h-11"
                  onClick={() => { setShowPrixForm(true); setNouveauPrix(String(Math.round((course.prix || 0) * 1.3))); }}
                >
                  💰 Augmenter le prix
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-amber-800 font-semibold">
                  💡 Prix suggéré : {Math.round((course.prix || 0) * 1.3).toLocaleString()} FCFA (+30%)
                </p>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder={`Nouveau prix (min: ${(course.prix || 0) + 1} FCFA)`}
                    value={nouveauPrix}
                    onChange={e => { setNouveauPrix(e.target.value); setPrixErreur(""); }}
                    className="pr-14"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">FCFA</span>
                </div>
                {prixErreur && <p className="text-xs text-red-600">{prixErreur}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowPrixForm(false); setPrixErreur(""); }}>Annuler</Button>
                  <Button
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                    onClick={relancerAvecNouveauPrix}
                    disabled={relancant || !nouveauPrix}
                  >
                    {relancant ? "⏳..." : "✅ Confirmer et relancer"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notation */}
      {course.statut === "livree" && course.livreur_email && !course.note_donnee && (
        <NotationCourse course={course} onDone={() => setCourse(prev => ({ ...prev, note_donnee: true }))} />
      )}

      {/* ✅ BOUTON ANNULATION UNIFIÉ — logique métier CDL */}
      {["en_attente", "assignee_attente", "aucun_livreur"].includes(course.statut) && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-green-700 font-medium">✅ Annulation gratuite — aucun frais</p>
            <Button variant="destructive" className="w-full" onClick={() => setCancelDialog(true)}>
              ❌ Annuler ma course
            </Button>
          </CardContent>
        </Card>
      )}
      {course.statut === "acceptee" && course.livreur_email && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-red-700">⚠️ Le livreur a accepté. 50% du montant seront prélevés si vous annulez.</p>
            <Button variant="destructive" className="w-full" onClick={() => setCancelDialog(true)}>
              ❌ Annuler la course (frais appliqués)
            </Button>
          </CardContent>
        </Card>
      )}

      {course.note_donnee && course.note_client && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-green-700">✅ Votre avis a été pris en compte</p>
            <div className="flex gap-0.5 mt-1">
              {[1,2,3,4,5].map(s => (
                <span key={s} className={s <= course.note_client ? "text-amber-400" : "text-muted-foreground"}>★</span>
              ))}
            </div>
            {course.commentaire_client && <p className="text-xs text-muted-foreground mt-1">{course.commentaire_client}</p>}
          </CardContent>
        </Card>
      )}

      {/* Signaler un problème */}
      {!["livree"].includes(course.statut) && (
        <Button variant="outline" className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 gap-2"
          onClick={() => setReportOpen(true)}>
          <AlertTriangle className="h-4 w-4" /> Signaler un problème
        </Button>
      )}

      {/* Dialog annulation */}
      <CancelCourseDialog
        open={cancelDialog}
        onOpenChange={setCancelDialog}
        course={course}
        onSuccess={() => setCourse(prev => ({ ...prev, statut: 'annulee' }))}
      />
      <ReportIssueModal open={reportOpen} onOpenChange={setReportOpen} course={course} user={user} />
    </div>
  );
}

function TimelineItem({ label, date, active }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-2 w-2 rounded-full ${active ? "bg-primary" : "bg-muted"}`} />
      <div className="flex-1 flex items-center justify-between">
        <span className="text-sm">{label}</span>
        <span className="text-xs text-muted-foreground">{moment(date).format("DD/MM HH:mm")}</span>
      </div>
    </div>
  );
}