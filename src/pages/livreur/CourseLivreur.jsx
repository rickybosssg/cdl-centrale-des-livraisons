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
        console.warn("[CourseLivreur] subscribe ignoré (stale après livraison):", incoming.statut);
        return;
      }
      if (incoming.statut === "livree") livreeVerrouilleRef.current = true;
      setCourse(incoming);
    });
    return unsub;
  }, [id]);

  // GPS tracking — partage la position du livreur en temps réel
  useEffect(() => {
    if (!course || !['acceptee', 'en_cours'].includes(course.statut)) return;
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

  const recupererColis = async () => {
    setUpdating(true);
    // Optimistic UI
    setCourse(prev => ({ ...prev, statut: "en_cours", date_recuperation: new Date().toISOString() }));
    await base44.entities.Course.update(id, {
      statut: "en_cours",
      date_recuperation: new Date().toISOString(),
    });
    vibrateSuccess();
    toast.success("Colis récupéré !");
    setUpdating(false);
  };

  const BEDOU_INVOKE_MS = 45000;

  const livrerColis = async () => {
    if (updating || livreeVerrouilleRef.current) return;
    setUpdating(true);
    console.log('[CourseLivreur] livrerColis START — course.id:', course.id, 'statut:', course.statut);
    const montant = course.prix || 0;
    const gainLivreur = course.gain_livreur || Math.round(montant * 0.8);
    const commissionCdl = course.commission_cdl || (montant - gainLivreur);

    try {
      // 1. Débiter client + créditer livreur via Bedou (timeout pour ne pas rester bloqué sur "Mise à jour...")
      // Vérification idempotence : relire la course pour s'assurer qu'elle n'est pas déjà livrée
      const freshCourses = await base44.entities.Course.filter({ id: course.id });
      if (freshCourses?.[0]?.statut === 'livree') {
        livreeVerrouilleRef.current = true;
        setCourse(prev => ({ ...prev, statut: 'livree' }));
        toast.success('Course déjà marquée comme livrée !');
        setUpdating(false);
        return;
      }

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
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('BEDOU_TIMEOUT')), BEDOU_INVOKE_MS)
          ),
        ]);
      } catch (err) {
        if (err?.message === 'BEDOU_TIMEOUT') {
          toast.error('Délai dépassé — vérifiez la connexion et réessayez.');
          setUpdating(false);
          return;
        }
        console.error('[CourseLivreur] bedouEngine error:', err);
        toast.error('Erreur Bedou : ' + (err?.message || 'inconnue') + ' — Réessayez.');
        setUpdating(false);
        return;
      }

      console.log('[CourseLivreur] bedouEngine result:', res?.data);
      if (res?.data?.alreadyDone) {
        // Course déjà réglée — mettre à jour le statut UI sans erreur
        console.log('[CourseLivreur] course déjà réglée, mise à jour statut uniquement');
      } else if (!res?.data?.success) {
        if (res?.data?.insuffisant) {
          toast.error(`Solde Bedou du client insuffisant (${res.data.solde} FCFA). Contactez l'administration.`);
        } else {
          toast.error(res?.data?.error || 'Erreur lors du règlement Bedou');
        }
        setUpdating(false);
        return;
      }

      // 2. Mettre à jour la course en BDD
      await base44.entities.Course.update(id, {
        statut: 'livree',
        date_livraison: new Date().toISOString(),
        statut_paiement: 'paye',
        commission_cdl: commissionCdl,
        gain_livreur: gainLivreur,
        statut_paiement_livreur: 'Payé',
      });
      console.log('[CourseLivreur] Course mise à jour → livree');

      // 3. UI + verrou anti-régression subscribe
      livreeVerrouilleRef.current = true;
      setCourse(prev => ({
        ...prev,
        statut: 'livree',
        date_livraison: new Date().toISOString(),
        gain_livreur: gainLivreur,
      }));

      // 4. Stats livreur (fire & forget)
      base44.entities.User.filter({ email: course.livreur_email }).then(livreurs => {
        if (livreurs.length > 0) {
          const livreur = livreurs[0];
          base44.entities.User.update(livreur.id, {
            total_courses_livrees: (livreur.total_courses_livrees || 0) + 1,
            nombre_courses_actives: Math.max(0, (livreur.nombre_courses_actives || 0) - 1),
          }).catch(e => console.warn('[CourseLivreur] stats livreur err:', e));
        }
      }).catch(() => {});

      // 5. Streak (fire & forget)
      base44.functions.invoke('updateLivreurStreak', {}).catch(() => {});

      // 6. Notif in-app client (la notification FCM est gérée par l'automation notifyCourseEvents)
      base44.entities.Notification.create({
        destinataire_email: course.client_email,
        destinataire_role: 'client',
        titre: '✅ Colis livré ! Notez votre livreur',
        message: `Votre colis a été livré par ${course.livreur_name}. ${montant.toLocaleString()} FCFA débités de votre Bedou. Appuyez pour noter !`,
        type: 'success',
        lue: false,
        course_id: course.id,
        target_screen: `/course/${course.id}/track`,
        notification_key: `${course.client_email}__livree__${course.id}__client`,
      }).catch(() => {});

      vibrateSuccess();
      toast.success(`🎉 Livraison confirmée ! +${gainLivreur} FCFA crédités sur votre Bedou.`);
      triggerWhatsAppNotification({
        eventType: 'course_completed',
        recipientRole: 'client',
        recipientName: course.client_name || 'Client',
        recipientPhone: course.telephone_expediteur,
        messageText: waMsgCourseCompletedClient(),
        entityId: course.id,
        entityType: 'course',
        priority: 'normal',
      });
      triggerWhatsAppNotification({
        eventType: 'course_completed_driver',
        recipientRole: 'driver',
        recipientName: course.livreur_name || '',
        recipientPhone: course.telephone_livreur,
        messageText: waMsgCourseCompletedDriver(),
        entityId: course.id,
        entityType: 'course',
        priority: 'normal',
      });
      console.log('[CourseLivreur] livrerColis DONE — gainLivreur:', gainLivreur);
    } catch (err) {
      console.error('[CourseLivreur] livrerColis error:', err);
      toast.error('Erreur : ' + (err?.message || 'inattendue — réessayez.'));
    } finally {
      setUpdating(false);
    }
  };

  const marquerCourseEffectuee = async () => {
    if (!id) {
      toast.error('Course introuvable');
      return;
    }
    setUpdating(true);
    console.log('[CourseLivreur] marquerCourseEffectuee START — course.id:', id);
    try {
      // Remettre le livreur disponible
      const me = await base44.auth.me();
      await base44.auth.updateMe({
        disponible: true,
        nombre_courses_actives: Math.max(0, (me.nombre_courses_actives || 0) - 1),
      });
      console.log('[CourseLivreur] marquerCourseEffectuee DONE — livreur remis disponible');
      vibrateSuccess();
      toast.success('✅ Course terminée + vous êtes de nouveau disponible !');
      navigate('/mes-livraisons');
    } catch (err) {
      console.error('[CourseLivreur] marquerCourseEffectuee error:', err);
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

      {/* Bouton Maps arrivée si colis récupéré */}
      {course.statut === "en_cours" && (
        <button
          onClick={openMapsArrivee}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-blue-300 bg-blue-50 text-blue-700 font-semibold active:scale-95 transition-all"
        >
          <Navigation className="h-5 w-5" />
          Naviguer vers la livraison
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
                setUpdating(true);
                const me = await base44.auth.me();
                let historique = [];
                try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}
                historique = historique.map(h =>
                  h.livreur_email === me.email && h.statut === 'proposee'
                    ? { ...h, statut: 'refuse', heure_refus: new Date().toISOString() }
                    : h
                );
                await base44.entities.Course.update(id, {
                  statut: 'en_attente', livreur_email: null, livreur_name: null,
                  telephone_livreur: null, heure_assignation: null,
                  historique_assignation: JSON.stringify(historique),
                });
                await base44.auth.updateMe({
                  nombre_courses_actives: Math.max(0, (me.nombre_courses_actives || 1) - 1),
                  courses_refusees: (me.courses_refusees || 0) + 1,
                  courses_refusees_consecutives: (me.courses_refusees_consecutives || 0) + 1,
                }).catch(() => {});
                base44.functions.invoke('autoDispatch', { course_id: id, exclude_emails: [me.email], force: true }).catch(() => {});
                toast.info("Course refusée");
                navigate(-1);
                setUpdating(false);
              }}
              className="flex-1 py-4 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-medium active:scale-95 transition-all"
            >
              Refuser
            </button>
            <button
              disabled={updating}
              onClick={async () => {
                setUpdating(true);
                const me = await base44.auth.me();
                await base44.entities.Course.update(id, {
                  statut: "acceptee",
                  livreur_email: me.email,
                  livreur_name: me.full_name,
                  date_acceptation: new Date().toISOString(),
                });
                await base44.auth.updateMe({
                  nombre_courses_actives: (me.nombre_courses_actives || 0) + 1,
                  courses_acceptees: (me.courses_acceptees || 0) + 1,
                  courses_refusees_consecutives: 0,
                });
                toast.success("✅ Course acceptée !");
                setUpdating(false);
              }}
              className="flex-[2] py-4 rounded-xl bg-green-500 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-green-200"
            >
              ✅ ACCEPTER
            </button>
          </div>
        </div>
      )}

      {/* acceptee : je suis arrivé + récupéré */}
      {course.statut === "acceptee" && (
        <div className="space-y-3">
          <p className="text-xs text-center text-gray-400 font-medium">Étape 1 — Allez récupérer le colis</p>
          <button
            onClick={recupererColis}
            disabled={updating}
            className="w-full py-5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-blue-200"
          >
            {updating ? "Mise à jour..." : "📦 J'ai récupéré le colis"}
          </button>
        </div>
      )}

      {/* en_cours : livré */}
      {course.statut === "en_cours" && (
        <div className="space-y-3">
          <p className="text-xs text-center text-gray-400 font-medium">Étape 2 — Livrez le colis au destinataire</p>
          <button
            onClick={livrerColis}
            disabled={updating}
            className="w-full py-5 rounded-2xl bg-green-500 hover:bg-green-600 text-white text-base font-extrabold active:scale-95 transition-all shadow-md shadow-green-200"
          >
            {updating ? "Mise à jour..." : "✅ Colis livré"}
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