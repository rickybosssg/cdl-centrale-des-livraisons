import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Zap, Clock, AlertCircle } from "lucide-react";

const VITESSE_CFG = {
  rapide:    { icon: Zap,          bg: "bg-green-50  border-green-300",  text: "text-green-800",  badge: "bg-green-500 text-white",  label: "⚡ Rapide" },
  moyen:     { icon: TrendingUp,   bg: "bg-blue-50   border-blue-300",   text: "text-blue-800",   badge: "bg-blue-500 text-white",   label: "✅ Moyen" },
  lent:      { icon: Clock,        bg: "bg-amber-50  border-amber-300",  text: "text-amber-800",  badge: "bg-amber-500 text-white",  label: "⚠️ Lent" },
  tres_lent: { icon: AlertCircle,  bg: "bg-red-50    border-red-300",    text: "text-red-800",    badge: "bg-red-500 text-white",    label: "🔴 Très lent" },
};

export default function PrixRecommande({ quartierDepart, prixPropose, onSuggest }) {
  const [data, setData] = useState(null);
  const timerRef = useRef(null);

  const load = async () => {
    if (!quartierDepart) return;
    const res = await base44.functions.invoke('getPrixRecommande', {
      quartier_depart: quartierDepart,
      prix_propose: parseInt(prixPropose) || 0,
    });
    if (res.data?.success) setData(res.data);
  };

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(load, 600);
    return () => clearTimeout(timerRef.current);
  }, [quartierDepart, prixPropose]);

  if (!data) return null;

  const { recommandation, evaluation, contexte, marche } = data;
  const cfg = evaluation ? VITESSE_CFG[evaluation.vitesse] : null;
  const Icon = cfg?.icon;

  return (
    <div className="space-y-3">
      {/* Indicateur vitesse */}
      {cfg && (
        <div className={`rounded-xl border-2 ${cfg.bg} p-3 space-y-1`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.text}`} />
              <p className={`text-sm font-bold ${cfg.text}`}>{evaluation.message}</p>
            </div>
            <span className={`text-xs font-extrabold px-2 py-1 rounded-full ${cfg.badge}`}>
              {cfg.label}
            </span>
          </div>
        </div>
      )}

      {/* Contexte marché */}
      {contexte && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${contexte.urgence ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-muted/50 text-muted-foreground'}`}>
          <span>{contexte.label}</span>
        </div>
      )}

      {/* Fourchette de prix */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <button
          onClick={() => onSuggest?.(recommandation.prixMinViable)}
          className="p-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 active:scale-95 transition-all"
        >
          <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide">Min</p>
          <p className="text-base font-extrabold text-amber-700">{recommandation.prixMinViable.toLocaleString()}</p>
          <p className="text-[9px] text-amber-500">FCFA</p>
        </button>
        <button
          onClick={() => onSuggest?.(recommandation.prixRecommande)}
          className="p-2 rounded-xl border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 active:scale-95 transition-all ring-2 ring-blue-200"
        >
          <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide">Recommandé</p>
          <p className="text-base font-extrabold text-blue-700">{recommandation.prixRecommande.toLocaleString()}</p>
          <p className="text-[9px] text-blue-500">FCFA</p>
        </button>
        <button
          onClick={() => onSuggest?.(recommandation.prixRapide)}
          className="p-2 rounded-xl border-2 border-green-400 bg-green-50 hover:bg-green-100 active:scale-95 transition-all"
        >
          <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide">Rapide</p>
          <p className="text-base font-extrabold text-green-700">{recommandation.prixRapide.toLocaleString()}</p>
          <p className="text-[9px] text-green-500">FCFA</p>
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        Basé sur {marche.nbLivreurs} livreur{marche.nbLivreurs !== 1 ? 's' : ''} disponible{marche.nbLivreurs !== 1 ? 's' : ''} · appuie pour appliquer
      </p>
    </div>
  );
}