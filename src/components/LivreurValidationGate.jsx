/**
 * LivreurValidationGate — Mur de statut pour livreurs non encore validés
 * Affiche la progression du dossier et bloque l'accès aux courses
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Clock, XCircle, ChevronRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STEPS = [
  { pct: 25,  label: "Compte créé",           desc: "Profil de base enregistré",              icon: "✅" },
  { pct: 50,  label: "Informations complètes", desc: "Téléphone, quartier, véhicule renseignés", icon: "📋" },
  { pct: 75,  label: "Documents envoyés",      desc: "Selfie, CNIB et véhicule soumis",         icon: "📄" },
  { pct: 100, label: "Compte validé par CDL",  desc: "Accès complet aux courses",               icon: "🏆" },
];

function calcProgression(user, profile) {
  let pct = 25; // compte créé de base
  const hasInfos = !!(user?.telephone && user?.quartier);
  const hasDocs = profile?.documents_json && (() => {
    try {
      const d = JSON.parse(profile.documents_json);
      return d.photo_profil && d.photo_identite_recto && d.photo_identite_verso && d.photo_moyen_deplacement;
    } catch { return false; }
  })();
  const isValidated = profile?.status === 'actif' || user?.statut_validation_livreur === 'valide';

  if (isValidated) return 100;
  if (hasDocs) return 75;
  if (hasInfos) return 50;
  return 25;
}

export default function LivreurValidationGate({ user, profile, onRefresh }) {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const statut = profile?.status || user?.statut_validation_livreur || "en_attente";
  const isRefused = statut === "refuse";
  const pct = calcProgression(user, profile);
  const motifRefus = profile?.refusal_reason || user?.motif_refus || "";

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh?.();
    setRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header statut */}
      <div className={`px-5 pt-10 pb-6 text-center space-y-3 ${
        isRefused
          ? "bg-gradient-to-b from-red-500 to-red-600"
          : "bg-gradient-to-b from-primary to-blue-700"
      }`}>
        <div className="flex items-center justify-center">
          {isRefused
            ? <XCircle className="h-16 w-16 text-white" />
            : <Clock className="h-16 w-16 text-white/90" />
          }
        </div>
        <div className="text-white space-y-1">
          <h1 className="text-2xl font-extrabold">
            {isRefused ? "Dossier refusé" : "En attente de validation"}
          </h1>
          <p className="text-sm text-white/80">
            {isRefused
              ? "Votre dossier a été refusé par l'administration CDL"
              : "L'équipe CDL examine votre dossier — généralement sous 24h"
            }
          </p>
        </div>
      </div>

      <div className="flex-1 px-5 py-6 space-y-6 max-w-sm mx-auto w-full">

        {/* Motif refus */}
        {isRefused && motifRefus && (
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 space-y-2">
            <p className="text-sm font-bold text-red-800">❌ Motif du refus :</p>
            <p className="text-sm text-red-700">{motifRefus}</p>
            <p className="text-xs text-red-500 mt-1">Contactez CDL sur WhatsApp pour corriger votre dossier.</p>
          </div>
        )}

        {/* Barre de progression */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">Progression de votre dossier</p>
            <span className="text-sm font-extrabold text-primary">{pct}%</span>
          </div>

          {/* Barre */}
          <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: pct === 100
                  ? "linear-gradient(90deg, #22C55E, #16A34A)"
                  : isRefused
                  ? "linear-gradient(90deg, #EF4444, #DC2626)"
                  : "linear-gradient(90deg, #1E6BFF, #38BDF8)",
              }}
            />
          </div>

          {/* Étapes */}
          <div className="space-y-3 mt-4">
            {STEPS.map((step, i) => {
              const done = pct >= step.pct;
              const current = pct < step.pct && (i === 0 || pct >= STEPS[i - 1]?.pct);
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  done
                    ? "bg-green-50 border border-green-200"
                    : current
                    ? "bg-blue-50 border-2 border-primary/40"
                    : "bg-gray-50 border border-gray-100 opacity-50"
                }`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                    done ? "bg-green-500 text-white" : current ? "bg-primary text-white" : "bg-gray-200 text-gray-400"
                  }`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : <span>{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${done ? "text-green-800" : current ? "text-primary" : "text-gray-400"}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-gray-400">{step.desc}</p>
                  </div>
                  <span className="text-xs font-bold text-gray-400">{step.pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions selon l'état */}
        {pct < 75 && !isRefused && (
          <button
            onClick={() => navigate('/complete-profile/' + (profile?.id || ''))}
            className="w-full py-4 rounded-2xl bg-primary text-white font-extrabold text-base flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-primary/30"
          >
            📄 Compléter mon dossier
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {pct === 75 && !isRefused && (
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-center space-y-2">
            <p className="text-2xl">⏳</p>
            <p className="font-bold text-blue-800">Dossier soumis — en attente d'examen</p>
            <p className="text-xs text-blue-600">L'équipe CDL examine vos documents. Vous serez notifié par notification push dès validation.</p>
          </div>
        )}

        {isRefused && (
          <a
            href={`https://wa.me/22600000000?text=Bonjour CDL, mon dossier livreur a été refusé. Je souhaite corriger mes documents.`}
            target="_blank"
            rel="noreferrer"
            className="w-full py-4 rounded-2xl bg-green-500 text-white font-extrabold text-base flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            💬 Contacter CDL sur WhatsApp
          </a>
        )}

        {/* Info accès */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-gray-700">Accès aux courses désactivé</p>
          </div>
          <p className="text-xs text-gray-500 pl-6">Vous pourrez accepter des courses dès que votre profil sera validé par l'administration CDL.</p>
          <div className="flex items-center gap-2 pt-1">
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            <p className="text-xs text-gray-500">Après validation → accès complet à toutes les fonctionnalités</p>
          </div>
        </div>

        {/* Bouton actualiser */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-medium flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Vérifier le statut
        </button>

        <button onClick={() => base44.auth.logout()} className="w-full text-xs text-gray-400 underline text-center">
          Se déconnecter
        </button>
      </div>
    </div>
  );
}