/**
 * DestinataireShareBlock — Partage du lien de suivi au destinataire
 * - Détecte si le destinataire a un compte CDL → notif push
 * - Sinon → bouton WhatsApp prérempli avec le lien de suivi
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Share2, Copy, CheckCircle2 } from "lucide-react";

const APP_URL = "https://cdl.base44.app";

export default function DestinataireShareBlock({ course }) {
  const [destinataireStatus, setDestinataireStatus] = useState(null); // 'cdl_user' | 'non_user' | null
  const [notifEnvoyee, setNotifEnvoyee] = useState(false);
  const [copied, setCopied] = useState(false);

  const trackingUrl = `${APP_URL}/track/${course.id}`;
  const phone = (course.telephone_destinataire || "").replace(/[^0-9]/g, "");
  const nom = course.nom_destinataire || "le destinataire";

  // Vérifier si le destinataire est un utilisateur CDL (via son téléphone)
  useEffect(() => {
    if (!course.telephone_destinataire || course.statut === "en_attente") return;
    const check = async () => {
      try {
        const cleaned = course.telephone_destinataire.replace(/[\s\-\.\(\)]/g, "");
        const users = await base44.entities.User.filter({ telephone: cleaned });
        if (users?.length > 0) {
          setDestinataireStatus('cdl_user');
          // Envoyer notif push si livreur a accepté
          if (["acceptee", "en_cours"].includes(course.statut) && !notifEnvoyee) {
            const notifTitle = course.statut === "acceptee"
              ? "🛵 Votre colis est en route !"
              : "📦 Votre colis arrive bientôt !";
            const notifMsg = `Un livreur CDL transporte votre colis de ${course.quartier_depart} vers ${course.quartier_arrivee}. Suivez en temps réel !`;
            base44.entities.Notification.create({
              destinataire_email: users[0].email,
              destinataire_role: users[0].current_role || "client",
              titre: notifTitle,
              message: notifMsg,
              type: "info",
              lue: false,
              course_id: course.id,
              target_screen: `/track/${course.id}`,
              notification_key: `destinataire__${course.id}__${course.statut}`,
            }).catch(() => {});
            // FCM push
            base44.functions.invoke("sendCdlNotification", {
              user_email: users[0].email,
              title: notifTitle,
              body: notifMsg,
              data: { type: "destinataire_course", entity_id: course.id, notif_route: `/track/${course.id}` },
            }).catch(() => {});
            setNotifEnvoyee(true);
          }
        } else {
          setDestinataireStatus('non_user');
        }
      } catch (_) {}
    };
    check();
  }, [course.telephone_destinataire, course.statut]);

  // Pas utile d'afficher si pas encore de livreur / course annulée / livraison terminée
  if (!["acceptee", "en_cours", "livree"].includes(course.statut)) return null;
  if (!course.telephone_destinataire && !course.nom_destinataire) return null;

  const whatsappMsg = encodeURIComponent(
    `Bonjour ${nom} 👋\nVotre colis est en route avec CDL 🛵\nSuivez votre livraison ici : ${trackingUrl}\n\n📦 ${course.quartier_depart} → ${course.quartier_arrivee}`
  );
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${whatsappMsg}`
    : `https://wa.me/?text=${whatsappMsg}`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(trackingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Share2 className="h-5 w-5 text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-primary">Informer le destinataire</p>
          <p className="text-xs text-blue-600">{nom}{phone ? ` · ${course.telephone_destinataire}` : ""}</p>
        </div>
        {destinataireStatus === 'cdl_user' && (
          <span className="ml-auto text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold flex-shrink-0">
            ✅ Utilisateur CDL
          </span>
        )}
        {destinataireStatus === 'non_user' && (
          <span className="ml-auto text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
            Non-utilisateur
          </span>
        )}
      </div>

      {/* Utilisateur CDL : notif envoyée automatiquement */}
      {destinataireStatus === 'cdl_user' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
          <p className="text-xs text-green-700 font-medium">
            Notification push envoyée automatiquement au destinataire CDL
          </p>
        </div>
      )}

      {/* Lien de suivi */}
      <div className="flex items-center gap-2 bg-white rounded-xl border border-blue-200 px-3 py-2">
        <p className="text-xs text-gray-500 flex-1 truncate font-mono">{trackingUrl}</p>
        <button onClick={handleCopy} className="flex-shrink-0 p-1 rounded-lg active:scale-90">
          {copied
            ? <CheckCircle2 className="h-4 w-4 text-green-500" />
            : <Copy className="h-4 w-4 text-gray-400" />}
        </button>
      </div>

      {/* Bouton WhatsApp */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-500 text-white font-bold text-sm active:scale-95 transition-all shadow-sm"
      >
        <span className="text-lg">💬</span>
        Envoyer le lien sur WhatsApp
      </a>

      {/* Si non-utilisateur CDL : encourager l'installation */}
      {destinataireStatus === 'non_user' && (
        <p className="text-[10px] text-center text-blue-500">
          Le destinataire pourra suivre sa livraison sans installer l'app • Le lien inclut un bouton de téléchargement CDL
        </p>
      )}
    </div>
  );
}