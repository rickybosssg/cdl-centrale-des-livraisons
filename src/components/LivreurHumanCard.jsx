/**
 * LivreurHumanCard — Carte humaine du livreur
 * Affiche photo, prénom dynamique, ETA, boutons appel/WhatsApp
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Phone, Clock } from "lucide-react";

// ETA simple basé sur distance à vol d'oiseau (moto ~30 km/h en ville)
function calcEtaMinutes(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lat2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // Vitesse moto en ville ~25 km/h
  return Math.max(2, Math.round((dist / 25) * 60));
}

function roundEta(minutes) {
  if (minutes <= 3) return "moins de 5 min";
  if (minutes <= 7) return "~5 min";
  if (minutes <= 12) return "~10 min";
  if (minutes <= 18) return "~15 min";
  if (minutes <= 25) return "~20 min";
  if (minutes <= 35) return "~30 min";
  return "~" + Math.round(minutes / 10) * 10 + " min";
}

export default function LivreurHumanCard({ course, destLat, destLng, context = "client" }) {
  const [photo, setPhoto] = useState(null);
  const [eta, setEta] = useState(null);
  const intervalRef = useRef(null);

  const prenom = (course?.livreur_name || "Le livreur").split(" ")[0];
  const phone = course?.telephone_livreur || "";

  // Charger la photo du livreur
  useEffect(() => {
    if (!course?.livreur_email) return;
    if (course.livreur_photo) { setPhoto(course.livreur_photo); return; }
    base44.entities.UserProfile.filter({ user_email: course.livreur_email, profile_type: "livreur" })
      .then(profiles => {
        try {
          const docs = JSON.parse(profiles?.[0]?.documents_json || "{}");
          setPhoto(docs.photo_profil || null);
        } catch (_) {}
      }).catch(() => {});
  }, [course?.livreur_email, course?.livreur_photo]);

  // Calcul ETA périodique
  useEffect(() => {
    const compute = () => {
      const lat = course?.livreur_lat;
      const lng = course?.livreur_lng;
      if (!lat || !lng) { setEta(null); return; }
      const tLat = destLat || course?.latitude_arrivee;
      const tLng = destLng || course?.longitude_arrivee;
      const mins = calcEtaMinutes(lat, lng, tLat, tLng);
      setEta(mins ? roundEta(mins) : null);
    };
    compute();
    intervalRef.current = setInterval(compute, 30000);
    return () => clearInterval(intervalRef.current);
  }, [course?.livreur_lat, course?.livreur_lng, destLat, destLng, course?.latitude_arrivee, course?.longitude_arrivee]);

  if (!course?.livreur_name) return null;

  const statusText = context === "destinataire"
    ? `${prenom} arrive avec votre colis 🚀`
    : `${prenom} est en route 🚀`;

  const etaText = context === "destinataire"
    ? `Arrive dans environ ${eta}`
    : `Arrive dans environ ${eta}`;

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-primary/20 bg-white shadow-sm">
      {/* Bannière bleue avec prénom */}
      <div className="bg-gradient-to-r from-primary to-blue-600 px-4 py-3 flex items-center gap-3">
        {/* Photo livreur */}
        {photo ? (
          <img
            src={photo}
            alt={prenom}
            className="h-14 w-14 rounded-full object-cover border-2 border-white/50 flex-shrink-0"
            onError={() => setPhoto(null)}
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-2xl flex-shrink-0">
            🛵
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-extrabold text-base leading-tight">{statusText}</p>
          {eta && (
            <div className="flex items-center gap-1.5 mt-1">
              <Clock className="h-3.5 w-3.5 text-white/80" />
              <p className="text-white/90 text-xs font-semibold">{etaText}</p>
            </div>
          )}
        </div>
      </div>

      {/* Boutons contact */}
      {phone && (
        <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
          <a
            href={`tel:${phone}`}
            className="flex items-center justify-center gap-2 py-3 text-primary text-sm font-bold active:bg-blue-50 transition-colors"
          >
            <Phone className="h-4 w-4" /> Appeler
          </a>
          <a
            href={`https://wa.me/${phone.replace(/\D/g, "")}?text=Bonjour ${prenom}, je vous attendais pour ma livraison CDL.`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 py-3 text-green-700 text-sm font-bold active:bg-green-50 transition-colors"
          >
            💬 WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}