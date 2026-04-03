import { useState, useEffect } from "react";
import { Wallet, TrendingUp, Lock, Plus, ArrowDownCircle } from "lucide-react";
import { fmt } from "@/lib/formatMoney";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";

export default function BedouWidget({ user, compact = false }) {
  const [bedou, setBedou] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    base44.functions.invoke('bedouEngine', { action: 'get_bedou' })
      .then(res => { 
        if (isMounted) setBedou(res.data.bedou); 
        if (isMounted) setLoading(false); 
      })
      .catch(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [user?.email]);

  if (loading) return (
    <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 p-4 animate-pulse h-24" />
  );

  if (!bedou) return null;

  const role = user?.user_type;
  const canRetrait = ['livreur', 'partenaire', 'commercial'].includes(role);

  if (compact) {
    return (
      <Link to="/mon-bedou">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-primary">{fmt(bedou.solde_disponible || 0)}</span>
        </div>
      </Link>
    );
  }

  return (
    <Link to="/mon-bedou">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-white/70 font-medium">Mon Bedou</p>
              <p className="text-xs text-white/60">Portefeuille CDL</p>
            </div>
          </div>
          <span className="text-xs bg-white/20 px-2 py-1 rounded-full font-medium">Voir tout →</span>
        </div>

        <p className="text-3xl font-extrabold tracking-tight text-white">
          {fmt(bedou.solde || 0)}
        </p>

        <div className="flex gap-4 mt-3">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-green-300" />
            <span className="text-xs text-white/90 font-medium">Dispo : {fmt(bedou.solde_disponible || 0)}</span>
          </div>
          {(bedou.solde_bloque || 0) > 0 && (
            <div className="flex items-center gap-1">
              <Lock className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-xs text-white/90 font-medium">Bloqué : {fmt(bedou.solde_bloque || 0)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <div className="flex-1 flex items-center justify-center gap-1.5 bg-white/20 rounded-xl py-2">
            <Plus className="h-4 w-4" />
            <span className="text-sm font-semibold">Recharger</span>
          </div>
          {canRetrait && (
            <div className="flex-1 flex items-center justify-center gap-1.5 bg-white/20 rounded-xl py-2">
              <ArrowDownCircle className="h-4 w-4" />
              <span className="text-sm font-semibold">Retirer</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}