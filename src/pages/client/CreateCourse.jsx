import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { vibrateSuccess } from "@/lib/vibration";
import { lancerDispatch } from "@/lib/dispatch";
import { triggerWhatsAppNotification, waMsgCourseCreatedClient } from "@/lib/whatsappNotifications";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import AdBanner from "../../components/AdBanner";
import GuidedOrderWizard from "@/components/GuidedOrderWizard";
import GpsLocationManager from "@/components/GpsLocationManager";

export default function CreateCourse() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [soldeBedou, setSoldeBedou] = useState(null);
  const [gpsDepart, setGpsDepart] = useState(null);
  const [searchingCourse, setSearchingCourse] = useState(null);
  const [livreurTrouve, setLivreurTrouve] = useState(null);
  const [aucunLivreur, setAucunLivreur] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        if (me.gps_latitude && me.gps_longitude) {
          setGpsDepart({ lat: me.gps_latitude, lng: me.gps_longitude });
        }
        try {
          const res = await base44.functions.invoke('bedouEngine', { action: 'get_bedou' });
          setSoldeBedou(res.data.bedou?.solde_disponible || 0);
        } catch (_) {
          setSoldeBedou(0);
        }
      } catch (err) {
        toast.error("Erreur authentification — reconnectez-vous");
        navigate('/connexion');
      }
    };
    load();
  }, [navigate]);

  const handleGpsLocationUpdate = async (locationData) => {
    try {
      await base44.auth.updateMe(locationData);
      setGpsDepart({ lat: locationData.gps_latitude, lng: locationData.gps_longitude });
      setUser(prev => ({ ...prev, ...locationData }));
    } catch (_) {}
  };

  const handleSubmit = async ({ form, typeService, urgence, prixBase, supplement, prixTotal }) => {
    if (!prixBase || prixBase <= 0) { toast.error("Prix requis"); return; }
    
    // SÉCURITÉ : Vérifier solde Bedou AVANT création de course
    if (soldeBedou !== null && soldeBedou < prixTotal) {
      toast.error("Solde Bedou insuffisant");
      // Envoyer notification push au client
      base44.functions.invoke('sendCdlNotification', {
        user_email: user?.email,
        title: '💳 Solde Bedou insuffisant',
        body: `Rechargez votre Bedou pour effectuer cette course. Solde actuel: ${soldeBedou.toLocaleString()} F / Requis: ${prixTotal.toLocaleString()} F`,
        data: { type: 'insufficient_balance', notif_route: '/mon-bedou' },
      }).catch(() => {});
      return;
    }

    setLoading(true);
    try {
      const clientLat = gpsDepart?.lat || user?.gps_latitude || null;
      const clientLng = gpsDepart?.lng || user?.gps_longitude || null;
      const commission = Math.round(prixTotal * 0.2);
      const gainLivreur = prixTotal - commission;

      // Mapper les champs selon le type de service
      let nom_expediteur = form.nom_expediteur || user?.full_name || "";
      let telephone_expediteur = form.telephone_expediteur || user?.telephone || "";
      let nom_destinataire = form.nom_destinataire || "";
      let telephone_destinataire = form.telephone_destinataire || "";

      if (typeService === "deplacement") {
        nom_expediteur = user?.full_name || "";
        telephone_expediteur = user?.telephone || "";
        nom_destinataire = user?.full_name || "";
        telephone_destinataire = user?.telephone || "";
      } else if (typeService === "recevoir") {
        nom_destinataire = nom_destinataire || user?.full_name || "";
        telephone_destinataire = telephone_destinataire || user?.telephone || "";
      }

      const courseData = await base44.entities.Course.create({
        quartier_depart: form.quartier_depart,
        quartier_arrivee: form.quartier_arrivee,
        latitude_depart: clientLat,
        longitude_depart: clientLng,
        nom_expediteur,
        telephone_expediteur,
        nom_destinataire,
        telephone_destinataire,
        type_colis: form.type_colis || (typeService === "deplacement" ? "Déplacement" : "Colis"),
        description: form.description || "",
        type_mission: typeService,
        mode_paiement: "Bedou",
        statut: "en_attente",
        statut_paiement: "en_attente",
        client_email: user.email,
        client_name: user.full_name,
        prix: prixTotal,
        montant_base: prixBase,
        supplement_urgence: supplement,
        niveau_urgence: urgence,
        urgence: urgence !== "normal" ? urgence : null,
        commission,
        commission_active: true,
        commission_cdl: commission,
        gain_livreur: gainLivreur,
        statut_paiement_livreur: "Commission due",
        nombre_tentatives: 0,
      });

      lancerDispatch(courseData);
      triggerWhatsAppNotification({
        eventType: 'course_created',
        recipientRole: 'client',
        recipientName: user.full_name,
        recipientPhone: telephone_expediteur,
        messageText: waMsgCourseCreatedClient(),
        entityId: courseData.id,
        entityType: 'course',
        priority: 'normal',
      });
      vibrateSuccess();
      setSearchingCourse(courseData);

      const unsub = base44.entities.Course.subscribe((event) => {
        if (event.id !== courseData.id) return;
        const c = event.data;
        if (c?.statut === 'assignee_attente' || c?.statut === 'acceptee') {
          setLivreurTrouve(c);
          unsub();
        } else if (c?.statut === 'aucun_livreur') {
          setAucunLivreur(true);
          unsub();
        }
      });
      setTimeout(() => { unsub(); if (!livreurTrouve) setAucunLivreur(true); }, 90000);
    } catch (err) {
      toast.error("Erreur création: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Écran recherche livreur
  if (searchingCourse) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 space-y-6 text-center">
        <div className="w-full max-w-sm">
          <AdBanner placement="attente_livreur" userRole="client" />
        </div>
        {livreurTrouve ? (
          <>
            <div className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-5xl">🛵</span>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-extrabold text-green-600">✅ Livreur trouvé !</p>
              <p className="text-base font-semibold">{livreurTrouve.livreur_name}</p>
              {livreurTrouve.telephone_livreur && (
                <a href={`tel:${livreurTrouve.telephone_livreur}`} className="text-primary underline text-sm block">
                  {livreurTrouve.telephone_livreur}
                </a>
              )}
              <p className="text-sm text-muted-foreground mt-2">Votre livreur est en route pour récupérer votre colis.</p>
            </div>
            <Button className="w-full max-w-xs" onClick={() => navigate('/mes-courses')}>Suivre ma course</Button>
          </>
        ) : aucunLivreur ? (
          <>
            <div className="h-24 w-24 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-5xl">😕</span>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-extrabold text-red-600">Aucun livreur disponible</p>
              <p className="text-sm text-muted-foreground">Réessayez plus tard ou augmentez le prix de la course.</p>
            </div>
            <div className="flex gap-3 w-full max-w-xs">
              <Button variant="outline" className="flex-1" onClick={() => navigate('/mes-courses')}>Voir ma course</Button>
              <Button className="flex-1" onClick={() => { setSearchingCourse(null); setAucunLivreur(false); }}>Modifier</Button>
            </div>
          </>
        ) : (
          <>
            {/* Moto animée */}
            <div className="relative flex items-center justify-center w-36 h-36">
              <div className="absolute inset-0 rounded-full border-4 border-blue-100 border-t-blue-500 animate-spin" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-b-blue-200 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
              <div className="absolute inset-4 rounded-full bg-blue-50 flex items-center justify-center">
                <motion.span
                  className="text-4xl"
                  animate={{ x: [0, 6, 0, -6, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
                >
                  🛵
                </motion.span>
              </div>
            </div>

            <div className="space-y-2 text-center">
              <p className="text-2xl font-extrabold text-gray-900">Recherche d'un livreur...</p>
              <p className="text-sm text-gray-400">CDL cherche le meilleur livreur disponible près de vous.</p>
            </div>

            {/* Message rassurant */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="w-full max-w-xs p-4 rounded-2xl text-center"
              style={{ background: "#EFF6FF", border: "1.5px solid #BFDBFE" }}
            >
              <p className="text-sm font-semibold text-blue-700">⚡ Un livreur va accepter sous quelques secondes.</p>
              <p className="text-xs text-blue-400 mt-1">Restez sur cette page — vous serez notifié immédiatement.</p>
            </motion.div>

            <div className="flex flex-col gap-2 w-full max-w-xs text-xs text-gray-500">
              <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: "#F0FDF4" }}>
                <span className="text-green-500 font-bold">✓</span>
                <span className="text-green-700 font-medium">Course créée avec succès</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: "#EFF6FF" }}>
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                <span className="text-blue-600 font-medium">Analyse GPS en cours...</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/mes-courses')}>Voir mes courses</Button>
          </>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* GPS silencieux en arrière-plan */}
      <div className="hidden">
        <GpsLocationManager onLocationUpdate={handleGpsLocationUpdate} />
      </div>
      {/* Afficher banneau si solde insuffisant */}
      {soldeBedou !== null && soldeBedou < 100 && (
        <div className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white text-center shadow-lg">
          <p className="text-sm font-bold">💳 Solde Bedou faible: {soldeBedou.toLocaleString()} F</p>
        </div>
      )}
      <div className={soldeBedou !== null && soldeBedou < 100 ? "mt-12" : ""}>
        <GuidedOrderWizard
          user={user}
          soldeBedou={soldeBedou}
          gpsDepart={gpsDepart}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </div>
    </>
  );
}