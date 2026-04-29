/**
 * UserLocationShare — Toggle opt-in partage de position en temps réel
 * Props:
 *   courseId       - ID de la course
 *   role           - 'expediteur' | 'destinataire'
 *   active         - état actuel depuis la course (course.client_sharing_location)
 *   onToggle(bool) - callback quand l'état change
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { MapPin, MapPinOff } from "lucide-react";
import { toast } from "sonner";

export default function UserLocationShare({ courseId, role = "expediteur", active, onToggle }) {
  const [sharing, setSharing] = useState(!!active);
  const [loading, setLoading] = useState(false);
  const watchRef = useRef(null);

  // Synchroniser si prop change depuis l'extérieur
  useEffect(() => { setSharing(!!active); }, [active]);

  // Démarrer / arrêter le watch GPS selon état
  useEffect(() => {
    if (!sharing || !courseId) {
      if (watchRef.current !== null) {
        navigator.geolocation?.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      return;
    }
    if (!navigator.geolocation) return;

    const fieldLat = role === "destinataire" ? "destinataire_lat_live" : "client_lat_live";
    const fieldLng = role === "destinataire" ? "destinataire_lng_live" : "client_lng_live";

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        base44.entities.Course.update(courseId, {
          [fieldLat]: pos.coords.latitude,
          [fieldLng]: pos.coords.longitude,
          client_sharing_location: true,
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 6000, timeout: 10000 }
    );

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [sharing, courseId, role]);

  const toggle = async () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible sur cet appareil");
      return;
    }
    const next = !sharing;
    setLoading(true);
    try {
      if (!next) {
        // Désactiver : nettoyer les champs live
        await base44.entities.Course.update(courseId, {
          client_sharing_location: false,
          client_lat_live: null,
          client_lng_live: null,
          destinataire_lat_live: null,
          destinataire_lng_live: null,
        });
      }
      setSharing(next);
      onToggle?.(next);
      toast.success(next ? "📍 Position partagée en temps réel" : "Position arrêtée");
    } catch (_) {
      toast.error("Erreur lors du changement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all active:scale-95 ${
        sharing
          ? "border-green-400 bg-green-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
        sharing ? "bg-green-500" : "bg-gray-100"
      }`}>
        {sharing
          ? <MapPin className="h-5 w-5 text-white" />
          : <MapPinOff className="h-5 w-5 text-gray-400" />}
      </div>
      <div className="flex-1 text-left">
        <p className={`text-sm font-bold ${sharing ? "text-green-800" : "text-gray-700"}`}>
          {sharing ? "📍 Position partagée" : "Partager ma position"}
        </p>
        <p className={`text-xs ${sharing ? "text-green-600" : "text-gray-400"}`}>
          {sharing
            ? "Le livreur voit votre position en direct"
            : "Optionnel · aide le livreur à vous trouver"}
        </p>
      </div>
      <div className={`relative h-6 w-11 rounded-full transition-all flex-shrink-0 ${
        sharing ? "bg-green-500" : "bg-gray-200"
      }`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
          sharing ? "left-5" : "left-0.5"
        }`} />
      </div>
    </button>
  );
}