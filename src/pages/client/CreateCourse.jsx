import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { vibrateSuccess } from "@/lib/vibration";
import { triggerWhatsAppNotification, waMsgCourseCreatedClient } from "@/lib/whatsappNotifications";
import { useBedouSync } from "@/lib/useBedouSync";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import AdBanner from "../../components/AdBanner";
import GuidedOrderWizard from "@/components/GuidedOrderWizard";
import GpsLocationManager from "@/components/GpsLocationManager";
import AucunLivreurPanel from "@/components/AucunLivreurPanel";
import SearchingLivreurScreen from "@/components/SearchingLivreurScreen";

export default function CreateCourse() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [gpsDepart, setGpsDepart] = useState(null);
  const [searchingCourse, setSearchingCourse] = useState(null);
  const [livreurTrouve, setLivreurTrouve] = useState(null);
  const [aucunLivreur, setAucunLivreur] = useState(false);

  // Hook centralisé Bedou — se met à jour automatiquement après validation recharge
  const { bedou } = useBedouSync(user?.email);
  const soldeBedou = bedou ? (bedou.solde_disponible || 0) + (bedou.solde_bonus || 0) : null;

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        if (me.gps_latitude && me.gps_longitude) {
          setGpsDepart({ lat: me.gps_latitude, lng: me.gps_longitude });
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

      // Dispatch déclenché exclusivement par automation entity Course.create → createSmartDispatch (backend)
      // Ne pas appeler lancerDispatch ici — cela créerait un double dispatch parallèle
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

      let unsubCourse = null;
      const timeoutId = setTimeout(() => {
        if (unsubCourse) { unsubCourse(); unsubCourse = null; }
        setAucunLivreur(prev => !livreurTrouve && !prev ? true : prev);
      }, 90000);

      unsubCourse = base44.entities.Course.subscribe((event) => {
        if (event.id !== courseData.id) return;
        const c = event.data;
        // GARDE : ne pas traiter les courses supprimées
        if (!c || c.is_deleted) { clearTimeout(timeoutId); if (unsubCourse) { unsubCourse(); unsubCourse = null; } return; }
        if (c.statut === 'assignee_attente' || c.statut === 'acceptee') {
          clearTimeout(timeoutId);
          setLivreurTrouve(c);
          if (unsubCourse) { unsubCourse(); unsubCourse = null; }
        } else if (c.statut === 'aucun_livreur') {
          clearTimeout(timeoutId);
          setAucunLivreur(true);
          if (unsubCourse) { unsubCourse(); unsubCourse = null; }
        }
      });
    } catch (err) {
      toast.error("Erreur création: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Écran recherche livreur
  if (searchingCourse) {
    if (aucunLivreur) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-5">
          <div className="w-full max-w-sm space-y-3">
            <AucunLivreurPanel
              course={searchingCourse}
              onCourseUpdate={(updated) => { setSearchingCourse(updated); setAucunLivreur(false); }}
              onCancel={() => { setSearchingCourse(null); setAucunLivreur(false); navigate("/mes-courses"); }}
            />
            <button className="w-full text-xs text-muted-foreground text-center py-2" onClick={() => navigate('/mes-courses')}>
              Voir toutes mes courses
            </button>
          </div>
        </div>
      );
    }
    return (
      <SearchingLivreurScreen
        course={searchingCourse}
        livreurTrouve={livreurTrouve}
        aucunLivreur={aucunLivreur}
      />
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