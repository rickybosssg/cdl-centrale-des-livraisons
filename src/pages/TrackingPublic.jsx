/**
 * TrackingPublic — Page de suivi publique pour le destinataire
 * Accessible sans login via /track/:courseId
 * Objectif : expérience complète + acquisition CDL
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Package } from "lucide-react";
import UserLocationShare from "@/components/UserLocationShare";
import LivreurHumanCard from "@/components/LivreurHumanCard";
import CdlAppDownloadBanner from "@/components/CdlAppDownloadBanner";

const STATUT_CFG = {
  en_attente:       { label: "Recherche d'un livreur…",     emoji: "🔍", color: "bg-amber-500",  pulse: true  },
  assignee_attente: { label: "Livreur contacté…",           emoji: "📲", color: "bg-blue-500",   pulse: true  },
  acceptee:         { label: "Livreur en route",            emoji: "🛵", color: "bg-primary",    pulse: true  },
  en_cours:         { label: "Colis en route vers vous",    emoji: "🚀", color: "bg-primary",    pulse: true  },
  livree:           { label: "Colis livré !",               emoji: "✅", color: "bg-green-500",  pulse: false },
  annulee:          { label: "Course annulée",              emoji: "❌", color: "bg-gray-400",   pulse: false },
  aucun_livreur:    { label: "Recherche en cours…",         emoji: "⏳", color: "bg-orange-500", pulse: true  },
};

const ETAPES = [
  { key: "created",   label: "Commande créée",    emoji: "📋" },
  { key: "accepted",  label: "Livreur assigné",   emoji: "🛵" },
  { key: "picked",    label: "Colis récupéré",    emoji: "📦" },
  { key: "delivered", label: "Colis livré",       emoji: "✅" },
];

function getEtapeActive(statut) {
  if (statut === "livree") return 4;
  if (statut === "en_cours") return 3;
  if (["acceptee", "assignee_attente"].includes(statut)) return 2;
  return 1;
}

function StarRating({ onChange, value }) {
  return (
    <div className="flex gap-2 justify-center">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} onClick={() => onChange(s)}
          className={`text-4xl transition-transform active:scale-90 ${s <= value ? "text-amber-400" : "text-gray-200"}`}>
          ★
        </button>
      ))}
    </div>
  );
}

export default function TrackingPublic() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState(0);
  const [noteEnvoyee, setNoteEnvoyee] = useState(false);
  const [confirmRecuOpen, setConfirmRecuOpen] = useState(false);
  const [receptionConfirmee, setReceptionConfirmee] = useState(false);
  const [locationSharing, setLocationSharing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await base44.entities.Course.filter({ id: courseId });
        if (!list?.length) { setNotFound(true); setLoading(false); return; }
        setCourse(list[0]);
        setReceptionConfirmee(list[0]?.destinataire_reception_confirmee || false);
      } catch (_) { setNotFound(true); }
      setLoading(false);
    };
    load();
    // Temps réel
    const unsub = base44.entities.Course.subscribe(e => {
      if (e.id === courseId && e.data) setCourse(e.data);
    });
    return unsub;
  }, [courseId]);

  const envoyerNote = async () => {
    if (!note) return;
    try {
      await base44.entities.LivreurRating.create({
        course_id: courseId,
        livreur_email: course.livreur_email || "",
        livreur_name: course.livreur_name || "",
        client_email: "destinataire_public",
        client_name: course.nom_destinataire || "Destinataire",
        note,
        commentaire: "",
      });
      setNoteEnvoyee(true);
    } catch (_) { setNoteEnvoyee(true); }
  };

  const confirmerReception = async () => {
    try {
      await base44.entities.Course.update(courseId, { destinataire_reception_confirmee: true });
      setReceptionConfirmee(true);
      setConfirmRecuOpen(false);
    } catch (_) {}
  };


  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-3">
        <div className="text-5xl animate-bounce">🛵</div>
        <p className="text-sm text-gray-400">Chargement du suivi…</p>
      </div>
    </div>
  );

  if (notFound || !course) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-4 max-w-sm">
        <p className="text-5xl">😕</p>
        <h1 className="text-xl font-bold text-gray-800">Suivi introuvable</h1>
        <p className="text-sm text-gray-400">Ce lien de suivi est invalide ou la course a été supprimée.</p>
        <a href="https://cdl.base44.app" className="block w-full py-3 bg-primary text-white rounded-2xl font-bold text-base">
          📦 Découvrir CDL
        </a>
      </div>
    </div>
  );

  const cfg = STATUT_CFG[course.statut] || STATUT_CFG.en_attente;
  const etapeActive = getEtapeActive(course.statut);
  const isLivre = course.statut === "livree";
  const isAssigned = ["acceptee", "en_cours", "livree"].includes(course.statut);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header CDL */}
      <div className="bg-primary px-5 pt-8 pb-5 text-white text-center space-y-1">
        <div className="flex items-center justify-center gap-2 mb-2">
          <img
            src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg"
            alt="CDL"
            className="h-8 w-8 rounded-xl object-cover"
          />
          <span className="font-extrabold text-base">CDL — Suivi livraison</span>
        </div>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20`}>
          <span className="text-xl">{cfg.emoji}</span>
          <span className="font-bold text-sm">{cfg.label}</span>
          {cfg.pulse && <span className="h-2 w-2 rounded-full bg-white animate-pulse" />}
        </div>
      </div>

      <div className="flex-1 px-5 py-5 space-y-5 max-w-sm mx-auto w-full">

        {/* Progression étapes */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Progression</p>
          <div className="flex items-center">
            {ETAPES.map((etape, i) => {
              const done = i + 1 < etapeActive;
              const current = i + 1 === etapeActive;
              return (
                <div key={etape.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      done || current
                        ? done ? "bg-green-500 text-white" : "bg-primary text-white ring-4 ring-primary/20"
                        : "bg-gray-100 text-gray-300"
                    }`}>
                      {done ? "✓" : etape.emoji}
                    </div>
                    <span className={`text-[9px] font-semibold text-center leading-tight w-16 ${current ? "text-primary" : done ? "text-green-600" : "text-gray-300"}`}>
                      {etape.label}
                    </span>
                  </div>
                  {i < ETAPES.length - 1 && (
                    <div className={`flex-1 h-0.5 mb-5 mx-1 transition-all ${i + 1 < etapeActive ? "bg-green-400" : "bg-gray-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Infos livraison */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Votre livraison</p>
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-1">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <div className="h-8 w-0.5 bg-gray-200 my-1" />
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-[10px] text-gray-400">Départ</p>
                <p className="text-sm font-bold text-gray-800">{course.quartier_depart}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">Livraison</p>
                <p className="text-sm font-bold text-gray-800">{course.quartier_arrivee}</p>
              </div>
            </div>
          </div>
          {course.type_colis && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
              <Package className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-700">{course.type_colis}</span>
            </div>
          )}
        </div>

        {/* Carte humaine livreur */}
        {isAssigned && course.livreur_name && (
          <LivreurHumanCard course={course} context="destinataire" />
        )}

        {/* Partage position destinataire — opt-in */}
        {isAssigned && !isLivre && (
          <UserLocationShare
            courseId={courseId}
            role="destinataire"
            active={locationSharing}
            onToggle={setLocationSharing}
          />
        )}

        {/* Confirmer réception */}
        {isLivre && !receptionConfirmee && (
          <button
            onClick={() => setConfirmRecuOpen(true)}
            className="w-full py-4 rounded-2xl bg-green-500 text-white font-extrabold text-base flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-green-200"
          >
            <CheckCircle2 className="h-5 w-5" /> Confirmer la réception
          </button>
        )}
        {receptionConfirmee && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-50 border border-green-200">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <p className="text-sm font-bold text-green-700">Réception confirmée ✅</p>
          </div>
        )}

        {/* Modal confirmation */}
        {confirmRecuOpen && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setConfirmRecuOpen(false)}>
            <div className="w-full bg-white rounded-t-3xl p-6 space-y-4 max-w-md mx-auto" onClick={e => e.stopPropagation()}>
              <p className="text-xl font-extrabold text-center">Confirmer la réception ?</p>
              <p className="text-sm text-gray-500 text-center">En confirmant, vous attestez avoir bien reçu votre colis.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmRecuOpen(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 font-medium">Annuler</button>
                <button onClick={confirmerReception} className="flex-[2] py-3 rounded-xl bg-green-500 text-white font-extrabold">Oui, j'ai reçu mon colis</button>
              </div>
            </div>
          </div>
        )}

        {/* Notation après livraison */}
        {isLivre && !noteEnvoyee && (
          <div className="bg-white rounded-2xl border border-amber-200 p-4 space-y-3 text-center">
            <p className="font-bold text-gray-800">⭐ Notez cette livraison</p>
            <p className="text-xs text-gray-400">Votre avis aide à améliorer le service</p>
            <StarRating value={note} onChange={setNote} />
            {note > 0 && (
              <button onClick={envoyerNote}
                className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold active:scale-95">
                Envoyer ma note
              </button>
            )}
          </div>
        )}
        {noteEnvoyee && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
            <p className="text-2xl mb-1">🌟</p>
            <p className="font-bold text-amber-800">Merci pour votre note !</p>
          </div>
        )}

        {/* Bannière téléchargement app — adaptative Android/iOS */}
        <CdlAppDownloadBanner courseId={courseId} />

        {/* Upsell CDL — Transformer le destinataire en client */}
        <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 text-white p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-base font-extrabold">📦 Essayez CDL pour vos propres livraisons</p>
            <p className="text-xs text-white/80">
              Envoyez un colis en moins de 2 minutes. Paiement sécurisé via Bedou.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {["⚡ Livreur en moins de 10 min", "💰 Tarifs transparents", "📍 Suivi GPS en direct", "⭐ Livreurs vérifiés"].map(v => (
              <div key={v} className="bg-white/15 rounded-xl px-2 py-1.5 font-medium">{v}</div>
            ))}
          </div>
          <div className="space-y-2">
            <a
              href="https://cdl.base44.app/commander"
              className="block w-full py-3 bg-white text-primary rounded-2xl font-extrabold text-center text-base active:scale-95"
            >
              🛵 Commander une course
            </a>
            <a
              href="https://cdl.base44.app/telecharger-app"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/20 rounded-xl text-white text-sm font-semibold active:scale-95"
            >
              📲 Télécharger l'app CDL
            </a>
          </div>
        </div>

        <p className="text-[10px] text-gray-300 text-center pb-4">
          CDL — Centrale des Livraisons · Ouagadougou, Burkina Faso
        </p>
      </div>
    </div>
  );
}