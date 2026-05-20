import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import CourseTrace from "@/lib/CourseTrace";
import { ArrowLeft, Phone, Package, CheckCircle2, Navigation, Zap } from "lucide-react";
import MiniChat from "../../components/MiniChat";
import DispatchTimer from "../../components/DispatchTimer";
import MapSuivi from "../../components/MapSuivi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "../../components/StatusBadge";
import { toast } from "sonner";
import { vibrateSuccess, vibrateMedium, vibrateNotif, playNotificationSound } from "@/lib/vibration";
import { triggerWhatsAppNotification } from "@/lib/whatsappNotifications";
import ContactCard from "@/components/ContactCard";
import { MapPin } from "lucide-react";

export default function CourseLivreur() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  /** Évite qu'un événement temps réel en retard remette la course en "en_cours" après livraison */
  const livreeVerrouilleRef = useRef(false);
  const deliveryInProgressRef = useRef(false);
  const dispatchExpireFiredRef = useRef(false);
  /** Verrou atomique updating — garantit le reset même si navigate() coupe le render */
  const updatingRef = useRef(false);
  const pendingNavigateRef = useRef(null);

  useEffect(() => {
    livreeVerrouilleRef.current = false;
    deliveryInProgressRef.current = false;
    updatingRef.current = false;
    pendingNavigateRef.current = null;
  }, [id]);

  useEffect(() => {
    dispatchExpireFiredRef.current = false;
  }, [id, course?.heure_assignation]);

  // Timer expiré → affichage uniquement, le serveur gère le timeout via checkPendingAssignments (cron 5min)
  const onDispatchTimerExpire = useCallback(() => {
    if (dispatchExpireFiredRef.current) return;
    dispatchExpireFiredRef.current = true;
    // Aucun appel backend ici — le cron checkPendingAssignments est la seule source de redispatch
    console.log(`[DISPATCH_TIMER_EXPIRE] UI only — backend handles timeout | course=${id}`);
  }, [id]);

  useEffect(() => {
    const load = async () => {
      CourseTrace.trace('CourseLivreur', 'MOUNT', { course_id: id, trigger: 'useEffect[id]' });
      const courses = await base44.entities.Course.filter({ id });
      const c = courses[0];
      if (c) {
        CourseTrace.trace('CourseLivreur', 'INITIAL_LOAD', { course_id: id, statut: c.statut, settlement_status: c.settlement_status });
        if (c.is_deleted || c.statut === 'annulee') {
          CourseTrace.trace('CourseLivreur', 'REDIRECT', { course_id: id, reason: c.is_deleted ? 'is_deleted' : 'annulee', to: '/' });
          toast.warning("⚠️ Course annulée par le client.");
          setLoading(false);
          navigate('/');
          return;
        }
        if (c.statut === "livree") livreeVerrouilleRef.current = true;
        setCourse(c);
      } else {
        CourseTrace.trace('CourseLivreur', 'COURSE_NOT_FOUND', { course_id: id });
      }
      setLoading(false);
    };
    load();

    // Subscription temps réel
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.id !== id) return;

      CourseTrace.traceRealtimeEvent({
        course_id: id,
        event_type: event.type,
        statut: event.data?.statut,
        source: 'CourseLivreur',
        subscription: 'Course.subscribe',
        extra: { is_deleted: event.data?.is_deleted, has_data: !!event.data },
      });

      if (!event.data || event.data.is_deleted || event.type === 'delete') {
        CourseTrace.trace('CourseLivreur', 'REDIRECT', { course_id: id, reason: 'deleted_or_no_data', event_type: event.type, to: '/mes-livraisons' });
        console.log(`[CourseLivreur] course supprimée id=${id}, retour automatique`);
        navigate('/mes-livraisons');
        return;
      }
      const incoming = event.data;
      if (incoming.statut === 'annulee' || incoming.is_deleted) {
        CourseTrace.trace('CourseLivreur', 'REDIRECT', { course_id: id, reason: 'annulee', to: '/' });
        toast.warning("⚠️ Course annulée par le client.");
        navigate('/');
        return;
      }
      if (livreeVerrouilleRef.current && incoming.statut !== "livree") {
        CourseTrace.trace('CourseLivreur', 'LIVREE_LOCK_BLOCKED', { course_id: id, incoming_statut: incoming.statut });
        return;
      }
      if (incoming.statut === "livree") livreeVerrouilleRef.current = true;

      CourseTrace.traceSetState({
        course_id: id,
        source: 'CourseLivreur',
        field: 'course',
        old_value: 'prev_statut',
        new_value: incoming.statut,
        trigger: 'Course.subscribe realtime',
      });
      setCourse(incoming);
    });
    return unsub;
  }, [id]);

  // GPS tracking — SOURCE UNIQUE : User.gps_latitude/gps_longitude
  // La position livreur est écrite UNIQUEMENT sur User (via auth.updateMe).
  // Course.livreur_lat/lng est mis à jour toutes les 15s pour le tracking client (throttle).
  useEffect(() => {
    if (!course || !['acceptee', 'driver_en_route_pickup', 'arrived_pickup', 'en_cours', 'driver_en_route_dropoff', 'arrived_dropoff'].includes(course.statut)) return;
    if (!navigator.geolocation) return;
    let lastCourseUpdate = 0;
    const COURSE_UPDATE_THROTTLE = 15000; // 15s max pour Course (économie BDD)
    const update = (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      // SOURCE UNIQUE GPS livreur : User
      base44.auth.updateMe({ gps_latitude: lat, gps_longitude: lng }).catch(() => {});
      // Course.livreur_lat/lng : throttlé à 15s (pour tracking client uniquement)
      const now = Date.now();
      if (now - lastCourseUpdate >= COURSE_UPDATE_THROTTLE) {
        lastCourseUpdate = now;
        base44.entities.Course.update(id, { livreur_lat: lat, livreur_lng: lng }).catch(() => {});
      }
    };
    const watchId = navigator.geolocation.watchPosition(update, null, { enableHighAccuracy: true, maximumAge: 8000, timeout: 10000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [course?.statut, id]);

  // ── Map statut → action courseStateMachine ───────────────────────────────
  const STATUT_TO_ACTION = {
    driver_en_route_pickup: 'EN_ROUTE',
    arrived_pickup:         'ARRIVED_PICKUP',
    en_cours:               'PICKUP',
    arrived_dropoff:        'ARRIVED_DROPOFF',
    livree:                 'DELIVER',
  };

  // ── Transition via machine d'état centrale (seule source de vérité) ────────
  const updateStatut = async (newStatut, extra = {}) => {
    if (updating || updatingRef.current) return;
    const action = STATUT_TO_ACTION[newStatut];
    if (!action) return;
    updatingRef.current = true;
    setUpdating(true);
    const fromStatut = course?.statut;
    console.log(`[CSM_CALL] action=${action} | ${fromStatut} → ${newStatut} | course=${id}`);
    CourseTrace.traceTransition({ course_id: id, from_statut: fromStatut, to_statut: newStatut, source: 'CourseLivreur.updateStatut', trigger: 'button_click' });
    try {
      setCourse(prev => ({ ...prev, statut: newStatut, ...extra }));
      await base44.functions.invoke('courseStateMachine', { course_id: id, action, extra });
      CourseTrace.trace('CourseLivreur', 'BACKEND_OK', { course_id: id, fn: 'courseStateMachine', action, to_statut: newStatut });
      vibrateSuccess();
    } catch (err) {
      console.error(`[CSM_ERROR] action=${action} | ${err?.message}`);
      CourseTrace.traceError({ course_id: id, source: 'CourseLivreur.updateStatut', error: err, context: { fn: 'courseStateMachine', action } });
      toast.error("Erreur : " + (err?.message || "réessayez"));
      setCourse(prev => ({ ...prev, statut: fromStatut }));
    } finally {
      updatingRef.current = false;
      setUpdating(false);
    }
  };

  const recupererColis = () => updateStatut("en_cours", { date_recuperation: new Date().toISOString() });

  const signalerProbleme = async () => {
    if (updating || updatingRef.current) return;
    const desc = window.prompt("Décrivez le problème :");
    if (!desc) return;
    updatingRef.current = true;
    setUpdating(true);
    try {
      await base44.entities.CourseIssue.create({
        course_id: id,
        client_email: course.client_email,
        client_name: course.client_name,
        livreur_email: course.livreur_email,
        livreur_name: course.livreur_name,
        issue_type: "autre",
        description: desc,
        urgency: "urgent",
        status: "nouveau",
        course_statut_at_report: course.statut,
        course_prix: course.prix,
        course_quartier_depart: course.quartier_depart,
        course_quartier_arrivee: course.quartier_arrivee,
      });
      // Notifier admin immédiatement
      base44.functions.invoke("sendCdlNotification", {
        role: "admin",
        title: "⚠️ Problème signalé par livreur",
        body: `${course.livreur_name} : ${desc} — Course ${course.quartier_depart}→${course.quartier_arrivee}`,
        data: { type: "issue_reported", entity_id: id, entity_type: "Course", notif_route: "/gestion-signalements" },
      }).catch(() => {});
      vibrateNotif();
      toast.success("✅ Signalement envoyé à l'admin");
    } catch (err) {
      toast.error("Erreur signalement : " + err.message);
    } finally {
      updatingRef.current = false;
      setUpdating(false);
    }
  };

  const livrerColis = async () => {
    console.log('[DELIVERY_CLICK] livrerColis | course_id:', course?.id, '| statut:', course?.statut, '| settlement:', course?.settlement_status);
    CourseTrace.traceTransition({ course_id: id, from_statut: course?.statut, to_statut: 'livree', source: 'CourseLivreur.livrerColis', trigger: 'button_click' });

    // Verrou dur multi-couche : double-clic, re-render, ou subscription concurrente
    if (updating || updatingRef.current || livreeVerrouilleRef.current || deliveryInProgressRef.current) {
      toast.info("Livraison déjà en cours ou terminée");
      return;
    }
    deliveryInProgressRef.current = true;
    if (course.settlement_status === 'completed') {
      livreeVerrouilleRef.current = true;
      setCourse(prev => ({ ...prev, statut: 'livree' }));
      toast.info("Cette course a déjà été réglée");
      return;
    }

    setUpdating(true);
    const montant = course.prix || 0;
    const gainLivreur = course.gain_livreur || Math.round(montant * 0.8);
    const commissionCdl = course.commission_cdl || (montant - gainLivreur);

    // Verrou de déverrouillage UI — garanti une seule exécution
    let uiUnlocked = false;
    const unlock = (reason) => {
      if (!uiUnlocked) {
        uiUnlocked = true;
        deliveryInProgressRef.current = false;
        updatingRef.current = false;
        setUpdating(false);
        if (reason) console.log('[DELIVERY_UI_REFRESH] unlock reason:', reason);
      }
    };
    updatingRef.current = true;

    try {
      // Idempotence : relire avant d'appeler le backend
      const freshCourses = await base44.entities.Course.filter({ id: course.id });
      const fresh = freshCourses?.[0];
      if (fresh?.statut === 'livree' || fresh?.settlement_status === 'completed') {
        unlock('ALREADY_DONE');
        livreeVerrouilleRef.current = true;
        setCourse(prev => ({ ...prev, statut: 'livree' }));
        toast.success('Course déjà livrée !');
        return;
      }

      // Appel unique à courseStateMachine — settlement + transition atomique en une seule fonction
      CourseTrace.traceBackend({ course_id: id, source: 'CourseLivreur', fn: 'courseStateMachine.DELIVER', payload_summary: `montant=${course.prix}` });
      console.log('[CSM_CALL] action=DELIVER | course:', id);

      const res = await base44.functions.invoke('courseStateMachine', { course_id: course.id, action: 'DELIVER' });
      const resData = res?.data;

      if (resData?.alreadyDone) {
        unlock('ALREADY_DONE');
        livreeVerrouilleRef.current = true;
        setCourse(prev => ({ ...prev, statut: 'livree' }));
        toast.success('Course déjà livrée !');
        return;
      }

      if (!resData?.success) {
        unlock('CSM_FAILED');
        if (resData?.insuffisant) {
          toast.error(`Solde Bedou client insuffisant. Contactez l'admin.`);
        } else {
          toast.error(resData?.error || 'Erreur lors de la livraison');
        }
        return;
      }

      const finalGain = resData?.gain_livreur || gainLivreur;
      unlock('SUCCESS');
      livreeVerrouilleRef.current = true;
      setCourse(prev => ({ ...prev, statut: 'livree', date_livraison: new Date().toISOString(), gain_livreur: finalGain }));

      vibrateSuccess();
      toast.success(`🎉 Livraison confirmée ! +${finalGain?.toLocaleString()} FCFA crédités sur votre Bedou.`);

      // Notifications gérées par notificationOrchestrator (appelé depuis courseStateMachine.DELIVER)
      // NE PAS dupliquer ici — source unique = notificationOrchestrator

    } catch (err) {
      console.error('[CSM_ERROR] DELIVER unexpected:', err?.message);
      unlock('CATCH');
      toast.error('Erreur inattendue : ' + (err?.message || 'réessayez'));
    } finally {
      if (!uiUnlocked) unlock('FINALLY');
    }
  };

  const marquerCourseEffectuee = async () => {
    if (!id) {
      toast.error('Course introuvable');
      return;
    }
    // ANTI-DOUBLE : si déjà livree via settlement, la décrémentation s'est faire ailleurs
    // Cet écran est juste pour "fermer" la vue — ne pas re-décrémenter
    updatingRef.current = true;
    setUpdating(true);
    try {
      vibrateSuccess();
      toast.success('✅ Course terminée ! Vous êtes de nouveau disponible.');
      navigate('/mes-livraisons');
    } catch (err) {
      toast.error(err.message || 'Erreur inattendue — Réessayez.');
    } finally {
      updatingRef.current = false;
      setUpdating(false);
    }
  };

  const openMaps = () => {
    // L'itinéraire va toujours vers le point de DÉPART (récupération du colis)
    let dest;
    if (course.latitude_depart && course.longitude_depart) {
      dest = `${course.latitude_depart},${course.longitude_depart}`;
    } else {
      dest = encodeURIComponent(`${course.quartier_depart}, Ouagadougou, Burkina Faso`);
    }
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, "_blank");
  };

  const openMapsArrivee = () => {
    const dest = encodeURIComponent(`${course.quartier_arrivee}, Ouagadougou, Burkina Faso`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Course introuvable</p>
      </div>
    );
  }

  // Numéros utiles
  const phoneClient = course.telephone_expediteur || course.telephone_destinataire || "";
  const phoneDestinataire = course.telephone_destinataire || "";

  const callNumber = (num) => { if (num) window.open(`tel:${num}`); };
  const whatsappNumber = (num) => { if (num) window.open(`https://wa.me/${num.replace(/\D/g, "")}`); };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Course en cours</h1>
          <p className="text-xs text-gray-400">#{course.id?.slice(0, 8)}</p>
        </div>
        <StatusBadge statut={course.statut} />
      </div>

      {/* Urgence */}
      {course.urgence && course.urgence !== 'normal' && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm ${
          course.urgence === 'tres_urgent' ? 'bg-red-500 text-white' : 'bg-orange-400 text-white'
        }`}>
          <Zap className="h-4 w-4" />
          {course.urgence === 'tres_urgent' ? '🚨 Très urgent — livraison prioritaire' : '🔔 Urgent — livraison rapide demandée'}
        </div>
      )}

      {/* Itinéraire */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-1">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <div className="h-10 w-0.5 bg-gray-200 my-1" />
              <div className="h-3 w-3 rounded-full bg-red-500" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold">Récupération</p>
                <p className="text-base font-bold">{course.quartier_depart}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold">Livraison</p>
                <p className="text-base font-bold">{course.quartier_arrivee}</p>
              </div>
            </div>
          </div>
          {/* Prix */}
          <div className="mt-4 flex items-center justify-between pt-3 border-t">
            <span className="text-sm text-gray-500">Prix de la course</span>
            <span className="text-xl font-extrabold text-gray-900">{(course.prix || 0).toLocaleString()} FCFA</span>
          </div>
          {course.type_colis && (
            <div className="flex items-center gap-2 mt-2">
              <Package className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">{course.type_colis}</span>
              {course.description && <span className="text-xs text-gray-400">— {course.description}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Boutons d'action principaux : Appeler / WhatsApp / Maps */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => callNumber(phoneClient)}
          disabled={!phoneClient}
          className="flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 border-gray-200 bg-white active:scale-95 transition-all disabled:opacity-30"
        >
          <Phone className="h-6 w-6 text-blue-600" />
          <span className="text-xs font-semibold text-gray-700">Appeler</span>
        </button>
        <button
          onClick={() => whatsappNumber(phoneClient)}
          disabled={!phoneClient}
          className="flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 border-green-200 bg-green-50 active:scale-95 transition-all disabled:opacity-30"
        >
          <span className="text-2xl">💬</span>
          <span className="text-xs font-semibold text-green-700">WhatsApp</span>
        </button>
        <button
          onClick={openMaps}
          className="flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 border-blue-200 bg-blue-50 active:scale-95 transition-all"
        >
          <Navigation className="h-6 w-6 text-blue-600" />
          <span className="text-xs font-semibold text-blue-700">Maps départ</span>
        </button>
      </div>

      {/* Bouton signalement — disponible dès que la course est acceptée */}
      {['acceptee', 'driver_en_route_pickup', 'arrived_pickup', 'en_cours', 'arrived_dropoff'].includes(course.statut) && (
        <button
          onClick={signalerProbleme}
          disabled={updating}
          className="w-full py-3 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold active:scale-95 transition-all"
        >
          ⚠️ Signaler un problème
        </button>
      )}

      {/* Contacts détaillés */}
      <div className="space-y-2">
        {course.telephone_expediteur && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border">
            <div>
              <p className="text-xs text-gray-400">Expéditeur / Récupération</p>
              <p className="text-sm font-semibold">{course.nom_expediteur || "—"} · {course.telephone_expediteur}</p>
            </div>
            <button onClick={() => callNumber(course.telephone_expediteur)} className="p-2 rounded-lg bg-blue-100 active:scale-95">
              <Phone className="h-4 w-4 text-blue-600" />
            </button>
          </div>
        )}
        {course.telephone_destinataire && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border">
            <div>
              <p className="text-xs text-gray-400">Destinataire / Livraison</p>
              <p className="text-sm font-semibold">{course.nom_destinataire || "—"} · {course.telephone_destinataire}</p>
            </div>
            <button onClick={() => callNumber(course.telephone_destinataire)} className="p-2 rounded-lg bg-blue-100 active:scale-95">
              <Phone className="h-4 w-4 text-blue-600" />
            </button>
          </div>
        )}
      </div>

      {/* Position client en temps réel — si partagée */}
      {["acceptee", "en_cours"].includes(course.statut) && course.client_sharing_location && (
        course.client_lat_live ? (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-green-50 border-2 border-green-300">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-800">📍 Position client en direct</p>
                <p className="text-xs text-green-600">Le client partage sa position GPS</p>
              </div>
            </div>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${course.client_lat_live},${course.client_lng_live}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded-xl active:scale-95"
            >
              <MapPin className="h-3.5 w-3.5" /> Y aller
            </a>
          </div>
        ) : (
          course.destinataire_lat_live ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-blue-50 border-2 border-blue-300">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-blue-800">📍 Position destinataire en direct</p>
                  <p className="text-xs text-blue-600">Le destinataire partage sa position GPS</p>
                </div>
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${course.destinataire_lat_live},${course.destinataire_lng_live}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl active:scale-95"
              >
                <MapPin className="h-3.5 w-3.5" /> Y aller
              </a>
            </div>
          ) : null
        )
      )}

      {/* Mini-carte */}
      {["acceptee", "en_cours"].includes(course.statut) && course.livreur_lat && (
        <MapSuivi
          livreurLat={course.livreur_lat}
          livreurLng={course.livreur_lng}
          label={course.statut === "en_cours" ? "En livraison 🛵" : "En route 🛵"}
        />
      )}

      {/* === SECTION SUIVI — boutons d'étapes === */}

      {/* assignee_attente : timer + accepter/refuser */}
      {course.statut === 'assignee_attente' && (
        <div className="space-y-3">
          <DispatchTimer
            heureAssignation={course.heure_assignation}
            dureeSecondes={60}
            onExpire={onDispatchTimerExpire}
          />
          <div className="flex gap-3">
            <button
              disabled={updating || updatingRef.current}
              onClick={async () => {
                if (updatingRef.current) return;
                console.log(`[CSM_CALL] action=REFUSE | course=${id}`);
                updatingRef.current = true;
                setUpdating(true);
                let shouldNavigate = false;
                try {
                  await base44.functions.invoke('courseStateMachine', { course_id: id, action: 'REFUSE' });
                  toast.info("Course refusée");
                  shouldNavigate = true;
                } catch (err) {
                  console.error(`[CSM_ERROR] REFUSE | ${err?.message}`);
                  toast.error("Erreur refus : " + (err?.message || "réessayez"));
                } finally {
                  updatingRef.current = false;
                  setUpdating(false);
                  if (shouldNavigate) navigate(-1);
                }
              }}
              className="flex-1 py-4 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-medium active:scale-95 transition-all disabled:opacity-50"
            >
              Refuser
            </button>
            <button
              disabled={updating || updatingRef.current}
              onClick={async () => {
                if (updatingRef.current) return;
                console.log(`[CSM_CALL] action=ACCEPT | course=${id}`);
                updatingRef.current = true;
                setUpdating(true);
                try {
                  const res = await base44.functions.invoke('courseStateMachine', { course_id: id, action: 'ACCEPT' });
                  if (res?.data?.success || res?.data?.alreadyDone) {
                    toast.success("✅ Course acceptée !");
                    // La subscription realtime met à jour le statut automatiquement
                  } else {
                    const currentStatut = res?.data?.current_statut || '?';
                    if (currentStatut === 'acceptee' || currentStatut === 'en_cours') {
                      toast.info("Course déjà acceptée.");
                    } else {
                      toast.error("Course non disponible (statut: " + currentStatut + ")");
                    }
                  }
                } catch (err) {
                  console.error(`[CSM_ERROR] ACCEPT | ${err?.message}`);
                  toast.error("Erreur : " + (err?.message || "réessayez"));
                } finally {
                  updatingRef.current = false;
                  setUpdating(false);
                }
              }}
              className="flex-[2] py-4 rounded-xl bg-green-500 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-green-200 disabled:opacity-50"
            >
              ✅ ACCEPTER
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 1 — acceptée : en route vers le départ */}
      {course.statut === "acceptee" && (
        <div className="space-y-3">
          <div className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-700 text-center font-medium">
            📍 Étape 1/4 — Rendez-vous au point de récupération
          </div>
          <button
            onClick={() => { vibrateMedium(); updateStatut("driver_en_route_pickup"); toast.success("En route vers le départ !"); }}
            disabled={updating}
            className="w-full py-5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-blue-200"
          >
            {updating ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mise à jour...</span> : "🛵 Je suis en route (départ)"}
          </button>
        </div>
      )}

      {/* ÉTAPE 2 — En route vers pickup : arrivé au départ */}
      {course.statut === "driver_en_route_pickup" && (
        <div className="space-y-3">
          <div className="px-3 py-2 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-700 text-center font-medium">
            📍 Étape 2/4 — Arrivez au point de récupération
          </div>
          <button
            onClick={() => { vibrateMedium(); updateStatut("arrived_pickup", { date_arrivee_depart: new Date().toISOString() }); toast.success("Arrivé au point de départ !"); }}
            disabled={updating}
            className="w-full py-5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-orange-200"
          >
            {updating ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mise à jour...</span> : "📍 Arrivé au point de départ"}
          </button>
        </div>
      )}

      {/* ÉTAPE 3 — Arrivé pickup : colis récupéré + en route destination */}
      {course.statut === "arrived_pickup" && (
        <div className="space-y-3">
          <div className="px-3 py-2 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-700 text-center font-medium">
            📦 Étape 3/4 — Récupérez le colis, puis partez en livraison
          </div>
          <button
            onClick={() => { vibrateSuccess(); recupererColis(); toast.success("Colis récupéré — en route !"); }}
            disabled={updating}
            className="w-full py-5 rounded-2xl bg-purple-500 hover:bg-purple-600 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-purple-200"
          >
            {updating ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mise à jour...</span> : "📦 Colis récupéré — En route !"}
          </button>
        </div>
      )}

      {/* Maps arrivée si colis récupéré / en_cours */}
      {course.statut === "en_cours" && (
        <button
          onClick={openMapsArrivee}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-blue-300 bg-blue-50 text-blue-700 font-semibold active:scale-95 transition-all"
        >
          <Navigation className="h-5 w-5" />
          Naviguer vers la livraison
        </button>
      )}

      {/* ÉTAPE 4a — En_cours : arrivé destination */}
      {course.statut === "en_cours" && (
        <div className="space-y-3">
          <div className="px-3 py-2 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-700 text-center font-medium">
            🏁 Étape 4/4 — Livrez le colis au destinataire
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { vibrateMedium(); updateStatut("arrived_dropoff", { date_arrivee_destination: new Date().toISOString() }); toast.success("Arrivé à destination !"); }}
              disabled={updating}
              className="flex-1 py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-extrabold active:scale-95 transition-all shadow-md shadow-teal-200"
            >
              {updating ? "..." : "📍 Arrivé destination"}
            </button>
            <button
              onClick={livrerColis}
              disabled={updating}
              className="flex-[2] py-4 rounded-2xl bg-green-500 hover:bg-green-600 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-green-200"
            >
              {updating ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Traitement...</span> : "✅ Colis livré"}
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 4b — Arrivé destination : livraison finale */}
      {course.statut === "arrived_dropoff" && (
        <div className="space-y-3">
          <div className="px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-xs text-green-700 text-center font-medium">
            🎯 Remettez le colis et confirmez la livraison
          </div>
          <button
            onClick={livrerColis}
            disabled={updating || course.settlement_status === 'completed'}
            className="w-full py-5 rounded-2xl bg-green-500 hover:bg-green-600 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {course.settlement_status === 'completed'
              ? "✅ Course terminée"
              : updating ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Traitement...</span>
              : "✅ Colis livré — Confirmer"}
          </button>
        </div>
      )}

      {/* livree */}
      {course.statut === "livree" && (
        <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-6 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-9 w-9 text-green-600" />
          </div>
          <div>
            <p className="text-green-800 font-extrabold text-lg">🎉 Livraison réussie !</p>
            {course.gain_livreur > 0 && (
              <p className="text-green-600 font-bold text-base mt-1">+{course.gain_livreur?.toLocaleString()} FCFA sur votre Bedou</p>
            )}
          </div>
          <button
            onClick={() => marquerCourseEffectuee()}
            disabled={updating}
            className="w-full py-4 rounded-xl bg-green-600 text-white font-bold text-base active:scale-95 transition-all"
          >
            {updating ? "..." : "Terminer et reprendre des courses"}
          </button>
          <button onClick={() => navigate('/mes-livraisons')} className="text-xs text-green-700 underline">
            Voir mon historique
          </button>
        </div>
      )}

      {/* Chat */}
      {["acceptee", "en_cours"].includes(course.statut) && (
        <MiniChat course={course} user={{ email: course.livreur_email, full_name: course.livreur_name, user_type: "livreur" }} />
      )}
    </div>
  );
}