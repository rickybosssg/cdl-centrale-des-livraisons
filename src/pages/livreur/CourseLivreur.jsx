import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Phone, Package, CheckCircle2, Navigation, Zap } from "lucide-react";
import MiniChat from "../../components/MiniChat";
import DispatchTimer from "../../components/DispatchTimer";
import MapSuivi from "../../components/MapSuivi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "../../components/StatusBadge";
import { toast } from "sonner";
import { vibrateSuccess, vibrateMedium, vibrateNotif, playNotificationSound } from "@/lib/vibration";
import { triggerWhatsAppNotification, waMsgCourseCompletedClient, waMsgCourseCompletedDriver } from "@/lib/whatsappNotifications";
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
  const dispatchExpireFiredRef = useRef(false);

  useEffect(() => {
    livreeVerrouilleRef.current = false;
  }, [id]);

  useEffect(() => {
    dispatchExpireFiredRef.current = false;
  }, [id, course?.heure_assignation]);

  const onDispatchTimerExpire = useCallback(() => {
    if (dispatchExpireFiredRef.current) return;
    dispatchExpireFiredRef.current = true;
    base44.functions
      .invoke("checkPendingAssignments", { course_id: id, force_immediate: true })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    const load = async () => {
      const courses = await base44.entities.Course.filter({ id });
      if (courses.length > 0) {
        const c = courses[0];
        if (c.statut === "livree") livreeVerrouilleRef.current = true;
        setCourse(c);
      }
      setLoading(false);
    };
    load();

    // Subscription temps réel
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.id !== id || !event.data) return;
      const incoming = event.data;
      if (livreeVerrouilleRef.current && incoming.statut !== "livree") {
        return;
      }
      if (incoming.statut === "livree") livreeVerrouilleRef.current = true;
      setCourse(incoming);
    });
    return unsub;
  }, [id]);

  // GPS tracking — partage la position du livreur en temps réel
  useEffect(() => {
    if (!course || !['acceptee', 'driver_en_route_pickup', 'arrived_pickup', 'en_cours', 'driver_en_route_dropoff', 'arrived_dropoff'].includes(course.statut)) return;
    if (!navigator.geolocation) return;
    const update = (pos) => {
      base44.entities.Course.update(id, {
        livreur_lat: pos.coords.latitude,
        livreur_lng: pos.coords.longitude,
      });
      // Aussi sur le profil livreur
      base44.auth.updateMe({
        gps_latitude: pos.coords.latitude,
        gps_longitude: pos.coords.longitude,
      });
    };
    const watchId = navigator.geolocation.watchPosition(update, null, { enableHighAccuracy: true, maximumAge: 8000, timeout: 10000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [course?.statut, id]);

  // ── Transitions de statut valides pour le livreur ──────────────────────────
  const LIVREUR_TRANSITIONS = {
    acceptee:               ['driver_en_route_pickup'],
    driver_en_route_pickup: ['arrived_pickup'],
    arrived_pickup:         ['en_cours'],
    en_cours:               ['arrived_dropoff', 'livree'],
    arrived_dropoff:        ['livree'],
  };

  const updateStatut = async (newStatut, extra = {}) => {
    if (updating) return;
    const validNext = LIVREUR_TRANSITIONS[course?.statut] || [];
    if (!validNext.includes(newStatut)) return;
    setUpdating(true);
    console.log(`[STATUT_CLICK] ${course?.statut} → ${newStatut} | course=${id}`);
    try {
      setCourse(prev => ({ ...prev, statut: newStatut, ...extra }));
      await base44.functions.invoke('updateCourseStatut', { course_id: id, new_statut: newStatut, extra });
      vibrateSuccess();
    } catch (err) {
      console.error(`[STATUT_ERROR] ${newStatut} | ${err?.message}`);
      toast.error("Erreur : " + (err?.message || "réessayez"));
      // Rollback UI
      setCourse(prev => ({ ...prev, statut: course?.statut }));
    } finally {
      setUpdating(false);
    }
  };

  const recupererColis = () => updateStatut("en_cours", { date_recuperation: new Date().toISOString() });

  const signalerProbleme = async () => {
    if (updating) return;
    const desc = window.prompt("Décrivez le problème :");
    if (!desc) return;
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
      setUpdating(false);
    }
  };

  const livrerColis = async () => {
    console.log('[DELIVERY_CLICK] livrerColis | course_id:', course?.id, '| statut:', course?.statut, '| settlement:', course?.settlement_status);

    if (updating || livreeVerrouilleRef.current) {
      toast.info("Livraison déjà en cours ou terminée");
      return;
    }
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

    // Timer de sécurité UI 8s — déblocage garanti même si tout plante
    let uiUnlocked = false;
    const unlock = (reason) => {
      if (!uiUnlocked) {
        uiUnlocked = true;
        clearTimeout(uiTimer);
        setUpdating(false);
        if (reason) console.log('[DELIVERY_UI_REFRESH] unlock reason:', reason);
      }
    };
    const uiTimer = setTimeout(() => {
      unlock('UI_TIMEOUT_8S');
      toast.error('⏱ Délai dépassé (8s). Vérifiez votre connexion et réessayez.');
    }, 8000);

    try {
      // Idempotence : relire la course avant de lancer le settlement
      const freshCourses = await base44.entities.Course.filter({ id: course.id });
      const fresh = freshCourses?.[0];
      if (fresh?.statut === 'livree' || fresh?.settlement_status === 'completed') {
        unlock('ALREADY_DONE');
        livreeVerrouilleRef.current = true;
        setCourse(prev => ({ ...prev, statut: 'livree' }));
        toast.success('Course déjà livrée !');
        return;
      }

      console.log('[DELIVERY_BACKEND_START] invoking bedouEngine | montant:', montant);
      let res;
      try {
        res = await Promise.race([
          base44.functions.invoke('bedouEngine', {
            action: 'finaliser_course',
            course_id: course.id,
            client_email: course.client_email,
            client_nom: course.client_name,
            livreur_email: course.livreur_email,
            livreur_nom: course.livreur_name,
            montant,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('BEDOU_TIMEOUT')), 7000)),
        ]);
        console.log('[DELIVERY_BACKEND_SUCCESS] bedouEngine response:', res?.data?.success, res?.data?.alreadyDone);
      } catch (bedouErr) {
        console.error('[DELIVERY_BACKEND_ERROR] bedouEngine error:', bedouErr?.message);
        unlock('BEDOU_ERROR');
        toast.error('Erreur règlement Bedou : ' + (bedouErr?.message || 'réessayez'));
        return;
      }

      if (!res?.data?.success && !res?.data?.alreadyDone) {
        unlock('BEDOU_FAILED');
        if (res?.data?.insuffisant) {
          toast.error(`Solde Bedou client insuffisant (${res.data.solde?.toLocaleString()} FCFA). Contactez l'admin.`);
        } else {
          toast.error(res?.data?.error || 'Erreur lors du règlement');
        }
        return;
      }

      // Mettre à jour statut course → livree via backend (service role, pas de 403)
      console.log('[DELIVERY_BACKEND_START] updating course status → livree');
      await base44.functions.invoke('updateCourseDelivered', {
        course_id: course.id,
        commission_cdl: commissionCdl,
        gain_livreur: gainLivreur,
      });
      console.log('[DELIVERY_UI_REFRESH] course status updated → livree');

      unlock('SUCCESS');
      livreeVerrouilleRef.current = true;
      setCourse(prev => ({ ...prev, statut: 'livree', date_livraison: new Date().toISOString(), gain_livreur: gainLivreur }));

      vibrateSuccess();
      toast.success(`🎉 Livraison confirmée ! +${gainLivreur?.toLocaleString()} FCFA crédités sur votre Bedou.`);

      // Fire & forget — stats + notifs
      base44.entities.User.filter({ email: course.livreur_email }).then(livs => {
        if (livs[0]) base44.entities.User.update(livs[0].id, {
          total_courses_livrees: (livs[0].total_courses_livrees || 0) + 1,
        }).catch(() => {});
      }).catch(() => {});
      base44.functions.invoke('updateLivreurStreak', {}).catch(() => {});

      const notif_key_client = `${course.client_email}__livree__${course.id}__client`;
      const notif_key_admin = `weezyh2@gmail.com__livree__${course.id}__admin`;
      base44.entities.Notification.create({
        destinataire_email: course.client_email, destinataire_role: 'client',
        titre: '✅ Colis livré ! Notez votre livreur',
        message: `Votre colis a été livré par ${course.livreur_name}. ${montant.toLocaleString()} FCFA débités de votre Bedou.`,
        type: 'success', lue: false, course_id: course.id,
        target_screen: `/course/${course.id}/track`,
        notification_key: notif_key_client,
      }).catch(() => {});
      base44.entities.Notification.create({
        destinataire_email: 'weezyh2@gmail.com', destinataire_role: 'admin',
        titre: '📦 Course livrée',
        message: `Course ${course.quartier_depart}→${course.quartier_arrivee} livrée par ${course.livreur_name}. ${montant.toLocaleString()} FCFA réglés.`,
        type: 'success', lue: false, course_id: course.id, target_screen: '/gerer-courses',
        notification_key: notif_key_admin,
      }).catch(() => {});
      triggerWhatsAppNotification({ eventType: 'course_completed', recipientRole: 'client', recipientName: course.client_name || 'Client', recipientPhone: course.telephone_expediteur, messageText: waMsgCourseCompletedClient(), entityId: course.id, entityType: 'course', priority: 'normal' });
      triggerWhatsAppNotification({ eventType: 'course_completed_driver', recipientRole: 'driver', recipientName: course.livreur_name || '', recipientPhone: course.telephone_livreur, messageText: waMsgCourseCompletedDriver(), entityId: course.id, entityType: 'course', priority: 'normal' });

    } catch (err) {
      console.error('[DELIVERY_BACKEND_ERROR] unexpected:', err?.message);
      unlock('CATCH');
      toast.error('Erreur inattendue : ' + (err?.message || 'réessayez'));
    }
  };

  const marquerCourseEffectuee = async () => {
    if (!id) {
      toast.error('Course introuvable');
      return;
    }
    // ANTI-DOUBLE : si déjà livree via settlement, la décrémentation s'est faire ailleurs
    // Cet écran est juste pour "fermer" la vue — ne pas re-décrémenter
    setUpdating(true);
    try {
      vibrateSuccess();
      toast.success('✅ Course terminée ! Vous êtes de nouveau disponible.');
      navigate('/mes-livraisons');
    } catch (err) {
      toast.error(err.message || 'Erreur inattendue — Réessayez.');
    } finally {
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
              disabled={updating}
              onClick={async () => {
                console.log(`[REFUSE_CLICK] course=${id} | statut=${course?.statut}`);
                setUpdating(true);
                try {
                  await base44.functions.invoke('refuseCourseAction', { course_id: id });
                  toast.info("Course refusée");
                  navigate(-1);
                } catch (err) {
                  console.error(`[REFUSE_ERROR] ${err?.message}`);
                  toast.error("Erreur refus : " + (err?.message || "réessayez"));
                } finally {
                  setUpdating(false);
                }
              }}
              className="flex-1 py-4 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-medium active:scale-95 transition-all"
            >
              Refuser
            </button>
            <button
              disabled={updating}
              onClick={async () => {
                console.log(`[ACCEPT_CLICK] course=${id} | statut=${course?.statut}`);
                setUpdating(true);
                try {
                  const res = await base44.functions.invoke('acceptCourseAction', { course_id: id });
                  if (res?.data?.success) {
                    console.log(`[ACCEPT_SUCCESS] course=${id}`);
                    toast.success("✅ Course acceptée !");
                  } else {
                    toast.error("Course non disponible (statut: " + (res?.data?.statut || "?") + ")");
                  }
                } catch (err) {
                  console.error(`[ACCEPT_ERROR] ${err?.message}`);
                  toast.error("Erreur : " + (err?.message || "réessayez"));
                } finally {
                  setUpdating(false);
                }
              }}
              className="flex-[2] py-4 rounded-xl bg-green-500 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-green-200"
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