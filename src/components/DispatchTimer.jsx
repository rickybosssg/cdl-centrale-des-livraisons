/**
 * CDL — Timer visuel pour livreur (60s pour accepter une course proposée)
 */
import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

export default function DispatchTimer({ heureAssignation, dureeSecondes = 60 }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!heureAssignation) return;
    const calcRemaining = () => {
      const elapsed = (Date.now() - new Date(heureAssignation).getTime()) / 1000;
      return Math.max(0, Math.round(dureeSecondes - elapsed));
    };
    setRemaining(calcRemaining());
    const interval = setInterval(() => {
      const r = calcRemaining();
      setRemaining(r);
      if (r <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [heureAssignation, dureeSecondes]);

  if (remaining === null || !heureAssignation) return null;

  const pct = Math.round((remaining / dureeSecondes) * 100);
  const isUrgent = remaining <= 15;
  const isExpired = remaining <= 0;

  if (isExpired) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-300 text-red-700 text-sm font-semibold">
        <Clock className="h-4 w-4 flex-shrink-0" />
        ⚠️ Délai expiré — la course peut être réassignée
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 p-3 space-y-2 ${isUrgent ? 'bg-red-50 border-red-400' : 'bg-amber-50 border-amber-300'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className={`h-4 w-4 flex-shrink-0 ${isUrgent ? 'text-red-600' : 'text-amber-600'}`} />
          <span className={`text-sm font-semibold ${isUrgent ? 'text-red-700' : 'text-amber-700'}`}>
            Temps pour accepter
          </span>
        </div>
        <span className={`text-2xl font-extrabold tabular-nums ${isUrgent ? 'text-red-700' : 'text-amber-700'}`}>
          {remaining}s
        </span>
      </div>
      {/* Barre de progression */}
      <div className="h-2 rounded-full bg-white/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs ${isUrgent ? 'text-red-600' : 'text-amber-600'}`}>
        {isUrgent ? '🚨 Dépêchez-vous !' : 'Acceptez ou refusez avant la fin du délai'}
      </p>
    </div>
  );
}