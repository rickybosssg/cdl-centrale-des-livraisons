/**
 * CDL — Panneau boost course côté client
 * Affiché quand une course est en statut aucun_livreur ou assignee_attente trop longtemps.
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Zap, TrendingUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function CourseBoostPanel({ course, onBoosted }) {
  const [boosting, setBoosting] = useState(false);
  const [selectedBoost, setSelectedBoost] = useState(null);

  if (!course) return null;
  if (!['aucun_livreur', 'echec_dispatch'].includes(course.statut)) return null;

  const options = [
    { id: 'prix_500', label: '+500 FCFA', desc: 'Attirer plus de livreurs', extra: 500, urgence: course.urgence },
    { id: 'urgent', label: '⚡ Urgent +500', desc: 'Passage en mode urgent', extra: 500, urgence: 'urgent' },
    { id: 'tres_urgent', label: '🚨 Très urgent +1000', desc: 'Priorité maximale', extra: 1000, urgence: 'tres_urgent' },
  ];

  const handleBoost = async () => {
    if (!selectedBoost) return toast.error('Choisissez une option');
    setBoosting(true);
    const opt = options.find(o => o.id === selectedBoost);
    const newPrix = (course.prix || 0) + opt.extra;
    const gainLivreur = Math.round(newPrix * 0.8);
    const commissionCdl = newPrix - gainLivreur;

    await base44.entities.Course.update(course.id, {
      prix: newPrix,
      gain_livreur: gainLivreur,
      commission_cdl: commissionCdl,
      urgence: opt.urgence,
      niveau_urgence: opt.urgence,
      statut: 'en_attente',
      nombre_tentatives: 0,
    });

    // Relancer le dispatch
    await base44.functions.invoke('autoDispatch', { course_id: course.id }).catch(() => {});

    toast.success(`🚀 Course boostée à ${newPrix} FCFA — recherche en cours !`);
    setBoosting(false);
    onBoosted?.();
  };

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-amber-600" />
        <p className="font-bold text-amber-800">Aucun livreur trouvé — Boostez votre course !</p>
      </div>
      <p className="text-xs text-amber-700">
        Augmentez le prix ou le niveau d'urgence pour attirer plus de livreurs.
      </p>

      <div className="space-y-2">
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => setSelectedBoost(opt.id)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all ${
              selectedBoost === opt.id
                ? 'border-amber-500 bg-white'
                : 'border-amber-200 bg-white/60 hover:bg-white'
            }`}
          >
            <div>
              <p className="text-sm font-bold text-amber-800">{opt.label}</p>
              <p className="text-xs text-amber-600">{opt.desc}</p>
            </div>
            <TrendingUp className="h-4 w-4 text-amber-500 flex-shrink-0" />
          </button>
        ))}
      </div>

      <Button
        className="w-full bg-amber-500 hover:bg-amber-600 text-white"
        onClick={handleBoost}
        disabled={boosting || !selectedBoost}
      >
        {boosting ? (
          <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Boost en cours...</>
        ) : (
          <><RefreshCw className="h-4 w-4 mr-2" />Booster et relancer</>
        )}
      </Button>
    </div>
  );
}