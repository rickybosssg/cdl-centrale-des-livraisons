import { TrendingUp, Zap, AlertTriangle, Flame } from "lucide-react";

const SURGE_CONFIG = {
  normal:  { icon: null,          bg: null,                    border: null,                    text: null },
  eleve:   { icon: TrendingUp,    bg: "bg-yellow-50",          border: "border-yellow-300",     text: "text-yellow-800",  badge: "bg-yellow-100 text-yellow-700" },
  fort:    { icon: Zap,           bg: "bg-orange-50",          border: "border-orange-400",     text: "text-orange-800",  badge: "bg-orange-100 text-orange-700" },
  extreme: { icon: Flame,         bg: "bg-red-50",             border: "border-red-400",        text: "text-red-800",     badge: "bg-red-100 text-red-700" },
};

export default function SurgePriceBanner({ surge, prixBase, prixFinal }) {
  if (!surge || surge.level === 'normal' || !surge.message) return null;

  const cfg = SURGE_CONFIG[surge.level];
  if (!cfg?.bg) return null;

  const Icon = cfg.icon;
  const pourcent = Math.round((surge.multiplier - 1) * 100);

  return (
    <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.text}`} />
        <p className={`text-sm font-bold ${cfg.text}`}>{surge.label}</p>
        <span className={`ml-auto text-xs font-extrabold px-2 py-0.5 rounded-full ${cfg.badge}`}>
          +{pourcent}%
        </span>
      </div>
      <p className={`text-xs ${cfg.text}`}>{surge.message}</p>
      {prixBase > 0 && prixFinal > prixBase && (
        <div className={`flex items-center justify-between text-xs font-medium ${cfg.text} pt-1 border-t ${cfg.border}`}>
          <span>Prix ajusté automatiquement</span>
          <span className="font-extrabold">{prixBase.toLocaleString()} → {prixFinal.toLocaleString()} FCFA</span>
        </div>
      )}
    </div>
  );
}