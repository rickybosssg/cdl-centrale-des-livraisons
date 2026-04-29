/**
 * CourseCardSimple — Carte de course minimaliste pour livreurs (phase de lancement)
 * Neutre, sans code couleur, sans jugement de prix. Objectif : max acceptation.
 */
import { useState, useEffect } from "react";
import { MapPin, Package, Clock, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

const URGENCE_LABELS = {
  tres_urgent: "🚨 Très urgent",
  urgent: "🔔 Urgent",
  normal: "Normal",
};

const TYPE_LABELS = {
  envoyer: "📦 Envoi de colis",
  recevoir: "📥 Réception colis",
  deplacement: "🏍️ Déplacement",
};

export default function CourseCardSimple({ course, onAccepter, onRefuser, showTimer = false }) {
  const [secondes, setSecondes] = useState(60);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!showTimer) return;
    const ref = course.heure_assignation ? new Date(course.heure_assignation) : new Date();
    const deadline = ref.getTime() + 60000;
    const tick = setInterval(() => {
      const reste = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSecondes(reste);
      if (reste === 0) {
        setExpired(true);
        clearInterval(tick);
      }
    }, 500);
    return () => clearInterval(tick);
  }, [showTimer, course.heure_assignation]);

  const urgence = course.urgence || course.niveau_urgence || "normal";
  const typeLabel = TYPE_LABELS[course.type_mission] || "📦 Course";

  return (
    <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Bandeau urgence si applicable */}
      {urgence !== "normal" && (
        <div className={`px-4 py-2 text-xs font-bold text-center ${urgence === "tres_urgent" ? "bg-red-500 text-white" : "bg-orange-400 text-white"}`}>
          {URGENCE_LABELS[urgence]}
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Itinéraire */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center mt-1 flex-shrink-0">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <div className="h-10 w-0.5 bg-gray-200 my-1" />
            <div className="h-3 w-3 rounded-full bg-red-500" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-semibold">Récupération</p>
              <p className="text-base font-bold text-gray-900">{course.quartier_depart}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-semibold">Livraison</p>
              <p className="text-base font-bold text-gray-900">{course.quartier_arrivee}</p>
            </div>
          </div>
        </div>

        {/* Infos course */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Package className="h-4 w-4 flex-shrink-0" />
            <span>{typeLabel}</span>
          </div>
          {course.type_colis && course.type_colis !== "Déplacement" && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">{course.type_colis}</span>
          )}
        </div>

        {/* Prix — simple, sans couleur ni jugement */}
        <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-gray-50 border border-gray-100">
          <span className="text-sm text-gray-500 font-medium">Prix de la course</span>
          <span className="text-2xl font-extrabold text-gray-900">{(course.prix || 0).toLocaleString()} F</span>
        </div>

        {/* Timer (pour assignee_attente) */}
        {showTimer && (
          <div className={`flex items-center justify-center gap-2 py-2 rounded-xl ${expired ? "bg-red-50 border border-red-200" : secondes <= 15 ? "bg-orange-50 border border-orange-200" : "bg-blue-50 border border-blue-200"}`}>
            <Clock className={`h-4 w-4 ${expired ? "text-red-500" : secondes <= 15 ? "text-orange-500" : "text-blue-500"}`} />
            <span className={`text-sm font-bold ${expired ? "text-red-600" : secondes <= 15 ? "text-orange-600" : "text-blue-600"}`}>
              {expired ? "Temps expiré" : `${secondes}s pour répondre`}
            </span>
          </div>
        )}

        {/* Boutons */}
        {(onAccepter || onRefuser) && (
          <div className="flex gap-3 pt-1">
            {onRefuser && (
              <button
                onClick={onRefuser}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium active:scale-95 transition-all"
              >
                Refuser
              </button>
            )}
            {onAccepter && (
              <button
                onClick={onAccepter}
                disabled={expired}
                className="flex-[2] py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white text-base font-extrabold active:scale-95 transition-all disabled:opacity-50 shadow-md shadow-green-200"
              >
                ✅ ACCEPTER
              </button>
            )}
          </div>
        )}

        {/* Si pas de boutons → lien vers la course */}
        {!onAccepter && !onRefuser && course.id && (
          <Link to={`/course-livreur/${course.id}`}>
            <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-primary/5 border border-primary/20">
              <span className="text-sm font-semibold text-primary">Voir la course</span>
              <ChevronRight className="h-4 w-4 text-primary" />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}